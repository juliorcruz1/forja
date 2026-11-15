/** All writes go through here. UI never touches Dexie tables directly. */
import { db } from './db';
import type {
  BadHabit, Habit, HabitLog, JournalEntry, LogStatus, Relapse, Settings, Weekday,
} from './types';
import { defaultHabits, defaultSettings } from '../config/defaults';
import { counterStatus } from '../domain/habits';
import { checklistStatus, validChecked } from '../domain/checklist';
import { addDays as addDaysSafe, type DateKey, todayKey } from '../lib/dates';
import { nowIso, uid } from '../lib/id';

export async function ensureSeeded(today: DateKey = todayKey()): Promise<void> {
  await db.transaction('rw', db.settings, db.habits, async () => {
    const s = await db.settings.get('settings');
    if (s) return;
    await db.settings.put(defaultSettings());
    if ((await db.habits.count()) === 0) await db.habits.bulkPut(defaultHabits(today));
  });
}

// ---------------- Habit logs ----------------

async function getLog(habitId: string, date: DateKey) {
  return db.habitLogs.where('[habitId+date]').equals([habitId, date]).first();
}

async function upsertLog(habitId: string, date: DateKey, patch: Partial<HabitLog>): Promise<HabitLog> {
  const existing = await getLog(habitId, date);
  const t = nowIso();
  const log: HabitLog = existing
    ? { ...existing, ...patch, updatedAt: t }
    : { id: uid(), habitId, date, status: 'pending', createdAt: t, updatedAt: t, ...patch };
  await db.habitLogs.put(log);
  return log;
}

export function setStatus(habitId: string, date: DateKey, status: LogStatus) {
  return upsertLog(habitId, date, { status });
}

/** Tap on the status circle: pending -> done, done/min -> pending. */
export function toggleDone(habit: Habit, date: DateKey, asMin = false) {
  return db.transaction('rw', db.habitLogs, () => toggleDoneTx(habit, date, asMin));
}

async function toggleDoneTx(habit: Habit, date: DateKey, asMin: boolean) {
  const log = await getLog(habit.id, date);
  const cur = log?.status ?? 'pending';
  const next: LogStatus = cur === 'done' || cur === 'min' ? 'pending' : asMin ? 'min' : 'done';
  const patch: Partial<HabitLog> = { status: next };
  if (habit.kind === 'counter') patch.count = next === 'done' ? Math.max(log?.count ?? 0, habit.counterTarget ?? 1) : next === 'pending' ? 0 : log?.count ?? 0;
  if (habit.kind === 'checklist') {
    const items = habit.checklist ?? [];
    patch.checked = next === 'done' ? items.map((i) => i.id) : next === 'min' ? items.filter((i) => i.essential).map((i) => i.id) : [];
  }
  return upsertLog(habit.id, date, patch);
}

export async function setCount(habit: Habit, date: DateKey, count: number) {
  return db.transaction('rw', db.habitLogs, async () => {
    const c = Math.max(0, Math.min(99, Math.round(count)));
    const log = await getLog(habit.id, date);
    let status = counterStatus(c, habit.counterTarget ?? 1);
    if (status === 'pending' && log?.status === 'min' && c > 0) status = 'min';
    return upsertLog(habit.id, date, { count: c, status });
  });
}

/** Atomic +n (safe with fast repeated taps). */
export async function incrementCount(habit: Habit, date: DateKey, n = 1) {
  return db.transaction('rw', db.habitLogs, async () => {
    const log = await getLog(habit.id, date);
    return setCount(habit, date, (log?.count ?? 0) + n);
  });
}

/** Check or uncheck one item; the habit status follows (complete / minimum / pending). */
export async function toggleChecklistItem(habit: Habit, date: DateKey, itemId: string) {
  return db.transaction('rw', db.habitLogs, async () => {
    const items = habit.checklist ?? [];
    const log = await getLog(habit.id, date);
    const set = new Set(validChecked(items, log?.checked));
    if (set.has(itemId)) set.delete(itemId);
    else set.add(itemId);
    const checked = items.map((i) => i.id).filter((id) => set.has(id)); // keep list order
    return upsertLog(habit.id, date, { checked, status: checklistStatus(items, checked) });
  });
}

/** "Marcar todos" (all = true) or clear the list (all = false). */
export async function setChecklistAll(habit: Habit, date: DateKey, all: boolean) {
  return db.transaction('rw', db.habitLogs, async () => {
    const items = habit.checklist ?? [];
    const checked = all ? items.map((i) => i.id) : [];
    return upsertLog(habit.id, date, { checked, status: all ? checklistStatus(items, checked) : 'pending' });
  });
}

