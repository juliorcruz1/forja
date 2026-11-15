/**
 * Data migrations shared by the Dexie schema upgrades (db.ts) and the JSON
 * backup importer (backup.ts), so old backups get the same fixes.
 */
import type { Habit } from './types';

/**
 * v1 -> v2: v1 seeded the Gym with planned days [L, M, X, J, D]. From v2 there are
 * no planned days by default; the user marks them. Only an untouched seed
 * (never edited: createdAt === updatedAt) is cleared, so user choices are kept.
 */
export function migrateHabitV1toV2(h: Habit): Habit {
  const f = h.frequency;
  const oldDefault = f.type === 'weekly' && f.plannedDays.join(',') === '0,1,2,3,6';
  if (h.name === 'Gym' && oldDefault && h.createdAt === h.updatedAt) {
    return { ...h, frequency: { ...f, plannedDays: [] } };
  }
  return h;
}
