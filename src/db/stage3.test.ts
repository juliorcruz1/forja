import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { deleteHabit, emptyJar, payDebt, resetDebts, saveHabit, setStatus, unpayDebt, updateSettings, ensureSeeded } from './repo';
import { dayInfo } from '../domain/calendar';
import { HabitIndex } from '../domain/habits';
import { computeDebts } from '../domain/punish';
import { normalizeSettings } from '../config/defaults';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function debtsAt(today: string) {
  const s = normalizeSettings((await db.settings.get('settings'))!);
  return computeDebts({
    habits: await db.habits.toArray(), logs: await db.habitLogs.toArray(), badHabits: await db.badHabits.toArray(),
    relapses: await db.relapses.toArray(), debtEvents: await db.debtEvents.toArray(), jarEmpties: await db.jarEmpties.toArray(),
    punish: s.punish, today,
  });
}

async function setup(type?: 'jar') {
  await ensureSeeded('2026-11-09');
  await db.habits.clear();
  await db.badHabits.clear();
  const s = normalizeSettings((await db.settings.get('settings'))!);
  await updateSettings({ punish: { ...s.punish, startDate: '2026-11-09', jarAmount: 2 } });
  await saveHabit({ name: 'Lectura', icon: 'book-open', kind: 'check', frequency: { type: 'daily' }, required: true, startDate: '2026-11-09', punishType: type });
}

describe('debts in the database', () => {
  it('pay, undo and reset are stored as dated events', async () => {
    await setup();
    let r = await debtsAt('2026-11-11');
    expect(r.pending.map((d) => d.date)).toEqual(['2026-11-09', '2026-11-10']);
    await payDebt(r.pending[0], new Date(2026, 10, 11, 9));
    r = await debtsAt('2026-11-11');
    expect(r.pending.map((d) => d.date)).toEqual(['2026-11-10']);
    expect(await db.debtEvents.get('paid:2026-11-09')).toMatchObject({ date: '2026-11-11', kind: 'paid' });
    await unpayDebt('2026-11-09');
    expect((await debtsAt('2026-11-11')).pending).toHaveLength(2);
    await resetDebts(r.pending.concat((await debtsAt('2026-11-11')).pending), new Date(2026, 10, 11, 10));
    expect((await debtsAt('2026-11-11')).pending).toEqual([]);
    expect((await debtsAt('2026-11-11')).history.every((d) => d.status === 'reset')).toBe(true);
  });

  it('jar: sum, history and emptying', async () => {
    await setup('jar');
    let r = await debtsAt('2026-11-12');
    expect(r.jar).toMatchObject({ balance: 6, total: 6 });
    await emptyJar(r.jar.balance, '2026-11-11', new Date(2026, 10, 12, 20));
    r = await debtsAt('2026-11-14');
    expect(r.jar.balance).toBe(4); // 12 and 13 after emptying
    expect(r.jar.total).toBe(10);
    expect(r.jar.empties).toHaveLength(1);
    expect(r.jar.empties[0]).toMatchObject({ amount: 6, throughDate: '2026-11-11' });
  });
});

describe('editing past days recalculates everything derived', () => {
  it('marking a missed day as done removes its debt and changes the calendar', async () => {
    await setup();
    const h = (await db.habits.toArray())[0];
    let r = await debtsAt('2026-11-12');
    expect(r.pending.map((d) => d.date)).toEqual(['2026-11-09', '2026-11-10']);
    await setStatus(h.id, '2026-11-09', 'done');
    r = await debtsAt('2026-11-12');
    // 9 Nov is fine now; 10 and 11 become the pending ones
    expect(r.pending.map((d) => d.date)).toEqual(['2026-11-10', '2026-11-11']);
    const cal = async (d: string) =>
      dayInfo(d, { habits: await db.habits.toArray(), idx: new HabitIndex(await db.habitLogs.toArray()), today: '2026-11-12', settings: normalizeSettings((await db.settings.get('settings'))!) }).kind;
    expect(await cal('2026-11-09')).toBe('perfect');
    // marking it as rest: no debt, calendar shows rest
    await setStatus(h.id, '2026-11-10', 'rest');
    expect((await debtsAt('2026-11-12')).debts.map((d) => d.date)).toEqual(['2026-11-11']);
    expect(await cal('2026-11-10')).toBe('rest');
  });

  it('deleting a habit removes its debts; paid ones stay in the history as they were', async () => {
    await setup();
    const h = (await db.habits.toArray())[0];
    const r = await debtsAt('2026-11-11');
    await payDebt(r.pending[0], new Date(2026, 10, 11, 9));
    await deleteHabit(h.id);
    const after = await debtsAt('2026-11-11');
    expect(after.pending).toEqual([]);
    expect(after.history).toHaveLength(1);
    expect(after.history[0]).toMatchObject({ date: '2026-11-09', status: 'paid', orphan: true });
  });
});
