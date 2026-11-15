/**
 * Logros y medallas. Every medal is DERIVED from the records: if a record
 * that earned it is deleted or edited, the medal goes away. The only thing
 * stored is a MedalUnlock (the date it was first detected + "seen").
 */
import type {
  BadHabit, FocusSession, Habit, LevelDef, MedalUnlock, Relapse, UsageLog, WeeklyReview,
} from '../db/types';
import { addDays, type DateKey, diffDays, toKey, weekStart } from '../lib/dates';
import { focusedMinutes } from './focus';
import {
  dayProgress, earliestStart, evalDay, type HabitIndex, isActiveOn, weekCount, weekState, weekTarget,
} from './habits';
import type { PointsResult } from './points';
import { limitOf } from './social';

export type MedalFamily = 'streak' | 'habit' | 'bad' | 'weekly' | 'perfectWeek' | 'focus' | 'comeback' | 'care' | 'level';

export interface Medal {
  id: string;
  family: MedalFamily;
  title: string;
  description: string;
  /** Progress towards the goal (current is capped at target). */
  current: number;
  target: number;
  unit: string;
  earned: boolean;
  /** Date the records reached the goal. */
  achievedOn?: DateKey;
  /** Name of the habit for per-habit medals. */
  subject?: string;
}

export interface MedalInput {
  habits: Habit[];
  idx: HabitIndex;
  badHabits: BadHabit[];
  relapses: Relapse[];
  usageLogs: UsageLog[];
  focusSessions: FocusSession[];
  reviews: WeeklyReview[];
  lastBackupAt?: string;
  levels: LevelDef[];
  points: Pick<PointsResult, 'days'>;
  today: DateKey;
}

export const STREAK_GOALS = [7, 14, 30, 60, 100];
export const HABIT_GOALS = [7, 30, 100];
export const BAD_GOALS = [7, 14, 30, 90];
export const WEEKLY_GOALS = [1, 4, 12];
export const FOCUS_HOURS = [10, 50, 100];
export const COMEBACK_GOAL = 10;

export const FAMILY_LABEL: Record<MedalFamily, string> = {
  streak: 'Rachas',
  habit: 'Por hábito',
  bad: 'Hábitos malos',
  weekly: 'Metas semanales',
  perfectWeek: 'Semana perfecta',
  focus: 'Concentración',
  comeback: 'Volver',
  care: 'Constancia',
  level: 'Niveles',
};

// ---------------- Helpers ----------------

type Step = 'hit' | 'miss' | 'skip';

/** Longest run of consecutive hits; records the first date each goal was reached. */
export function runMilestones(steps: Iterable<[DateKey, Step]>, goals: number[]) {
  const reached = new Map<number, DateKey>();
  let cur = 0;
  let best = 0;
  for (const [d, s] of steps) {
    if (s === 'skip') continue;
    if (s === 'miss') {
      cur = 0;
      continue;
    }
    cur++;
    if (cur > best) best = cur;
    for (const g of goals) if (cur >= g && !reached.has(g)) reached.set(g, d);
  }
  return { best, reached };
}

function* days(from: DateKey, to: DateKey): Generator<DateKey> {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
}

/** Perfect days in a row (empty days skipped; today only counts once complete). */
function* overallSteps(habits: Habit[], idx: HabitIndex, today: DateKey): Generator<[DateKey, Step]> {
  const first = earliestStart(habits);
  if (!first) return;
  for (const d of days(first, today)) {
    const p = dayProgress(habits, d, idx, today);
    if (p.total === 0) yield [d, 'skip'];
    else if (p.done === p.total) yield [d, 'hit'];
    else yield [d, d === today ? 'skip' : 'miss'];
  }
}

function* habitSteps(h: Habit, idx: HabitIndex, today: DateKey): Generator<[DateKey, Step]> {
  for (const d of days(h.startDate, today)) {
    const e = evalDay(h, d, idx, today);
    if (!e.counts) yield [d, 'skip'];
    else if (e.done) yield [d, 'hit'];
    else yield [d, d === today ? 'skip' : 'miss'];
  }
}

