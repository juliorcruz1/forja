import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_LEVELS, DEFAULT_POINTS } from '../config/defaults';
import type { DayMeta, FocusSession, HabitLog, Joker, Urge, UsageLog, WindowLog } from '../db/types';
import { addDays, type DateKey } from '../lib/dates';
import { computePoints, levelFor, memoStats, type PointsInput, summarize } from './points';
import { bad, habit, log, logs, relapse } from './testUtils';

// Week: Mon 2026-11-09 … Sun 2026-11-15. Next Monday: 2026-11-16.
const T = '2026-01-01T00:00:00.000Z';
const settings = (pointsStartDate = '2026-11-09') => ({ points: DEFAULT_POINTS, levels: DEFAULT_LEVELS, pointsStartDate });
const base = (p: Partial<PointsInput>): PointsInput => ({
  habits: [], logs: [], badHabits: [], relapses: [], settings: settings(), today: '2026-11-12', ...p,
});
const day = (r: ReturnType<typeof computePoints>, d: DateKey) => r.byDate.get(d)!;
const kinds = (r: ReturnType<typeof computePoints>, d: DateKey) => day(r, d).items.map((i) => `${i.kind}:${i.pts}`);

beforeEach(() => memoStats.clear());

describe('gains', () => {
  it('complete +10, minimum +6, extra +5, counter goal +10, perfect day +20', () => {
    const a = habit({ id: 'a', startDate: '2026-11-09' });
    const b = habit({ id: 'b', startDate: '2026-11-09' });
    const water = habit({ id: 'w', kind: 'counter', counterTarget: 8, startDate: '2026-11-09' });
    const walk = habit({ id: 'x', required: false, startDate: '2026-11-09' });
    const r = computePoints(base({
      habits: [a, b, water, walk],
      logs: [log('a', '2026-11-10', 'done'), log('b', '2026-11-10', 'min'), log('w', '2026-11-10', 'done', { count: 8 }), log('x', '2026-11-10', 'done')],
    }));
    expect(kinds(r, '2026-11-10').sort()).toEqual(['counter:10', 'done:10', 'extra:5', 'min:6', 'perfect:20'].sort());
    expect(day(r, '2026-11-10').net).toBe(51);
  });

  it('each habit gives points only once per day', () => {
    const a = habit({ id: 'a', startDate: '2026-11-09' });
    const dup: HabitLog[] = [log('a', '2026-11-10', 'done'), { ...log('a', '2026-11-10', 'done'), id: 'other' }];
    const r = computePoints(base({ habits: [a], logs: dup }));
    expect(day(r, '2026-11-10').items.filter((i) => i.kind === 'done')).toHaveLength(1);
  });

  it('streak milestones: 7 perfect days in a row → +50', () => {
    const a = habit({ id: 'a', startDate: '2026-11-01' });
    const done = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [addDays('2026-11-09', i), 'done' as const]));
    const r = computePoints(base({ habits: [a], logs: logs('a', done), today: '2026-11-16', settings: settings('2026-11-09') }));
    expect(kinds(r, '2026-11-15')).toContain('streak:50');
    expect(kinds(r, '2026-11-14')).not.toContain('streak:50');
  });

  it('phone-free window +10, focus +5 (max 4 a day), urge resisted +3', () => {
    const w: WindowLog = { id: 'w', date: '2026-11-10', kind: 'night', startedAt: T, endedAt: T, kept: true, createdAt: T, updatedAt: T };
    const notKept: WindowLog = { ...w, id: 'w2', kind: 'morning', kept: false };
    const focus: FocusSession[] = Array.from({ length: 6 }, (_, i) => ({
      id: `f${i}`, date: '2026-11-10', label: 'Clips', plannedMin: 25, startAt: `2026-11-10T1${i}:00:00.000Z`, status: 'done', createdAt: T, updatedAt: T,
    }));
    const cancelled: FocusSession = { ...focus[0], id: 'fc', status: 'cancelled' };
    const urges: Urge[] = [
      { id: 'u1', date: '2026-11-10', at: T, hour: 22, result: 'resisted', createdAt: T, updatedAt: T },
      { id: 'u2', date: '2026-11-10', at: T, hour: 23, result: 'fell', createdAt: T, updatedAt: T },
    ];
    const r = computePoints(base({ windowLogs: [w, notKept], focusSessions: [...focus, cancelled], urges }));
    const it = day(r, '2026-11-10').items;
    expect(it.filter((i) => i.kind === 'window').map((i) => i.pts)).toEqual([10]); // not kept: no points, no penalty
    expect(it.filter((i) => i.kind === 'focus')).toHaveLength(4);
    expect(it.filter((i) => i.kind === 'resisted').map((i) => i.pts)).toEqual([3]);
    expect(day(r, '2026-11-10').loss).toBe(0);
  });
});

