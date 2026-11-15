/** Statistics computed from real records only. */
import type { Habit } from '../db/types';
import {
  addDays, addMonths, type DateKey, MONTH_NAMES, WEEKDAY_NAMES, WEEKDAY_LETTER, daysInMonth, formatShort,
  minKey, maxKey, monthStart, range, weekday, weekStart,
} from '../lib/dates';
import { evalDay, HabitIndex, remainingDaysInWeek, weekCount, weekTarget } from './habits';

export type PeriodKind = 'week' | 'month' | 'year';

export interface Period {
  kind: PeriodKind;
  from: DateKey;
  to: DateKey;
  label: string;
}

export function periodFor(kind: PeriodKind, anchor: DateKey): Period {
  if (kind === 'week') {
    const from = weekStart(anchor);
    const to = addDays(from, 6);
    return { kind, from, to, label: `${formatShort(from)} – ${formatShort(to)}` };
  }
  if (kind === 'month') {
    const from = monthStart(anchor);
    const to = addDays(from, daysInMonth(from) - 1);
    const m = Number(from.slice(5, 7)) - 1;
    return { kind, from, to, label: `${MONTH_NAMES[m]} ${from.slice(0, 4)}` };
  }
  const y = anchor.slice(0, 4);
  return { kind, from: `${y}-01-01`, to: `${y}-12-31`, label: y };
}

export function previousPeriod(p: Period): Period {
  if (p.kind === 'week') return periodFor('week', addDays(p.from, -7));
  if (p.kind === 'month') return periodFor('month', addMonths(p.from, -1));
  return periodFor('year', `${Number(p.from.slice(0, 4)) - 1}-06-01`);
}

export interface Tally {
  done: number;
  slots: number;
  pct: number | null; // null when there is nothing to measure
}

const tally = (done: number, slots: number): Tally => ({
  done, slots, pct: slots > 0 ? Math.round((done / slots) * 100) : null,
});

/** A week belongs to a range when its Thursday falls inside it (ISO-style). */
const weekInRange = (ws: DateKey, from: DateKey, to: DateKey) => {
  const thu = addDays(ws, 3);
  return thu >= from && thu <= to;
};

/** Compliance of one habit over a date range (future days ignored). */
export function habitTally(h: Habit, idx: HabitIndex, from: DateKey, to: DateKey, today: DateKey): Tally {
  const end = minKey(to, today);
  if (end < from) return tally(0, 0);
  if (h.frequency.type !== 'weekly') {
    let done = 0;
    let slots = 0;
    for (const d of range(maxKey(from, h.startDate), end)) {
      const e = evalDay(h, d, idx, today);
      if (!e.counts) continue;
      slots++;
      if (e.done) done++;
    }
    return tally(done, slots);
  }
  // Weekly goals are evaluated per week, never day by day.
  let done = 0;
  let slots = 0;
  for (let ws = weekStart(addDays(from, -3)); ws <= end; ws = addDays(ws, 7)) {
    if (!weekInRange(ws, from, to) || ws > today) continue;
    const target = weekTarget(h, ws);
    if (target === 0) continue;
    const count = Math.min(weekCount(h, ws, idx), target);
    const isCurrent = ws === weekStart(today);
    const remaining = isCurrent ? remainingDaysInWeek(h, today, idx) : 0;
    const lost = Math.max(0, target - count - remaining);
    done += count;
    slots += count + lost;
  }
  return tally(done, slots);
}

export interface HabitStat {
  habit: Habit;
  tally: Tally;
}

export interface Bucket {
  label: string;
  from: DateKey;
  to: DateKey;
  pct: number | null;
}

export interface PeriodStats {
  period: Period;
  overall: Tally;
  previous: Tally;
  perHabit: HabitStat[];
  extras: { habit: Habit; days: number }[];
  buckets: Bucket[];
  missesByWeekday: number[]; // index 0 = Monday
}

export function rangeTally(habits: Habit[], idx: HabitIndex, from: DateKey, to: DateKey, today: DateKey): Tally {
  let done = 0;
  let slots = 0;
  for (const h of habits) {
    if (!h.required) continue;
    const t = habitTally(h, idx, from, to, today);
    done += t.done;
    slots += t.slots;
  }
  return tally(done, slots);
}

