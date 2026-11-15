import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, SCHEMA_VERSION } from './db';
import { backupDue, createBackup, parseBackup, restoreBackup } from './backup';
import { addRelapse, ensureSeeded, saveBadHabit, saveJournal, saveReview, setStatus } from './repo';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('JSON backup', () => {
  it('exports and re-imports every table (round trip)', async () => {
    await ensureSeeded('2026-11-12');
    const habit = (await db.habits.toArray())[0];
    await setStatus(habit.id, '2026-11-12', 'min');
    await saveJournal('2026-11-12', { line: 'Buen día', mood: 4 });
    await saveReview('2026-11-09', ['a', 'b', 'c']);
    const bad = await saveBadHabit({ name: 'Redes', icon: 'smartphone', startDate: '2026-11-01' });
    await addRelapse(bad.id, '2026-11-10');

    const backup = await createBackup();
    expect(backup.schemaVersion).toBe(SCHEMA_VERSION);
    const text = JSON.stringify(backup);

    // wipe and add unrelated data that must be replaced
    await db.delete();
    await db.open();
    await saveJournal('2030-01-01', { line: 'otro' });

    await restoreBackup(parseBackup(text));
    expect(await db.habits.count()).toBe(8);
    expect((await db.habitLogs.toArray())[0]).toMatchObject({ habitId: habit.id, date: '2026-11-12', status: 'min' });
    expect(await db.journal.get('2026-11-12')).toMatchObject({ line: 'Buen día', mood: 4 });
    expect(await db.journal.get('2030-01-01')).toBeUndefined();
    expect((await db.reviews.get('2026-11-09'))!.answers).toEqual(['a', 'b', 'c']);
    expect(await db.relapses.count()).toBe(1);
    // restoring the backup must not bring back the "make a backup" reminder
    expect((await db.settings.get('settings'))!.lastBackupAt).toBe(backup.exportedAt);
  });

  it('rejects invalid files with a clear message', () => {
    expect(() => parseBackup('no es json')).toThrow('JSON válido');
    expect(() => parseBackup('{"format":"otra"}')).toThrow('no es un respaldo');
    expect(() => parseBackup(JSON.stringify({ format: 'forja-backup', schemaVersion: SCHEMA_VERSION + 1, data: {} }))).toThrow('más nueva');
    expect(() =>
      parseBackup(JSON.stringify({ format: 'forja-backup', schemaVersion: 1, data: { habits: [{ name: 'sin id' }] } })),
    ).toThrow('sin id');
  });

  it('accepts backups with missing tables (treated as empty)', () => {
    const b = parseBackup(JSON.stringify({ format: 'forja-backup', schemaVersion: 1, exportedAt: 'x', data: { habits: [] } }));
    expect(b.data.journal).toEqual([]);
  });

  it('weekly reminder is due after 7 days or when never backed up', () => {
    const now = new Date('2026-11-12T12:00:00');
    expect(backupDue(undefined, now)).toBe(true);
    expect(backupDue(new Date('2026-11-10T12:00:00').toISOString(), now)).toBe(false);
    expect(backupDue(new Date('2026-11-04T12:00:00').toISOString(), now)).toBe(true);
  });
});
