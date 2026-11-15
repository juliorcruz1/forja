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
