import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, SCHEMA_VERSION } from './db';
import { applyJoker, cancelFocus, deleteBadHabit, ensureSeeded, finishWindow, removeJoker, resolveUrge, saveBadHabit, setStatus, settleFocus, setUsage, startFocus, startUrge, startWindow, updateSettings, updateUrge } from './repo';
import { findOrphans } from './integrity';
import { usageOn, usageTrend, withinStreak } from '../domain/social';
import { expiredRunning, focusTotals, formatClock, remainingMs, runningSession } from '../domain/focus';
import { urgePatterns, urgeSecondsLeft } from '../domain/urges';
import { badHabitStats } from '../domain/bad';
import { computePoints } from '../domain/points';
import { DEFAULT_LEVELS, DEFAULT_POINTS } from '../config/defaults';
import { createBackup, parseBackup, restoreBackup } from './backup';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('joker (comodín)', () => {
  it('one per week (Monday–Sunday), stored as a dated record', async () => {
    expect(await applyJoker('2026-11-10')).toBe(true);
    expect(await applyJoker('2026-11-12')).toBe(false); // same week
    expect(await applyJoker('2026-11-17')).toBe(true); // next week
    expect((await db.jokers.toArray()).map((j) => [j.date, j.weekStart])).toEqual([
      ['2026-11-10', '2026-11-09'],
      ['2026-11-17', '2026-11-16'],
    ]);
    await removeJoker('2026-11-10');
    expect(await applyJoker('2026-11-12')).toBe(true); // freed after removing
  });
});

describe('Redes / scroll (limit mode)', () => {
  it('logs minutes per day (editable), with trend and streak within the limit', async () => {
    const b = await saveBadHabit({ name: 'Redes / scroll', icon: 'smartphone', mode: 'limit', limitMinutes: 30, startDate: '2026-11-01' });
    await setUsage(b.id, '2026-11-10', 20);
    await setUsage(b.id, '2026-11-11', 45);
    await setUsage(b.id, '2026-11-12', 25);
    await setUsage(b.id, '2026-11-12', 28); // edited: one record per day
    const logs = await db.usageLogs.toArray();
    expect(logs).toHaveLength(3);
    expect(usageOn(b, logs, '2026-11-12')).toBe(28);
    const t = usageTrend(b, logs, '2026-11-09', '2026-11-12');
    expect(t).toMatchObject({ logged: 3, average: 31, daysWithin: 2, daysOver: 1 });
    expect(t.days[0].minutes).toBeNull(); // not logged
    expect(withinStreak(b, logs, '2026-11-12')).toBe(1); // the 11th was over
    expect(withinStreak(b, logs, '2026-11-13')).toBe(1); // today not logged yet: counts from yesterday
    await setUsage(b.id, '2026-11-12', null);
    expect(await db.usageLogs.count()).toBe(2);
  });

  it('deleting the habit removes its minutes too', async () => {
    const b = await saveBadHabit({ name: 'Redes', icon: 'smartphone', mode: 'limit', limitMinutes: 60 });
    await setUsage(b.id, '2026-11-10', 20);
    await deleteBadHabit(b.id);
    expect(await db.usageLogs.count()).toBe(0);
    expect((await findOrphans()).usageLogs).toEqual([]);
  });
});

describe('phone-free window records', () => {
  it('start once per kind and day; honor answer saved; not kept is just recorded', async () => {
    const a = await startWindow('2026-11-17', 'night', new Date(2026, 10, 17, 21, 5));
    const again = await startWindow('2026-11-17', 'night');
    expect(again.id).toBe(a.id);
    await finishWindow(a.id, true, new Date(2026, 10, 17, 22, 0));
    const m = await startWindow('2026-11-18', 'morning');
    await finishWindow(m.id, false);
    const all = await db.windowLogs.orderBy('date').toArray();
    expect(all.map((w) => [w.id, w.kept])).toEqual([['2026-11-17:night', true], ['2026-11-18:morning', false]]);
    expect(all[0].endedAt).toBeDefined();
  });
});

