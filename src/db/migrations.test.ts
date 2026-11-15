import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { ForjaDB, SCHEMA_VERSION } from './db';
import { parseBackup } from './backup';
import type { Habit, Settings } from './types';
import { withSocialHabit } from './migrations';

const T = '2026-11-14T10:00:00.000Z';
const v1Gym = (p: Partial<Habit> = {}): Habit => ({
  id: 'gym', name: 'Gym', icon: 'dumbbell', kind: 'check', required: true, lifecycle: 'active',
  frequency: { type: 'weekly', target: 5, plannedDays: [0, 1, 2, 3, 6] },
  startDate: '2026-11-14', pauses: [], order: 0, createdAt: T, updatedAt: T, ...p,
});

describe('schema migration v1 → v2', () => {
  it('upgrades an existing v1 database: untouched Gym loses default planned days', async () => {
    const name = 'forja-migration-test';
    const old = new Dexie(name);
    old.version(1).stores({ habits: 'id, lifecycle, order' });
    await old.open();
    await old.table('habits').bulkPut([
      v1Gym(),
      v1Gym({ id: 'edited', updatedAt: '2026-11-15T00:00:00.000Z' }), // the user edited it: keep
    ]);
    old.close();

    const db = new ForjaDB(name);
    await db.open();
    expect(db.verno).toBe(SCHEMA_VERSION);
    const gym = (await db.habits.get('gym'))!;
    expect(gym.frequency).toEqual({ type: 'weekly', target: 5, plannedDays: [] });
    const edited = (await db.habits.get('edited'))!;
    expect(edited.frequency).toMatchObject({ plannedDays: [0, 1, 2, 3, 6] });
    db.close();
  });

  it('importing a v1 backup applies the same migration', () => {
    const b = parseBackup(JSON.stringify({ format: 'forja-backup', schemaVersion: 1, exportedAt: T, data: { habits: [v1Gym()] } }));
    expect(b.schemaVersion).toBe(SCHEMA_VERSION);
    expect((b.data.habits[0] as Habit).frequency).toMatchObject({ plannedDays: [] });
  });
});

describe('schema migration v2 → v3 (Stage 2)', () => {
  it('upgrades a Stage 1 database: settings get points defaults and the Redes suggestion is added', async () => {
    const name = 'forja-v2-to-v3';
    const old = new Dexie(name);
    old.version(2).stores({
      habits: 'id, lifecycle, order',
      habitLogs: 'id, &[habitId+date], habitId, date',
      weekPlans: 'id, habitId, weekStart',
      badHabits: 'id, lifecycle, order',
      relapses: 'id, badHabitId, date',
      journal: 'id, date',
      reviews: 'id, weekStart',
      dayMeta: 'id, date',
      settings: 'id',
    });
    await old.open();
    const stage1Settings = {
      id: 'settings', createdAt: T, updatedAt: T, work: [], bedtime: Array(7).fill('22:00'),
      criticalBedtime: '21:00', earlyStartThreshold: '06:00', weekStartsOn: 'monday', seeded: true, lastBackupAt: T,
    };
    await old.table('settings').put(stage1Settings);
    await old.table('habits').put(v1Gym({ id: 'g', frequency: { type: 'weekly', target: 5, plannedDays: [] } }));
    await old.table('habitLogs').put({ id: 'l1', habitId: 'g', date: '2026-11-10', status: 'done', createdAt: T, updatedAt: T });
    old.close();

    const db = new ForjaDB(name);
    await db.open();
    expect(db.verno).toBe(SCHEMA_VERSION); // upgraded through every version
    const s = (await db.settings.get('settings'))!;
    expect(s.points.done).toBe(10);
    expect(s.levels.map((l) => l.name)).toEqual(['Chispa', 'Brasa', 'Hierro', 'Acero']);
    expect(s.userName).toBe('Julior');
    expect(s.pointsStartDate).toMatch(/^\d{4}-\d{2}-\d{2}$/); // the upgrade day
    expect(s.lastBackupAt).toBe(T); // Stage 1 values kept
    const bad = await db.badHabits.toArray();
    expect(bad).toHaveLength(1);
    expect(bad[0]).toMatchObject({ name: 'Redes / scroll', mode: 'limit', limitMinutes: 60 });
    expect(await db.habitLogs.count()).toBe(1); // history untouched
    expect(await db.focusSessions.count()).toBe(0);
    db.close();
  });

  it('does not duplicate Redes if the user already has one', () => {
    const today = '2026-11-15';
    const mine = { id: 'x', name: 'Redes sociales', icon: 'smartphone', startDate: today, lifecycle: 'active' as const, order: 0, createdAt: T, updatedAt: T };
    expect(withSocialHabit([mine], today)).toHaveLength(1);
  });

  it('imports a Stage 1 (v2) backup: settings migrated, new tables empty', () => {
    const b = parseBackup(JSON.stringify({
      format: 'forja-backup', schemaVersion: 2, exportedAt: T,
      data: { settings: [{ id: 'settings', createdAt: T, updatedAt: T, bedtime: Array(7).fill('22:00') }], habits: [v1Gym()], badHabits: [] },
    }));
    expect(b.schemaVersion).toBe(SCHEMA_VERSION);
    expect((b.data.settings[0] as Settings).points.missed).toBe(5);
    expect((b.data.badHabits[0] as { mode?: string }).mode).toBe('limit');
    expect(b.data.focusSessions).toEqual([]);
    expect(b.data.urges).toEqual([]);
  });

  it('imports a v1 backup through both migrations', () => {
    const b = parseBackup(JSON.stringify({ format: 'forja-backup', schemaVersion: 1, exportedAt: T, data: { habits: [v1Gym()] } }));
    expect(b.schemaVersion).toBe(SCHEMA_VERSION);
    expect((b.data.habits[0] as Habit).frequency).toMatchObject({ plannedDays: [] });
  });
});

