import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { emptyJar, payDebt, resetDebts, saveHabit, unpayDebt, updateSettings, ensureSeeded } from './repo';
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
