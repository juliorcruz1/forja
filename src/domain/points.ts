/**
 * Points and levels engine (pure). Points are ALWAYS derived from records;
 * no total is ever stored. Only configuration is stored (values, thresholds,
 * start date) plus jokers as dated records.
 *
 * Rules (values from settings.points):
 * - Gains (provisional for today): complete / minimum / extra / counter goal,
 *   perfect day, weekly goal reached, streak milestones, phone-free windows,
 *   focus sessions (max N per day), urges resisted.
 * - Closed days only (date < today): bad-habit clean days (+), relapses (−),
 *   social-limit within (+) / over (−), missed required habits (−).
 * - Missed habits + over the social limit share a daily cap (default −20).
 * - Weekly goals: missing days are penalized when the week closes (Mon–Sun).
 * - Never penalized: rest days, non-scheduled days, optional habits, heavy
 *   days ("modo día pesado"), joker days ("comodín"), minimum versions.
 * - Nothing counts before settings.pointsStartDate.
 * - The running total never goes below 0; the level is the highest ever reached.
 */
import type {
  BadHabit, DayMeta, FocusSession, Habit, HabitLog, Joker, LevelDef, PointValues, Relapse, Settings, Urge,
  UsageLog, WeekPlan, WindowLog,
} from '../db/types';
import { addDays, type DateKey, weekday, weekStart } from '../lib/dates';
import {
  dayProgress, evalDay, HabitIndex, isActiveOn, isDoneStatus, isPartialWeek, weekCount, weekState, weekTarget,
} from './habits';

export type PointKind =
  | 'done' | 'min' | 'extra' | 'counter' | 'perfect' | 'weekly' | 'streak' | 'badClean' | 'socialWithin'
  | 'window' | 'focus' | 'resisted'
  | 'missed' | 'socialOver' | 'relapse' | 'weeklyMiss';

export const KIND_LABEL: Record<PointKind, string> = {
  done: 'Hábitos completos',
  min: 'Versiones mínimas',
  extra: 'Extras',
  counter: 'Metas de contador',
  perfect: 'Días perfectos',
  weekly: 'Metas semanales',
  streak: 'Hitos de racha',
  badClean: 'Días sin caer',
  socialWithin: 'Redes dentro del límite',
  window: 'Ventanas sin celular',
  focus: 'Sesiones de concentración',
  resisted: 'Ganas resistidas',
  missed: 'Hábitos no cumplidos',
  socialOver: 'Redes sobre el límite',
  relapse: 'Recaídas',
  weeklyMiss: 'Metas semanales no cumplidas',
};

export interface PointItem {
  kind: PointKind;
  label: string;
  /** Positive for gains, negative for losses (after the daily cap). */
  pts: number;
  /** Habit or bad-habit id the item belongs to, when it has one. */
  ref?: string;
}

export interface DayPoints {
  date: DateKey;
  items: PointItem[];
  gain: number;
  loss: number; // positive number
  net: number;
  /** Today: gains only, penalties are applied when the day closes. */
  provisional: boolean;
  /** Penalties waived (joker or heavy day). */
  waived?: 'joker' | 'heavy';
  /** Penalties that the daily cap removed. */
  cappedOff: number;
  perfect: boolean;
  /** Running total after this day (never below 0). */
  total: number;
}

export interface PointsInput {
  habits: Habit[];
  logs: HabitLog[];
  plans?: WeekPlan[];
  badHabits: BadHabit[];
  relapses: Relapse[];
  usageLogs?: UsageLog[];
  windowLogs?: WindowLog[];
  focusSessions?: FocusSession[];
  urges?: Urge[];
  jokers?: Joker[];
  dayMeta?: DayMeta[];
  settings: Pick<Settings, 'points' | 'levels' | 'pointsStartDate'>;
  today: DateKey;
}

export interface PointsResult {
  days: DayPoints[];
  byDate: Map<DateKey, DayPoints>;
  /** Current running total (never below 0). */
  total: number;
  /** Highest running total ever: drives the level, so the level never goes down. */
  maxTotal: number;
  today: DayPoints | undefined;
  level: LevelInfo;
}

// ---------------- Levels ----------------

export interface LevelInfo {
  name: string;
  index: number;
  min: number;
  next?: LevelDef;
  /** 0..1 progress toward the next level. 1 at the top level. */
  progress: number;
  toNext: number;
}

