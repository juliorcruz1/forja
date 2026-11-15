import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { db } from '../db/db';
import type {
  BadHabit, DayMeta, DebtEvent, FocusSession, Habit, HabitLog, JarEmpty, Joker, MedalUnlock, Relapse, Settings, Urge,
  UsageLog, WeeklyReview, WindowLog,
} from '../db/types';
import { normalizeSettings } from '../config/defaults';
import { HabitIndex } from '../domain/habits';
import { computePoints, type PointsResult } from '../domain/points';
import { type DateKey, todayKey } from '../lib/dates';

export interface AppData {
  habits: Habit[];
  badHabits: BadHabit[];
  relapses: Relapse[];
  settings: Settings;
  dayMeta: DayMeta[];
  idx: HabitIndex;
  today: DateKey;
  // Stage 2
  logs: HabitLog[];
  jokers: Joker[];
  usageLogs: UsageLog[];
  windowLogs: WindowLog[];
  focusSessions: FocusSession[];
  urges: Urge[];
  /** Derived from the records on every change (memoized per day). */
  points: PointsResult;
  // Stage 3
  debtEvents: DebtEvent[];
  jarEmpties: JarEmpty[];
  medalUnlocks: MedalUnlock[];
  reviews: WeeklyReview[];
}

const Ctx = createContext<AppData | undefined>(undefined);

/** Loads a live snapshot of the core tables once and shares it with every screen. */
export function DataProvider({ children }: { children: ReactNode }) {
  const today = useToday();
  const raw = useLiveQuery(async () => {
    const [habits, logs, plans, badHabits, relapses, settings, dayMeta, jokers, usageLogs, windowLogs, focusSessions, urges,
      debtEvents, jarEmpties, medalUnlocks, reviews] =
      await Promise.all([
        db.habits.toArray(),
        db.habitLogs.toArray(),
        db.weekPlans.toArray(),
        db.badHabits.toArray(),
        db.relapses.toArray(),
        db.settings.get('settings'),
        db.dayMeta.toArray(),
        db.jokers.toArray(),
        db.usageLogs.toArray(),
        db.windowLogs.toArray(),
        db.focusSessions.toArray(),
        db.urges.toArray(),
        db.debtEvents.toArray(),
        db.jarEmpties.toArray(),
        db.medals.toArray(),
        db.reviews.toArray(),
      ]);
    return {
      habits, logs, plans, badHabits, relapses, settings, dayMeta, jokers, usageLogs, windowLogs, focusSessions, urges,
      debtEvents, jarEmpties, medalUnlocks, reviews,
    };
  });
  const value = useMemo<AppData | undefined>(() => {
    if (!raw || !raw.settings) return undefined;
    const settings = normalizeSettings(raw.settings, today);
    const points = computePoints({
      habits: raw.habits, logs: raw.logs, plans: raw.plans, badHabits: raw.badHabits, relapses: raw.relapses,
      usageLogs: raw.usageLogs, windowLogs: raw.windowLogs, focusSessions: raw.focusSessions, urges: raw.urges,
      jokers: raw.jokers, dayMeta: raw.dayMeta, settings, today,
    });
    return {
      habits: [...raw.habits].sort((a, b) => a.order - b.order),
      badHabits: [...raw.badHabits].sort((a, b) => a.order - b.order),
      relapses: raw.relapses,
      settings,
      dayMeta: raw.dayMeta,
      idx: new HabitIndex(raw.logs, raw.plans),
      today,
      logs: raw.logs,
      jokers: raw.jokers,
      usageLogs: raw.usageLogs,
      windowLogs: raw.windowLogs,
      focusSessions: raw.focusSessions,
      urges: raw.urges,
      points,
      debtEvents: raw.debtEvents,
      jarEmpties: raw.jarEmpties,
      medalUnlocks: raw.medalUnlocks,
      reviews: raw.reviews,
    };
  }, [raw, today]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): AppData | undefined {
  return useContext(Ctx);
}

/** Local date that updates at midnight and when the app returns to foreground. */
export function useToday(): DateKey {
  const [today, setToday] = useState(todayKey());
  useEffect(() => {
    const check = () => setToday((t) => (t === todayKey() ? t : todayKey()));
    const timer = setInterval(check, 30000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return today;
}
