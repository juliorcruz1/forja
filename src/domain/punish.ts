/**
 * Debts ("castigos"): soft, user-chosen consequences. Pure and derived.
 *
 * - A debt is created when a day CLOSES (date < today) with a missed required
 *   habit, a relapse, or (on Sunday) a weekly goal that was not reached.
 * - At most 1 debt per day and at most 2 pending at a time. Extra failures
 *   while 2 are pending don't create debts; the app offers to reset instead.
 * - Never for: rest days, non-scheduled days, optional habits, joker days,
 *   heavy days, days before the start date, or habits set to "ninguno".
 * - Only user actions are stored (paid / reset / jar emptied), so editing or
 *   deleting a past record recalculates the debts on its own.
 * - Honor system: nothing is blocked and no real money moves.
 */
import type {
  BadHabit, DayMeta, DebtEvent, Habit, HabitLog, JarEmpty, Joker, PunishChoice, PunishConfig, PunishType, Relapse,
  WeekPlan,
} from '../db/types';
import { MAX_DEBTS_PER_DAY, MAX_PENDING_DEBTS } from '../config/defaults';
import { addDays, type DateKey, diffDays, weekday, weekStart } from '../lib/dates';
import { evalDay, HabitIndex, isActiveOn, isPartialWeek, weekCount, weekState, weekTarget } from './habits';

export const PUNISH_LABEL: Record<PunishType, string> = {
  habitDebt: 'Deuda del hábito',
  firstThings: 'Primero lo primero',
  task: 'Tarea pendiente',
  jar: 'Frasco',
};

export const PUNISH_HINT: Record<PunishType, string> = {
  habitDebt: 'Al día siguiente haces el hábito más un extra pequeño.',
  firstThings: 'Sin streams ni juegos hasta cumplir lo pendiente (de honor).',
  task: 'Una tarea de ~10 minutos que llevas posponiendo, sorteada de tu lista.',
  jar: 'Un monto simbólico va a un frasco virtual. No se mueve dinero real.',
};

export type DebtStatus = 'pending' | 'paid' | 'reset' | 'jar';

export interface DebtSource {
  kind: 'habit' | 'bad' | 'weekly';
  id: string;
  name: string;
}

export interface Debt {
  /** Day of the failure (the debt is due the day after). */
  date: DateKey;
  type: PunishType;
  source: DebtSource;
  label: string;
  detail: string;
  amount?: number;
  status: DebtStatus;
  event?: DebtEvent;
  /** True when the debt no longer comes from the records (e.g. the day was edited), kept for history. */
  orphan?: boolean;
}

export interface PunishInput {
  habits: Habit[];
  logs: HabitLog[];
  plans?: WeekPlan[];
  badHabits: BadHabit[];
  relapses: Relapse[];
  jokers?: Joker[];
  dayMeta?: DayMeta[];
  debtEvents?: DebtEvent[];
  jarEmpties?: JarEmpty[];
  punish: PunishConfig;
  today: DateKey;
}

export interface PunishResult {
  debts: Debt[];
  pending: Debt[];
  /** Newest first, including paid/reset debts whose day changed later (orphans). */
  history: Debt[];
  /** Failure days that did not create a debt because 2 were already pending. */
  cappedDays: DateKey[];
  /** More failures than the cap: offer "Reiniciar". */
  overflow: boolean;
  jar: { balance: number; total: number; entries: Debt[]; empties: JarEmpty[] };
}

// ---------------- Safety: never sleep, food, rest or pain ----------------

const UNSAFE = /(dormir|sueño|desvel|madrug|comer|comida|ayun|cenar|desayun|descans|dolor|golpe|lastim|herir|herid|cortar|quemar|ducha fr[ií]a|hielo|castigo f[ií]sico|sangr)/i;

/** Error message if a user-written consequence touches sleep, food, rest or pain; null if OK. */
export function unsafePunishText(text: string): string | null {
  return UNSAFE.test(text)
    ? 'Elige algo que no recorte tu sueño, tu comida ni tu descanso, y que no implique dolor.'
    : null;
}

// ---------------- Type resolution ----------------

