import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { db } from '../db/db';
import type {
  BadHabit, DayMeta, FocusSession, Habit, HabitLog, Joker, Relapse, Settings, Urge, UsageLog, WindowLog,
} from '../db/types';
import { normalizeSettings } from '../config/defaults';
import { HabitIndex } from '../domain/habits';
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
}

const Ctx = createContext<AppData | undefined>(undefined);

/** Loads a live snapshot of the core tables once and shares it with every screen. */
export function DataProvider({ children }: { children: ReactNode }) {
  const today = useToday();
  const raw = useLiveQuery(async () => {
    const [habits, logs, plans, badHabits, relapses, settings, dayMeta, jokers, usageLogs, windowLogs, focusSessions, urges] =
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
      ]);
    return { habits, logs, plans, badHabits, relapses, settings, dayMeta, jokers, usageLogs, windowLogs, focusSessions, urges };
  });
  const value = useMemo<AppData | undefined>(() => {
    if (!raw || !raw.settings) return undefined;
    return {
      habits: [...raw.habits].sort((a, b) => a.order - b.order),
      badHabits: [...raw.badHabits].sort((a, b) => a.order - b.order),
      relapses: raw.relapses,
      settings: normalizeSettings(raw.settings, today),
      dayMeta: raw.dayMeta,
      idx: new HabitIndex(raw.logs, raw.plans),
      today,
      logs: raw.logs,
      jokers: raw.jokers,
      usageLogs: raw.usageLogs,
      windowLogs: raw.windowLogs,
      focusSessions: raw.focusSessions,
      urges: raw.urges,
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
