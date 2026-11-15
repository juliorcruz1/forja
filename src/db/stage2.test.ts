import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { applyJoker, removeJoker } from './repo';

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

import { deleteBadHabit, saveBadHabit, setUsage } from './repo';
import { findOrphans } from './integrity';
import { usageOn, usageTrend, withinStreak } from '../domain/social';

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

import { finishWindow, startWindow } from './repo';

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

import { cancelFocus, settleFocus, startFocus } from './repo';
import { expiredRunning, focusTotals, formatClock, remainingMs, runningSession } from '../domain/focus';

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