/** Weeks with the weekly goal met; the hit is dated the day the goal was reached. */
function* weeklySteps(h: Habit, idx: HabitIndex, today: DateKey): Generator<[DateKey, Step]> {
  for (let ws = weekStart(h.startDate); ws <= today; ws = addDays(ws, 7)) {
    const s = weekState(h, ws, idx, today);
    if (s === 'met') {
      const target = weekTarget(h, ws);
      let when = addDays(ws, 6);
      for (const d of days(ws, addDays(ws, 6))) {
        if (weekCount(h, ws, idx, d) >= target) {
          when = d;
          break;
        }
      }
      yield [when, 'hit'];
    } else yield [ws, s === 'missed' ? 'miss' : 'skip'];
  }
}

/** Days without a relapse ("días sin"), same rule as the bad-habit card. */
function badMilestones(b: BadHabit, relapses: Relapse[], today: DateKey, goals: number[]) {
  const reached = new Map<number, DateKey>();
  if (b.mode === 'limit') return { best: 0, reached };
  const rs = relapses.filter((r) => r.badHabitId === b.id && r.date >= b.startDate && r.date <= today).map((r) => r.date).sort();
  const points = [b.startDate, ...rs, today];
  let best = 0;
  for (let i = 1; i < points.length; i++) {
    const gap = diffDays(points[i - 1], points[i]);
    best = Math.max(best, gap);
    for (const g of goals) if (gap >= g && !reached.has(g)) reached.set(g, addDays(points[i - 1], g));
  }
  return { best, reached };
}

/** Limit mode (e.g. Redes): logged days within the limit, in a row. */
function* limitSteps(b: BadHabit, logs: UsageLog[], today: DateKey): Generator<[DateKey, Step]> {
  const mine = new Map(logs.filter((u) => u.badHabitId === b.id).map((u) => [u.date, u.minutes]));
  for (const d of days(b.startDate, today)) {
    const m = mine.get(d);
    if (m === undefined) yield [d, d === today ? 'skip' : 'miss'];
    else yield [d, m <= limitOf(b) ? 'hit' : 'miss'];
  }
}

/** Days completed after a failed day ("Hoy toca volver" → volviste). */
export function comebacks(habits: Habit[], idx: HabitIndex, today: DateKey) {
  const dates: DateKey[] = [];
  let prevFailed = false;
  for (const [d, s] of overallSteps(habits, idx, today)) {
    if (s === 'skip') continue;
    if (s === 'miss') prevFailed = true;
    else {
      if (prevFailed) dates.push(d);
      prevFailed = false;
    }
  }
  return dates;
}

/**
 * Weeks (Mon–Sun, already ended — or ending today and complete) where every
 * day with required habits was complete and no weekly goal was missed.
 */
