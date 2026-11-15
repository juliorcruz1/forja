/**
 * Calendar data, derived from the records (habits, logs, plans, day flags).
 * Nothing here is stored: editing a past day changes the logs and the
 * calendar simply re-derives.
 */
import type { BadHabit, DayMeta, DaySchedule, Habit, Joker, Relapse, Settings, Weekday } from '../db/types';
import { type DateKey, monthDays, weekday, weekStart } from '../lib/dates';
import { dayProgress, type HabitIndex, isActiveOn, isDoneStatus, plannedDaysFor } from './habits';
import type { Debt, PunishResult } from './punish';

/**
 * - future: after today.
 * - empty: nothing required that day (before starting, or nothing scheduled).
 * - rest: nothing counted because the habits were marked as rest.
 * - perfect: every counted habit done.
 * - partial: some done, some not.
 * - missed: a closed day with counted habits and none done.
 * - open: today, still in progress.
 */
export type DayKind = 'future' | 'empty' | 'rest' | 'perfect' | 'partial' | 'missed' | 'open';

export interface WeeklyMark {
  habitId: string;
  name: string;
  planned: boolean;
  done: boolean;
}

export interface DayInfo {
  date: DateKey;
  kind: DayKind;
  total: number;
  done: number;
  pct: number;
  isToday: boolean;
  /** Work schedule of that weekday (undefined = day off). */
  work?: DaySchedule;
  heavy: boolean;
  joker: boolean;
  /** Weekly-target habits (e.g. Gym): planned that day and/or done. */
  weekly: WeeklyMark[];
  relapses: number;
  debt?: Debt;
}

export interface CalendarInput {
  habits: Habit[];
  idx: HabitIndex;
  today: DateKey;
  settings: Pick<Settings, 'work'>;
  dayMeta?: DayMeta[];
  jokers?: Joker[];
  relapses?: Relapse[];
  badHabits?: BadHabit[];
  debts?: Pick<PunishResult, 'debts'>;
}

/** Lookups built once per input (calendar views render up to 366 days). */
class CalendarCtx {
  heavy: Set<DateKey>;
  jokers: Set<DateKey>;
  relapses = new Map<DateKey, number>();
  debts = new Map<DateKey, Debt>();
  constructor(public input: CalendarInput) {
    this.heavy = new Set((input.dayMeta ?? []).filter((m) => m.heavy).map((m) => m.date));
    this.jokers = new Set((input.jokers ?? []).map((j) => j.date));
    const daysMode = new Set((input.badHabits ?? []).filter((b) => (b.mode ?? 'days') === 'days').map((b) => b.id));
    for (const r of input.relapses ?? []) {
      if (input.badHabits && !daysMode.has(r.badHabitId)) continue;
      this.relapses.set(r.date, (this.relapses.get(r.date) ?? 0) + 1);
    }
    for (const d of input.debts?.debts ?? []) this.debts.set(d.date, d);
  }
}

const ctxCache = new WeakMap<CalendarInput, CalendarCtx>();
function ctxFor(input: CalendarInput) {
  let c = ctxCache.get(input);
  if (!c) ctxCache.set(input, (c = new CalendarCtx(input)));
  return c;
}

/** Weekly-target habits planned or done on a date. */
export function weeklyMarks(habits: Habit[], date: DateKey, idx: HabitIndex): WeeklyMark[] {
  const out: WeeklyMark[] = [];
  const ws = weekStart(date);
  for (const h of habits) {
    if (h.frequency.type !== 'weekly' || h.oneOffDate || !isActiveOn(h, date)) continue;
    const planned = plannedDaysFor(h, ws, idx).includes(weekday(date) as Weekday);
    const done = isDoneStatus(idx.status(h.id, date));
    if (planned || done) out.push({ habitId: h.id, name: h.name, planned, done });
  }
  return out;
}

export function dayKindOf(p: { total: number; done: number }, date: DateKey, today: DateKey, anyRest: boolean): DayKind {
  if (date > today) return 'future';
  if (p.total === 0) return anyRest ? 'rest' : 'empty';
  if (p.done === p.total) return 'perfect';
  if (date === today) return 'open';
  return p.done === 0 ? 'missed' : 'partial';
}

export function dayInfo(date: DateKey, input: CalendarInput): DayInfo {
  const c = ctxFor(input);
  const { habits, idx, today } = input;
  const p = dayProgress(habits, date, idx, today);
  const anyRest = habits.some((h) => h.required && !h.oneOffDate && isActiveOn(h, date) && idx.status(h.id, date) === 'rest');
  const ws = input.settings.work[weekday(date)];
  return {
    date,
    kind: dayKindOf(p, date, today, anyRest),
    total: p.total,
    done: p.done,
    pct: p.pct,
    isToday: date === today,
    work: ws && !ws.off ? ws : undefined,
    heavy: c.heavy.has(date),
    joker: c.jokers.has(date),
    weekly: weeklyMarks(habits, date, idx),
    relapses: c.relapses.get(date) ?? 0,
    debt: c.debts.get(date),
  };
}

export interface PeriodSummary {
  perfect: number;
  partial: number;
  missed: number;
  rest: number;
  /** Planned weekly-habit days and how many of those planned days were done. */
  planned: number;
  plannedDone: number;
  /** Weekly-habit days done that weren't planned (extra days). */
  unplannedDone: number;
}

export function summarizeDays(days: DayInfo[]): PeriodSummary {
  const s: PeriodSummary = { perfect: 0, partial: 0, missed: 0, rest: 0, planned: 0, plannedDone: 0, unplannedDone: 0 };
  for (const d of days) {
    if (d.kind === 'perfect') s.perfect++;
    else if (d.kind === 'partial') s.partial++;
    else if (d.kind === 'missed') s.missed++;
    else if (d.kind === 'rest') s.rest++;
    if (d.kind === 'future') continue;
    for (const m of d.weekly) {
      if (m.planned) {
        s.planned++;
        if (m.done) s.plannedDone++;
      } else if (m.done) s.unplannedDone++;
    }
  }
  return s;
}

export function monthInfo(month: DateKey, input: CalendarInput) {
  const days = monthDays(month).map((d) => dayInfo(d, input));
  return { days, lead: weekday(days[0].date), summary: summarizeDays(days) };
}
