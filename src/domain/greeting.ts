/**
 * Greeting for Inicio, from the phone's local time and the configured name
 * (Ajustes → "Tu nombre"; the name is never hard-coded here).
 *
 *   5:00–11:59  "Buenos días, {nombre}"
 *  12:00–18:59  "Buenas tardes, {nombre}"
 *  19:00–4:59   "Buenas noches, {nombre}"
 *
 * Below it, a short line from a bank of variants per moment. The variant
 * rotates by date, so the same phrase never shows two days in a row.
 */
import { type DateKey, diffDays, formatTime } from '../lib/dates';

export type Moment = 'morning' | 'afternoon' | 'night';

export function momentOf(now: Date): Moment {
  const h = now.getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 19) return 'afternoon';
  return 'night';
}

const WORD: Record<Moment, string> = {
  morning: 'Buenos días',
  afternoon: 'Buenas tardes',
  night: 'Buenas noches',
};

export function greeting(now: Date, name: string): string {
  const n = name.trim();
  return n ? `${WORD[momentOf(now)]}, ${n}` : WORD[momentOf(now)];
}

export interface LineContext {
  date: DateKey;
  /** Local hour 0..23 (0–4 counts as late night). */
  hour: number;
  total: number; // required habits scheduled today
  done: number;
  missing: string[]; // names
  isWorkDay: boolean;
  workStart?: string; // 'HH:MM'
  pointsToday: number;
  bedtime: string; // 'HH:MM'
  criticalNight: boolean;
  nextStart?: string; // next day's work start
}

type Variant = (c: Ctx) => string;
interface Ctx extends LineContext {
  left: number;
  first: string;
  list: string;
  start: string;
  bed: string;
  allDone: boolean;
  none: boolean;
  habitsWord: string;
}

const join = (names: string[]) =>
  names.length <= 1 ? names[0] ?? '' : names.length === 2 ? `${names[0]} y ${names[1]}` : `${names.slice(0, 2).join(', ')} y ${names.length - 2} más`;

// ---------------- Banks (≥ 6 per moment) ----------------

const MORNING: Variant[] = [
  (c) => (c.isWorkDay ? `Hoy tocan ${c.habitsWord} y entras a las ${c.start}. Empieza por el más fácil.` : `Hoy no trabajas. Tocan ${c.habitsWord}; aprovecha la mañana.`),
  (c) => (c.isWorkDay ? `Día de trabajo: entras a las ${c.start}. Son ${c.habitsWord}, uno a la vez.` : `Día libre. ${cap(c.habitsWord)} en la lista y todo el día para hacerlos.`),
  (c) => (c.isWorkDay ? `Entras a las ${c.start}. Si te da tiempo, saca uno antes de salir.` : `Descansas del trabajo, no de ti. Hoy tocan ${c.habitsWord}.`),
  (c) => (c.isWorkDay ? `Turno a las ${c.start}. Hoy tocan ${c.habitsWord}; el mínimo también cuenta.` : `Sin turno hoy. Buen día para adelantar tus hábitos temprano.`),
  (c) => (c.isWorkDay ? `Hoy trabajas desde las ${c.start}. Lo primero: un vaso de agua.` : `Hoy descansas. Haz tus ${c.total} antes de que se te vaya el día.`),
  (c) => (c.isWorkDay ? `${cap(c.habitsWord)} y trabajo a las ${c.start}. Tú puedes con los dos.` : `No hay trabajo hoy. ${cap(c.habitsWord)} y lo demás es tuyo.`),
];

const AFTERNOON: Variant[] = [
  (c) => (c.allDone ? 'Ya cumpliste todo lo de hoy. Lo que hagas de aquí es extra.' : `Llevas ${c.done} de ${c.total}. Falta ${c.list}.`),
  (c) => (c.allDone ? 'Día completo y todavía es de tarde. Bien jugado.' : `${c.done} de ${c.total} hasta ahora. Sigue ${c.first}.`),
  (c) => (c.allDone ? 'Todo hecho. Si te sobra energía, una caminata cuenta como extra.' : c.none ? `Todavía no marcas nada, y no pasa nada: empieza con ${c.first}, aunque sea el mínimo.` : `Medio día y vas ${c.done} de ${c.total}. Te queda ${c.list}.`),
  (c) => (c.allDone ? 'Ya está todo. Disfruta la tarde.' : `Te ${c.left === 1 ? 'falta 1' : `faltan ${c.left}`}: ${c.list}. Uno a la vez.`),
  (c) => (c.allDone ? 'Cumpliste con todo. Mañana, igual.' : c.none ? `Aún hay tiempo para los ${c.total}. Empieza por ${c.first}.` : `Vas bien: ${c.done} ${c.done === 1 ? 'listo' : 'listos'}. Lo que sigue es ${c.first}.`),
  (c) => (c.allDone ? 'Lo de hoy ya quedó. Ahora descansa un rato.' : `${c.left === 1 ? 'Falta uno' : `Faltan ${c.left}`}. Si el día está pesado, haz la versión mínima de ${c.first}.`),
];

