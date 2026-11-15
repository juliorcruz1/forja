import type { BadHabit, Habit, LevelDef, NoPhoneConfig, PointValues, Settings } from '../db/types';
import { type DateKey, todayKey } from '../lib/dates';
import { uid, nowIso } from '../lib/id';

// ---------------- Stage 2 defaults (all editable in Ajustes) ----------------

/** Initial value of "Tu nombre" in Ajustes. The greeting always reads the setting. */
export const DEFAULT_USER_NAME = 'Julior';

export const DEFAULT_POINTS: PointValues = {
  done: 10,
  min: 6,
  extra: 5,
  hydration: 10,
  perfectDay: 20,
  weeklyGoal: 30,
  streak7: 50,
  streak14: 100,
  streak30: 200,
  badCleanDay: 5,
  missed: 5,
  dailyPenaltyCap: 20,
  relapse: 10,
  weeklyMissPerDay: 10,
  socialWithin: 5,
  socialOver: 5,
  windowKept: 10,
  focusSession: 5,
  focusMaxPerDay: 4,
  resisted: 3,
};

export const DEFAULT_LEVELS: LevelDef[] = [
  { name: 'Chispa', min: 0 },
  { name: 'Brasa', min: 500 },
  { name: 'Hierro', min: 1500 },
  { name: 'Acero', min: 4000 },
];

export const DEFAULT_NO_PHONE: NoPhoneConfig = {
  morningEnabled: true,
  morningMinutes: 30,
  nightEnabled: true,
  nightMinutes: 60,
};

/** Wake-up time per weekday (Mon..Sun): 1 h before work, 7:00 on rest days. */
export const DEFAULT_WAKE = ['07:00', '06:00', '06:00', '06:00', '04:00', '04:00', '07:00'];

export const DEFAULT_REPLACEMENTS = ['Leer 2 páginas', 'Tomar agua', 'Caminar 5 min', '10 flexiones'];

export const FOCUS_DURATIONS = [25, 45, 60];
export const DEFAULT_FOCUS_LABEL = 'Clips';
export const URGE_WAIT_SECONDS = 120;

/** Fills any setting missing from older data (schema v1/v2 records and backups). */
export function normalizeSettings(s: Partial<Settings>, today: DateKey = todayKey()): Settings {
  const base = defaultSettings(today);
  return {
    ...base,
    ...s,
    userName: typeof s.userName === 'string' ? s.userName : base.userName,
    points: { ...DEFAULT_POINTS, ...(s.points ?? {}) },
    levels: s.levels?.length ? s.levels : DEFAULT_LEVELS,
    pointsStartDate: s.pointsStartDate ?? today,
    wakeTime: s.wakeTime?.length === 7 ? s.wakeTime : DEFAULT_WAKE,
    noPhone: { ...DEFAULT_NO_PHONE, ...(s.noPhone ?? {}) },
    replacements: s.replacements ?? DEFAULT_REPLACEMENTS,
  } as Settings;
}

/** Suggested limit-mode bad habit, created once (editable or deletable). */
export function defaultSocialHabit(startDate: DateKey, order = 0): BadHabit {
  const t = nowIso();
  return {
    id: uid(),
    name: 'Redes / scroll',
    icon: 'smartphone',
    trigger: '',
    replacement: '',
    startDate,
    lifecycle: 'active',
    order,
    mode: 'limit',
    limitMinutes: 60,
    createdAt: t,
    updatedAt: t,
  };
}

/**
 * Editable defaults used on first launch. No personal data here: the
 * supplement list starts empty and is filled in by the user inside the app.
 */