export function perfectWeeks(habits: Habit[], idx: HabitIndex, today: DateKey): DateKey[] {
  const first = earliestStart(habits);
  if (!first) return [];
  const out: DateKey[] = [];
  // Only whole weeks: a week where tracking started midweek doesn't count.
  const firstWs = weekStart(first) === first ? first : addDays(weekStart(first), 7);
  for (let ws = firstWs; addDays(ws, 6) <= today; ws = addDays(ws, 7)) {
    let counted = 0;
    let ok = true;
    for (const d of days(ws, addDays(ws, 6))) {
      const p = dayProgress(habits, d, idx, today);
      if (p.total === 0) continue;
      counted++;
      if (p.done < p.total) {
        ok = false;
        break;
      }
    }
    if (!ok || counted === 0) continue;
    const weeklyMissed = habits.some(
      (h) => h.frequency.type === 'weekly' && h.required && !h.oneOffDate && isActiveOn(h, addDays(ws, 6)) && weekState(h, ws, idx, today) === 'missed',
    );
    if (!weeklyMissed) out.push(addDays(ws, 6));
  }
  return out;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

// ---------------- Engine ----------------

export function computeMedals(input: MedalInput): Medal[] {
  const { habits, idx, today } = input;
  const medals: Medal[] = [];
  const push = (m: Omit<Medal, 'earned' | 'current'> & { progress: number; reachedOn?: DateKey }) => {
    const { progress, reachedOn, ...rest } = m;
    medals.push({ ...rest, current: Math.min(progress, m.target), earned: !!reachedOn, achievedOn: reachedOn });
  };
  const recurring = habits.filter((h) => !h.oneOffDate);

  // Global streak of perfect days.
  const overall = runMilestones(overallSteps(recurring, idx, today), STREAK_GOALS);
  for (const g of STREAK_GOALS) {
    push({
      id: `streak:${g}`, family: 'streak', title: `Racha de ${g} días`, description: `${g} días seguidos con todos tus hábitos obligatorios.`,
      target: g, unit: 'días', progress: overall.best, reachedOn: overall.reached.get(g),
    });
  }

  // Per good habit (daily / specific days). Archived habits only show what they earned.
  for (const h of recurring) {
    if (h.frequency.type === 'weekly') continue;
    const r = runMilestones(habitSteps(h, idx, today), HABIT_GOALS);
    for (const g of HABIT_GOALS) {
      const reachedOn = r.reached.get(g);
      if (h.lifecycle === 'archived' && !reachedOn) continue;
      push({
        id: `habit:${h.id}:${g}`, family: 'habit', title: `${h.name}: ${g} seguidos`, subject: h.name,
        description: `${g} ${plural(g, 'vez', 'veces')} seguidas cumpliendo ${h.name} cuando tocaba.`,
        target: g, unit: 'días', progress: r.best, reachedOn,
      });
    }
  }

  // Weekly goals (Gym): first week met, 4 and 12 weeks in a row.
  for (const h of recurring) {
    if (h.frequency.type !== 'weekly') continue;
    const r = runMilestones(weeklySteps(h, idx, today), WEEKLY_GOALS);
    for (const g of WEEKLY_GOALS) {
      const reachedOn = r.reached.get(g);
      if (h.lifecycle === 'archived' && !reachedOn) continue;
      push({
        id: `weekly:${h.id}:${g}`, family: 'weekly', subject: h.name,
        title: g === 1 ? `${h.name}: primera semana` : `${h.name}: ${g} semanas`,
        description: g === 1 ? `Cumpliste la meta semanal de ${h.name} por primera vez.` : `${g} semanas seguidas con la meta de ${h.name}.`,
        target: g, unit: 'semanas', progress: r.best, reachedOn,
      });
    }
  }

  // Bad habits: days clean (days mode) or days within the limit (limit mode).
  for (const b of input.badHabits) {
    const r = b.mode === 'limit'
      ? runMilestones(limitSteps(b, input.usageLogs, today), BAD_GOALS)
      : badMilestones(b, input.relapses, today, BAD_GOALS);
    for (const g of BAD_GOALS) {
      const reachedOn = r.reached.get(g);
      if (b.lifecycle === 'archived' && !reachedOn) continue;
      push({
        id: `bad:${b.id}:${g}`, family: 'bad', subject: b.name,
        title: b.mode === 'limit' ? `${b.name}: ${g} días en límite` : `${g} días sin ${b.name}`,
        description: b.mode === 'limit' ? `${g} días seguidos registrados dentro de tu límite.` : `${g} días seguidos sin recaer.`,
        target: g, unit: 'días', progress: r.best, reachedOn,
      });
    }
  }

  // Perfect week.
  const pw = perfectWeeks(recurring, idx, today);
  push({
    id: 'perfectWeek', family: 'perfectWeek', title: 'Semana perfecta',
    description: 'Una semana de lunes a domingo con todo lo obligatorio cumplido.',
    target: 1, unit: 'semana', progress: pw.length, reachedOn: pw[0],
  });

  // Focus hours.
  const sessions = [...input.focusSessions].filter((s) => s.status === 'done').sort((a, b) => a.startAt.localeCompare(b.startAt));
  let acc = 0;
  const focusReached = new Map<number, DateKey>();
  for (const s of sessions) {
    acc += focusedMinutes(s);
    for (const h of FOCUS_HOURS) if (acc >= h * 60 && !focusReached.has(h)) focusReached.set(h, s.date);
  }
  for (const h of FOCUS_HOURS) {
    push({
      id: `focus:${h}`, family: 'focus', title: `${h} horas de concentración`, description: `${h} horas en sesiones de concentración completadas.`,
      target: h, unit: 'horas', progress: Math.floor(acc / 60), reachedOn: focusReached.get(h),
    });
  }

  // Volver.
  const cb = comebacks(recurring, idx, today);
  push({
    id: 'comeback:10', family: 'comeback', title: 'Volver 10 veces', description: 'Diez veces completaste el día después de fallar uno.',
    target: COMEBACK_GOAL, unit: 'veces', progress: cb.length, reachedOn: cb[COMEBACK_GOAL - 1],
  });

  // Care: backup and weekly reviews.
  push({
    id: 'backup:1', family: 'care', title: 'Primer respaldo', description: 'Guardaste un respaldo de tus datos.',
    target: 1, unit: 'respaldo', progress: input.lastBackupAt ? 1 : 0,
    reachedOn: input.lastBackupAt ? toKey(new Date(input.lastBackupAt)) : undefined,
  });
  const reviews = [...input.reviews].filter((r) => r.answers.some((a) => a.trim())).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const reviewDate = (i: number) => (reviews[i] ? toKey(new Date(reviews[i].createdAt)) : undefined);
  push({
    id: 'review:1', family: 'care', title: 'Primera revisión semanal', description: 'Hiciste tu primera revisión de la semana.',
    target: 1, unit: 'revisión', progress: reviews.length, reachedOn: reviewDate(0),
  });
  push({
    id: 'review:4', family: 'care', title: '4 revisiones semanales', description: 'Cuatro revisiones semanales guardadas.',
    target: 4, unit: 'revisiones', progress: reviews.length, reachedOn: reviewDate(3),
  });

  // Levels (the level never goes down, so the first day over the mark counts).
  const levels = [...input.levels].sort((a, b) => a.min - b.min).slice(1, 4);
  const maxSoFar = input.points.days.reduce((m, d) => Math.max(m, d.total), 0);
  for (const l of levels) {
    const day = input.points.days.find((d) => d.total >= l.min);
    push({
      id: `level:${l.name}`, family: 'level', title: `Nivel ${l.name}`, description: `Llegaste a ${l.min.toLocaleString('es-MX')} puntos.`,
      target: l.min, unit: 'pts', progress: maxSoFar, reachedOn: day?.date,
    });
  }

  return medals;
}

// ---------------- Unlock records ----------------

/** What to write so the stored unlocks match the derived medals. */
export function medalSyncPlan(medals: Medal[], unlocks: MedalUnlock[]) {
  const stored = new Map(unlocks.map((u) => [u.medalId, u]));
  const earned = new Set(medals.filter((m) => m.earned).map((m) => m.id));
  const add = medals.filter((m) => m.earned && !stored.has(m.id)).map((m) => ({ medalId: m.id, achievedOn: m.achievedOn! }));
  const remove = unlocks.filter((u) => !earned.has(u.medalId)).map((u) => u.id);
  return { add, remove };
}

/** Earned medals not yet seen (for the discreet Inicio notice). */
export function unseenMedals(medals: Medal[], unlocks: MedalUnlock[]): Medal[] {
  const unseen = new Set(unlocks.filter((u) => !u.seen).map((u) => u.medalId));
  return medals.filter((m) => m.earned && unseen.has(m.id));
}

/** "Ganado el …": the stored date wins (it's what the user saw), else the derived one. */
export function earnedOn(m: Medal, unlocks: MedalUnlock[]): DateKey | undefined {
  return unlocks.find((u) => u.medalId === m.id)?.achievedOn ?? m.achievedOn;
}