describe('schema migration v3 → v4 (Stage 3)', () => {
  it('upgrades a Stage 2 database: debts start on the upgrade day, history untouched', async () => {
    const name = 'forja-v3-to-v4';
    const old = new Dexie(name);
    old.version(3).stores({
      habits: 'id, lifecycle, order', habitLogs: 'id, &[habitId+date], habitId, date', weekPlans: 'id, habitId, weekStart',
      badHabits: 'id, lifecycle, order', relapses: 'id, badHabitId, date', journal: 'id, date', reviews: 'id, weekStart',
      dayMeta: 'id, date', settings: 'id', jokers: 'id, date, weekStart', usageLogs: 'id, badHabitId, date',
      windowLogs: 'id, date', focusSessions: 'id, date, status', urges: 'id, date',
    });
    await old.open();
    await old.table('settings').put({ id: 'settings', createdAt: T, updatedAt: T, userName: 'Ana', pointsStartDate: '2026-11-01', bedtime: Array(7).fill('22:00') });
    await old.table('habitLogs').put({ id: 'l1', habitId: 'g', date: '2026-11-10', status: 'done', createdAt: T, updatedAt: T });
    await old.table('focusSessions').put({ id: 'f', date: '2026-11-10', label: 'Clips', plannedMin: 25, startAt: T, status: 'done', createdAt: T, updatedAt: T });
    old.close();

    const db = new ForjaDB(name);
    await db.open();
    expect(db.verno).toBe(4);
    const s = (await db.settings.get('settings'))!;
    expect(s.userName).toBe('Ana'); // Stage 2 values kept
    expect(s.pointsStartDate).toBe('2026-11-01');
    expect(s.punish.enabled).toBe(true);
    expect(s.punish.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(s.punish.types).toEqual(['habitDebt', 'firstThings', 'task', 'jar']);
    expect(s.paperSize).toBe('letter');
    expect(await db.habitLogs.count()).toBe(1);
    expect(await db.focusSessions.count()).toBe(1);
    expect(await db.debtEvents.count()).toBe(0);
    expect(await db.medals.count()).toBe(0);
    db.close();
  });

  it('imports a Stage 2 (v3) backup and an old v1 backup into v4', () => {
    const v3 = parseBackup(JSON.stringify({
      format: 'forja-backup', schemaVersion: 3, exportedAt: T,
      data: { settings: [{ id: 'settings', createdAt: T, updatedAt: T, userName: 'Ana' }], habits: [v1Gym()] },
    }));
    expect(v3.schemaVersion).toBe(4);
    expect((v3.data.settings[0] as Settings).punish.jarAmount).toBe(1);
    expect((v3.data.settings[0] as Settings).userName).toBe('Ana');
    expect(v3.data.debtEvents).toEqual([]);
    expect(v3.data.jarEmpties).toEqual([]);
    const v1 = parseBackup(JSON.stringify({ format: 'forja-backup', schemaVersion: 1, exportedAt: T, data: { habits: [v1Gym()] } }));
    expect(v1.schemaVersion).toBe(4);
  });
});
