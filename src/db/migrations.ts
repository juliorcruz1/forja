/**
 * Data migrations shared by the Dexie schema upgrades (db.ts) and the JSON
 * backup importer (backup.ts), so old backups get the same fixes.
 */
import type { BadHabit, Habit, Settings } from './types';
import { defaultSocialHabit, normalizeSettings } from '../config/defaults';
import type { DateKey } from '../lib/dates';

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

/**
 * v2 -> v3 (Stage 2): settings get points, levels, name, wake times, phone-free
 * windows and replacements. Points start counting from the upgrade day, so days
 * before Stage 2 never add or subtract points.
 */
export function migrateSettingsV2toV3(s: Partial<Settings>, today: DateKey): Settings {
  return normalizeSettings({ ...s, pointsStartDate: s.pointsStartDate ?? today }, today);
}

/** v2 -> v3: adds the suggested "Redes / scroll" limit habit unless one already exists. */
export function withSocialHabit(bad: BadHabit[], today: DateKey): BadHabit[] {
  const exists = bad.some((b) => b.mode === 'limit' || /redes|scroll/i.test(b.name));
  return exists ? bad : [...bad, defaultSocialHabit(today, bad.length)];
}