/** Which consequence applies, or null if none (habit set to "ninguno" or no type allowed). */
export function resolveType(choice: PunishChoice | undefined, cfg: PunishConfig): PunishType | null {
  if (choice === 'none') return null;
  const wanted = choice ?? cfg.defaultType;
  let type: PunishType | null = cfg.types.includes(wanted)
    ? wanted
    : cfg.types.includes(cfg.defaultType)
      ? cfg.defaultType
      : cfg.types[0] ?? null;
  // "Tarea pendiente" needs a list; without one, fall back to the habit debt (if allowed).
  if (type === 'task' && cfg.tasks.filter((t) => t.trim()).length === 0) {
    type = cfg.types.includes('habitDebt') ? 'habitDebt' : cfg.types.find((t) => t !== 'task') ?? null;
  }
  return type;
}

/** Deterministic draw from the task list (same day → same task). */
export function drawTask(tasks: string[], date: DateKey): string {
  const list = tasks.map((t) => t.trim()).filter(Boolean);
  if (!list.length) return '';
  const n = Math.abs(diffDays('2026-01-01', date));
  return list[n % list.length];
}

function describe(type: PunishType, src: DebtSource, cfg: PunishConfig, date: DateKey): { label: string; detail: string; amount?: number } {
  const extra = cfg.habitDebtExtra.trim();
  switch (type) {
    case 'habitDebt':
      return {
        label: PUNISH_LABEL.habitDebt,
        detail:
          src.kind === 'bad'
            ? `Un día limpio de ${src.name}${extra ? ` y ${extra}` : ''}`
            : `${src.name}${extra ? ` + ${extra}` : ''}`,
      };
    case 'firstThings':
      return {
        label: PUNISH_LABEL.firstThings,
        detail: src.kind === 'bad' ? 'Sin streams ni juegos hasta cumplir tus hábitos de hoy' : `Sin streams ni juegos hasta hacer ${src.name}`,
      };
    case 'task':
      return { label: PUNISH_LABEL.task, detail: drawTask(cfg.tasks, date) };
    case 'jar':
      return { label: PUNISH_LABEL.jar, detail: `${cfg.currency}${cfg.jarAmount} al frasco`, amount: cfg.jarAmount };
  }
}

// ---------------- Engine ----------------

interface Candidate {
  source: DebtSource;
  choice: PunishChoice | undefined;
}

/** Failures of a closed day that may create a debt, in priority order. */
export function failuresOfDay(
  d: DateKey,
  ctx: { habits: Habit[]; idx: HabitIndex; badHabits: BadHabit[]; relapses: Relapse[]; today: DateKey; start: DateKey },
): Candidate[] {
  const out: Candidate[] = [];
  const bads = [...ctx.badHabits].sort((a, b) => a.order - b.order);
  for (const b of bads) {
    if (d < b.startDate || (b.archivedAt && d >= b.archivedAt) || (b.mode ?? 'days') !== 'days') continue;
    if (ctx.relapses.some((r) => r.badHabitId === b.id && r.date === d)) {
      out.push({ source: { kind: 'bad', id: b.id, name: b.name }, choice: b.punishType });
    }
  }
  const hs = [...ctx.habits].sort((a, b) => a.order - b.order);
  for (const h of hs) {
    if (!h.required || h.oneOffDate || h.frequency.type === 'weekly') continue;
    const e = evalDay(h, d, ctx.idx, ctx.today);
    if (e.counts && !e.done) out.push({ source: { kind: 'habit', id: h.id, name: h.name }, choice: h.punishType });
  }
  // Weekly goals are judged when the week closes (Sunday).
  if (weekday(d) === 6) {
    const ws = weekStart(d);
    for (const h of hs) {
      if (h.frequency.type !== 'weekly' || !h.required || h.oneOffDate || (!isActiveOn(h, ws) && !isActiveOn(h, d))) continue;
      if (ws < ctx.start || isPartialWeek(h, ws) || !weekTarget(h, ws)) continue;
      if (weekState(h, ws, ctx.idx, ctx.today) === 'missed') {
        const missing = weekTarget(h, ws) - weekCount(h, ws, ctx.idx);
        out.push({ source: { kind: 'weekly', id: h.id, name: `${h.name} (faltaron ${missing})` }, choice: h.punishType });
      }
    }
  }
  return out;
}

