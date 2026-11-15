import { describe, expect, it } from 'vitest';
import { defaultPunish } from '../config/defaults';
import type { DayMeta, DebtEvent, JarEmpty, Joker, PunishConfig } from '../db/types';
import { computeDebts, debtsInRange, drawTask, type PunishInput, resolveType, unsafePunishText } from './punish';
import { bad, habit, log, logs, relapse } from './testUtils';

// Week: Mon 2026-11-09 … Sun 2026-11-15.
const T = '2026-01-01T00:00:00.000Z';
const cfg = (p: Partial<PunishConfig> = {}): PunishConfig => ({ ...defaultPunish('2026-11-09'), ...p });
const base = (p: Partial<PunishInput>): PunishInput => ({
  habits: [], logs: [], badHabits: [], relapses: [], punish: cfg(), today: '2026-11-12', ...p,
});
const ev = (debtDate: string, kind: 'paid' | 'reset', date: string): DebtEvent => ({
  id: `${kind}:${debtDate}`, debtDate, kind, date, snapshot: { type: 'habitDebt', label: 'x', detail: 'y' }, createdAt: T, updatedAt: T,
});
const reading = () => habit({ id: 'read', name: 'Lectura', startDate: '2026-11-01' });

describe('each type of consequence', () => {
  it('habit debt: the missed habit + the extra, due the next day', () => {
    const r = computeDebts(base({ habits: [reading()], today: '2026-11-10' }));
    expect(r.debts).toHaveLength(1);
    expect(r.debts[0]).toMatchObject({ date: '2026-11-09', type: 'habitDebt', label: 'Deuda del hábito', detail: 'Lectura + 10 flexiones más', status: 'pending' });
  });

  it('"primero lo primero": no streams or games until the habit is done', () => {
    const r = computeDebts(base({ habits: [habit({ ...reading(), punishType: 'firstThings' })], today: '2026-11-10' }));
    expect(r.debts[0]).toMatchObject({ type: 'firstThings', detail: 'Sin streams ni juegos hasta hacer Lectura' });
  });

  it('pending task: drawn from the list, same day → same task', () => {
    const tasks = ['Ordenar el escritorio', 'Contestar el correo pendiente', 'Lavar el coche'];
    const r = computeDebts(base({ habits: [habit({ ...reading(), punishType: 'task' })], punish: cfg({ tasks }), today: '2026-11-10' }));
    expect(tasks).toContain(r.debts[0].detail);
    expect(r.debts[0].detail).toBe(drawTask(tasks, '2026-11-09'));
    // without a list it falls back to the habit debt
    const r2 = computeDebts(base({ habits: [habit({ ...reading(), punishType: 'task' })], today: '2026-11-10' }));
    expect(r2.debts[0].type).toBe('habitDebt');
  });

  it('jar: adds the amount; never pending; total, history and emptying', () => {
    const h = habit({ ...reading(), punishType: 'jar' });
    const r = computeDebts(base({ habits: [h], punish: cfg({ jarAmount: 2 }), today: '2026-11-13' }));
    expect(r.debts.map((d) => [d.date, d.status, d.amount])).toEqual([
      ['2026-11-09', 'jar', 2], ['2026-11-10', 'jar', 2], ['2026-11-11', 'jar', 2], ['2026-11-12', 'jar', 2],
    ]);
    expect(r.pending).toEqual([]); // jar entries don't count as pending debts
    expect(r.jar).toMatchObject({ total: 8, balance: 8 });
    const empty: JarEmpty = { id: 'e', date: '2026-11-11', throughDate: '2026-11-10', amount: 4, createdAt: T, updatedAt: T };
    const after = computeDebts(base({ habits: [h], punish: cfg({ jarAmount: 2 }), today: '2026-11-13', jarEmpties: [empty] }));
    expect(after.jar).toMatchObject({ total: 8, balance: 4 });
    expect(after.jar.empties).toHaveLength(1);
  });

  it('relapse creates a debt (relapses come first) and "ninguno" creates nothing', () => {
    const b = bad({ id: 'b', name: 'Redes', startDate: '2026-11-01' });
    const r = computeDebts(base({ habits: [reading()], badHabits: [b], relapses: [relapse('b', '2026-11-09')], today: '2026-11-10' }));
    expect(r.debts).toHaveLength(1); // max 1 per day even with two failures
    expect(r.debts[0].source).toMatchObject({ kind: 'bad', name: 'Redes' });
    expect(r.debts[0].detail).toBe('Un día limpio de Redes y 10 flexiones más');
    const none = computeDebts(base({ habits: [habit({ ...reading(), punishType: 'none' })], today: '2026-11-10' }));
    expect(none.debts).toEqual([]);
  });

  it('a type turned off in Ajustes is replaced by the default; all off → nothing', () => {
    const h = habit({ ...reading(), punishType: 'jar' });
    expect(computeDebts(base({ habits: [h], punish: cfg({ types: ['habitDebt'] }), today: '2026-11-10' })).debts[0].type).toBe('habitDebt');
    expect(computeDebts(base({ habits: [h], punish: cfg({ types: [] }), today: '2026-11-10' })).debts).toEqual([]);
    expect(computeDebts(base({ habits: [h], punish: cfg({ enabled: false }), today: '2026-11-10' })).debts).toEqual([]);
  });
});

