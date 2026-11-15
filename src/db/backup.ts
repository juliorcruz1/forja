/** Versioned JSON backup: export, validate, migrate and import. */
import { db, SCHEMA_VERSION, TABLES, type TableName } from './db';
import { nowIso } from '../lib/id';
import { migrateHabitV1toV2, migrateSettingsV2toV3, withSocialHabit } from './migrations';
import type { BadHabit, Habit, Settings } from './types';
import { todayKey } from '../lib/dates';

export const BACKUP_FORMAT = 'forja-backup';

export interface Backup {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  data: Record<TableName, unknown[]>;
}

export async function createBackup(): Promise<Backup> {
  const data = {} as Record<TableName, unknown[]>;
  await db.transaction('r', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) data[t] = await db.table(t).toArray();
  });
  const exportedAt = nowIso();
  // The backup itself counts as the last backup, so restoring it doesn't re-trigger the reminder.
  data.settings = data.settings.map((s) => ({ ...(s as object), lastBackupAt: exportedAt }));
  return { format: BACKUP_FORMAT, schemaVersion: SCHEMA_VERSION, exportedAt, data };
}

/**
 * Migrations from older backup schema versions to the current one.
 * Add a step here whenever SCHEMA_VERSION increases: MIGRATIONS[1] turns v1 into v2, etc.
 */
const MIGRATIONS: Record<number, (b: Backup) => Backup> = {
  1: (b) => ({
    ...b,
    schemaVersion: 2,
    data: { ...b.data, habits: (b.data.habits as Habit[]).map(migrateHabitV1toV2) },
  }),
  // v2 -> v3 (Stage 2): same changes as the Dexie upgrade; new tables start empty.
  2: (b) => {
    const today = todayKey();
    const settings = (b.data.settings as Partial<Settings>[]).map((s) => migrateSettingsV2toV3(s, today));
    return {
      ...b,
      schemaVersion: 3,
      data: {
        ...b.data,
        settings,
        badHabits: settings.length ? withSocialHabit(b.data.badHabits as BadHabit[], today) : b.data.badHabits,
      },
    };
  },
};

export function migrateBackup(b: Backup): Backup {
  let cur = b;
  while (cur.schemaVersion < SCHEMA_VERSION) {
    const step = MIGRATIONS[cur.schemaVersion];
    if (!step) throw new Error(`No hay migración desde la versión ${cur.schemaVersion}.`);
    cur = step(cur);
  }
  return cur;
}

export function parseBackup(text: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
  const b = raw as Partial<Backup>;
  if (!b || typeof b !== 'object' || b.format !== BACKUP_FORMAT) throw new Error('Este archivo no es un respaldo de la app.');
  if (typeof b.schemaVersion !== 'number' || b.schemaVersion < 1) throw new Error('El respaldo no tiene una versión válida.');
  if (b.schemaVersion > SCHEMA_VERSION) throw new Error('El respaldo es de una versión más nueva de la app. Actualiza la app primero.');
  if (!b.data || typeof b.data !== 'object') throw new Error('El respaldo no contiene datos.');
  const data = {} as Record<TableName, unknown[]>;
  for (const t of TABLES) {
    const rows = (b.data as Record<string, unknown>)[t] ?? [];
    if (!Array.isArray(rows)) throw new Error(`Datos inválidos en "${t}".`);
    for (const r of rows) {
      if (!r || typeof r !== 'object' || typeof (r as { id?: unknown }).id !== 'string') throw new Error(`Registro sin id en "${t}".`);
    }
    data[t] = rows;
  }
  return migrateBackup({ format: BACKUP_FORMAT, schemaVersion: b.schemaVersion, exportedAt: String(b.exportedAt ?? ''), data });
}

export function backupSummary(b: Backup) {
  return {
    habits: b.data.habits.length,
    logs: b.data.habitLogs.length,
    journal: b.data.journal.length,
    badHabits: b.data.badHabits.length,
    exportedAt: b.exportedAt,
  };
}

/** Replaces ALL local data with the backup's content (atomic). */
export async function restoreBackup(b: Backup): Promise<void> {
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear();
      if (b.data[t].length) await db.table(t).bulkPut(b.data[t]);
    }
  });
}

export function backupFileName(date = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `forja-respaldo-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}.json`;
}

export async function markBackedUp() {
  const s = await db.settings.get('settings');
  if (s) await db.settings.put({ ...s, lastBackupAt: nowIso(), updatedAt: nowIso() });
}

/** True when the last backup is older than `days` (or never happened). */
export function backupDue(lastBackupAt: string | undefined, now = new Date(), days = 7): boolean {
  if (!lastBackupAt) return true;
  return now.getTime() - new Date(lastBackupAt).getTime() > days * 86400000;
}