const bedLine = (c: Ctx) =>
  c.criticalNight && c.nextStart
    ? `Mañana entras a las ${formatTime(c.nextStart)}: a dormir a las ${c.bed}.`
    : `A dormir a las ${c.bed}.`;

const NIGHT: Variant[] = [
  (c) => `Hoy: ${c.done} de ${c.total} hábitos y ${c.pointsToday} pts. ${bedLine(c)}`,
  (c) => (c.allDone ? `Día completo, ${c.pointsToday} pts. ${bedLine(c)}` : `Cerraste con ${c.done} de ${c.total}. Lo que no salió, mañana. ${bedLine(c)}`),
  (c) => (c.allDone ? `Todo hecho hoy. ${bedLine(c)}` : `Todavía alcanzas el mínimo de ${c.first}. Después, ${lowerFirst(bedLine(c))}`),
  (c) => `Resumen: ${c.done}/${c.total} y ${c.pointsToday} pts. Deja el celular lejos de la cama. ${bedLine(c)}`,
  (c) => (c.allDone ? `Hoy sí se armó: ${c.pointsToday} pts. ${bedLine(c)}` : `${c.done} de ${c.total} hoy, ${c.pointsToday} pts. Mañana se recupera. ${bedLine(c)}`),
  (c) => `Ya casi. Anota tus minutos de redes y cierra el día. ${bedLine(c)}`,
];

const LATE: Variant[] = [
  () => 'Ya es de madrugada. Lo mejor que puedes hacer por tus hábitos ahora es dormir.',
  () => 'Es tarde. Mañana sigues; ahorita toca descansar.',
  () => 'Hora de dormir. Lo de hoy ya quedó.',
];

const BANKS: Record<Moment, Variant[]> = { morning: MORNING, afternoon: AFTERNOON, night: NIGHT };
const SALT: Record<Moment, number> = { morning: 0, afternoon: 2, night: 4 };

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** Which variant is used on a date: consecutive dates always get different variants. */
export function variantIndex(date: DateKey, bankSize: number, salt = 0): number {
  const day = diffDays('2026-01-01', date);
  return (((day + salt) % bankSize) + bankSize) % bankSize;
}

export function dailyLine(c: LineContext): string {
  const moment: Moment = c.hour >= 5 && c.hour < 12 ? 'morning' : c.hour >= 12 && c.hour < 19 ? 'afternoon' : 'night';
  if (c.total === 0 && moment !== 'night') {
    return c.isWorkDay
      ? `Hoy no tienes hábitos obligatorios. Entras a las ${formatTime(c.workStart ?? '07:00')}.`
      : 'Hoy no tienes hábitos obligatorios. Día tranquilo.';
  }
  const ctx: Ctx = {
    ...c,
    left: c.total - c.done,
    first: c.missing[0] ?? 'tu siguiente hábito',
    list: join(c.missing),
    start: formatTime(c.workStart ?? '07:00'),
    bed: formatTime(c.bedtime),
    allDone: c.total > 0 && c.done >= c.total,
    none: c.done === 0,
    habitsWord: c.total === 1 ? '1 hábito' : `${c.total} hábitos`,
  };
  if (moment === 'night' && c.hour < 5) return LATE[variantIndex(c.date, LATE.length)](ctx);
  if (moment === 'night' && c.total === 0) return `Hoy sumaste ${c.pointsToday} pts. ${bedLine(ctx)}`;
  const bank = BANKS[moment];
  return bank[variantIndex(c.date, bank.length, SALT[moment])](ctx);
}

/** Bank sizes, for tests and documentation. */
export const BANK_SIZES = { morning: MORNING.length, afternoon: AFTERNOON.length, night: NIGHT.length };
