/** "Momento de ganas": patterns of when the urges show up (day of week and hour). */
import type { Urge } from '../db/types';
import { type DateKey, weekday } from '../lib/dates';

export const URGE_SITUATIONS = ['Aburrimiento', 'Cansancio', 'Estrés', 'Antes de dormir', 'Al despertar', 'Después de comer'];
export const URGE_FEELINGS = ['Ansioso', 'Cansado', 'Aburrido', 'Triste', 'Tranquilo'];

/** Seconds left of the 2-minute pause, from the moment the urge was opened. */
export function urgeSecondsLeft(u: Pick<Urge, 'at'>, waitSeconds: number, now: Date = new Date()): number {
  const elapsed = Math.floor((now.getTime() - new Date(u.at).getTime()) / 1000);
  // The clock can be read a moment before the start time: never show more than the wait (no "2:01").
  return Math.min(waitSeconds, Math.max(0, waitSeconds - elapsed));
}

export interface UrgePatterns {
  total: number;
  resisted: number;
  fell: number;
  byWeekday: number[]; // 0 = Monday
  byHour: number[]; // 0..23
  topWeekday?: number;
  topHour?: number;
}

export function urgePatterns(urges: Urge[], from: DateKey, to: DateKey): UrgePatterns {
  const list = urges.filter((u) => u.date >= from && u.date <= to);
  const byWeekday = Array(7).fill(0);
  const byHour = Array(24).fill(0);
  for (const u of list) {
    byWeekday[weekday(u.date)]++;
    byHour[u.hour]++;
  }
  const argmax = (a: number[]) => {
    const m = Math.max(...a);
    return m > 0 ? a.indexOf(m) : undefined;
  };
  return {
    total: list.length,
    resisted: list.filter((u) => u.result === 'resisted').length,
    fell: list.filter((u) => u.result === 'fell').length,
    byWeekday,
    byHour,
    topWeekday: argmax(byWeekday),
    topHour: argmax(byHour),
  };
}

/** "10 PM" */
export const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;
