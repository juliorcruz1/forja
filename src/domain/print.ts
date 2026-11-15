/**
 * Data for the weekly printouts, built only from real records.
 * - pared: the week to hang on the wall and fill in by hand.
 * - archivo: what actually happened that week (to keep on paper / PDF).
 * - plan: a planning sheet for the week.
 */
import type {
  BadHabit, DaySchedule, Habit, JournalEntry, LogStatus, Relapse, Settings, UsageLog, WeeklyReview, Weekday,
} from '../db/types';
import { addDays, type DateKey, formatShort, weekDays, WEEKDAY_SHORT } from '../lib/dates';
import { relapsesInRange } from './bad';
import { dayProgress, evalDay, type HabitIndex, isActiveOn, isDoneStatus, isScheduledByFrequency, plannedDaysFor, weeklyGoal } from './habits';
import type { Medal } from './medals';
import type { PointsResult } from './points';
import type { Debt, PunishResult } from './punish';
import { nightInfo } from './sleep';
import { isLimitHabit, limitOf, usageOn } from './social';

export type PrintMode = 'pared' | 'archivo' | 'plan';
export type PaperSize = Settings['paperSize'];

export interface PrintCell {
  date: DateKey;
  /** Habit exists that day (not before start, paused or archived). */
  active: boolean;
  /** It's a day the habit is meant to be done (weekly habits: any day). */
  scheduled: boolean;
  /** Weekly habits: planned for that day. */
  planned: boolean;
  status: LogStatus;
  /** Counts in the day's percentage (closed days). */
  counts: boolean;
}

export interface PrintRow {
  habitId: string;
  name: string;
  group: 'required' | 'extra' | 'oneOff';
  weekly?: { target: number; count: number; met: boolean };
  minVersion?: string;
  cells: PrintCell[];
  done: number;
}

export interface PrintDay {
  date: DateKey;
  label: string; // "Lun 9"
  work?: DaySchedule;
  critical: boolean;
  bedtime: string;
  done: number;
  total: number;
  pct: number | null;
  joker: boolean;
  heavy: boolean;
  points?: number;
  journalLine?: string;
}

export interface PrintBadRow {
  id: string;
  name: string;
  mode: 'days' | 'limit';
  /** days mode: relapses per day; limit mode: minutes per day (undefined = not logged). */
  perDay: (number | undefined)[];
  limit?: number;
  total: number;
}

export interface PrintWeek {
  ws: DateKey;
  to: DateKey;
  label: string;
  today: DateKey;
  days: PrintDay[];
  rows: PrintRow[];
  bad: PrintBadRow[];
  /** Required habits, closed days: done / counted. */
  overall: { done: number; total: number; pct: number | null };
  points: number;
  debts: Debt[];
  medals: { title: string; date: DateKey }[];
  review: string[];
  /** Answer "¿Qué voy a ajustar?" of the previous week (for the planning sheet). */
  previousAdjust?: string;
}

export interface PrintInput {
  habits: Habit[];
  idx: HabitIndex;
  badHabits: BadHabit[];
  relapses: Relapse[];
  usageLogs: UsageLog[];
  settings: Settings;
  dayMeta: { date: DateKey; heavy: boolean }[];
  jokers: { date: DateKey }[];
  points: Pick<PointsResult, 'byDate'>;
  debts: Pick<PunishResult, 'history'>;
  medals: Medal[];
  medalDates: (m: Medal) => DateKey | undefined;
  reviews: WeeklyReview[];
  journal?: JournalEntry[];
  today: DateKey;
}