function bucketsFor(p: Period): { label: string; from: DateKey; to: DateKey }[] {
  if (p.kind === 'week') {
    return range(p.from, p.to).map((d) => ({ label: WEEKDAY_LETTER[weekday(d)], from: d, to: d }));
  }
  if (p.kind === 'month') {
    const out: { label: string; from: DateKey; to: DateKey }[] = [];
    let i = 1;
    for (let ws = weekStart(p.from); ws <= p.to; ws = addDays(ws, 7), i++) {
      out.push({ label: `S${i}`, from: maxKey(ws, p.from), to: minKey(addDays(ws, 6), p.to) });
    }
    return out;
  }
  return Array.from({ length: 12 }, (_, m) => {
    const from = addMonths(p.from, m);
    return { label: MONTH_NAMES[m].slice(0, 1).toUpperCase(), from, to: addDays(from, daysInMonth(from) - 1) };
  });
}

/** Bucket tally: for single days and partial weeks, weekly goals are measured day-wise (done days only). */
function bucketTally(habits: Habit[], idx: HabitIndex, from: DateKey, to: DateKey, today: DateKey): Tally {
  const fullWeek = weekday(from) === 0 && to === addDays(from, 6);
  const longRange = range(from, to).length >= 28;
  if (fullWeek || longRange) return rangeTally(habits, idx, from, to, today);
  let done = 0;
  let slots = 0;
  for (const h of habits) {
    if (!h.required) continue;
    for (const d of range(from, minKey(to, today))) {
      const e = evalDay(h, d, idx, today);
      if (!e.counts) continue;
      slots++;
      if (e.done) done++;
    }
  }
  return tally(done, slots);
}

export function periodStats(habits: Habit[], idx: HabitIndex, p: Period, today: DateKey): PeriodStats {
  const required = habits.filter((h) => h.required);
  const perHabit = required
    .map((habit) => ({ habit, tally: habitTally(habit, idx, p.from, p.to, today) }))
    .filter((s) => s.tally.slots > 0 || habitHasActivity(s.habit, p, today));
  const extras = habits
    .filter((h) => !h.required)
    .map((habit) => ({
      habit,
      days: range(p.from, minKey(p.to, today)).filter((d) => {
        const s = idx.status(habit.id, d);
        return s === 'done' || s === 'min';
      }).length,
    }));
  const missesByWeekday = Array(7).fill(0);
  for (const h of required) {
    for (const d of range(p.from, minKey(p.to, addDays(today, -1)))) {
      const e = evalDay(h, d, idx, today);
      if (e.counts && !e.done) missesByWeekday[weekday(d)]++;
    }
  }
  const prev = previousPeriod(p);
  return {
    period: p,
    overall: rangeTally(habits, idx, p.from, p.to, today),
    previous: rangeTally(habits, idx, prev.from, prev.to, today),
    perHabit,
    extras,
    buckets: bucketsFor(p).map((b) => ({ ...b, pct: b.from > today ? null : bucketTally(habits, idx, b.from, b.to, today).pct })),
    missesByWeekday,
  };
}

function habitHasActivity(h: Habit, p: Period, today: DateKey) {
  return h.startDate <= minKey(p.to, today) && (!h.archivedAt || h.archivedAt > p.from);
}

/** A short observation built from the data. Returns null when there isn't enough data yet. */
export function observation(s: PeriodStats): string | null {
  const measurable = s.perHabit.filter((h) => h.tally.slots >= 3 && h.tally.pct !== null);
  if (measurable.length === 0) return null;
  const parts: string[] = [];
  const worst = [...measurable].sort((a, b) => a.tally.pct! - b.tally.pct!)[0];
  const best = [...measurable].sort((a, b) => b.tally.pct! - a.tally.pct!)[0];
  if (best && best.habit.id !== worst.habit.id && best.tally.pct! > worst.tally.pct!) {
    parts.push(`Tu hábito más firme es ${best.habit.name} (${best.tally.pct}%).`);
  }
  if (worst.tally.pct! < 100) {
    parts.push(`${worst.habit.name} es el que más cuesta (${worst.tally.pct}%)${worst.habit.minVersion ? `: prueba su versión mínima, "${worst.habit.minVersion}".` : '.'}`);
  }
  const maxMiss = Math.max(...s.missesByWeekday);
  if (maxMiss >= 2) {
    const days = s.missesByWeekday.map((n, i) => (n === maxMiss ? WEEKDAY_NAMES[i] : null)).filter(Boolean);
    parts.push(`Los ${days.join(' y ')} es cuando más fallas (${maxMiss} pendientes sin cumplir).`);
  }
  if (s.overall.pct !== null && s.previous.pct !== null) {
    const delta = s.overall.pct - s.previous.pct;
    if (delta >= 5) parts.push(`Vas ${delta} puntos arriba del periodo anterior.`);
    else if (delta <= -5) parts.push(`Bajaste ${-delta} puntos frente al periodo anterior.`);
  }
  if (parts.length === 0) parts.push(`Cumplimiento parejo en todos tus hábitos (${s.overall.pct}%). Sigue así.`);
  return parts.join(' ');
}
