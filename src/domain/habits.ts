/**
 * Pure habit logic. Everything here is derived from records (habits, logs,
 * week plans); nothing derived is ever stored.
 */
import type { Habit, HabitLog, LogStatus, WeekPlan, Weekday } from '../db/types';
import { addDays, type DateKey, weekday, weekStart, weekDays } from '../lib/dates';

export const isDoneStatus = (s: LogStatus | undefined) => s === 'done' || s === 'min';

/** Fast lookup over logs and week plans. */
export class HabitIndex {
  private logs = new Map<string, HabitLog>();
  private plans = new Map<string, WeekPlan>();

  constructor(logs: HabitLog[] = [], plans: WeekPlan[] = []) {
    for (const l of logs) this.logs.set(`${l.habitId}|${l.date}`, l);
    for (const p of plans) this.plans.set(`${p.habitId}|${p.weekStart}`, p);
  }
  log(habitId: string, date: DateKey): HabitLog | undefined {
    return this.logs.get(`${habitId}|${date}`);
  }
  status(habitId: string, date: DateKey): LogStatus {
    return this.log(habitId, date)?.status ?? 'pending';
  }
  plan(habitId: string, ws: DateKey): WeekPlan | undefined {
    return this.plans.get(`${habitId}|${ws}`);
  }
}

/** Habit exists, is not paused and not archived on that date. */
export function isActiveOn(h: Habit, date: DateKey): boolean {
  if (date < h.startDate) return false;
  if (h.archivedAt && date >= h.archivedAt) return false;
  for (const p of h.pauses) {
    if (date >= p.from && (!p.to || date <= p.to)) return false;
  }
  return true;
}

export function plannedDaysFor(h: Habit, ws: DateKey, idx: HabitIndex): Weekday[] {
  if (h.frequency.type !== 'weekly') return [];
  return idx.plan(h.id, ws)?.plannedDays ?? h.frequency.plannedDays;
}

/** Days of the week for which a 'days'/'daily' habit is scheduled. */
export function isScheduledByFrequency(h: Habit, date: DateKey): boolean {
  const f = h.frequency;
  if (f.type === 'daily') return true;
  if (f.type === 'days') return f.days.includes(weekday(date) as Weekday);
  return false; // weekly is evaluated per week
}

/** Completed days in the habit's week (optionally only up to `upTo` inclusive). */
export function weekCount(h: Habit, ws: DateKey, idx: HabitIndex, upTo?: DateKey): number {
  let n = 0;
  for (const d of weekDays(ws)) {
    if (upTo && d > upTo) break;
    if (isActiveOn(h, d) && isDoneStatus(idx.status(h.id, d))) n++;
  }
  return n;
}

/**
 * Weekly target. Always the configured goal (e.g. 5) for any week in which the
 * habit is active at least one day; 0 when it is inactive the whole week.
 */
export function weekTarget(h: Habit, ws: DateKey): number {
  if (h.frequency.type !== 'weekly') return 0;
  return weekDays(ws).some((d) => isActiveOn(h, d)) ? h.frequency.target : 0;
}

/**
 * A week the habit didn't cover entirely (start week, pause, archive). Such a
 * week can be met, but is never counted as failed.
 */
export function isPartialWeek(h: Habit, ws: DateKey): boolean {
  return !weekDays(ws).every((d) => isActiveOn(h, d));
}

export interface DayEval {
  /** Counts in the day's denominator. */
  counts: boolean;
  done: boolean;
  status: LogStatus;
}

/**
 * How a habit counts on a given day.
 * - Rest days and non-scheduled days never count (never a failure).
 * - Weekly-target habits: a done day always counts as done. A planned day that
 *   wasn't done only counts as a miss once the weekly goal became unreachable.
 *   Today, a planned (not yet done) day counts as pending while the goal is open.
 */
export function evalDay(h: Habit, date: DateKey, idx: HabitIndex, today: DateKey): DayEval {
  const status = idx.status(h.id, date);
  const done = isDoneStatus(status);
  // Archived today after already doing it: the habit leaves Inicio, but that day's record is kept.
  if (done && !h.oneOffDate && h.archivedAt === date && date <= today && date >= h.startDate) {
    return { counts: true, done: true, status };
  }
  if (!isActiveOn(h, date) || status === 'rest' || date > today) return { counts: false, done: false, status };
  if (h.oneOffDate) return { counts: false, done, status }; // one-day extras never count

  if (h.frequency.type !== 'weekly') {
    return { counts: isScheduledByFrequency(h, date), done, status };
  }
  if (done) return { counts: true, done: true, status };
  const ws = weekStart(date);
  const planned = plannedDaysFor(h, ws, idx).includes(weekday(date) as Weekday);
  if (!planned) return { counts: false, done: false, status };
  const target = weekTarget(h, ws);
  const doneSoFar = weekCount(h, ws, idx, date);
  if (doneSoFar >= target) return { counts: false, done: false, status }; // goal already met
  if (date === today) return { counts: true, done: false, status };
  if (isPartialWeek(h, ws)) return { counts: false, done: false, status };
  const daysLeftAfter = 6 - weekday(date);
  const unreachable = target - doneSoFar > daysLeftAfter;
  return { counts: unreachable, done: false, status };
}

