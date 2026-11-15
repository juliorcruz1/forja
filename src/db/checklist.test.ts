import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { createBackup, parseBackup, restoreBackup } from './backup';
import { saveHabit, setChecklistAll, toggleChecklistItem, toggleDone } from './repo';
import type { ChecklistItem, Habit } from './types';
import {
  addItem, checklistStatus, cleanItems, moveItem, removeItem, timeLabel, updateItem,
} from '../domain/checklist';
import { todayKey } from '../lib/dates';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const TODAY = todayKey();

/** Three items: A (required + essential), B (required), C (optional). */
function threeItems(): ChecklistItem[] {
  let items: ChecklistItem[] = [];
  items = addItem(items, { name: 'Elemento A', note: '1 cápsula', timeOfDay: 'mañana', required: true, essential: true });
  items = addItem(items, { name: 'Elemento B', note: '2 tabletas', timeOfDay: 'con comida', required: true });
  items = addItem(items, { name: 'Elemento C', timeOfDay: 'noche', required: false });
  return items;
}

const supplements = (checklist: ChecklistItem[], id?: string) =>
  saveHabit({ id, name: 'Suplementos', icon: 'pill', kind: 'checklist', frequency: { type: 'daily' }, required: true, checklist });

const statusToday = async (h: Habit) => (await db.habitLogs.toArray()).find((l) => l.habitId === h.id && l.date === TODAY)?.status;

describe('checklist editing (pure)', () => {
  it('adds as many items as the user wants, each with its own id', () => {
    let items: ChecklistItem[] = [];
    for (let i = 0; i < 6; i++) items = addItem(items, { name: `E${i}` });
    expect(items).toHaveLength(6);
    expect(new Set(items.map((i) => i.id)).size).toBe(6);
    expect(items[0]).toMatchObject({ required: true, essential: false, timeOfDay: '' });
  });

  it('edits one item without touching the others', () => {
    const items = threeItems();
    const edited = updateItem(items, items[1].id, { name: 'B2', note: 'media', timeOfDay: 'noche', essential: true });
    expect(edited[1]).toMatchObject({ id: items[1].id, name: 'B2', note: 'media', timeOfDay: 'noche', essential: true });
    expect(edited[0]).toEqual(items[0]);
    expect(edited[2]).toEqual(items[2]);
  });

  it('deletes and reorders', () => {
    const items = threeItems();
    expect(removeItem(items, items[1].id).map((i) => i.name)).toEqual(['Elemento A', 'Elemento C']);
    expect(moveItem(items, items[2].id, -1).map((i) => i.name)).toEqual(['Elemento A', 'Elemento C', 'Elemento B']);
    expect(moveItem(items, items[0].id, 1).map((i) => i.name)).toEqual(['Elemento B', 'Elemento A', 'Elemento C']);
    expect(moveItem(items, items[0].id, -1)).toBe(items); // already first
    expect(moveItem(items, items[2].id, 1)).toBe(items); // already last
  });

  it('blank rows are dropped on save instead of blocking it', () => {
    const items = addItem(addItem(threeItems(), { name: '   ' }), { name: '' });
    const clean = cleanItems(items);
    expect(clean.map((i) => i.name)).toEqual(['Elemento A', 'Elemento B', 'Elemento C']);
    expect(clean[2].note).toBeUndefined();
  });

  it('shows the three times of day', () => {
    expect(['mañana', 'con comida', 'noche'].map(timeLabel)).toEqual(['Mañana', 'Con comida', 'Noche']);
    expect(timeLabel('tarde')).toBe('Tarde'); // older value still readable
  });
});

