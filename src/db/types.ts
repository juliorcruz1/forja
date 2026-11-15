import type { DateKey } from '../lib/dates';

/** Every stored record has these. Timestamps are ISO strings. */
export interface BaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export type HabitKind = 'check' | 'counter' | 'checklist';
export type HabitLifecycle = 'active' | 'paused' | 'archived';

/** 0 = Monday ... 6 = Sunday */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type Frequency =
  | { type: 'daily' }
  | { type: 'days'; days: Weekday[] }
  /** X times per week. plannedDays are a guide; any day counts toward the target. */
  | { type: 'weekly'; target: number; plannedDays: Weekday[] };

export interface ChecklistItem {
  id: string;
  name: string;
  note?: string; // free text: dose, note… (entered by the user, never suggested)
  /** 'mañana' | 'con comida' | 'noche' | '' (older backups may hold other text) */
  timeOfDay?: string;
  /** Must be checked for the habit to be "complete". */
  required: boolean;
  /** Checking all essential items = "minimum" version. */
  essential: boolean;
}

export interface PauseRange {
  from: DateKey;
  to?: DateKey; // inclusive end; undefined = still paused
}

export interface Habit extends BaseRecord {
  name: string;
  icon: string;
  kind: HabitKind;
  frequency: Frequency;
  minVersion?: string;
  identity?: string;
  stackAfter?: string;
  required: boolean; // false = optional / bonus ("Extras")
  lifecycle: HabitLifecycle;
  /** First local day the habit counts. */
  startDate: DateKey;
  archivedAt?: DateKey;
  pauses: PauseRange[];
  order: number;
  counterTarget?: number;
  counterUnit?: string;
  checklist?: ChecklistItem[];
  /** Shows the bedtime for the day (sleep habit). */
  sleepLinked?: boolean;
  /**
   * "Solo para hoy": a one-day habit that exists only on this date. Always
   * optional (counts as an extra), never in the day percentage or streaks.
   * Stored with startDate = oneOffDate and archivedAt = next day.
   */
  oneOffDate?: DateKey;
}

export type LogStatus = 'pending' | 'done' | 'min' | 'skipped' | 'rest';

export interface HabitLog extends BaseRecord {
  habitId: string;
  date: DateKey;
  status: LogStatus;
  count?: number;
  checked?: string[];
  note?: string;
}

/** Per-week override of planned days for a weekly-target habit. id = `${habitId}:${weekStart}` */
export interface WeekPlan extends BaseRecord {
  habitId: string;
  weekStart: DateKey;
  plannedDays: Weekday[];
}

export interface BadHabit extends BaseRecord {
  name: string;
  icon: string;
  trigger?: string;
  replacement?: string;
  startDate: DateKey;
  lifecycle: HabitLifecycle;
  archivedAt?: DateKey;
  order: number;
  /**
   * 'days' (default): counts days without falling.
   * 'limit': daily usage limit in minutes (e.g. "Redes / scroll"), logged manually each night.
   */
  mode?: 'days' | 'limit';
  limitMinutes?: number;
}

export interface Relapse extends BaseRecord {
  badHabitId: string;
  date: DateKey;
  note?: string;
}

export type Mood = 1 | 2 | 3 | 4 | 5;

/** id = date */
export interface JournalEntry extends BaseRecord {
  date: DateKey;
  mood?: Mood;
  line: string;
  reflection: string;
  gratitude: string;
  learning: string;
  notes: string;
}

/** id = weekStart */
export interface WeeklyReview extends BaseRecord {
  weekStart: DateKey;
  answers: string[];
}

/** id = date. Day-level flags. */
export interface DayMeta extends BaseRecord {
  date: DateKey;
  heavy: boolean;
}

export interface DaySchedule {
  off: boolean;
  start: string; // 'HH:MM'
  end: string;
}

export interface Settings extends BaseRecord {
  /** index 0 = Monday */
  work: DaySchedule[];
  /** Usual bedtime per weekday (night of that day). index 0 = Monday */
  bedtime: string[];
  /** Suggested bedtime on critical nights. */
  criticalBedtime: string;
  /** A night is critical when the next day's work starts before this time. */
  earlyStartThreshold: string;
  weekStartsOn: 'monday';
  lastBackupAt?: string;
  seeded: boolean;

  // ---------- Stage 2 (schema v3). Filled with defaults by normalizeSettings. ----------
  /** Name used in the greeting ("Buenos días, {nombre}"). Editable in Ajustes. */
  userName: string;
  points: PointValues;
  levels: LevelDef[];
  /** Points and penalties only count from this local date on. */
  pointsStartDate: DateKey;
  /** Usual wake-up time per weekday (index 0 = Monday), for the morning phone-free window. */
  wakeTime: string[];
  noPhone: NoPhoneConfig;
  /** Quick replacements shown in "Momento de ganas". */
  replacements: string[];
}

export interface PointValues {
  done: number;
  min: number;
  extra: number;
  hydration: number;
  perfectDay: number;
  weeklyGoal: number;
  streak7: number;
  streak14: number;
  streak30: number;
  badCleanDay: number;
  /** Penalties are stored as positive numbers and subtracted. */
  missed: number;
  dailyPenaltyCap: number;
  relapse: number;
  weeklyMissPerDay: number;
  socialWithin: number;
  socialOver: number;
  windowKept: number;
  focusSession: number;
  focusMaxPerDay: number;
  resisted: number;
}

export interface LevelDef {
  name: string;
  min: number;
}

export interface NoPhoneConfig {
  morningEnabled: boolean;
  /** Minutes after waking up. */
  morningMinutes: number;
  nightEnabled: boolean;
  /** Minutes before bedtime. */
  nightMinutes: number;
}

/** Weekly wildcard ("comodín"): forgives that day's penalties. id = date */
export interface Joker extends BaseRecord {
  date: DateKey;
  weekStart: DateKey;
}

/** Minutes used on a limit-mode bad habit (e.g. Redes) for a day. id = `${badHabitId}:${date}` */
export interface UsageLog extends BaseRecord {
  badHabitId: string;
  date: DateKey;
  minutes: number;
}

export type WindowKind = 'morning' | 'night';

/** A phone-free window the user started. id = `${date}:${kind}` */
export interface WindowLog extends BaseRecord {
  date: DateKey;
  kind: WindowKind;
  startedAt: string; // ISO
  endedAt?: string; // ISO
  /** Honor system: did you keep it? undefined while it is still open. */
  kept?: boolean;
}

export type FocusStatus = 'running' | 'done' | 'cancelled';

/**
 * Focus session. Time is derived from timestamps (startAt + plannedMin), never
 * from a running counter, so it survives the app being closed or suspended.
 */
export interface FocusSession extends BaseRecord {
  date: DateKey; // local date of startAt
  label: string;
  plannedMin: number;
  startAt: string; // ISO
  endAt?: string; // ISO, actual end (done or cancelled)
  status: FocusStatus;
}

/** A "Momento de ganas" (urge). */
export interface Urge extends BaseRecord {
  date: DateKey;
  at: string; // ISO time it was opened
  hour: number; // local hour 0..23
  situation?: string;
  feeling?: string;
  result?: 'resisted' | 'fell';
  /** Bad habit the fall was registered on (creates a Relapse). */
  badHabitId?: string;
  relapseId?: string;
}
