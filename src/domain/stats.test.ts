import { describe, expect, it } from 'vitest';
import { HabitIndex } from './habits';
import { habitTally, observation, periodFor, periodStats, previousPeriod } from './stats';
import { habit, logs } from './testUtils';

describe('periods', () => {
  it('builds week/month/year ranges and the previous one', () => {
    expect(periodFor('week', '2026-11-12')).toMatchObject({ from: '2026-11-09', to: '2026-11-15' });
    expect(periodFor('month', '2026-02-10')).toMatchObject({ from: '2026-02-01', to: '2026-02-28' });
    expect(previousPeriod(periodFor('month', '2026-01-10'))).toMatchObject({ from: '2025-12-01', to: '2025-12-31' });
    expect(periodFor('year', '2026-05-05')).toMatchObject({ from: '2026-01-01', to: '2026-12-31' });
  });
});

describe('compliance from real records', () => {
  it('daily habit: done days / scheduled days, future ignored', () => {
    const h = habit({ id: 'r', startDate: '2026-11-09' });
    const idx = new HabitIndex(logs('r', { '2026-11-09': 'done', '2026-11-10': 'min', '2026-11-11': 'rest' }));
    // Today Thu 12: scheduled Mon, Tue, Thu (Wed rest). Thu pending counts as slot.
    const t = habitTally(h, idx, '2026-11-09', '2026-11-15', '2026-11-12');
    expect(t).toEqual({ done: 2, slots: 3, pct: 67 });
  });

  it('weekly goal is evaluated per week, not day by day', () => {
    const gym = habit({ id: 'g', startDate: '2026-11-02', frequency: { type: 'weekly', target: 5, plannedDays: [0, 1, 2, 3, 6] } });
    const idx = new HabitIndex(
      logs('g', {
        '2026-11-02': 'done', '2026-11-03': 'done', '2026-11-04': 'done', // week 1: 3 of 5 (past)
        '2026-11-09': 'done', '2026-11-10': 'done', // current week: 2 so far, still reachable
      }),
    );
    expect(habitTally(gym, idx, '2026-11-02', '2026-11-08', '2026-11-12')).toEqual({ done: 3, slots: 5, pct: 60 });
    // Current week is still open: nothing lost yet
    expect(habitTally(gym, idx, '2026-11-09', '2026-11-15', '2026-11-12')).toEqual({ done: 2, slots: 2, pct: 100 });
  });

  it('compares against the previous period', () => {
    const a = habit({ id: 'a', startDate: '2026-11-02' });
    const prevWeek = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'];
    const idx = new HabitIndex(
      logs('a', {
        ...Object.fromEntries(prevWeek.slice(0, 3).map((d) => [d, 'done' as const])), // 3/7 last week
        '2026-11-09': 'done', '2026-11-10': 'done', '2026-11-11': 'done', // 3/4 this week (today Thu 12 pending)
      }),
    );
    const s = periodStats([a], idx, periodFor('week', '2026-11-12'), '2026-11-12');
    expect(s.previous).toEqual({ done: 3, slots: 7, pct: 43 });
    expect(s.overall).toEqual({ done: 3, slots: 4, pct: 75 });
    expect(observation(s)).toContain('Vas 32 puntos arriba');
  });

  it('archived habits with nothing to measure are left out of "Por hábito"', () => {
    const a = habit({ id: 'a', startDate: '2026-11-12', lifecycle: 'archived', archivedAt: '2026-11-12' });
    expect(periodStats([a], new HabitIndex(), periodFor('week', '2026-11-12'), '2026-11-12').perHabit).toEqual([]);
  });

  it('optional habits do not enter compliance', () => {
    const a = habit({ id: 'a', startDate: '2026-11-09' });
    const extra = habit({ id: 'e', startDate: '2026-11-09', required: false });
    const idx = new HabitIndex([...logs('a', { '2026-11-09': 'done' }), ...logs('e', { '2026-11-09': 'done', '2026-11-10': 'done' })]);
    const s = periodStats([a, extra], idx, periodFor('week', '2026-11-10'), '2026-11-10');
    expect(s.overall).toEqual({ done: 1, slots: 2, pct: 50 });
    expect(s.extras[0].days).toBe(2);
    expect(s.perHabit.map((p) => p.habit.id)).toEqual(['a']);
  });

  it('observation names the weakest habit and the weekday with most misses', () => {
    const a = habit({ id: 'a', name: 'Lectura', startDate: '2026-11-02', minVersion: '2 páginas' });
    const b = habit({ id: 'b', name: 'Biblia', startDate: '2026-11-02' });
    const days = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'];
    const idx = new HabitIndex([
      ...logs('a', Object.fromEntries(days.slice(0, 2).map((d) => [d, 'done' as const]))),
      ...logs('b', Object.fromEntries(days.map((d) => [d, 'done' as const]))),
    ]);
    const s = periodStats([a, b], idx, periodFor('week', '2026-11-05'), '2026-11-12');
    const text = observation(s)!;
    expect(text).toContain('Biblia (100%)');
    expect(text).toContain('Lectura es el que más cuesta (29%)');
    expect(observation(periodStats([], new HabitIndex(), periodFor('week', '2026-11-05'), '2026-11-12'))).toBeNull();
  });
});
