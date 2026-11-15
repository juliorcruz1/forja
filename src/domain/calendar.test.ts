import { describe, expect, it } from 'vitest';
import type { DaySchedule, Weekday } from '../db/types';
import { type CalendarInput, dayInfo, monthInfo } from './calendar';
import { HabitIndex } from './habits';
import { habit, log, logs, plan } from './testUtils';

// Week: Mon 2026-11-09 … Sun 2026-11-15. Today = Fri 13.
const work: DaySchedule[] = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ off: i >= 5, start: '09:00', end: '18:00' }));
const read = habit({ id: 'read', name: 'Lectura', startDate: '2026-11-02' });
const water = habit({ id: 'water', name: 'Agua', startDate: '2026-11-02' });
const gym = habit({
  id: 'gym', name: 'Gym', startDate: '2026-11-02', frequency: { type: 'weekly', target: 3, plannedDays: [0, 2, 4] as Weekday[] },
});

function input(l = [] as ReturnType<typeof log>[], extra: Partial<CalendarInput> = {}): CalendarInput {
  return {
    habits: [read, water, gym], idx: new HabitIndex(l), today: '2026-11-13', settings: { work }, ...extra,
  };
}

describe('calendar day states', () => {
  it('perfect, partial, missed, open and future', () => {
    const l = [
      ...logs('read', { '2026-11-09': 'done', '2026-11-10': 'done', '2026-11-13': 'done' }),
      ...logs('water', { '2026-11-09': 'min', '2026-11-12': 'skipped' }),
    ];
    const i = input(l);
    expect(dayInfo('2026-11-09', i).kind).toBe('perfect'); // minimum counts as done
    expect(dayInfo('2026-11-10', i)).toMatchObject({ kind: 'partial', done: 1, total: 2 });
    expect(dayInfo('2026-11-12', i).kind).toBe('missed');
    expect(dayInfo('2026-11-13', i)).toMatchObject({ kind: 'open', isToday: true });
    expect(dayInfo('2026-11-14', i).kind).toBe('future');
  });

  it('rest days: everything marked as rest is "rest", never missed', () => {
    const l = logs('read', { '2026-11-11': 'rest' }).concat(logs('water', { '2026-11-11': 'rest' }));
    expect(dayInfo('2026-11-11', input(l)).kind).toBe('rest');
    // one habit resting, the other done → perfect (rest never counts against)
    const l2 = logs('read', { '2026-11-11': 'rest' }).concat(logs('water', { '2026-11-11': 'done' }));
    expect(dayInfo('2026-11-11', input(l2)).kind).toBe('perfect');
  });

  it('days before any habit exist are empty', () => {
    expect(dayInfo('2026-10-30', input()).kind).toBe('empty');
  });

  it('weekly habits: planned vs done (Gym)', () => {
    const l = logs('gym', { '2026-11-09': 'done', '2026-11-10': 'done' });
    const i = input(l);
    expect(dayInfo('2026-11-09', i).weekly).toEqual([{ habitId: 'gym', name: 'Gym', planned: true, done: true }]);
    expect(dayInfo('2026-11-10', i).weekly).toEqual([{ habitId: 'gym', name: 'Gym', planned: false, done: true }]);
    expect(dayInfo('2026-11-11', i).weekly).toEqual([{ habitId: 'gym', name: 'Gym', planned: true, done: false }]);
    expect(dayInfo('2026-11-12', i).weekly).toEqual([]);
    // future planned days are shown too
    expect(dayInfo('2026-11-13', i).weekly[0]).toMatchObject({ planned: true });
    // a planned Gym day that wasn't done doesn't make the day partial while the goal is still reachable
    const only = logs('read', { '2026-11-11': 'done' }).concat(logs('water', { '2026-11-11': 'done' }));
    expect(dayInfo('2026-11-11', input(only)).kind).toBe('perfect');
  });

  it('per-week plans override the default planned days', () => {
    const idx = new HabitIndex([], [plan('gym', '2026-11-09', [1, 3])]);
    const i = { ...input(), idx };
    expect(dayInfo('2026-11-09', i).weekly).toEqual([]);
    expect(dayInfo('2026-11-10', i).weekly[0]).toMatchObject({ planned: true, done: false });
  });

  it('work days, heavy days and comodín flags', () => {
    const i = input([], {
      dayMeta: [{ id: '2026-11-10', date: '2026-11-10', heavy: true, createdAt: '', updatedAt: '' }],
      jokers: [{ id: 'j', date: '2026-11-11', weekStart: '2026-11-09', createdAt: '', updatedAt: '' }],
    });
    expect(dayInfo('2026-11-09', i).work).toMatchObject({ start: '09:00' });
    expect(dayInfo('2026-11-14', i).work).toBeUndefined(); // Saturday off
    expect(dayInfo('2026-11-10', i).heavy).toBe(true);
    expect(dayInfo('2026-11-11', i).joker).toBe(true);
  });
});

describe('month view', () => {
  it('weeks start on Monday and the summary counts each state', () => {
    const l = [
      ...logs('read', { '2026-11-09': 'done', '2026-11-10': 'done' }),
      ...logs('water', { '2026-11-09': 'done' }),
      ...logs('gym', { '2026-11-09': 'done' }),
    ];
    const m = monthInfo('2026-11-01', input(l));
    expect(m.days).toHaveLength(30);
    expect(m.lead).toBe(6); // 1 Nov 2026 is a Sunday → 6 blanks before it
    expect(m.summary.perfect).toBe(1);
    expect(m.summary.partial).toBe(1);
    // 2–8 Nov + 11, 12 Nov missed (no records at all)
    expect(m.summary.missed).toBe(9);
    // Gym: planned days up to today (2,4,6,9,11,13 Nov) — 1 done, 6 planned
    expect(m.summary.planned).toBe(6);
    expect(m.summary.plannedDone).toBe(1);
  });

  it('editing a past day changes the derived state (recalculation)', () => {
    const before = input(logs('read', { '2026-11-12': 'done' }));
    expect(dayInfo('2026-11-12', before).kind).toBe('partial');
    const after = input(logs('read', { '2026-11-12': 'done' }).concat(logs('water', { '2026-11-12': 'done' })));
    expect(dayInfo('2026-11-12', after).kind).toBe('perfect');
    const removed = input([]);
    expect(dayInfo('2026-11-12', removed).kind).toBe('missed');
  });
});
