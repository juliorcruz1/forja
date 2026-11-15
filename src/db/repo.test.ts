import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
  addRelapse, deleteRelapse, ensureSeeded, incrementCount, pauseHabit, resumeHabit, saveHabit, setWeekPlan,
  toggleChecklistItem, toggleDone, updateRelapse, saveBadHabit,
} from './repo';
import { badHabitStats } from '../domain/bad';
import { HabitIndex, weeklyGoal } from '../domain/habits';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('repository', () => {
  it('seeds defaults once, without personal data', async () => {
    await ensureSeeded('2026-11-12');
    await ensureSeeded('2026-11-12');
    const habits = await db.habits.orderBy('order').toArray();
    expect(habits.map((h) => h.name)).toEqual([
      'Gym', 'Lectura', 'Biblia', 'Clips', 'Hidratación', 'Suplementos', 'Sueño', 'Caminata familiar',
    ]);
    expect(habits.find((h) => h.name === 'Suplementos')!.checklist).toEqual([]);
    expect(habits.find((h) => h.name === 'Caminata familiar')!.required).toBe(false);
    expect(habits.every((h) => h.id && h.createdAt && h.updatedAt)).toBe(true);
  });

  it('stores one log per habit and date; fast +1 taps are not lost', async () => {
    const h = await saveHabit({ name: 'Agua', icon: 'droplets', kind: 'counter', counterTarget: 3, frequency: { type: 'daily' }, required: true });
    await Promise.all([incrementCount(h, '2026-11-12'), incrementCount(h, '2026-11-12'), incrementCount(h, '2026-11-12')]);
    const logs = await db.habitLogs.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0].count).toBe(3);
    expect(logs[0].status).toBe('done');
  });

  it('toggles done and checklist items', async () => {
    const h = await saveHabit({
      name: 'Lista', icon: 'pill', kind: 'checklist', frequency: { type: 'daily' }, required: true,
      checklist: [
        { id: 'a', name: 'A', required: true, essential: true },
        { id: 'b', name: 'B', required: true, essential: false },
      ],
    });
    await toggleChecklistItem(h, '2026-11-12', 'a');
    expect((await db.habitLogs.toArray())[0].status).toBe('min');
    await toggleChecklistItem(h, '2026-11-12', 'b');
    expect((await db.habitLogs.toArray())[0].status).toBe('done');
    await toggleDone(h, '2026-11-12');
    expect((await db.habitLogs.toArray())[0].status).toBe('pending');
  });

  it('week plan overrides apply to one week only', async () => {
    const h = await saveHabit({ name: 'Gym', icon: 'dumbbell', kind: 'check', frequency: { type: 'weekly', target: 5, plannedDays: [0, 1, 2, 3, 6] }, required: true, startDate: '2026-11-01' });
    await setWeekPlan(h.id, '2026-11-09', [0, 1, 2, 4, 6]);
    const idx = new HabitIndex(await db.habitLogs.toArray(), await db.weekPlans.toArray());
    const fresh = (await db.habits.get(h.id))!;
    expect(weeklyGoal(fresh, idx, '2026-11-12').planned).toEqual([0, 1, 2, 4, 6]);
    expect(weeklyGoal(fresh, idx, '2026-11-17').planned).toEqual([0, 1, 2, 3, 6]);
  });

  it('pause and resume record a closed pause range', async () => {
    const h = await saveHabit({ name: 'X', icon: 'target', kind: 'check', frequency: { type: 'daily' }, required: true });
    await pauseHabit(h.id, '2026-11-10');
    await resumeHabit(h.id, '2026-11-13');
    const fresh = (await db.habits.get(h.id))!;
    expect(fresh.lifecycle).toBe('active');
    expect(fresh.pauses).toEqual([{ from: '2026-11-10', to: '2026-11-12' }]);
  });

  it('relapses can be added, edited and deleted', async () => {
    const b = await saveBadHabit({ name: 'Redes', icon: 'smartphone', startDate: '2026-11-01' });
    const r = await addRelapse(b.id, '2026-11-10', 'nota');
    expect(badHabitStats(b, await db.relapses.toArray(), '2026-11-12').current).toBe(2);
    await updateRelapse(r.id, { date: '2026-11-11' });
    expect(badHabitStats(b, await db.relapses.toArray(), '2026-11-12').current).toBe(1);
    await deleteRelapse(r.id);
    expect(badHabitStats(b, await db.relapses.toArray(), '2026-11-12').current).toBe(11);
  });
});
