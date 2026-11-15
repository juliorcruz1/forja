/**
 * Focus sessions. iPhone suspends timers in the background, so time is never
 * counted by a running interval: it is always derived from startAt + plannedMin
 * and recalculated whenever the app is opened again.
 */
import type { FocusSession } from '../db/types';
import { type DateKey, range } from '../lib/dates';

export const plannedEnd = (s: FocusSession) => new Date(s.startAt).getTime() + s.plannedMin * 60000;

/** Milliseconds left (0 when finished). */
export function remainingMs(s: FocusSession, now: Date = new Date()): number {
  if (s.status !== 'running') return 0;
  // Never more than the planned length, even if the clock was read just before the start.
  return Math.min(s.plannedMin * 60000, Math.max(0, plannedEnd(s) - now.getTime()));
}

/** Running sessions whose planned end already passed (e.g. app was closed): they count as done. */
export const expiredRunning = (sessions: FocusSession[], now: Date = new Date()) =>
  sessions.filter((s) => s.status === 'running' && plannedEnd(s) <= now.getTime());

export const runningSession = (sessions: FocusSession[], now: Date = new Date()) =>
  sessions.find((s) => s.status === 'running' && plannedEnd(s) > now.getTime());

/** Minutes of completed sessions (cancelled ones don't count). */
export const focusedMinutes = (s: FocusSession) => (s.status === 'done' ? s.plannedMin : 0);

export function focusTotals(sessions: FocusSession[], from: DateKey, to: DateKey) {
  const days = range(from, to).map((date) => {
    const done = sessions.filter((s) => s.date === date && s.status === 'done');
    return { date, minutes: done.reduce((a, s) => a + s.plannedMin, 0), sessions: done.length };
  });
  return {
    days,
    minutes: days.reduce((a, d) => a + d.minutes, 0),
    sessions: days.reduce((a, d) => a + d.sessions, 0),
  };
}

/** "1 h 15 min" / "45 min" */
export function formatMinutes(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** "24:59" */
export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
