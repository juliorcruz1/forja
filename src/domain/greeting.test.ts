import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { normalizeSettings } from '../config/defaults';
import { db } from '../db/db';
import { ensureSeeded, updateSettings } from '../db/repo';
import { addDays } from '../lib/dates';
import { BANK_SIZES, dailyLine, greeting, type LineContext, momentOf, variantIndex } from './greeting';

const at = (h: number, m = 0) => new Date(2026, 10, 17, h, m);

describe('greeting by local time', () => {
  it('switches exactly at the hour limits', () => {
    expect(greeting(at(4, 59), 'Ana')).toBe('Buenas noches, Ana');
    expect(greeting(at(5, 0), 'Ana')).toBe('Buenos días, Ana');
    expect(greeting(at(11, 59), 'Ana')).toBe('Buenos días, Ana');
    expect(greeting(at(12, 0), 'Ana')).toBe('Buenas tardes, Ana');
    expect(greeting(at(18, 59), 'Ana')).toBe('Buenas tardes, Ana');
    expect(greeting(at(19, 0), 'Ana')).toBe('Buenas noches, Ana');
    expect(greeting(at(0, 30), 'Ana')).toBe('Buenas noches, Ana');
    expect(momentOf(at(23, 59))).toBe('night');
  });

  it('without a name, just the greeting', () => {
    expect(greeting(at(9), '  ')).toBe('Buenos días');
  });
});

describe('name from Ajustes', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('starts as "Julior" and follows the setting when it changes', async () => {
    await ensureSeeded('2026-11-15');
    let s = normalizeSettings((await db.settings.get('settings'))!);
    expect(s.userName).toBe('Julior');
    expect(greeting(at(9), s.userName)).toBe('Buenos días, Julior');
    await updateSettings({ userName: 'Julio César' });
    s = normalizeSettings((await db.settings.get('settings'))!);
    expect(greeting(at(20), s.userName)).toBe('Buenas noches, Julio César');
  });

  it('the name is never hard-coded in the greeting or the screens', () => {
    const sources = import.meta.glob(['../**/*.ts', '../**/*.tsx', '!../**/*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    expect(Object.keys(sources).length).toBeGreaterThan(30);
    const offenders = Object.entries(sources)
      .filter(([path, src]) => !path.endsWith('config/defaults.ts') && /Julior/.test(src))
      .map(([path]) => path);
    expect(offenders).toEqual([]); // only the editable default lives in config/defaults.ts
  });
});

const ctx = (p: Partial<LineContext>): LineContext => ({
  date: '2026-11-17', hour: 8, total: 6, done: 0, missing: ['Lectura', 'Biblia', 'Clips', 'Sueño', 'Hidratación', 'Gym'],
  isWorkDay: true, workStart: '07:00', pointsToday: 0, bedtime: '22:00', criticalNight: false, ...p,
});

describe('line under the greeting', () => {
  it('morning: work day vs rest day messages are different', () => {
    for (let i = 0; i < 6; i++) {
      const date = addDays('2026-11-17', i);
      const work = dailyLine(ctx({ date, isWorkDay: true, workStart: '05:00' }));
      const rest = dailyLine(ctx({ date, isWorkDay: false }));
      expect(work).not.toBe(rest);
    }
    const anyWork = Array.from({ length: 6 }, (_, i) => dailyLine(ctx({ date: addDays('2026-11-17', i), workStart: '05:00' })));
    expect(anyWork.some((l) => l.includes('5:00 AM'))).toBe(true);
    const anyRest = Array.from({ length: 6 }, (_, i) => dailyLine(ctx({ date: addDays('2026-11-17', i), isWorkDay: false })));
    expect(anyRest.every((l) => !l.includes('entras'))).toBe(true);
  });

  it('afternoon: says how far along and what is missing', () => {
    const lines = Array.from({ length: 6 }, (_, i) =>
      dailyLine(ctx({ date: addDays('2026-11-17', i), hour: 15, done: 4, missing: ['Clips', 'Sueño'] })),
    );
    expect(lines.every((l) => l.includes('Clips') || l.includes('4'))).toBe(true);
  });

  it('night: summary with points and bedtime; 9 PM on critical nights', () => {
    const normal = Array.from({ length: 6 }, (_, i) =>
      dailyLine(ctx({ date: addDays('2026-11-17', i), hour: 21, done: 5, pointsToday: 64, missing: ['Sueño'] })),
    );
    expect(normal.every((l) => l.includes('10:00 PM'))).toBe(true);
    const critical = dailyLine(ctx({ date: '2026-11-19', hour: 20, criticalNight: true, bedtime: '21:00', nextStart: '05:00' }));
    expect(critical).toContain('9:00 PM');
    expect(critical).toContain('5:00 AM');
  });

  it('never blames: no guilt words on a bad day', () => {
    for (let i = 0; i < 12; i++) {
      for (const hour of [8, 15, 21]) {
        const l = dailyLine(ctx({ date: addDays('2026-11-17', i), hour, done: 0 }));
        expect(l).not.toMatch(/fallaste|culpa|deberías|mal/i);
      }
    }
  });

  it('banks have at least 6 variants per moment', () => {
    expect(BANK_SIZES.morning).toBeGreaterThanOrEqual(6);
    expect(BANK_SIZES.afternoon).toBeGreaterThanOrEqual(6);
    expect(BANK_SIZES.night).toBeGreaterThanOrEqual(6);
  });

  it('the same phrase never shows two days in a row', () => {
    for (const hour of [8, 15, 21]) {
      let prev = '';
      for (let i = 0; i < 60; i++) {
        const line = dailyLine(ctx({ date: addDays('2026-11-01', i), hour, done: 2 }));
        expect(line).not.toBe(prev);
        prev = line;
      }
    }
    for (let i = 0; i < 400; i++) {
      const d = addDays('2026-01-01', i);
      expect(variantIndex(d, 6)).not.toBe(variantIndex(addDays(d, 1), 6));
    }
  });
});