describe('focus sessions (time from start and end timestamps)', () => {
  const at = (h: number, m = 0) => new Date(2026, 10, 17, h, m);

  it('remaining time is computed from the start time, not a running counter', async () => {
    const f = await startFocus('Clips', 25, at(10, 0));
    expect(f).toMatchObject({ date: '2026-11-17', status: 'running', plannedMin: 25 });
    expect(remainingMs(f, at(10, 10))).toBe(15 * 60000);
    expect(formatClock(remainingMs(f, at(10, 10)))).toBe('15:00');
    // app closed and reopened after the end: still exactly 25 min, never more
    expect(remainingMs(f, at(13, 0))).toBe(0);
    expect(expiredRunning([f], at(10, 30))).toHaveLength(1);
  });

  it('a session that ended while the app was closed is settled as done on reopen', async () => {
    const f = await startFocus('Lectura', 45, at(9, 0));
    expect(await settleFocus(at(9, 30))).toBe(0); // still running
    expect(await settleFocus(at(11, 0))).toBe(1);
    const done = (await db.focusSessions.get(f.id))!;
    expect(done.status).toBe('done');
    expect(done.endAt).toBe(new Date(at(9, 45)).toISOString()); // planned end, not reopen time
    expect(focusTotals(await db.focusSessions.toArray(), '2026-11-17', '2026-11-17')).toMatchObject({ minutes: 45, sessions: 1 });
  });

  it('cancelling early does not count (and never subtracts)', async () => {
    const f = await startFocus('Clips', 60, at(15));
    await cancelFocus(f.id, at(15, 20));
    const c = (await db.focusSessions.get(f.id))!;
    expect(c.status).toBe('cancelled');
    expect(focusTotals([c], '2026-11-17', '2026-11-17').minutes).toBe(0);
    expect(await settleFocus(at(18))).toBe(0);
  });

  it('only one session runs at a time', async () => {
    const a = await startFocus('A', 25, at(8));
    const b = await startFocus('B', 25, at(8, 5));
    expect(b.id).toBe(a.id);
    expect(runningSession(await db.focusSessions.toArray(), at(8, 6))?.label).toBe('A');
    const c = await startFocus('C', 25, at(8, 30)); // A already finished
    expect(c.id).not.toBe(a.id);
  });
});

