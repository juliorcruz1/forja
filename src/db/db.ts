import Dexie, { type Table } from 'dexie';
import type {
  BadHabit, DayMeta, DebtEvent, FocusSession, Habit, HabitLog, JarEmpty, Joker, JournalEntry, MedalUnlock, Relapse,
  Settings, Urge, UsageLog, WeekPlan, WeeklyReview, WindowLog,
} from './types';
import { migrateHabitV1toV2, migrateSettingsV2toV3, migrateSettingsV3toV4, withSocialHabit } from './migrations';
import { todayKey } from '../lib/dates';

/**
 * Versioned schema. To evolve it, add a new `this.version(n)` block with the
 * new stores and an `.upgrade()` migration; never edit an old version.
 * Keep SCHEMA_VERSION in sync — it is also written into JSON backups.
 */
export const SCHEMA_VERSION = 4;

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
  // Stage 2 (v3)
  jokers!: Table<Joker, string>;
  usageLogs!: Table<UsageLog, string>;
  windowLogs!: Table<WindowLog, string>;
  focusSessions!: Table<FocusSession, string>;
  urges!: Table<Urge, string>;
  // Stage 3 (v4)
  debtEvents!: Table<DebtEvent, string>;
  jarEmpties!: Table<JarEmpty, string>;
  medals!: Table<MedalUnlock, string>;

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
    // v2: same stores; Gym seed no longer has default planned days.
    this.version(2)
      .stores({})
      .upgrade((tx) =>
        tx.table<Habit, string>('habits').toCollection().modify((h, ref) => {
          ref.value = migrateHabitV1toV2(h);
        }),
      );
    // v3 (Stage 2): points, phone control, focus and urges.
    this.version(3)
      .stores({
        jokers: 'id, date, weekStart',
        usageLogs: 'id, badHabitId, date',
        windowLogs: 'id, date',
        focusSessions: 'id, date, status',
        urges: 'id, date',
      })
      .upgrade(async (tx) => {
        const today = todayKey();
        await tx.table<Settings, string>('settings').toCollection().modify((s, ref) => {
          ref.value = migrateSettingsV2toV3(s, today);
        });
        // Only existing installs get the suggestion here; fresh installs get it from ensureSeeded.
        if ((await tx.table('settings').count()) > 0) {
          const bad = await tx.table<BadHabit, string>('badHabits').toArray();
          const next = withSocialHabit(bad, today);
          if (next.length > bad.length) await tx.table('badHabits').add(next[next.length - 1]);
        }
      });
    // v4 (Stage 3): debts, jar and medals.
    this.version(4)
      .stores({
        debtEvents: 'id, debtDate, date',
        jarEmpties: 'id, date',
        medals: 'id',
      })
      .upgrade(async (tx) => {
        const today = todayKey();
        await tx.table<Settings, string>('settings').toCollection().modify((s, ref) => {
          ref.value = migrateSettingsV3toV4(s, today);
        });
      });
  }
}

export const TABLES = [
  'habits', 'habitLogs', 'weekPlans', 'badHabits', 'relapses', 'journal', 'reviews', 'dayMeta', 'settings',
  'jokers', 'usageLogs', 'windowLogs', 'focusSessions', 'urges',
  'debtEvents', 'jarEmpties', 'medals',
] as const;
export type TableName = (typeof TABLES)[number];

export const db = new ForjaDB();
