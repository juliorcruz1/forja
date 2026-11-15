/**
 * Pure helpers for checklist habits (e.g. Suplementos). The list is fully
 * user-defined: the app never suggests products, doses or medical advice.
 */
import type { ChecklistItem, LogStatus } from '../db/types';
import { uid } from '../lib/id';

export const TIMES_OF_DAY = [
  { value: 'mañana', label: 'Mañana' },
  { value: 'con comida', label: 'Con comida' },
  { value: 'noche', label: 'Noche' },
] as const;

/** Label for a stored time of day (older values like "tarde" are shown as-is). */
export function timeLabel(t?: string): string {
  if (!t) return '';
  return TIMES_OF_DAY.find((x) => x.value === t)?.label ?? t.charAt(0).toUpperCase() + t.slice(1);
}

export function newItem(p: Partial<ChecklistItem> = {}): ChecklistItem {
  return { id: uid(), name: '', note: '', timeOfDay: '', required: true, essential: false, ...p };
}

export const addItem = (items: ChecklistItem[], p: Partial<ChecklistItem> = {}) => [...items, newItem(p)];

export const updateItem = (items: ChecklistItem[], id: string, patch: Partial<ChecklistItem>) =>
  items.map((i) => (i.id === id ? { ...i, ...patch, id: i.id } : i));

export const removeItem = (items: ChecklistItem[], id: string) => items.filter((i) => i.id !== id);

/** Moves an item up (-1) or down (+1). Out-of-range moves return the list unchanged. */
export function moveItem(items: ChecklistItem[], id: string, dir: -1 | 1): ChecklistItem[] {
  const i = items.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= items.length) return items;
  const out = [...items];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Trims text and drops items left without a name (so a blank row never blocks saving). */
export function cleanItems(items: ChecklistItem[]): ChecklistItem[] {
  return items
    .map((i) => ({ ...i, name: i.name.trim(), note: i.note?.trim() || undefined, timeOfDay: i.timeOfDay || undefined }))
    .filter((i) => i.name.length > 0);
}

/**
 * Status from the checked items:
 * - complete ("done") when every required item is checked (if none is marked
 *   required, every item is);
 * - minimum ("min") when every essential item is checked but not all required;
 * - otherwise pending.
 */
export function checklistStatus(items: ChecklistItem[], checked: string[]): LogStatus {
  if (items.length === 0) return 'pending';
  const set = new Set(checked);
  const required = items.filter((i) => i.required);
  const essential = items.filter((i) => i.essential);
  const requiredList = required.length ? required : items;
  if (requiredList.every((i) => set.has(i.id))) return 'done';
  if (essential.length && essential.every((i) => set.has(i.id))) return 'min';
  return 'pending';
}

/** Checked ids that still exist in the list (items can be deleted after being checked). */
export const validChecked = (items: ChecklistItem[], checked: string[] = []) => {
  const ids = new Set(items.map((i) => i.id));
  return checked.filter((c) => ids.has(c));
};