export function buildPrintWeek(ws: DateKey, input: PrintInput): PrintWeek {
  const { habits, idx, today, settings } = input;
  const dates = weekDays(ws);
  const to = dates[6];
  const heavy = new Set(input.dayMeta.filter((m) => m.heavy).map((m) => m.date));
  const jokers = new Set(input.jokers.map((j) => j.date));
  const journal = new Map((input.journal ?? []).map((j) => [j.date, j]));

  const inWeek = (h: Habit) => (h.oneOffDate ? h.oneOffDate >= ws && h.oneOffDate <= to : dates.some((d) => isActiveOn(h, d)));
  const sorted = [...habits].filter(inWeek).sort((a, b) => a.order - b.order);
  const group = (h: Habit): PrintRow['group'] => (h.oneOffDate ? 'oneOff' : h.required ? 'required' : 'extra');

  const rows: PrintRow[] = sorted.map((h) => {
    const planned = plannedDaysFor(h, ws, idx);
    const cells = dates.map((d, i): PrintCell => {
      const active = h.oneOffDate ? d === h.oneOffDate : isActiveOn(h, d);
      const status = idx.status(h.id, d);
      return {
        date: d,
        active,
        scheduled: active && (h.oneOffDate ? true : h.frequency.type === 'weekly' ? true : isScheduledByFrequency(h, d)),
        planned: h.frequency.type === 'weekly' && planned.includes(i as Weekday),
        status,
        counts: h.required && !h.oneOffDate ? evalDay(h, d, idx, today).counts : false,
      };
    });
    const g = h.frequency.type === 'weekly' ? weeklyGoal(h, idx, today, ws) : undefined;
    return {
      habitId: h.id,
      name: h.name,
      group: group(h),
      minVersion: h.minVersion,
      weekly: g && g.target > 0 ? { target: g.target, count: g.count, met: g.state === 'met' } : undefined,
      cells,
      done: cells.filter((c) => c.active && isDoneStatus(c.status)).length,
    };
  });
  const order: PrintRow['group'][] = ['required', 'extra', 'oneOff'];
  rows.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));

  const days: PrintDay[] = dates.map((d, i) => {
    const p = dayProgress(habits, d, idx, today);
    const night = nightInfo(settings, d);
    const ws_ = settings.work[i];
    const pts = d >= settings.pointsStartDate ? input.points.byDate.get(d) : undefined;
    return {
      date: d,
      label: `${WEEKDAY_SHORT[i]} ${Number(d.slice(8))}`,
      work: ws_ && !ws_.off ? ws_ : undefined,
      critical: night.critical,
      bedtime: night.bedtime,
      done: p.done,
      total: p.total,
      // today stays blank while it is still open (unless already complete)
      pct: d > today || p.total === 0 || (d === today && p.done < p.total) ? null : p.pct,
      joker: jokers.has(d),
      heavy: heavy.has(d),
      points: pts && d <= today && !pts.provisional ? pts.net : undefined,
      journalLine: journal.get(d)?.line?.trim() || undefined,
    };
  });

  const counted = days.filter((d) => d.date <= today);
  const done = counted.reduce((a, d) => a + d.done, 0);
  const total = counted.reduce((a, d) => a + d.total, 0);

  const bad: PrintBadRow[] = input.badHabits
    .filter((b) => b.lifecycle !== 'archived' && b.startDate <= to)
    .sort((a, b) => a.order - b.order)
    .map((b) => {
      if (isLimitHabit(b)) {
        const perDay = dates.map((d) => (d < b.startDate ? undefined : usageOn(b, input.usageLogs, d)));
        return { id: b.id, name: b.name, mode: 'limit', perDay, limit: limitOf(b), total: perDay.reduce<number>((a, m) => a + (m ?? 0), 0) };
      }
      const perDay = dates.map((d) => relapsesInRange(b, input.relapses, d, d));
      return { id: b.id, name: b.name, mode: 'days', perDay, total: perDay.reduce<number>((a, n) => a + (n ?? 0), 0) };
    });

  const review = input.reviews.find((r) => r.weekStart === ws)?.answers ?? [];
  const prev = input.reviews.find((r) => r.weekStart === addDays(ws, -7))?.answers ?? [];

  return {
    ws,
    to,
    label: `${formatShort(ws)} – ${formatShort(to)} ${to.slice(0, 4)}`,
    today,
    days,
    rows,
    bad,
    overall: { done, total, pct: total ? Math.round((done / total) * 100) : null },
    points: days.reduce((a, d) => a + (d.points ?? 0), 0),
    debts: input.debts.history.filter((d) => d.date >= ws && d.date <= to && !d.orphan).sort((a, b) => a.date.localeCompare(b.date)),
    medals: input.medals
      .filter((m) => m.earned)
      .map((m) => ({ title: m.title, date: input.medalDates(m) ?? '' }))
      .filter((m) => m.date >= ws && m.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date)),
    review,
    previousAdjust: prev[2]?.trim() || undefined,
  };
}

/** Mark printed in a cell of the archive sheet. */
export function archiveMark(c: PrintCell, today: DateKey): string {
  if (!c.active || c.date > today) return '';
  switch (c.status) {
    case 'done': return '✓';
    case 'min': return 'M';
    case 'rest': return 'D';
    case 'skipped': return '–';
    // Pending: today is still open (blank); a closed day that counted is a miss.
    default: return c.counts && c.date < today ? '–' : '';
  }
}
