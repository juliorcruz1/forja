import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { createBackup, parseBackup, restoreBackup } from './backup';
import { findOrphans } from './integrity';
import {
  addRelapse, archiveHabit, deleteBadHabit, deleteHabit, habitRecordCount, pauseHabit, restoreHabit,
  saveBadHabit, saveHabit, setBadHabitLifecycle, setStatus, setWeekPlan,
} from './repo';
import { badHabitStats } from '../domain/bad';
import { dailyStreak, dayProgress, habitsForDay, HabitIndex } from '../domain/habits';
import { periodFor, periodStats } from '../domain/stats';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const snap = async () => ({
  habits: await db.habits.toArray(),
  idx: new HabitIndex(await db.habitLogs.toArray(), await db.weekPlans.toArray()),
});
const noOrphans = { habitLogs: [], weekPlans: [], relapses: [] };

async function readingWithHistory() {
  const h = await saveHabit({ name: 'Lectura', icon: 'book-open', kind: 'check', frequency: { type: 'daily' }, required: true, startDate: '2026-11-02' });
  for (const d of ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']) await setStatus(h.id, d, 'done');
  return h;
}

describe('archive', () => {
  it('removes the habit from today but keeps every record, its stats and its streak history', async () => {
    const h = await readingWithHistory();
    await archiveHabit(h.id, '2026-11-06');
    const { habits, idx } = await snap();
    const a = habits[0];
    expect(a).toMatchObject({ lifecycle: 'archived', archivedAt: '2026-11-06' });
    expect(habitsForDay(habits, '2026-11-06').required).toEqual([]); // gone from Inicio
    expect(habitsForDay(habits, '2026-11-05').required).toHaveLength(1); // past days still show it
    expect(await db.habitLogs.count()).toBe(4); // history kept
    expect(dayProgress(habits, '2026-11-06', idx, '2026-11-06').total).toBe(0); // no longer due
    const s = periodStats(habits, idx, periodFor('week', '2026-11-04'), '2026-11-06');
    expect(s.perHabit[0].tally).toEqual({ done: 4, slots: 4, pct: 100 }); // stats kept
  });

  it('a record already done on the archive day is kept in stats and streaks', async () => {
    const h = await readingWithHistory();
    await setStatus(h.id, '2026-11-06', 'done'); // done today, then archived today
    await archiveHabit(h.id, '2026-11-06');
    const { habits, idx } = await snap();
    expect(habitsForDay(habits, '2026-11-06').required).toEqual([]); // still leaves Inicio
    expect(dailyStreak(habits[0], idx, '2026-11-06')).toBe(5);
    const s = periodStats(habits, idx, periodFor('week', '2026-11-04'), '2026-11-06');
    expect(s.perHabit[0].tally).toEqual({ done: 5, slots: 5, pct: 100 });
  });

  it('archiving a paused habit closes the pause so a later restore works', async () => {
    const h = await readingWithHistory();
    await pauseHabit(h.id, '2026-11-06');
    await archiveHabit(h.id, '2026-11-08');
    await restoreHabit(h.id, '2026-11-10');
    const r = (await db.habits.get(h.id))!;
    expect(r.lifecycle).toBe('active');
    expect(r.pauses).toEqual([
      { from: '2026-11-06', to: '2026-11-07' },
      { from: '2026-11-08', to: '2026-11-09' },
    ]);
    const { habits } = await snap();
    expect(habitsForDay(habits, '2026-11-10').required).toHaveLength(1);
  });

  it('is included in the JSON backup with its records', async () => {
    const h = await readingWithHistory();
    await archiveHabit(h.id, '2026-11-06');
    const b = parseBackup(JSON.stringify(await createBackup()));
    expect((b.data.habits[0] as { lifecycle: string }).lifecycle).toBe('archived');
    expect(b.data.habitLogs).toHaveLength(4);
  });
});

describe('restore', () => {
  it('brings the habit back to Inicio; archived days do not count as misses', async () => {
    const h = await readingWithHistory();
    await archiveHabit(h.id, '2026-11-06');
    await restoreHabit(h.id, '2026-11-10');
    const r = (await db.habits.get(h.id))!;
    expect(r).toMatchObject({ lifecycle: 'active', pauses: [{ from: '2026-11-06', to: '2026-11-09' }] });
    expect(r.archivedAt).toBeUndefined();
    await setStatus(h.id, '2026-11-10', 'done');
    const { habits, idx } = await snap();
    expect(habitsForDay(habits, '2026-11-10').required).toHaveLength(1);
    // 4 days before the archive + today: the archived gap does not break the streak
    expect(dailyStreak(habits[0], idx, '2026-11-10')).toBe(5);
    const s = periodStats(habits, idx, periodFor('week', '2026-11-10'), '2026-11-10');
    expect(s.perHabit[0].tally.slots).toBe(1); // Nov 6–9 are not counted as missed
  });

  it('restoring on the same day it was archived leaves no gap', async () => {
    const h = await readingWithHistory();
    await archiveHabit(h.id, '2026-11-06');
    await restoreHabit(h.id, '2026-11-06');
    const r = (await db.habits.get(h.id))!;
    expect(r.pauses).toEqual([]);
    expect(r.lifecycle).toBe('active');
  });

  it('bad habits archive and restore, keeping their relapses', async () => {
    const b = await saveBadHabit({ name: 'Redes', icon: 'smartphone', startDate: '2026-11-01' });
    await addRelapse(b.id, '2026-11-05');
    await setBadHabitLifecycle(b.id, 'archived');
    expect((await db.badHabits.get(b.id))!.lifecycle).toBe('archived');
    expect(await db.relapses.count()).toBe(1);
    await setBadHabitLifecycle(b.id, 'active');
    const r = (await db.badHabits.get(b.id))!;
    expect(r.lifecycle).toBe('active');
    expect(r.archivedAt).toBeUndefined();
    expect(badHabitStats(r, await db.relapses.toArray(), '2026-11-12')).toMatchObject({ current: 7, best: 7, totalRelapses: 1 });
  });
});

describe('delete', () => {
  it('removes the habit, all its logs and week plans; nothing orphaned, other habits untouched', async () => {
    const h = await readingWithHistory();
    const gym = await saveHabit({ name: 'Gym', icon: 'dumbbell', kind: 'check', frequency: { type: 'weekly', target: 5, plannedDays: [] }, required: true, startDate: '2026-11-02' });
    await setStatus(gym.id, '2026-11-03', 'done');
    await setWeekPlan(gym.id, '2026-11-02', [0, 2, 4]);
    expect(await habitRecordCount(gym.id, 'good')).toBe(1);

    await deleteHabit(gym.id);
    expect(await db.habits.get(gym.id)).toBeUndefined();
    expect(await db.habitLogs.where('habitId').equals(gym.id).count()).toBe(0);
    expect(await db.weekPlans.count()).toBe(0);
    expect(await findOrphans()).toEqual(noOrphans);
    expect(await db.habitLogs.where('habitId').equals(h.id).count()).toBe(4);

    const { habits, idx } = await snap();
    const s = periodStats(habits, idx, periodFor('week', '2026-11-04'), '2026-11-06');
    expect(s.perHabit.map((p) => p.habit.name)).toEqual(['Lectura']);
  });

  it('deleting an archived habit also removes its kept history', async () => {
    const h = await readingWithHistory();
    await archiveHabit(h.id, '2026-11-06');
    await deleteHabit(h.id);
    expect(await db.habits.count()).toBe(0);
    expect(await db.habitLogs.count()).toBe(0);
    expect(await findOrphans()).toEqual(noOrphans);
  });

  it('removes a bad habit and all its relapses', async () => {
    const keep = await saveBadHabit({ name: 'Refrescos', icon: 'coffee', startDate: '2026-11-01' });
    const b = await saveBadHabit({ name: 'Redes', icon: 'smartphone', startDate: '2026-11-01' });
    await addRelapse(b.id, '2026-11-03');
    await addRelapse(b.id, '2026-11-07');
    await addRelapse(keep.id, '2026-11-04');
    expect(await habitRecordCount(b.id, 'bad')).toBe(2);
    await deleteBadHabit(b.id);
    expect(await db.badHabits.get(b.id)).toBeUndefined();
    expect(await db.relapses.count()).toBe(1);
    expect(await findOrphans()).toEqual(noOrphans);
  });

  it('the backup made after a delete contains no trace of it', async () => {
    const h = await readingWithHistory();
    const b = await saveBadHabit({ name: 'Redes', icon: 'smartphone', startDate: '2026-11-01' });
    await addRelapse(b.id, '2026-11-03');
    await deleteHabit(h.id);
    await deleteBadHabit(b.id);
    const backup = parseBackup(JSON.stringify(await createBackup()));
    expect(backup.data.habits).toEqual([]);
    expect(backup.data.habitLogs).toEqual([]);
    expect(backup.data.badHabits).toEqual([]);
    expect(backup.data.relapses).toEqual([]);
    await restoreBackup(backup);
    expect(await findOrphans()).toEqual(noOrphans);
  });
});
