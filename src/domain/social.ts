/**
 * Limit-mode bad habits (e.g. "Redes / scroll"). Minutes are logged manually
 * each night from iPhone Screen Time: the app cannot read Screen Time.
 */
import type { BadHabit, UsageLog } from '../db/types';
import { addDays, type DateKey, range } from '../lib/dates';

export const isLimitHabit = (b: BadHabit) => b.mode === 'limit';
export const limitOf = (b: BadHabit) => b.limitMinutes ?? 60;

export function usageOn(b: BadHabit, logs: UsageLog[], date: DateKey): number | undefined {
  return logs.find((u) => u.badHabitId === b.id && u.date === date)?.minutes;
}

export interface UsageTrend {
  days: { date: DateKey; minutes: number | null; over: boolean }[];
  logged: number;
  average: number | null;
  daysWithin: number;
  daysOver: number;
}

export function usageTrend(b: BadHabit, logs: UsageLog[], from: DateKey, to: DateKey): UsageTrend {
  const mine = new Map(logs.filter((u) => u.badHabitId === b.id).map((u) => [u.date, u.minutes]));
  const days = range(from, to).map((date) => {
    const m = mine.get(date);
    return { date, minutes: m ?? null, over: m !== undefined && m > limitOf(b) };
  });
  const values = days.filter((d) => d.minutes !== null).map((d) => d.minutes as number);
  return {
    days,
    logged: values.length,
    average: values.length ? Math.round(values.reduce((a, n) => a + n, 0) / values.length) : null,
    daysWithin: days.filter((d) => d.minutes !== null && !d.over).length,
    daysOver: days.filter((d) => d.over).length,
  };
}

/** Consecutive logged days within the limit, ending today (or yesterday if today isn't logged yet). */
export function withinStreak(b: BadHabit, logs: UsageLog[], today: DateKey): number {
  const mine = new Map(logs.filter((u) => u.badHabitId === b.id).map((u) => [u.date, u.minutes]));
  let d = mine.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (mine.has(d) && (mine.get(d) as number) <= limitOf(b)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}
