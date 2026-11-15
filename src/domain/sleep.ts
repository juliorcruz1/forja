import type { Settings } from '../db/types';
import { addDays, type DateKey, timeToMinutes, weekday } from '../lib/dates';

export interface NightInfo {
  critical: boolean;
  bedtime: string; // 'HH:MM'
  nextStart?: string; // next day's work start
}

/**
 * The night of `date` is critical when the next day's work starts earlier than
 * the configured threshold (default: Thu and Fri nights, before the 5:00 AM shifts).
 */
export function nightInfo(settings: Settings, date: DateKey): NightInfo {
  const next = settings.work[weekday(addDays(date, 1))];
  const usual = settings.bedtime[weekday(date)] ?? '22:00';
  const critical = !!next && !next.off && timeToMinutes(next.start) < timeToMinutes(settings.earlyStartThreshold);
  if (!critical) return { critical: false, bedtime: usual, nextStart: next && !next.off ? next.start : undefined };
  const bedtime = timeToMinutes(settings.criticalBedtime) < timeToMinutes(usual) ? settings.criticalBedtime : usual;
  return { critical: true, bedtime, nextStart: next.start };
}
