import type { BadHabit, Habit, HabitLog, LogStatus, Relapse, WeekPlan, Weekday } from '../db/types';
import type { DateKey } from '../lib/dates';

let n = 0;
const T = '2026-01-01T00:00:00.000Z';

export function habit(p: Partial<Habit> = {}): Habit {
  return {
    id: p.id ?? `h${++n}`,
    name: 'Hábito',
    icon: 'target',
    kind: 'check',
    frequency: { type: 'daily' },
    required: true,
    lifecycle: 'active',
    startDate: '2026-11-01',
    pauses: [],
    order: 0,
    createdAt: T,
    updatedAt: T,
    ...p,
  };
}

export function log(habitId: string, date: DateKey, status: LogStatus, extra: Partial<HabitLog> = {}): HabitLog {
  return { id: `${habitId}-${date}`, habitId, date, status, createdAt: T, updatedAt: T, ...extra };
}

export function logs(habitId: string, entries: Record<DateKey, LogStatus>): HabitLog[] {
  return Object.entries(entries).map(([d, s]) => log(habitId, d, s));
}

export function plan(habitId: string, weekStart: DateKey, plannedDays: Weekday[]): WeekPlan {
  return { id: `${habitId}:${weekStart}`, habitId, weekStart, plannedDays, createdAt: T, updatedAt: T };
}

export function bad(p: Partial<BadHabit> = {}): BadHabit {
  return {
    id: p.id ?? `b${++n}`, name: 'Malo', icon: 'smartphone', startDate: '2026-11-01', lifecycle: 'active', order: 0,
    createdAt: T, updatedAt: T, ...p,
  };
}

export function relapse(badHabitId: string, date: DateKey, note?: string): Relapse {
  return { id: `r-${badHabitId}-${date}-${++n}`, badHabitId, date, note, createdAt: T, updatedAt: T };
}