export interface DayProgress {
  date: DateKey;
  total: number;
  done: number;
  pct: number; // 0..100, 0 when total = 0
  missing: Habit[];
  extrasDone: number;
}

/** Day percentage: required, counted habits done (complete or minimum) / required counted. */
export function dayProgress(habits: Habit[], date: DateKey, idx: HabitIndex, today: DateKey): DayProgress {
  let total = 0;
  let done = 0;
  let extrasDone = 0;
  const missing: Habit[] = [];
  for (const h of habits) {
    if (!h.required || h.oneOffDate) {
      if (isActiveOn(h, date) && isDoneStatus(idx.status(h.id, date))) extrasDone++;
      continue;
    }
    const e = evalDay(h, date, idx, today);
    if (!e.counts) continue;
    total++;
    if (e.done) done++;
    else missing.push(h);
  }
  return { date, total, done, pct: total ? Math.round((done / total) * 100) : 0, missing, extrasDone };
}

/** "Never miss twice": true if yesterday had a required habit that was missed. */
export function missedYesterday(habits: Habit[], idx: HabitIndex, today: DateKey): boolean {
  const p = dayProgress(habits, addDays(today, -1), idx, today);
  return p.total > 0 && p.done < p.total;
}

// ---------------- Streaks ----------------

const MAX_LOOKBACK = 3660;

/** Consecutive scheduled days completed, skipping non-scheduled/rest/paused days. Today pending doesn't break. */
export function dailyStreak(h: Habit, idx: HabitIndex, today: DateKey): number {
  let streak = 0;
  for (let i = 0, d = today; i < MAX_LOOKBACK && d >= h.startDate; i++, d = addDays(d, -1)) {
    const e = evalDay(h, d, idx, today);
    if (!e.counts) continue;
    if (e.done) streak++;
    else if (d === today) continue;
    else break;
  }
  return streak;
}

export function bestDailyStreak(h: Habit, idx: HabitIndex, today: DateKey): number {
  let best = 0;
  let cur = 0;
  for (let d = h.startDate; d <= today; d = addDays(d, 1)) {
    const e = evalDay(h, d, idx, today);
    if (!e.counts) continue;
    if (e.done) best = Math.max(best, ++cur);
    else if (d !== today) cur = 0;
  }
  return best;
}

export type WeekState = 'met' | 'open' | 'missed' | 'none';

export function weekState(h: Habit, ws: DateKey, idx: HabitIndex, today: DateKey): WeekState {
  const target = weekTarget(h, ws);
  if (target === 0) return 'none';
  const count = weekCount(h, ws, idx);
  if (count >= target) return 'met';
  const end = addDays(ws, 6);
  if (isPartialWeek(h, ws)) return end < today ? 'none' : 'open';
  if (end < today) return 'missed';
  if (ws > today) return 'open';
  const left = remainingDaysInWeek(h, today, idx);
  return target - count > left ? 'missed' : 'open';
}

/** Days still available this week to do the habit (today included unless already done). */
export function remainingDaysInWeek(h: Habit, today: DateKey, idx: HabitIndex): number {
  const doneToday = isDoneStatus(idx.status(h.id, today));
  return 6 - weekday(today) + (doneToday ? 0 : 1);
}

/** Consecutive weeks with the weekly goal met. Current open week doesn't break the streak. */
export function weeklyStreak(h: Habit, idx: HabitIndex, today: DateKey): number {
  let streak = 0;
  let ws = weekStart(today);
  const first = weekStart(h.startDate);
  for (let i = 0; i < 530 && ws >= first; i++, ws = addDays(ws, -7)) {
    const s = weekState(h, ws, idx, today);
    if (s === 'none') continue;
    if (s === 'met') streak++;
    else if (s === 'open') continue;
    else break;
  }
  return streak;
}

