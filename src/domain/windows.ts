/**
 * Phone-free windows ("ventanas sin celular"): the first minutes after waking
 * up and the last stretch before bed. The night window ends at that day's
 * bedtime, so on critical nights (Thu/Fri by default) it is earlier.
 * Honor system: the app cannot block the phone; it only records and reminds.
 */
import type { Settings, WindowKind, WindowLog } from '../db/types';
import { type DateKey, timeToMinutes, toKey, weekday } from '../lib/dates';
import { nightInfo } from './sleep';

export interface WindowSpec {
  kind: WindowKind;
  date: DateKey;
  start: string; // HH:MM
  end: string; // HH:MM
}

const toHHMM = (mins: number) => {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export function windowsFor(settings: Settings, date: DateKey): WindowSpec[] {
  const out: WindowSpec[] = [];
  const cfg = settings.noPhone;
  if (cfg.morningEnabled && cfg.morningMinutes > 0) {
    const wake = timeToMinutes(settings.wakeTime[weekday(date)] ?? '07:00');
    out.push({ kind: 'morning', date, start: toHHMM(wake), end: toHHMM(wake + cfg.morningMinutes) });
  }
  if (cfg.nightEnabled && cfg.nightMinutes > 0) {
    const bed = timeToMinutes(nightInfo(settings, date).bedtime);
    out.push({ kind: 'night', date, start: toHHMM(bed - cfg.nightMinutes), end: toHHMM(bed) });
  }
  return out;
}

const nowMinutes = (now: Date) => now.getHours() * 60 + now.getMinutes();

/** Window happening right now (local time), if any. */
export function activeWindow(settings: Settings, now: Date = new Date()): WindowSpec | undefined {
  const m = nowMinutes(now);
  return windowsFor(settings, toKey(now)).find((w) => m >= timeToMinutes(w.start) && m < timeToMinutes(w.end));
}

/** Next window later today, if any. */
export function nextWindow(settings: Settings, now: Date = new Date()): WindowSpec | undefined {
  const m = nowMinutes(now);
  return windowsFor(settings, toKey(now)).find((w) => timeToMinutes(w.start) > m);
}

export const windowLabel = (k: WindowKind) => (k === 'morning' ? 'de la mañana' : 'de la noche');

export const windowLogFor = (logs: WindowLog[], date: DateKey, kind: WindowKind) =>
  logs.find((l) => l.date === date && l.kind === kind);

/** Has the window's planned end already passed? */
export function windowOver(w: WindowSpec, now: Date = new Date()) {
  return toKey(now) > w.date || nowMinutes(now) >= timeToMinutes(w.end);
}