describe('penalties (soft)', () => {
  it('missed required habit −5, applied only when the day is closed', () => {
    const a = habit({ id: 'a', startDate: '2026-11-09' });
    const r = computePoints(base({ habits: [a], today: '2026-11-12' }));
    expect(kinds(r, '2026-11-11')).toEqual(['missed:-5']);
    expect(day(r, '2026-11-12').items).toEqual([]); // today: provisional, no penalty
    expect(day(r, '2026-11-12').provisional).toBe(true);
  });

  it('daily cap of −20', () => {
    const many = Array.from({ length: 6 }, (_, i) => habit({ id: `h${i}`, startDate: '2026-11-09' }));
    const r = computePoints(base({ habits: many }));
    expect(day(r, '2026-11-10').loss).toBe(20);
    expect(day(r, '2026-11-10').cappedOff).toBe(10);
  });

  it('social over the limit −5 counts inside the −20 cap; within the limit +5', () => {
    const many = Array.from({ length: 4 }, (_, i) => habit({ id: `h${i}`, startDate: '2026-11-09' }));
    const redes = bad({ id: 'r', mode: 'limit', limitMinutes: 60, startDate: '2026-11-01' });
    const usage = (date: string, minutes: number): UsageLog => ({ id: `r:${date}`, badHabitId: 'r', date, minutes, createdAt: T, updatedAt: T });
    const r = computePoints(base({ habits: many, badHabits: [redes], usageLogs: [usage('2026-11-10', 90), usage('2026-11-11', 45)] }));
    expect(day(r, '2026-11-10').loss).toBe(20); // 4×5 + 5 = 25 → capped at 20
    expect(kinds(r, '2026-11-11')).toContain('socialWithin:5');
  });

  it('relapse −10 and clean days +5 for bad habits (closed days)', () => {
    const b = bad({ id: 'b', startDate: '2026-11-09' });
    const r = computePoints(base({ badHabits: [b], relapses: [relapse('b', '2026-11-10')] }));
    expect(kinds(r, '2026-11-09')).toEqual(['badClean:5']);
    expect(kinds(r, '2026-11-10')).toEqual(['relapse:-10']);
    expect(kinds(r, '2026-11-11')).toEqual(['badClean:5']);
    expect(day(r, '2026-11-12').items).toEqual([]); // today not closed
  });

  it('never penalizes rest days, non-scheduled days or optional habits', () => {
    const rest = habit({ id: 'a', startDate: '2026-11-09' });
    const monWedFri = habit({ id: 'b', startDate: '2026-11-09', frequency: { type: 'days', days: [0, 2, 4] } });
    const optional = habit({ id: 'c', startDate: '2026-11-09', required: false });
    const r = computePoints(base({
      habits: [rest, monWedFri, optional],
      logs: [log('a', '2026-11-10', 'rest'), log('b', '2026-11-09', 'done'), log('b', '2026-11-11', 'done'), log('a', '2026-11-09', 'done'), log('a', '2026-11-11', 'done')],
    }));
    expect(day(r, '2026-11-10').loss).toBe(0); // Tue: a resting, b not scheduled, c optional
  });

  it('heavy day and joker forgive the day', () => {
    const a = habit({ id: 'a', startDate: '2026-11-09' });
    const heavy: DayMeta = { id: '2026-11-10', date: '2026-11-10', heavy: true, createdAt: T, updatedAt: T };
    const joker: Joker = { id: '2026-11-11', date: '2026-11-11', weekStart: '2026-11-09', createdAt: T, updatedAt: T };
    const r = computePoints(base({ habits: [a], dayMeta: [heavy], jokers: [joker] }));
    expect(day(r, '2026-11-09').loss).toBe(5);
    expect(day(r, '2026-11-10')).toMatchObject({ loss: 0, waived: 'heavy' });
    expect(day(r, '2026-11-11')).toMatchObject({ loss: 0, waived: 'joker' });
  });
});

describe('weekly goal (evaluated over the week)', () => {
  const gym = () => habit({ id: 'g', startDate: '2026-11-01', frequency: { type: 'weekly', target: 5, plannedDays: [0, 1, 2, 3, 6] } });

  it('+30 the day the goal is reached', () => {
    const done = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'];
    const r = computePoints(base({ habits: [gym()], logs: logs('g', Object.fromEntries(done.map((d) => [d, 'done' as const]))), today: '2026-11-13' }));
    expect(kinds(r, '2026-11-13')).toContain('weekly:30');
    expect(kinds(r, '2026-11-12')).not.toContain('weekly:30');
  });

  it('missing days cost −10 each, only when the week closes (not day by day)', () => {
    const done = { '2026-11-09': 'done' as const, '2026-11-11': 'done' as const, '2026-11-13': 'done' as const };
    const open = computePoints(base({ habits: [gym()], logs: logs('g', done), today: '2026-11-15' }));
    expect(open.days.some((d) => d.items.some((i) => i.kind === 'weeklyMiss'))).toBe(false);
    expect(open.days.some((d) => d.items.some((i) => i.kind === 'missed'))).toBe(false); // planned days are not daily misses
    const closed = computePoints(base({ habits: [gym()], logs: logs('g', done), today: '2026-11-16' }));
    expect(kinds(closed, '2026-11-15')).toContain('weeklyMiss:-20'); // 3 of 5 → 2 missing
  });

  it('a week that started before the points start date is not penalized', () => {
    const r = computePoints(base({ habits: [gym()], today: '2026-11-16', settings: settings('2026-11-12') }));
    expect(r.days.some((d) => d.items.some((i) => i.kind === 'weeklyMiss'))).toBe(false);
  });
});