/**
 * After the list is edited, re-derive that day's status from what is still
 * checked (e.g. adding a required item turns "complete" back into pending).
 * Rest / skipped days are left alone.
 */
async function recomputeChecklistDay(habit: Habit, date: DateKey) {
  const log = await getLog(habit.id, date);
  if (!log || log.status === 'rest' || log.status === 'skipped') return;
  const items = habit.checklist ?? [];
  if (items.length === 0) return;
  const checked = validChecked(items, log.checked);
  await upsertLog(habit.id, date, { checked, status: checklistStatus(items, checked) });
}

export function setLogNote(habitId: string, date: DateKey, note: string) {
  return upsertLog(habitId, date, { note });
}

// ---------------- Week plans ----------------

export async function setWeekPlan(habitId: string, weekStart: DateKey, plannedDays: Weekday[]) {
  const id = `${habitId}:${weekStart}`;
  const t = nowIso();
  const existing = await db.weekPlans.get(id);
  const days = [...new Set(plannedDays)].sort() as Weekday[];
  await db.weekPlans.put({ id, habitId, weekStart, plannedDays: days, createdAt: existing?.createdAt ?? t, updatedAt: t });
}

export function clearWeekPlan(habitId: string, weekStart: DateKey) {
  return db.weekPlans.delete(`${habitId}:${weekStart}`);
}

// ---------------- Habits ----------------

export type HabitDraft = Omit<Habit, 'id' | 'createdAt' | 'updatedAt' | 'order' | 'pauses' | 'lifecycle' | 'startDate'> &
  Partial<Pick<Habit, 'id' | 'startDate'>>;

export async function saveHabit(draft: HabitDraft): Promise<Habit> {
  const t = nowIso();
  const existing = draft.id ? await db.habits.get(draft.id) : undefined;
  const order = existing?.order ?? (await db.habits.count());
  const habit: Habit = existing
    ? { ...existing, ...draft, id: existing.id, updatedAt: t }
    : {
        pauses: [],
        lifecycle: 'active',
        ...draft,
        id: uid(),
        startDate: draft.startDate ?? todayKey(),
        order,
        createdAt: t,
        updatedAt: t,
      };
  await db.habits.put(habit);
  if (existing && habit.kind === 'checklist') await recomputeChecklistDay(habit, todayKey());
  return habit;
}

async function patchHabit(id: string, fn: (h: Habit) => Partial<Habit>) {
  const h = await db.habits.get(id);
  if (!h) return;
  await db.habits.put({ ...h, ...fn(h), updatedAt: nowIso() });
}

export const pauseHabit = (id: string, today = todayKey()) =>
  patchHabit(id, (h) => ({ lifecycle: 'paused', pauses: [...h.pauses, { from: today }] }));

/** Ends any open pause the day before `today` (dropping same-day pauses, which cover no days). */
const closePauses = (h: Habit, today: DateKey) =>
  h.pauses
    .map((p) => (p.to ? p : { ...p, to: addDaysSafe(today, -1) }))
    .filter((p) => p.to! >= p.from);

export const resumeHabit = (id: string, today = todayKey()) =>
  patchHabit(id, (h) => ({ lifecycle: 'active', pauses: closePauses(h, today) }));

/**
 * Archive: the habit leaves Inicio from `today` on, but every record stays, so
 * its history and statistics (and anything derived later) are kept.
 */
export const archiveHabit = (id: string, today = todayKey()) =>
  patchHabit(id, (h) => ({ lifecycle: 'archived', archivedAt: today, pauses: closePauses(h, today) }));

/**
 * Restore an archived habit. The archived days become a pause, so they are
 * not counted as misses and do not break streaks.
 */
export const restoreHabit = (id: string, today = todayKey()) =>
  patchHabit(id, (h) => {
    const pauses = [...h.pauses];
    if (h.archivedAt && h.archivedAt <= addDaysSafe(today, -1)) {
      pauses.push({ from: h.archivedAt, to: addDaysSafe(today, -1) });
    }
    return { lifecycle: 'active', archivedAt: undefined, pauses };
  });

/** Deletes the habit and every record that belongs to it (logs and week plans). */
export async function deleteHabit(id: string) {
  await db.transaction('rw', db.habits, db.habitLogs, db.weekPlans, async () => {
    await db.habits.delete(id);
    await db.habitLogs.where('habitId').equals(id).delete();
    await db.weekPlans.where('habitId').equals(id).delete();
  });
}

