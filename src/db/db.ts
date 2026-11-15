import Dexie, { type Table } from 'dexie';
import type {
  BadHabit, DayMeta, Habit, HabitLog, JournalEntry, Relapse, Settings, WeekPlan, WeeklyReview,
} from './types';

/**
 * Versioned schema. To evolve it, add a new `this.version(n)` block with the
 * new stores and an `.upgrade()` migration; never edit an old version.
 * Keep SCHEMA_VERSION in sync — it is also written into JSON backups.
 */
export const SCHEMA_VERSION = 1;

export class ForjaDB extends Dexie {
  habits!: Table<Habit, string>;
  habitLogs!: Table<HabitLog, string>;
  weekPlans!: Table<WeekPlan, string>;
  badHabits!: Table<BadHabit, string>;
  relapses!: Table<Relapse, string>;
  journal!: Table<JournalEntry, string>;
  reviews!: Table<WeeklyReview, string>;
  dayMeta!: Table<DayMeta, string>;
  settings!: Table<Settings, string>;

  constructor(name = 'forja') {
    super(name);
    this.version(1).stores({
      habits: 'id, lifecycle, order',
      habitLogs: 'id, &[habitId+date], habitId, date',
      weekPlans: 'id, habitId, weekStart',
      badHabits: 'id, lifecycle, order',
      relapses: 'id, badHabitId, date',
      journal: 'id, date',
      reviews: 'id, weekStart',
      dayMeta: 'id, date',
      settings: 'id',
    });
  }
}

export const TABLES = [
  'habits', 'habitLogs', 'weekPlans', 'badHabits', 'relapses', 'journal', 'reviews', 'dayMeta', 'settings',
] as const;
export type TableName = (typeof TABLES)[number];

export const db = new ForjaDB();