describe('caps: 1 per day, 2 pending, reset', () => {
  it('max 1 debt per day even with several missed habits', () => {
    const many = [reading(), habit({ id: 'b2', name: 'Biblia', startDate: '2026-11-01' }), habit({ id: 'c', startDate: '2026-11-01' })];
    const r = computeDebts(base({ habits: many, today: '2026-11-10' }));
    expect(r.debts).toHaveLength(1);
    expect(r.debts[0].source.name).toBe('Lectura'); // first in order
  });

  it('max 2 pending at a time; more failures are capped and offer a reset', () => {
    const r = computeDebts(base({ habits: [reading()], today: '2026-11-14' })); // misses Mon–Fri
    expect(r.pending.map((d) => d.date)).toEqual(['2026-11-09', '2026-11-10']);
    expect(r.cappedDays).toEqual(['2026-11-11', '2026-11-12', '2026-11-13']);
    expect(r.overflow).toBe(true);
  });

  it('paying one frees a slot for the next failure', () => {
    const r = computeDebts(base({ habits: [reading()], debtEvents: [ev('2026-11-09', 'paid', '2026-11-10')], today: '2026-11-13' }));
    expect(r.debts.map((d) => [d.date, d.status])).toEqual([
      ['2026-11-09', 'paid'], ['2026-11-10', 'pending'], ['2026-11-11', 'pending'],
    ]);
    expect(r.cappedDays).toEqual(['2026-11-12']);
  });

  it('reset clears the pending ones and the count starts again', () => {
    const events = [ev('2026-11-09', 'reset', '2026-11-12'), ev('2026-11-10', 'reset', '2026-11-12')];
    const r = computeDebts(base({ habits: [reading()], debtEvents: events, today: '2026-11-15' }));
    expect(r.debts.map((d) => [d.date, d.status])).toEqual([
      ['2026-11-09', 'reset'], ['2026-11-10', 'reset'], ['2026-11-12', 'pending'], ['2026-11-13', 'pending'],
    ]);
    expect(r.cappedDays).toEqual(['2026-11-11', '2026-11-14']);
  });
});

describe('never a consequence for', () => {
  it('rest days, non-scheduled days and optional habits', () => {
    const rest = habit({ ...reading() });
    const mwf = habit({ id: 'mwf', name: 'MWF', startDate: '2026-11-01', frequency: { type: 'days', days: [0, 2, 4] } });
    const extra = habit({ id: 'x', name: 'Caminata', startDate: '2026-11-01', required: false });
    const r = computeDebts(base({
      habits: [rest, mwf, extra],
      logs: [log('read', '2026-11-10', 'rest'), ...logs('read', { '2026-11-09': 'done' }), ...logs('mwf', { '2026-11-09': 'done' })],
      today: '2026-11-11',
    }));
    expect(r.debts).toEqual([]); // Tue: reading resting, MWF not scheduled, walk optional
  });

  it('joker days and heavy days', () => {
    const joker: Joker = { id: '2026-11-09', date: '2026-11-09', weekStart: '2026-11-09', createdAt: T, updatedAt: T };
    const heavy: DayMeta = { id: '2026-11-10', date: '2026-11-10', heavy: true, createdAt: T, updatedAt: T };
    const r = computeDebts(base({ habits: [reading()], jokers: [joker], dayMeta: [heavy], today: '2026-11-11' }));
    expect(r.debts).toEqual([]);
  });

  it('today (the day has not closed) and days before the start date', () => {
    expect(computeDebts(base({ habits: [reading()], today: '2026-11-09' })).debts).toEqual([]);
    const r = computeDebts(base({ habits: [reading()], punish: cfg({ startDate: '2026-11-11' }), today: '2026-11-12' }));
    expect(r.debts.map((d) => d.date)).toEqual(['2026-11-11']);
  });

  it('minimum versions count as done', () => {
    const r = computeDebts(base({ habits: [reading()], logs: logs('read', { '2026-11-09': 'min' }), today: '2026-11-10' }));
    expect(r.debts).toEqual([]);
  });
});

