/** Bad habits in "days without" mode. All values derived from relapse records. */
import type { BadHabit, Relapse } from '../db/types';
import { addDays, type DateKey, diffDays } from '../lib/dates';

export interface BadHabitStats {
  current: number;
  best: number;
  lastRelapse?: Relapse;
  totalRelapses: number;
}

export function relapsesOf(b: BadHabit, relapses: Relapse[]): Relapse[] {
  return relapses
    .filter((r) => r.badHabitId === b.id && r.date >= b.startDate)
    .sort((a, z) => (a.date === z.date ? a.createdAt.localeCompare(z.createdAt) : a.date.localeCompare(z.date)));
}

/**
 * Days without: days since the last relapse (or the start date). A relapse
 * today means 0. The best mark is the longest gap between consecutive events.
 */
export function badHabitStats(b: BadHabit, relapses: Relapse[], today: DateKey): BadHabitStats {
  const rs = relapsesOf(b, relapses).filter((r) => r.date <= today);
  const points = [b.startDate, ...rs.map((r) => r.date)];
  let best = 0;
  for (let i = 1; i < points.length; i++) best = Math.max(best, diffDays(points[i - 1], points[i]));
  const last = points[points.length - 1];
  const current = Math.max(0, diffDays(last, today));
  best = Math.max(best, current);
  return { current, best, lastRelapse: rs[rs.length - 1], totalRelapses: rs.length };
}

export type StripDay = 'clean' | 'relapse' | 'none';

/** Last `n` days ending today: clean (violet), relapse (gray), or none (before start). */
export function badStrip(b: BadHabit, relapses: Relapse[], today: DateKey, n = 14): { date: DateKey; state: StripDay }[] {
  const dates = new Set(relapsesOf(b, relapses).map((r) => r.date));
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(today, i - (n - 1));
    const state: StripDay = date < b.startDate ? 'none' : dates.has(date) ? 'relapse' : 'clean';
    return { date, state };
  });
}

export function relapsesInRange(b: BadHabit, relapses: Relapse[], from: DateKey, to: DateKey): number {
  return relapsesOf(b, relapses).filter((r) => r.date >= from && r.date <= to).length;
}