describe('Momento de ganas', () => {
  it('records the trigger at open; 2-minute countdown from that time', async () => {
    const u = await startUrge(new Date(2026, 10, 17, 22, 15));
    expect(u).toMatchObject({ date: '2026-11-17', hour: 22 });
    expect(urgeSecondsLeft(u, 120, new Date(2026, 10, 17, 22, 15, 30))).toBe(90);
    expect(urgeSecondsLeft(u, 120, new Date(2026, 10, 17, 22, 20))).toBe(0);
    await updateUrge(u.id, { situation: 'Antes de dormir', feeling: 'Cansado' });
    expect(await db.urges.get(u.id)).toMatchObject({ situation: 'Antes de dormir', feeling: 'Cansado' });
  });

  it('"Resistí" gives +3; "Caí" registers a relapse (counter resets, best mark kept)', async () => {
    const b = await saveBadHabit({ name: 'Redes sin propósito', icon: 'smartphone', startDate: '2026-11-01' });
    const r1 = await startUrge(new Date(2026, 10, 10, 21, 0));
    await resolveUrge(r1.id, 'resisted');
    const r2 = await startUrge(new Date(2026, 10, 12, 23, 0));
    await updateUrge(r2.id, { situation: 'Aburrimiento' });
    await resolveUrge(r2.id, 'fell', b.id);

    const relapses = await db.relapses.toArray();
    expect(relapses).toHaveLength(1);
    expect(relapses[0]).toMatchObject({ date: '2026-11-12', note: 'Momento de ganas: Aburrimiento' });
    expect((await db.urges.get(r2.id))!.relapseId).toBe(relapses[0].id);
    expect(badHabitStats(b, relapses, '2026-11-14')).toMatchObject({ current: 2, best: 11 });

    const points = computePoints({
      habits: [], logs: [], badHabits: [b], relapses, urges: await db.urges.toArray(),
      settings: { points: DEFAULT_POINTS, levels: DEFAULT_LEVELS, pointsStartDate: '2026-11-10' }, today: '2026-11-14',
    });
    expect(points.byDate.get('2026-11-10')!.items.map((i) => i.kind)).toContain('resisted');
    expect(points.byDate.get('2026-11-12')!.items.map((i) => `${i.kind}:${i.pts}`)).toEqual(['relapse:-10']);
  });

  it('a fall without a habit is only recorded; deleting the habit keeps the urge without dangling ids', async () => {
    const b = await saveBadHabit({ name: 'X', icon: 'tv', startDate: '2026-11-01' });
    const u = await startUrge();
    await resolveUrge(u.id, 'fell');
    expect(await db.relapses.count()).toBe(0);
    const u2 = await startUrge();
    await resolveUrge(u2.id, 'fell', b.id);
    await deleteBadHabit(b.id);
    const kept = (await db.urges.get(u2.id))!;
    expect(kept.result).toBe('fell');
    expect(kept.badHabitId).toBeUndefined();
    expect(kept.relapseId).toBeUndefined();
  });

  it('patterns by weekday and hour', () => {
    const T = '2026-01-01T00:00:00.000Z';
    const mk = (date: string, hour: number, result?: 'resisted' | 'fell') => ({ id: `${date}${hour}`, date, at: T, hour, result, createdAt: T, updatedAt: T });
    const p = urgePatterns([mk('2026-11-12', 22, 'resisted'), mk('2026-11-19', 22, 'fell'), mk('2026-11-17', 15)], '2026-11-09', '2026-11-22');
    expect(p).toMatchObject({ total: 3, resisted: 1, fell: 1, topWeekday: 3, topHour: 22 }); // Thursdays, 10 PM
  });
});

describe('Stage 2 backup (v3)', () => {
  it('round trip keeps settings and every new table; points come back identical', async () => {
    await ensureSeeded('2026-11-09');
    await updateSettings({ userName: 'Ana', pointsStartDate: '2026-11-09' });
    const h = (await db.habits.toArray())[1];
    const redes = (await db.badHabits.toArray())[0];
    await setStatus(h.id, '2026-11-10', 'done');
    await setUsage(redes.id, '2026-11-10', 40);
    await applyJoker('2026-11-11');
    const w = await startWindow('2026-11-10', 'night');
    await finishWindow(w.id, true);
    const f = await startFocus('Clips', 25, new Date(2026, 10, 10, 9));
    await settleFocus(new Date(2026, 10, 10, 10));
    const u = await startUrge(new Date(2026, 10, 10, 22));
    await resolveUrge(u.id, 'resisted');

    const snapshot = async () => {
      const s = (await db.settings.get('settings'))!;
      return computePoints({
        habits: await db.habits.toArray(), logs: await db.habitLogs.toArray(), badHabits: await db.badHabits.toArray(),
        relapses: await db.relapses.toArray(), usageLogs: await db.usageLogs.toArray(), windowLogs: await db.windowLogs.toArray(),
        focusSessions: await db.focusSessions.toArray(), urges: await db.urges.toArray(), jokers: await db.jokers.toArray(),
        settings: s, today: '2026-11-12',
      }).total;
    };
    const before = await snapshot();
    expect(before).toBeGreaterThan(0);

    const backup = await createBackup();
    expect(backup.schemaVersion).toBe(SCHEMA_VERSION);
    const text = JSON.stringify(backup);
    await db.delete();
    await db.open();
    await restoreBackup(parseBackup(text));

    expect((await db.settings.get('settings'))!.userName).toBe('Ana');
    expect(await db.usageLogs.count()).toBe(1);
    expect(await db.jokers.count()).toBe(1);
    expect(await db.windowLogs.count()).toBe(1);
    expect((await db.focusSessions.get(f.id))!.status).toBe('done');
    expect((await db.urges.get(u.id))!.result).toBe('resisted');
    expect(await snapshot()).toBe(before);
  });
});