export function levelFor(points: number, levels: LevelDef[]): LevelInfo {
  const sorted = [...levels].sort((a, b) => a.min - b.min);
  let i = 0;
  for (let k = 0; k < sorted.length; k++) if (points >= sorted[k].min) i = k;
  const cur = sorted[i];
  const next = sorted[i + 1];
  if (!next) return { name: cur.name, index: i, min: cur.min, progress: 1, toNext: 0 };
  const span = next.min - cur.min || 1;
  return {
    name: cur.name, index: i, min: cur.min, next,
    progress: Math.min(1, Math.max(0, (points - cur.min) / span)),
    toNext: Math.max(0, next.min - points),
  };
}

// ---------------- Per-day memo ----------------

interface DayCore {
  items: PointItem[];
  /** Penalties before the cap, split by whether they share the daily cap. */
  capped: PointItem[];
  uncapped: PointItem[];
  perfect: boolean;
  hasRequired: boolean;
  waived?: 'joker' | 'heavy';
}

const memo = new Map<string, { sig: string; core: DayCore }>();
let computedDays = 0;

/** For tests: how many days were (re)computed since the last reset. */
export const memoStats = {
  get computed() {
    return computedDays;
  },
  reset() {
    computedDays = 0;
  },
  clear() {
    memo.clear();
    computedDays = 0;
  },
};

/** Full record content, so any edit (even without touching updatedAt) invalidates the day. */
const stamp = (r: object) => JSON.stringify(r);