export function bestWeeklyStreak(h: Habit, idx: HabitIndex, today: DateKey): number {
  let best = 0;
  let cur = 0;
  for (let ws = weekStart(h.startDate); ws <= today; ws = addDays(ws, 7)) {
    const s = weekState(h, ws, idx, today);
    if (s === 'met') best = Math.max(best, ++cur);
    else if (s === 'missed') cur = 0;
  }
  return best;
}

export interface StreakInfo {
  current: number;
  best: number;
  unit: 'días' | 'semanas';
}

export function habitStreak(h: Habit, idx: HabitIndex, today: DateKey): StreakInfo {
  if (h.frequency.type === 'weekly') {
    return { current: weeklyStreak(h, idx, today), best: bestWeeklyStreak(h, idx, today), unit: 'semanas' };
  }
  return { current: dailyStreak(h, idx, today), best: bestDailyStreak(h, idx, today), unit: 'días' };
}

/** Overall day streak: consecutive days with 100 % of required habits; empty days are skipped. */
export function overallStreak(habits: Habit[], idx: HabitIndex, today: DateKey): number {
  const first = earliestStart(habits);
  if (!first) return 0;
  let streak = 0;
  for (let d = today; d >= first; d = addDays(d, -1)) {
    const p = dayProgress(habits, d, idx, today);
    if (p.total === 0) continue;
    if (p.done === p.total) streak++;
    else if (d === today) continue;
    else break;
  }
  return streak;
}

export function bestOverallStreak(habits: Habit[], idx: HabitIndex, today: DateKey): number {
  const first = earliestStart(habits);
  if (!first) return 0;
  let best = 0;
  let cur = 0;
  for (let d = first; d <= today; d = addDays(d, 1)) {
    const p = dayProgress(habits, d, idx, today);
    if (p.total === 0) continue;
    if (p.done === p.total) best = Math.max(best, ++cur);
    else if (d !== today) cur = 0;
  }
  return best;
}

export function earliestStart(habits: Habit[]): DateKey | undefined {
  let min: DateKey | undefined;
  for (const h of habits) if (!min || h.startDate < min) min = h.startDate;
  return min;
}

// ---------------- Weekly goal summary ----------------

export interface WeeklyGoal {
  count: number;
  target: number;
  need: number;
  remaining: number;
  planned: Weekday[];
  state: WeekState;
  message: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function weeklyGoal(h: Habit, idx: HabitIndex, today: DateKey, ws: DateKey = weekStart(today)): WeeklyGoal {
  const target = weekTarget(h, ws);
  const count = weekCount(h, ws, idx);
  const need = Math.max(0, target - count);
  const isCurrent = ws === weekStart(today);
  const remaining = isCurrent ? remainingDaysInWeek(h, today, idx) : ws > today ? 7 : 0;
  const state = weekState(h, ws, idx, today);
  let message: string;
  if (state === 'met') message = `¡Meta cumplida! ${count} de ${target} esta semana.`;
  else if (!isCurrent) message = `${count} de ${target} esa semana.`;
  else if (state === 'missed')
    message = `Llevas ${count} de ${target}. Esta semana ya no se alcanza la meta: cada día que sumes cuenta.`;
  else
    message = `Llevas ${count} de ${target}, te falta ${need} y ${remaining === 1 ? 'queda 1 día' : `quedan ${plural(remaining, 'día', 'días')}`}.`;
  return { count, target, need, remaining, planned: plannedDaysFor(h, ws, idx), state, message };
}

// ---------------- Checklist / counter status ----------------

export { checklistStatus } from './checklist';

export function counterStatus(count: number, target: number): LogStatus {
  return count >= Math.max(1, target) ? 'done' : 'pending';
}

/** "Solo para hoy" one-day habit. */
export const isOneOff = (h: Habit) => !!h.oneOffDate;

/** Regular (recurring) habits: everything except one-day habits. */
export const recurring = (habits: Habit[]) => habits.filter((h) => !h.oneOffDate);

/** Habits shown on the Today list for a date (active, not archived). */
export function habitsForDay(habits: Habit[], date: DateKey) {
  const active = habits.filter((h) => isActiveOn(h, date)).sort((a, b) => a.order - b.order);
  return {
    required: active.filter((h) => h.required && !isOneOff(h)),
    extras: active.filter((h) => !h.required && !isOneOff(h)),
    oneOff: active.filter((h) => isOneOff(h) && h.oneOffDate === date),
  };
}

/** Whether a habit appears in the Today list (daily/days only on scheduled days; weekly always). */
export function showsOnDay(h: Habit, date: DateKey): boolean {
  if (h.frequency.type === 'weekly') return true;
  return isScheduledByFrequency(h, date);
}
