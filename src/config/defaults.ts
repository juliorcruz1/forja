import type { Habit, Settings } from '../db/types';
import type { DateKey } from '../lib/dates';
import { uid, nowIso } from '../lib/id';

/**
 * Editable defaults used on first launch. No personal data here: the
 * supplement list starts empty and is filled in by the user inside the app.
 */
export function defaultSettings(): Settings {
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
  };
}

type HabitSeed = Omit<Habit, 'id' | 'createdAt' | 'updatedAt' | 'startDate' | 'pauses' | 'lifecycle' | 'order'>;

const SEEDS: HabitSeed[] = [
  {
    name: 'Gym',
    icon: 'dumbbell',
    kind: 'check',
    // Default planned days avoid the 5:00 AM shifts (Fri/Sat).
    frequency: { type: 'weekly', target: 5, plannedDays: [0, 1, 2, 3, 6] },
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
