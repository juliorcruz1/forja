import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { ForjaDB, SCHEMA_VERSION } from './db';
import { parseBackup } from './backup';
import type { Habit } from './types';

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
