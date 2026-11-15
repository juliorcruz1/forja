import { describe, expect, it } from 'vitest';
import { defaultPunish, defaultSettings } from '../config/defaults';
import type { UsageLog, WeeklyReview, Weekday } from '../db/types';
import { dayProgress, HabitIndex, isDoneStatus, weeklyGoal } from './habits';
import { computeDebts } from './punish';
import { archiveMark, buildPrintWeek, type PrintInput } from './print';
import { computePoints } from './points';
import { bad, habit, log, logs, relapse } from './testUtils';

// Week Mon 2026-11-09 … Sun 15; today = Thu 12.
const T = '2026-01-01T00:00:00.000Z';
const today = '2026-11-12';
const settings = { ...defaultSettings('2026-11-02'), punish: { ...defaultPunish('2026-11-02') }, pointsStartDate: '2026-11-02' };
const read = habit({ id: 'read', name: 'Lectura', startDate: '2026-11-02', order: 1, minVersion: '2 páginas' });
const walk = habit({ id: 'walk', name: 'Caminata', startDate: '2026-11-02', required: false, order: 2 });
const gym = habit({ id: 'gym', name: 'Gym', startDate: '2026-11-02', order: 0, frequency: { type: 'weekly', target: 3, plannedDays: [0, 2, 4] as Weekday[] } });
const once = habit({ id: 'once', name: 'Llamar al banco', oneOffDate: '2026-11-10', startDate: '2026-11-10', required: false, order: 3 });
const later = habit({ id: 'later', name: 'Fuera', oneOffDate: '2026-11-20', startDate: '2026-11-20', order: 4 });
const smoke = bad({ id: 'smoke', name: 'Fumar', startDate: '2026-11-02' });
const social = bad({ id: 'soc', name: 'Redes', startDate: '2026-11-02', mode: 'limit', limitMinutes: 60, order: 1 });

const allLogs = [
  ...logs('read', { '2026-11-09': 'done', '2026-11-10': 'min', '2026-11-11': 'rest' }),
  ...logs('gym', { '2026-11-09': 'done', '2026-11-10': 'done' }),
  log('walk', '2026-11-11', 'done'),
  log('once', '2026-11-10', 'done'),
];
const usage: UsageLog[] = [{ id: 'soc:2026-11-09', badHabitId: 'soc', date: '2026-11-09', minutes: 45, createdAt: T, updatedAt: T }];
const reviews: WeeklyReview[] = [
  { id: '2026-11-02', weekStart: '2026-11-02', answers: ['a', 'b', 'Leer antes de dormir'], createdAt: T, updatedAt: T },
];

function makeInput(): PrintInput {
  const habits = [read, walk, gym, once, later];
  const idx = new HabitIndex(allLogs);
  const relapses = [relapse('smoke', '2026-11-10')];
  const points = computePoints({ habits, logs: allLogs, badHabits: [smoke, social], relapses, usageLogs: usage, settings, today });
  const debts = computeDebts({ habits, logs: allLogs, badHabits: [smoke, social], relapses, punish: settings.punish, today });
  return {
    habits, idx, badHabits: [smoke, social], relapses, usageLogs: usage, settings, dayMeta: [], jokers: [], points, debts,
    medals: [], medalDates: () => undefined, reviews, today,
    journal: [{ id: '2026-11-09', date: '2026-11-09', line: 'Buen arranque', reflection: '', gratitude: '', learning: '', notes: '', createdAt: T, updatedAt: T }],
  };
}

describe('weekly print data equals the real records', () => {
  const input = makeInput();
  const w = buildPrintWeek('2026-11-09', input);

  it('rows: only habits of that week, required first, every cell = the stored status', () => {
    expect(w.rows.map((r) => r.name)).toEqual(['Gym', 'Lectura', 'Caminata', 'Llamar al banco']);
    for (const r of w.rows) {
      for (const c of r.cells) expect(c.status).toBe(input.idx.status(r.habitId, c.date));
      expect(r.done).toBe(r.cells.filter((c) => c.active && isDoneStatus(c.status)).length);
    }
    const once_ = w.rows.find((r) => r.habitId === 'once')!;
    expect(once_.cells.filter((c) => c.active).map((c) => c.date)).toEqual(['2026-11-10']);
  });

  it('weekly goal (Gym) and planned days match', () => {
    const g = weeklyGoal(gym, input.idx, today, '2026-11-09');
    expect(w.rows[0].weekly).toEqual({ target: 3, count: g.count, met: false });
    expect(w.rows[0].cells.map((c) => c.planned)).toEqual([true, false, true, false, true, false, false]);
  });

  it('day percentages match Inicio, future days are blank', () => {
    for (const d of w.days) {
      const p = dayProgress(input.habits, d.date, input.idx, today);
      expect([d.done, d.total]).toEqual([p.done, p.total]);
      if (d.date > today) expect(d.pct).toBeNull();
    }
    expect(w.days[0]).toMatchObject({ label: 'Lun 9', journalLine: 'Buen arranque' });
    expect(w.days[1].pct).toBe(100); // minimum counts as done
  });

  it('archive marks: ✓ done, M minimum, D rest, – missed, blank when not scheduled or future', () => {
    const read_ = w.rows.find((r) => r.habitId === 'read')!;
    // 12 Nov is today and still open → blank, not a miss
    expect(read_.cells.map((c) => archiveMark(c, today))).toEqual(['✓', 'M', 'D', '', '', '', '']);
    // the next day, the same pending cell is printed as missed
    const next = buildPrintWeek('2026-11-09', { ...input, today: '2026-11-13' });
    expect(archiveMark(next.rows.find((r) => r.habitId === 'read')!.cells[3], '2026-11-13')).toBe('–');
  });

  it('bad habits, debts, points, review and next-week adjustment come from the records', () => {
    expect(w.bad.find((b) => b.id === 'smoke')).toMatchObject({ perDay: [0, 1, 0, 0, 0, 0, 0], total: 1 });
    expect(w.bad.find((b) => b.id === 'soc')).toMatchObject({ mode: 'limit', total: 45, limit: 60 });
    expect(w.debts.map((d) => d.date)).toEqual(input.debts.history.filter((d) => d.date >= '2026-11-09' && d.date <= '2026-11-15').map((d) => d.date).sort());
    const pts = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'].reduce((a, d) => a + (input.points.byDate.get(d)?.net ?? 0), 0);
    expect(w.points).toBe(pts);
    expect(w.previousAdjust).toBe('Leer antes de dormir');
    expect(w.review).toEqual([]);
  });

  it('a record change is reflected in the printout (no stale copy)', () => {
    const changed = { ...input, idx: new HabitIndex([...allLogs, log('read', '2026-11-12', 'done')]) };
    const w2 = buildPrintWeek('2026-11-09', changed);
    expect(w2.rows.find((r) => r.habitId === 'read')!.cells[3].status).toBe('done');
  });
});