describe('checklist status: complete and minimum', () => {
  const items = threeItems();
  const [a, b, c] = items.map((i) => i.id);

  it('complete when all required items are checked (optional ones not needed)', () => {
    expect(checklistStatus(items, [a, b])).toBe('done');
    expect(checklistStatus(items, [a, b, c])).toBe('done');
  });
  it('minimum when only the essential items are checked', () => {
    expect(checklistStatus(items, [a])).toBe('min');
    expect(checklistStatus(items, [a, c])).toBe('min');
  });
  it('pending otherwise', () => {
    expect(checklistStatus(items, [])).toBe('pending');
    expect(checklistStatus(items, [b])).toBe('pending');
    expect(checklistStatus(items, [c])).toBe('pending');
  });
  it('with no required marked, every item is needed for complete', () => {
    const none = items.map((i) => ({ ...i, required: false, essential: false }));
    expect(checklistStatus(none, [a, b])).toBe('pending');
    expect(checklistStatus(none, [a, b, c])).toBe('done');
  });
});

describe('checklist in the database (Inicio flow)', () => {
  it('saves several items and checks each one separately', async () => {
    const h = await supplements(threeItems());
    expect((await db.habits.get(h.id))!.checklist).toHaveLength(3);
    const [a, b, c] = h.checklist!;
    await toggleChecklistItem(h, TODAY, c.id);
    expect(await statusToday(h)).toBe('pending');
    await toggleChecklistItem(h, TODAY, a.id);
    expect(await statusToday(h)).toBe('min');
    await toggleChecklistItem(h, TODAY, b.id);
    expect(await statusToday(h)).toBe('done');
    await toggleChecklistItem(h, TODAY, b.id); // uncheck
    expect(await statusToday(h)).toBe('min');
  });

  it('"Marcar todos" completes the habit and can be cleared', async () => {
    const h = await supplements(threeItems());
    await setChecklistAll(h, TODAY, true);
    const log = (await db.habitLogs.toArray())[0];
    expect(log.status).toBe('done');
    expect(log.checked).toHaveLength(3);
    await setChecklistAll(h, TODAY, false);
    expect(await statusToday(h)).toBe('pending');
  });

  it('heavy-day minimum checks only the essentials', async () => {
    const h = await supplements(threeItems());
    await toggleDone(h, TODAY, true);
    const log = (await db.habitLogs.toArray())[0];
    expect(log.status).toBe('min');
    expect(log.checked).toEqual([h.checklist![0].id]);
  });

  it('editing the list re-derives today: a new required item reopens a complete day', async () => {
    let h = await supplements(threeItems());
    await setChecklistAll(h, TODAY, true);
    expect(await statusToday(h)).toBe('done');
    h = await supplements(addItem(h.checklist!, { name: 'Elemento D', required: true }), h.id);
    expect(await statusToday(h)).toBe('min'); // A (essential) still checked, D missing
  });

  it('deleting a checked item drops it from the record and the status follows', async () => {
    let h = await supplements(threeItems());
    const [a, b] = h.checklist!;
    await toggleChecklistItem(h, TODAY, b.id); // only B (required, not essential)
    expect(await statusToday(h)).toBe('pending');
    h = await supplements(removeItem(h.checklist!, a.id), h.id); // remove A: now only B is required
    const log = (await db.habitLogs.toArray())[0];
    expect(log.checked).toEqual([b.id]);
    expect(log.status).toBe('done');
  });

  it('reordering is saved', async () => {
    let h = await supplements(threeItems());
    h = await supplements(moveItem(h.checklist!, h.checklist![2].id, -1), h.id);
    expect((await db.habits.get(h.id))!.checklist!.map((i) => i.name)).toEqual(['Elemento A', 'Elemento C', 'Elemento B']);
  });

  it('survives a backup round trip with all fields and checks', async () => {
    const h = await supplements(threeItems());
    await toggleChecklistItem(h, TODAY, h.checklist![0].id);
    const text = JSON.stringify(await createBackup());
    await db.delete();
    await db.open();
    await restoreBackup(parseBackup(text));
    const back = (await db.habits.get(h.id))!;
    expect(back.checklist).toEqual(h.checklist);
    expect(back.checklist!.map((i) => [i.name, i.note, i.timeOfDay, i.required, i.essential])).toEqual([
      ['Elemento A', '1 cápsula', 'mañana', true, true],
      ['Elemento B', '2 tabletas', 'con comida', true, false],
      ['Elemento C', '', 'noche', false, false],
    ]);
    expect(await statusToday(back)).toBe('min');
  });
});