export function defaultSettings(today: DateKey = todayKey()): Settings {
  const t = nowIso();
  const work = [
    { off: true, start: '07:00', end: '15:30' }, // Lunes: descanso
    { off: false, start: '07:00', end: '15:30' }, // Martes
    { off: false, start: '07:00', end: '15:30' }, // Miércoles
    { off: false, start: '07:00', end: '15:30' }, // Jueves
    { off: false, start: '05:00', end: '13:30' }, // Viernes
    { off: false, start: '05:00', end: '13:30' }, // Sábado
    { off: true, start: '07:00', end: '15:30' }, // Domingo: descanso
  ];
  return {
    id: 'settings',
    createdAt: t,
    updatedAt: t,
    work,
    bedtime: Array(7).fill('22:00'),
    criticalBedtime: '21:00',
    earlyStartThreshold: '06:00',
    weekStartsOn: 'monday',
    seeded: true,
    userName: DEFAULT_USER_NAME,
    points: DEFAULT_POINTS,
    levels: DEFAULT_LEVELS,
    pointsStartDate: today,
    wakeTime: DEFAULT_WAKE,
    noPhone: DEFAULT_NO_PHONE,
    replacements: DEFAULT_REPLACEMENTS,
  };
}

type HabitSeed = Omit<Habit, 'id' | 'createdAt' | 'updatedAt' | 'startDate' | 'pauses' | 'lifecycle' | 'order'>;

const SEEDS: HabitSeed[] = [
  {
    name: 'Gym',
    icon: 'dumbbell',
    kind: 'check',
    // No planned days by default: the user marks them each week (or in the habit).
    frequency: { type: 'weekly', target: 5, plannedDays: [] },
    minVersion: '10 min de movimiento',
    identity: 'Soy alguien que se cuida',
    required: true,
  },
  {
    name: 'Lectura',
    icon: 'book-open',
    kind: 'check',
    frequency: { type: 'daily' },
    minVersion: '2 páginas',
    identity: 'Soy alguien que aprende cada día',
    required: true,
  },
  {
    name: 'Biblia',
    icon: 'book-marked',
    kind: 'check',
    frequency: { type: 'daily' },
    minVersion: '1 versículo',
    required: true,
  },
  {
    name: 'Clips',
    icon: 'clapperboard',
    kind: 'counter',
    counterTarget: 1,
    counterUnit: 'clips',
    frequency: { type: 'daily' },
    minVersion: '1 clip subido',
    identity: 'Soy alguien que crea y publica',
    required: true,
  },
  {
    name: 'Hidratación',
    icon: 'droplets',
    kind: 'counter',
    counterTarget: 8,
    counterUnit: 'vasos',
    frequency: { type: 'daily' },
    required: true,
  },
  {
    name: 'Suplementos',
    icon: 'pill',
    kind: 'checklist',
    checklist: [],
    frequency: { type: 'daily' },
    minVersion: 'Tomar lo esencial',
    required: true,
  },
  {
    name: 'Sueño',
    icon: 'moon',
    kind: 'check',
    sleepLinked: true,
    frequency: { type: 'daily' },
    identity: 'Soy alguien que descansa para rendir',
    required: true,
  },
  {
    name: 'Caminata familiar',
    icon: 'footprints',
    kind: 'check',
    frequency: { type: 'daily' },
    minVersion: '10 min',
    required: false,
  },
];

export function defaultHabits(startDate: DateKey): Habit[] {
  const t = nowIso();
  return SEEDS.map((s, i) => ({
    ...s,
    id: uid(),
    createdAt: t,
    updatedAt: t,
    startDate,
    pauses: [],
    lifecycle: 'active',
    order: i,
  }));
}

/** Suggestions offered when creating a bad habit (none are created by default). */
export const BAD_HABIT_SUGGESTIONS = [
  'Redes sociales sin propósito',
  'Comida chatarra',
  'Desvelarme',
  'Refrescos',
  'Posponer la alarma',
];

export const WEEKLY_REVIEW_QUESTIONS = [
  '¿Qué salió bien esta semana?',
  '¿Qué se interpuso en el camino?',
  '¿Qué voy a ajustar la próxima semana?',
];