function groupBy<T>(rows: T[] | undefined, key: (r: T) => string) {
  const m = new Map<string, T[]>();
  for (const r of rows ?? []) {
    const k = key(r);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return m;
}

// ---------------- Engine ----------------

export function computePoints(input: PointsInput): PointsResult {
  const { habits, badHabits, settings, today } = input;
  const P = settings.points;
  const start = settings.pointsStartDate;
  const idx = new HabitIndex(input.logs, input.plans ?? []);

  // Group every record once, so each day's signature is cheap to build.
  const logsByWeek = groupBy(input.logs, (l) => weekStart(l.date));
  const plansByWeek = groupBy(input.plans, (p) => p.weekStart);
  const relByDate = groupBy(input.relapses, (r) => r.date);
  const useByDate = groupBy(input.usageLogs, (u) => u.date);
  const winByDate = groupBy(input.windowLogs, (w) => w.date);
  const focByDate = groupBy(input.focusSessions, (f) => f.date);
  const urgeByDate = groupBy(input.urges, (u) => u.date);
  const jokerDates = new Set((input.jokers ?? []).map((j) => j.date));
  const heavyDates = new Set((input.dayMeta ?? []).filter((m) => m.heavy).map((m) => m.date));
  const globalSig = [
    JSON.stringify(P),
    habits.map(stamp).join(','),
    badHabits.map(stamp).join(','),
  ].join('|');

  const days: DayPoints[] = [];
  const byDate = new Map<DateKey, DayPoints>();
  if (start > today) {
    const level = levelFor(0, settings.levels);
    return { days, byDate, total: 0, maxTotal: 0, today: undefined, level };
  }

  // Streak milestones need the perfect-day history before the start date too.
  let first = start;
  for (const h of habits) if (h.required && !h.oneOffDate && h.startDate < first) first = h.startDate;

  let streak = 0;
  let total = 0;
  let maxTotal = 0;

  for (let d = first; d <= today; d = addDays(d, 1)) {
    const ws = weekStart(d);
    const sig = [
      globalSig,
      d === today ? 'T' : d < today ? 'C' : 'F',
      (logsByWeek.get(ws) ?? []).map(stamp).join(','),
      (plansByWeek.get(ws) ?? []).map(stamp).join(','),
      (relByDate.get(d) ?? []).map(stamp).join(','),
      (useByDate.get(d) ?? []).map(stamp).join(','),
      (winByDate.get(d) ?? []).map(stamp).join(','),
      (focByDate.get(d) ?? []).map(stamp).join(','),
      (urgeByDate.get(d) ?? []).map(stamp).join(','),
      jokerDates.has(d) ? 'J' : '',
      heavyDates.has(d) ? 'H' : '',
    ].join('|');
    let entry = memo.get(d);
    if (!entry || entry.sig !== sig) {
      computedDays++;
      entry = {
        sig,
        core: computeDayCore(d, {
          habits, idx, badHabits, P, today,
          relapses: relByDate.get(d) ?? [],
          usage: useByDate.get(d) ?? [],
          windows: winByDate.get(d) ?? [],
          focus: focByDate.get(d) ?? [],
          urges: urgeByDate.get(d) ?? [],
          joker: jokerDates.has(d),
          heavy: heavyDates.has(d),
          start,
        }),
      };
      memo.set(d, entry);
    }
    const core = entry.core;

    // Streak (perfect days in a row; days with nothing required are skipped).
    const streakItems: PointItem[] = [];
    if (core.hasRequired) {
      if (core.perfect) {
        streak++;
        const bonus = streak === 7 ? P.streak7 : streak === 14 ? P.streak14 : streak >= 30 && streak % 30 === 0 ? P.streak30 : 0;
        if (bonus && d >= start) streakItems.push({ kind: 'streak', label: `Racha de ${streak} días`, pts: bonus });
      } else if (d < today) {
        streak = 0;
      }
    }
    if (d < start) continue;

    // Daily cap on missed habits + social over the limit.
    const cappedRaw = core.capped.reduce((a, i) => a - i.pts, 0);
    const cappedLoss = Math.min(cappedRaw, P.dailyPenaltyCap);
    const cappedOff = cappedRaw - cappedLoss;
    const capped = scaleToCap(core.capped, cappedLoss);

    const items = [...core.items, ...streakItems, ...capped, ...core.uncapped];
    const gain = items.filter((i) => i.pts > 0).reduce((a, i) => a + i.pts, 0);
    const loss = items.filter((i) => i.pts < 0).reduce((a, i) => a - i.pts, 0);
    const net = gain - loss;
    total = Math.max(0, total + net);
    maxTotal = Math.max(maxTotal, total);
    const day: DayPoints = {
      date: d, items, gain, loss, net, provisional: d === today, waived: core.waived, cappedOff,
      perfect: core.perfect, total,
    };
    days.push(day);
    byDate.set(d, day);
  }

  return { days, byDate, total, maxTotal, today: byDate.get(today), level: levelFor(maxTotal, settings.levels) };
}

/** Reduce penalty items proportionally so they sum to `-target` (keeps the breakdown honest). */
function scaleToCap(items: PointItem[], target: number): PointItem[] {
  const raw = items.reduce((a, i) => a - i.pts, 0);
  if (raw <= target) return items;
  let left = target;
  return items
    .map((i) => {
      const take = Math.min(-i.pts, left);
      left -= take;
      return { ...i, pts: -take };
    })
    .filter((i) => i.pts !== 0);
}

interface DayCtx {
  habits: Habit[];
  idx: HabitIndex;
  badHabits: BadHabit[];
  P: PointValues;
  today: DateKey;
  start: DateKey;
  relapses: Relapse[];
  usage: UsageLog[];
  windows: WindowLog[];
  focus: FocusSession[];
  urges: Urge[];
  joker: boolean;
  heavy: boolean;
}

function computeDayCore(d: DateKey, c: DayCtx): DayCore {
  const { P, idx, today } = c;
  const closed = d < today;
  const items: PointItem[] = [];
  const capped: PointItem[] = [];
  const uncapped: PointItem[] = [];

  // --- Good habits (one award per habit per day: logs are unique per habit+date)
  for (const h of c.habits) {
    const status = idx.status(h.id, d);
    const done = isDoneStatus(status);
    if (h.required && !h.oneOffDate) {
      const e = evalDay(h, d, idx, today);
      if (e.counts && e.done) {
        if (status === 'min') items.push({ kind: 'min', label: `${h.name} (mínimo)`, pts: P.min, ref: h.id });
        else if (h.kind === 'counter') items.push({ kind: 'counter', label: `${h.name}: meta del día`, pts: P.hydration, ref: h.id });
        else items.push({ kind: 'done', label: h.name, pts: P.done, ref: h.id });
      } else if (e.counts && !e.done && closed && h.frequency.type !== 'weekly') {
        // Weekly goals are judged when the week closes, not day by day.
        capped.push({ kind: 'missed', label: `${h.name} sin cumplir`, pts: -P.missed, ref: h.id });
      }
    } else if (done && (h.oneOffDate === d || isActiveOn(h, d))) {
      items.push({ kind: 'extra', label: `${h.name} (extra)`, pts: P.extra, ref: h.id });
    }
  }

  // --- Perfect day
  const prog = dayProgress(c.habits, d, idx, today);
  const perfect = prog.total > 0 && prog.done === prog.total;
  if (perfect) items.push({ kind: 'perfect', label: 'Día perfecto', pts: P.perfectDay });

  // --- Weekly goals: bonus the day the goal is reached; penalty when the week closes (on Sunday)
  for (const h of c.habits) {
    if (h.frequency.type !== 'weekly' || !h.required || h.oneOffDate) continue;
    const ws = weekStart(d);
    const target = weekTarget(h, ws);
    if (!target) continue;
    const countToday = weekCount(h, ws, idx, d);
    const countBefore = weekday(d) === 0 ? 0 : weekCount(h, ws, idx, addDays(d, -1));
    if (countToday >= target && countBefore < target) {
      items.push({ kind: 'weekly', label: `${h.name}: meta semanal`, pts: P.weeklyGoal, ref: h.id });
    }
    if (weekday(d) === 6 && closed && ws >= c.start && !isPartialWeek(h, ws) && weekState(h, ws, idx, today) === 'missed') {
      const missing = target - weekCount(h, ws, idx);
      uncapped.push({ kind: 'weeklyMiss', label: `${h.name}: faltaron ${missing} de ${target}`, pts: -missing * P.weeklyMissPerDay, ref: h.id });
    }
  }

  // --- Bad habits
  for (const b of c.badHabits) {
    if (d < b.startDate || (b.archivedAt && d >= b.archivedAt)) continue;
    if ((b.mode ?? 'days') === 'days') {
      const fell = c.relapses.filter((r) => r.badHabitId === b.id);
      if (!closed) continue;
      if (fell.length) uncapped.push({ kind: 'relapse', label: `Recaída: ${b.name}`, pts: -P.relapse * fell.length, ref: b.id });
      else if (b.lifecycle === 'active') items.push({ kind: 'badClean', label: `${b.name}: día sin caer`, pts: P.badCleanDay, ref: b.id });
    } else {
      const u = c.usage.find((x) => x.badHabitId === b.id);
      if (!u || !closed) continue;
      if (u.minutes <= (b.limitMinutes ?? 60)) items.push({ kind: 'socialWithin', label: `${b.name}: dentro del límite`, pts: P.socialWithin, ref: b.id });
      else capped.push({ kind: 'socialOver', label: `${b.name}: sobre el límite`, pts: -P.socialOver, ref: b.id });
    }
  }

  // --- Phone-free windows (honor system), focus sessions, urges resisted
  for (const w of c.windows) {
    if (w.kept) items.push({ kind: 'window', label: w.kind === 'morning' ? 'Ventana de la mañana' : 'Ventana de la noche', pts: P.windowKept });
  }
  const sessions = c.focus.filter((f) => f.status === 'done').sort((a, b) => a.startAt.localeCompare(b.startAt));
  sessions.slice(0, P.focusMaxPerDay).forEach((f) => items.push({ kind: 'focus', label: `Concentración: ${f.label}`, pts: P.focusSession }));
  for (const u of c.urges) if (u.result === 'resisted') items.push({ kind: 'resisted', label: 'Resististe unas ganas', pts: P.resisted });

  // --- Waivers: heavy day and joker forgive every penalty of that day.
  const waived = c.joker ? 'joker' : c.heavy ? 'heavy' : undefined;
  if (waived) {
    return { items, capped: [], uncapped: uncapped.filter((i) => i.kind === 'weeklyMiss'), perfect, hasRequired: prog.total > 0, waived };
  }
  return { items, capped, uncapped, perfect, hasRequired: prog.total > 0 };
}

// ---------------- Aggregation for Stats ----------------

export interface PointsSummary {
  net: number;
  gain: number;
  loss: number;
  byKind: { kind: PointKind; label: string; pts: number }[];
  perDay: { date: DateKey; net: number }[];
}

export function summarize(result: PointsResult, from: DateKey, to: DateKey): PointsSummary {
  const kinds = new Map<PointKind, number>();
  let gain = 0;
  let loss = 0;
  const perDay: { date: DateKey; net: number }[] = [];
  for (const day of result.days) {
    if (day.date < from || day.date > to) continue;
    gain += day.gain;
    loss += day.loss;
    perDay.push({ date: day.date, net: day.net });
    for (const i of day.items) kinds.set(i.kind, (kinds.get(i.kind) ?? 0) + i.pts);
  }
  const byKind = [...kinds.entries()]
    .filter(([, pts]) => pts !== 0)
    .map(([kind, pts]) => ({ kind, label: KIND_LABEL[kind], pts }))
    .sort((a, b) => b.pts - a.pts);
  return { net: gain - loss, gain, loss, byKind, perDay };
}

/** "1.240" */
export const formatPts = (n: number) => n.toLocaleString('es-MX');

/** Net points a habit (or bad habit) earned in a date range. */
export function pointsForRef(result: PointsResult, ref: string, from: DateKey, to: DateKey): number {
  let n = 0;
  for (const d of result.days) {
    if (d.date < from || d.date > to) continue;
    for (const i of d.items) if (i.ref === ref) n += i.pts;
  }
  return n;
}