export function computeDebts(input: PunishInput): PunishResult {
  const cfg = input.punish;
  const { today } = input;
  const idx = new HabitIndex(input.logs, input.plans ?? []);
  const events = new Map<DateKey, DebtEvent>();
  for (const e of [...(input.debtEvents ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (!events.has(e.debtDate)) events.set(e.debtDate, e); // the first action on a debt wins
  }
  const jokers = new Set((input.jokers ?? []).map((j) => j.date));
  const heavy = new Set((input.dayMeta ?? []).filter((m) => m.heavy).map((m) => m.date));

  const debts: Debt[] = [];
  const cappedDays: DateKey[] = [];

  if (cfg.enabled) {
    for (let d = cfg.startDate; d < today; d = addDays(d, 1)) {
      if (jokers.has(d) || heavy.has(d)) continue; // joker / heavy day: no consequence
      const fails = failuresOfDay(d, {
        habits: input.habits, idx, badHabits: input.badHabits, relapses: input.relapses, today, start: cfg.startDate,
      });
      let created = 0;
      for (const f of fails) {
        if (created >= MAX_DEBTS_PER_DAY) break;
        const type = resolveType(f.choice, cfg);
        if (!type) continue;
        const pendingNow = debts.filter((x) => x.type !== 'jar' && !resolvedBy(events.get(x.date), d)).length;
        if (type !== 'jar' && pendingNow >= MAX_PENDING_DEBTS) {
          cappedDays.push(d);
          break;
        }
        const ev = events.get(d);
        const desc = describe(type, f.source, cfg, d);
        debts.push({
          date: d, type, source: f.source, ...desc,
          status: ev ? ev.kind : type === 'jar' ? 'jar' : 'pending',
          event: ev,
        });
        created++;
      }
    }
  }

  const pending = debts.filter((x) => x.status === 'pending');
  const oldestPending = pending[0]?.date;
  const overflow = pending.length >= MAX_PENDING_DEBTS && !!oldestPending && cappedDays.some((c) => c > oldestPending);

  // History: derived debts + paid/reset events whose day no longer produces a debt (kept as they were).
  const derivedDates = new Set(debts.map((x) => x.date));
  const orphans: Debt[] = [...events.values()]
    .filter((e) => !derivedDates.has(e.debtDate))
    .map((e) => ({
      date: e.debtDate, type: e.snapshot.type, source: { kind: 'habit', id: '', name: '' },
      label: e.snapshot.label, detail: e.snapshot.detail, status: e.kind, event: e, orphan: true,
    }));
  const history = [...debts, ...orphans].sort((a, b) => b.date.localeCompare(a.date));

  // Jar: everything after the last emptying is the current balance.
  const entries = debts.filter((x) => x.type === 'jar');
  const empties = [...(input.jarEmpties ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const through = empties.reduce<DateKey>((m, e) => (e.throughDate > m ? e.throughDate : m), '');
  const total = entries.reduce((a, x) => a + (x.amount ?? 0), 0);
  const balance = entries.filter((x) => x.date > through).reduce((a, x) => a + (x.amount ?? 0), 0);

  return { debts, pending, history, cappedDays, overflow, jar: { balance, total, entries, empties } };
}

/** A debt counts as resolved at the close of `day` if it was paid/reset on or before that day. */
function resolvedBy(ev: DebtEvent | undefined, day: DateKey) {
  return !!ev && ev.date <= day;
}

/** Debts per period for Stats. */
export function debtsInRange(result: PunishResult, from: DateKey, to: DateKey) {
  const list = result.history.filter((d) => d.date >= from && d.date <= to);
  return {
    created: list.filter((d) => !d.orphan).length,
    paid: list.filter((d) => d.status === 'paid').length,
    pending: list.filter((d) => d.status === 'pending').length,
    reset: list.filter((d) => d.status === 'reset').length,
    jar: list.filter((d) => d.status === 'jar').reduce((a, d) => a + (d.amount ?? 0), 0),
  };
}