/** How many records a delete would remove (for the confirmation message). */
export async function habitRecordCount(id: string, kind: 'good' | 'bad') {
  return kind === 'good'
    ? db.habitLogs.where('habitId').equals(id).count()
    : db.relapses.where('badHabitId').equals(id).count();
}

export async function moveHabit(id: string, dir: -1 | 1) {
  const all = (await db.habits.toArray()).sort((a, b) => a.order - b.order);
  const i = all.findIndex((h) => h.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  const t = nowIso();
  await db.habits.bulkPut(all.map((h, order) => ({ ...h, order, updatedAt: h.order === order ? h.updatedAt : t })));
}

// ---------------- "Solo para hoy" (one-day habits) ----------------

export async function createOneOff(date: DateKey, name: string, icon: string): Promise<Habit> {
  return saveHabit({
    name: name.trim(),
    icon,
    kind: 'check',
    frequency: { type: 'daily' },
    required: false,
    startDate: date,
    archivedAt: addDaysSafe(date, 1), // exists only on `date`
    oneOffDate: date,
  });
}

export const updateOneOff = (id: string, name: string, icon: string) =>
  patchHabit(id, () => ({ name: name.trim(), icon }));

// ---------------- Bad habits ----------------

export type BadHabitDraft = Pick<BadHabit, 'name' | 'icon' | 'trigger' | 'replacement'> & Partial<Pick<BadHabit, 'id' | 'startDate'>>;

export async function saveBadHabit(draft: BadHabitDraft): Promise<BadHabit> {
  const t = nowIso();
  const existing = draft.id ? await db.badHabits.get(draft.id) : undefined;
  const b: BadHabit = existing
    ? { ...existing, ...draft, id: existing.id, updatedAt: t }
    : {
        ...draft,
        id: uid(),
        startDate: draft.startDate ?? todayKey(),
        lifecycle: 'active',
        order: await db.badHabits.count(),
        createdAt: t,
        updatedAt: t,
      };
  await db.badHabits.put(b);
  return b;
}

export async function setBadHabitLifecycle(id: string, lifecycle: BadHabit['lifecycle']) {
  const b = await db.badHabits.get(id);
  if (!b) return;
  await db.badHabits.put({ ...b, lifecycle, archivedAt: lifecycle === 'archived' ? todayKey() : undefined, updatedAt: nowIso() });
}

export async function deleteBadHabit(id: string) {
  await db.transaction('rw', db.badHabits, db.relapses, async () => {
    await db.badHabits.delete(id);
    await db.relapses.where('badHabitId').equals(id).delete();
  });
}

export async function addRelapse(badHabitId: string, date: DateKey, note?: string): Promise<Relapse> {
  const t = nowIso();
  const r: Relapse = { id: uid(), badHabitId, date, note: note?.trim() || undefined, createdAt: t, updatedAt: t };
  await db.relapses.put(r);
  return r;
}

export async function updateRelapse(id: string, patch: Partial<Pick<Relapse, 'date' | 'note'>>) {
  const r = await db.relapses.get(id);
  if (!r) return;
  await db.relapses.put({ ...r, ...patch, updatedAt: nowIso() });
}

export const deleteRelapse = (id: string) => db.relapses.delete(id);

// ---------------- Journal / reviews / day meta ----------------

export async function saveJournal(date: DateKey, patch: Partial<Omit<JournalEntry, 'id' | 'date' | 'createdAt' | 'updatedAt'>>) {
  const t = nowIso();
  const existing = await db.journal.get(date);
  const entry: JournalEntry = existing
    ? { ...existing, ...patch, updatedAt: t }
    : { id: date, date, line: '', reflection: '', gratitude: '', learning: '', notes: '', createdAt: t, updatedAt: t, ...patch };
  await db.journal.put(entry);
}

export async function saveReview(weekStart: DateKey, answers: string[]) {
  const t = nowIso();
  const existing = await db.reviews.get(weekStart);
  await db.reviews.put({ id: weekStart, weekStart, answers, createdAt: existing?.createdAt ?? t, updatedAt: t });
}

export async function setHeavyDay(date: DateKey, heavy: boolean) {
  const t = nowIso();
  const existing = await db.dayMeta.get(date);
  await db.dayMeta.put({ id: date, date, heavy, createdAt: existing?.createdAt ?? t, updatedAt: t });
}

export async function updateSettings(patch: Partial<Settings>) {
  const s = (await db.settings.get('settings')) ?? defaultSettings();
  await db.settings.put({ ...s, ...patch, id: 'settings', updatedAt: nowIso() });
}
