/**
 * Local-date helpers. All dates in the app are LOCAL calendar days stored as
 * 'YYYY-MM-DD' strings (never UTC). Weeks start on Monday.
 * Weekday index used everywhere: 0 = Monday ... 6 = Sunday.
 */
export type DateKey = string; // 'YYYY-MM-DD'

const pad = (n: number) => String(n).padStart(2, '0');

export function toKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12); // noon avoids DST edge cases
}

export function todayKey(now: Date = new Date()): DateKey {
  return toKey(now);
}

export function isValidKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  return toKey(fromKey(key)) === key;
}

export function addDays(key: DateKey, n: number): DateKey {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

/** Whole days from a to b (b - a). */
export function diffDays(a: DateKey, b: DateKey): number {
  const da = fromKey(a);
  const db = fromKey(b);
  const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((ub - ua) / 86400000);
}

/** 0 = Monday ... 6 = Sunday */
export function weekday(key: DateKey): number {
  return (fromKey(key).getDay() + 6) % 7;
}

export function weekStart(key: DateKey): DateKey {
  return addDays(key, -weekday(key));
}

export function weekDays(start: DateKey): DateKey[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function monthStart(key: DateKey): DateKey {
  return key.slice(0, 8) + '01';
}

export function daysInMonth(key: DateKey): number {
  const d = fromKey(key);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function monthDays(key: DateKey): DateKey[] {
  const start = monthStart(key);
  return Array.from({ length: daysInMonth(key) }, (_, i) => addDays(start, i));
}

export function addMonths(key: DateKey, n: number): DateKey {
  const d = fromKey(monthStart(key));
  d.setMonth(d.getMonth() + n);
  return toKey(d);
}

/** Inclusive range of date keys. */
export function range(from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

export function minKey(a: DateKey, b: DateKey): DateKey {
  return a < b ? a : b;
}
export function maxKey(a: DateKey, b: DateKey): DateKey {
  return a > b ? a : b;
}

// ---------- Spanish formatting ----------
export const WEEKDAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
export const WEEKDAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const WEEKDAY_LETTER = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Jueves, 12 de noviembre" */
export function formatLong(key: DateKey): string {
  const d = fromKey(key);
  return `${cap(WEEKDAY_NAMES[weekday(key)])}, ${d.getDate()} de ${MONTH_NAMES[d.getMonth()]}`;
}

/** "12 nov" */
export function formatShort(key: DateKey): string {
  const d = fromKey(key);
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)}`;
}

export function formatMonth(key: DateKey): string {
  const d = fromKey(key);
  return `${cap(MONTH_NAMES[d.getMonth()])} ${d.getFullYear()}`;
}

/** '21:00' -> '9:00 PM' */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${suffix}`;
}

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
