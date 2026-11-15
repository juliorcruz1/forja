import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { db } from '../db/db';
import type { BadHabit, DayMeta, Habit, Relapse, Settings } from '../db/types';
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
}

/** Live snapshot of the core tables. Re-renders on any change. */
export function useData(): AppData | undefined {
  const today = useToday();
  const raw = useLiveQuery(async () => {
    const [habits, logs, plans, badHabits, relapses, settings, dayMeta] = await Promise.all([
      db.habits.toArray(),
      db.habitLogs.toArray(),
      db.weekPlans.toArray(),
      db.badHabits.toArray(),
      db.relapses.toArray(),
      db.settings.get('settings'),
      db.dayMeta.toArray(),
    ]);
    return { habits, logs, plans, badHabits, relapses, settings, dayMeta };
  });
  return useMemo(() => {
    if (!raw || !raw.settings) return undefined;
    return {
      habits: [...raw.habits].sort((a, b) => a.order - b.order),
      badHabits: [...raw.badHabits].sort((a, b) => a.order - b.order),
      relapses: raw.relapses,
      settings: raw.settings,
      dayMeta: raw.dayMeta,
      idx: new HabitIndex(raw.logs, raw.plans),
      today,
    };
  }, [raw, today]);
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