describe('start date, totals and levels', () => {
  it('days before the points start date neither add nor subtract', () => {
    const a = habit({ id: 'a', startDate: '2026-11-01' });
    const r = computePoints(base({ habits: [a], logs: logs('a', { '2026-11-05': 'done' }), settings: settings('2026-11-10'), today: '2026-11-12' }));
    expect(r.days[0].date).toBe('2026-11-10');
    expect(r.byDate.has('2026-11-05')).toBe(false);
    expect(r.byDate.has('2026-11-09')).toBe(false);
  });

  it('the total never goes below 0 and the level never goes down', () => {
    const a = habit({ id: 'a', startDate: '2026-11-01' });
    const levels = [{ name: 'Chispa', min: 0 }, { name: 'Brasa', min: 30 }];
    const r = computePoints(base({
      habits: [a],
      logs: logs('a', { '2026-11-09': 'done', '2026-11-10': 'done' }),
      settings: { ...settings('2026-11-09'), levels },
      today: '2026-11-20',
    }));
    // Mon/Tue +30 each (done + perfect), then misses −5 a day
    expect(r.byDate.get('2026-11-10')!.total).toBe(60);
    expect(r.total).toBeLessThan(60);
    expect(r.days.every((d) => d.total >= 0)).toBe(true);
    expect(r.maxTotal).toBe(60);
    expect(r.level.name).toBe('Brasa'); // reached Brasa once: stays Brasa
  });

  it('total floors at 0 when it would go negative', () => {
    const a = habit({ id: 'a', startDate: '2026-11-01' });
    const r = computePoints(base({ habits: [a], today: '2026-11-12' }));
    expect(r.days.map((d) => d.total)).toEqual([0, 0, 0, 0]);
  });

  it('levelFor gives progress to the next level', () => {
    expect(levelFor(0, DEFAULT_LEVELS)).toMatchObject({ name: 'Chispa', toNext: 500, progress: 0 });
    expect(levelFor(1000, DEFAULT_LEVELS)).toMatchObject({ name: 'Brasa', toNext: 500, progress: 0.5 });
    expect(levelFor(4000, DEFAULT_LEVELS)).toMatchObject({ name: 'Acero', progress: 1, toNext: 0 });
  });
});

describe('recalculation from records (never stored)', () => {
  it('editing or deleting a past record recomputes the points', () => {
    const a = habit({ id: 'a', startDate: '2026-11-09' });
    const before = computePoints(base({ habits: [a], logs: [log('a', '2026-11-10', 'done')] }));
    expect(day(before, '2026-11-10').net).toBe(30);
    const edited = computePoints(base({ habits: [a], logs: [log('a', '2026-11-10', 'min', { updatedAt: 'x' })] }));
    expect(day(edited, '2026-11-10').net).toBe(26); // 6 + 20 perfect
    const deleted = computePoints(base({ habits: [a], logs: [] }));
    expect(day(deleted, '2026-11-10').net).toBe(-5);
  });

  it('memoizes by day: an edit only recomputes the affected week', () => {
    const a = habit({ id: 'a', startDate: '2026-09-01' });
    const input = base({ habits: [a], settings: settings('2026-09-01'), today: '2026-11-12' });
    computePoints(input);
    memoStats.reset();
    computePoints(input);
    expect(memoStats.computed).toBe(0); // nothing changed
    computePoints({ ...input, logs: [log('a', '2026-11-03', 'done')] });
    expect(memoStats.computed).toBe(7); // only the week of Nov 3
  });

  it('summarize groups gains and losses by kind for a period', () => {
    const a = habit({ id: 'a', startDate: '2026-11-09' });
    const r = computePoints(base({ habits: [a], logs: [log('a', '2026-11-09', 'done')] }));
    const s = summarize(r, '2026-11-09', '2026-11-15');
    expect(s.gain).toBe(30);
    expect(s.loss).toBe(10);
    expect(s.net).toBe(20);
    expect(s.byKind.find((k) => k.kind === 'missed')?.pts).toBe(-10);
  });
});

describe('performance', () => {
  it('a year of history with 10 habits computes fast, and a re-render is near instant', () => {
    const hs = Array.from({ length: 10 }, (_, i) => habit({ id: `p${i}`, startDate: '2025-11-12' }));
    const all: HabitLog[] = [];
    for (let d = '2025-11-12'; d <= '2026-11-12'; d = addDays(d, 1)) hs.forEach((h, i) => (i + d.length) % 3 && all.push(log(h.id, d, 'done')));
    const input = base({ habits: hs, logs: all, settings: settings('2025-11-12') });
    let t = performance.now();
    computePoints(input);
    const cold = performance.now() - t;
    t = performance.now();
    computePoints({ ...input });
    const warm = performance.now() - t;
    expect(cold).toBeLessThan(3000);
    expect(warm).toBeLessThan(cold);
    console.log(`points: cold ${cold.toFixed(0)} ms, memoized ${warm.toFixed(0)} ms`);
  });
});
