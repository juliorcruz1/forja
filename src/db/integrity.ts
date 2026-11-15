import { db } from './db';

/** Records that point to a habit that no longer exists. Should always be empty. */
export async function findOrphans() {
  const habitIds = new Set((await db.habits.toArray()).map((h) => h.id));
  const badIds = new Set((await db.badHabits.toArray()).map((b) => b.id));
  return {
    habitLogs: (await db.habitLogs.toArray()).filter((l) => !habitIds.has(l.habitId)).map((l) => l.id),
    weekPlans: (await db.weekPlans.toArray()).filter((p) => !habitIds.has(p.habitId)).map((p) => p.id),
    relapses: (await db.relapses.toArray()).filter((r) => !badIds.has(r.badHabitId)).map((r) => r.id),
    usageLogs: (await db.usageLogs.toArray()).filter((u) => !badIds.has(u.badHabitId)).map((u) => u.id),
  };
}
