import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { createBackup, parseBackup, restoreBackup } from './backup';
import { createOneOff, deleteHabit, saveHabit, setStatus, toggleDone, updateOneOff } from './repo';
import { dayProgress, habitsForDay, HabitIndex, overallStreak } from '../domain/habits';
import { periodFor, periodStats } from '../domain/stats';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const snapshot = async () => ({
  habits: await db.habits.toArray(),
  idx: new HabitIndex(await db.habitLogs.toArray(), await db.weekPlans.toArray()),
});

describe('"Solo para hoy" one-day habits', () => {
  it('appears only on its date, in its own list (not in required or extras)', async () => {
    await createOneOff('2026-11-12', 'Llamar a mamá', 'users');
    const { habits } = await snapshot();
    expect(habitsForDay(habits, '2026-11-12').oneOff.map((h) => h.name)).toEqual(['Llamar a mamá']);
    expect(habitsForDay(habits, '2026-11-12').required).toEqual([]);
    expect(habitsForDay(habits, '2026-11-12').extras).toEqual([]);
    expect(habitsForDay(habits, '2026-11-11').oneOff).toEqual([]);
    expect(habitsForDay(habits, '2026-11-13').oneOff).toEqual([]);
  });

  it('counts as an extra and never changes the day percentage or streaks', async () => {
    const read = await saveHabit({ name: 'Lectura', icon: 'book-open', kind: 'check', frequency: { type: 'daily' }, required: true, startDate: '2026-11-10' });
    await setStatus(read.id, '2026-11-10', 'done');
    await setStatus(read.id, '2026-11-11', 'done');
    const one = await createOneOff('2026-11-12', 'Tarea única', 'target');

    let { habits, idx } = await snapshot();
    const before = dayProgress(habits, '2026-11-12', idx, '2026-11-12');
    const streakBefore = overallStreak(habits, idx, '2026-11-12');

    await toggleDone(one, '2026-11-12');
    ({ habits, idx } = await snapshot());
    const after = dayProgress(habits, '2026-11-12', idx, '2026-11-12');
    expect(after.total).toBe(before.total); // 1: only Lectura
    expect(after.pct).toBe(before.pct);
    expect(after.extrasDone).toBe(before.extrasDone + 1);
    expect(overallStreak(habits, idx, '2026-11-12')).toBe(streakBefore);
    // An undone one-day habit is never "missing" and never a failure
    const other = await createOneOff('2026-11-12', 'Sin hacer', 'target');
    ({ habits, idx } = await snapshot());
    const p = dayProgress(habits, '2026-11-12', idx, '2026-11-13');
    expect(p.missing.map((h) => h.id)).not.toContain(other.id);
    expect(p.total).toBe(1);
  });

  it('can be edited (name and icon) and stays in history and stats', async () => {
    const one = await createOneOff('2026-11-12', 'Algo', 'target');
    await toggleDone(one, '2026-11-12');
    await updateOneOff(one.id, 'Algo especial', 'sparkles');
    const { habits, idx } = await snapshot();
    const h = habits.find((x) => x.id === one.id)!;
    expect(h).toMatchObject({ name: 'Algo especial', icon: 'sparkles', oneOffDate: '2026-11-12', required: false });
    expect(idx.status(one.id, '2026-11-12')).toBe('done');
    // still visible when looking back at that day
    expect(habitsForDay(habits, '2026-11-12').oneOff).toHaveLength(1);
    const s = periodStats(habits, idx, periodFor('week', '2026-11-12'), '2026-11-20');
    expect(s.oneOffDone).toBe(1);
    expect(s.extras).toEqual([]); // not listed one by one
    expect(s.perHabit).toEqual([]);
    expect(s.overall.slots).toBe(0);
  });

  it('can be deleted together with its record', async () => {
    const one = await createOneOff('2026-11-12', 'Borrar', 'target');
    await toggleDone(one, '2026-11-12');
    await deleteHabit(one.id);
    expect(await db.habits.count()).toBe(0);
    expect(await db.habitLogs.count()).toBe(0);
  });

  it('survives a backup round trip', async () => {
    const one = await createOneOff('2026-11-12', 'Respaldo', 'target');
    await toggleDone(one, '2026-11-12');
    const text = JSON.stringify(await createBackup());
    await db.delete();
    await db.open();
    await restoreBackup(parseBackup(text));
    const { habits, idx } = await snapshot();
    expect(habits[0].oneOffDate).toBe('2026-11-12');
    expect(idx.status(one.id, '2026-11-12')).toBe('done');
  });
});