describe('weekly goal (gym) when the week closes', () => {
  it('a missed weekly goal creates the Sunday debt; a met goal does not', () => {
    const gym = habit({ id: 'g', name: 'Gym', startDate: '2026-11-01', frequency: { type: 'weekly', target: 5, plannedDays: [] } });
    const missed = computeDebts(base({ habits: [gym], logs: logs('g', { '2026-11-10': 'done' }), today: '2026-11-16' }));
    expect(missed.debts.map((d) => [d.date, d.source.name])).toEqual([['2026-11-15', 'Gym (faltaron 4)']]);
    const five = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'];
    const met = computeDebts(base({ habits: [gym], logs: logs('g', Object.fromEntries(five.map((d) => [d, 'done' as const]))), today: '2026-11-16' }));
    expect(met.debts).toEqual([]);
  });
});

describe('recalculated from the records', () => {
  it('marking the day as done afterwards removes the debt; a paid one stays in history', () => {
    const before = computeDebts(base({ habits: [reading()], today: '2026-11-10' }));
    expect(before.pending).toHaveLength(1);
    const fixed = computeDebts(base({ habits: [reading()], logs: logs('read', { '2026-11-09': 'done' }), today: '2026-11-10' }));
    expect(fixed.debts).toEqual([]);
    const paidThenFixed = computeDebts(base({
      habits: [reading()], logs: logs('read', { '2026-11-09': 'done' }), debtEvents: [ev('2026-11-09', 'paid', '2026-11-10')], today: '2026-11-11',
    }));
    expect(paidThenFixed.debts.map((d) => d.date)).toEqual(['2026-11-10']);
    expect(paidThenFixed.history.find((d) => d.date === '2026-11-09')).toMatchObject({ status: 'paid', orphan: true });
  });

  it('deleting the relapse removes its debt', () => {
    const b = bad({ id: 'b', startDate: '2026-11-01' });
    expect(computeDebts(base({ badHabits: [b], relapses: [relapse('b', '2026-11-09')], today: '2026-11-10' })).debts).toHaveLength(1);
    expect(computeDebts(base({ badHabits: [b], relapses: [], today: '2026-11-10' })).debts).toEqual([]);
  });

  it('stats per period', () => {
    const r = computeDebts(base({ habits: [reading()], debtEvents: [ev('2026-11-09', 'paid', '2026-11-10')], today: '2026-11-12' }));
    expect(debtsInRange(r, '2026-11-09', '2026-11-15')).toMatchObject({ created: 3, paid: 1, pending: 2 });
  });
});

describe('safety and settings helpers', () => {
  it('rejects consequences about sleep, food, rest or pain', () => {
    expect(unsafePunishText('Dormir una hora menos')).not.toBeNull();
    expect(unsafePunishText('No comer postre')).not.toBeNull();
    expect(unsafePunishText('Ducha fría')).not.toBeNull();
    expect(unsafePunishText('Saltarme el descanso')).not.toBeNull();
    expect(unsafePunishText('10 flexiones más')).toBeNull();
    expect(unsafePunishText('Ordenar el escritorio')).toBeNull();
  });

  it('resolveType: own type, default, or none', () => {
    const c = cfg();
    expect(resolveType(undefined, c)).toBe('habitDebt');
    expect(resolveType('jar', c)).toBe('jar');
    expect(resolveType('none', c)).toBeNull();
  });
});
