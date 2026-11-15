import { describe, expect, it } from 'vitest';
import { DEFAULT_LEVELS } from '../config/defaults';
import type { FocusSession, HabitLog, MedalUnlock, UsageLog, WeeklyReview, Weekday } from '../db/types';
import { addDays, type DateKey } from '../lib/dates';
import { HabitIndex } from './habits';
import { comebacks, computeMedals, type MedalInput, medalSyncPlan, perfectWeeks, unseenMedals } from './medals';
import { bad, habit, log, relapse } from './testUtils';

const T = '2026-01-01T00:00:00.000Z';
// Mon 2026-11-02 is the first day; weeks start on Monday.
const START = '2026-11-02';
const read = habit({ id: 'read', name: 'Lectura', startDate: START });

const doneDays = (id: string, from: DateKey, n: number, status: HabitLog['status'] = 'done') =>
  Array.from({ length: n }, (_, i) => log(id, addDays(from, i), status));

function input(p: Partial<MedalInput> & { logs?: HabitLog[] } = {}): MedalInput {
  const { logs = [], ...rest } = p;
  return {
    habits: [read], idx: new HabitIndex(logs), badHabits: [], relapses: [], usageLogs: [], focusSessions: [], reviews: [],
    levels: DEFAULT_LEVELS, points: { days: [] }, today: '2026-11-30', ...rest,
  };
}
const get = (ms: ReturnType<typeof computeMedals>, id: string) => ms.find((m) => m.id === id)!;

describe('streak medals', () => {
  it('exactly 7 days earns the 7 (dated the 7th day), not the 14', () => {
    const ms = computeMedals(input({ logs: doneDays('read', START, 7), today: '2026-11-20' }));
    expect(get(ms, 'streak:7')).toMatchObject({ earned: true, achievedOn: '2026-11-08' });
    expect(get(ms, 'streak:14')).toMatchObject({ earned: false, current: 7, target: 14 });
  });

  it('6 days is not enough; a miss resets the run', () => {
    const l = [...doneDays('read', START, 6), ...doneDays('read', '2026-11-09', 6)]; // 8 Nov missed
    const ms = computeMedals(input({ logs: l, today: '2026-11-20' }));
    expect(get(ms, 'streak:7').earned).toBe(false);
    expect(get(ms, 'streak:7').current).toBe(6);
  });

  it('rest days and today pending do not break the run', () => {
    const l = [...doneDays('read', START, 3), log('read', '2026-11-05', 'rest'), ...doneDays('read', '2026-11-06', 4)];
    const ms = computeMedals(input({ logs: l, today: '2026-11-10' }));
    expect(get(ms, 'streak:7')).toMatchObject({ earned: true, achievedOn: '2026-11-09' });
  });

  it('per-habit medals: 7 / 30 / 100 for each good habit', () => {
    const water = habit({ id: 'water', name: 'Agua', startDate: START, required: false });
    const ms = computeMedals(input({ habits: [read, water], logs: doneDays('water', START, 30), today: '2026-12-05' }));
    expect(get(ms, 'habit:water:7').earned).toBe(true);
    expect(get(ms, 'habit:water:30')).toMatchObject({ earned: true, achievedOn: '2026-12-01' });
    expect(get(ms, 'habit:water:100').earned).toBe(false);
    expect(get(ms, 'habit:read:7').earned).toBe(false);
  });
});

describe('weekly goal medals (Gym)', () => {
  const gym = habit({ id: 'gym', name: 'Gym', startDate: START, frequency: { type: 'weekly', target: 3, plannedDays: [0, 2, 4] as Weekday[] } });
  const week = (ws: DateKey) => [log('gym', ws, 'done'), log('gym', addDays(ws, 2), 'done'), log('gym', addDays(ws, 4), 'done')];

  it('first week met is dated the day the goal was reached', () => {
    const ms = computeMedals(input({ habits: [gym], logs: week(START), today: '2026-11-20' }));
    expect(get(ms, 'weekly:gym:1')).toMatchObject({ earned: true, achievedOn: '2026-11-06' });
    expect(get(ms, 'weekly:gym:4').earned).toBe(false);
  });

  it('4 consecutive weeks; a missed week resets', () => {
    const four = [START, '2026-11-09', '2026-11-16', '2026-11-23'].flatMap(week);
    expect(get(computeMedals(input({ habits: [gym], logs: four, today: '2026-11-30' })), 'weekly:gym:4').earned).toBe(true);
    const gap = [START, '2026-11-09', '2026-11-23', '2026-11-30'].flatMap(week);
    const ms = computeMedals(input({ habits: [gym], logs: gap, today: '2026-12-06' }));
    expect(get(ms, 'weekly:gym:4')).toMatchObject({ earned: false, current: 2 });
  });
});

describe('bad habit medals', () => {
  it('days clean: 7 and 14, reset by a relapse', () => {
    const smoke = bad({ id: 'smoke', name: 'Fumar', startDate: START });
    const ms = computeMedals(input({ badHabits: [smoke], relapses: [relapse('smoke', '2026-11-12')], today: '2026-11-22' }));
    expect(get(ms, 'bad:smoke:7')).toMatchObject({ earned: true, achievedOn: '2026-11-09' });
    expect(get(ms, 'bad:smoke:14')).toMatchObject({ earned: false, current: 10 });
  });

  it('limit mode (Redes): logged days within the limit', () => {
    const social = bad({ id: 'soc', name: 'Redes', startDate: START, mode: 'limit', limitMinutes: 60 });
    const usage: UsageLog[] = Array.from({ length: 7 }, (_, i) => ({
      id: `soc:${addDays(START, i)}`, badHabitId: 'soc', date: addDays(START, i), minutes: i === 3 ? 60 : 30, createdAt: T, updatedAt: T,
    }));
    const ms = computeMedals(input({ badHabits: [social], usageLogs: usage, today: '2026-11-09' }));
    expect(get(ms, 'bad:soc:7')).toMatchObject({ earned: true, achievedOn: '2026-11-08' });
  });
});

describe('perfect week, comeback, focus, care, levels', () => {
  it('perfect week: Monday to Sunday complete', () => {
    expect(perfectWeeks([read], new HabitIndex(doneDays('read', START, 7)), '2026-11-20')).toEqual(['2026-11-08']);
    // one day missing → not perfect
    const l = doneDays('read', START, 7).filter((x) => x.date !== '2026-11-05');
    expect(perfectWeeks([read], new HabitIndex(l), '2026-11-20')).toEqual([]);
    // a rest day doesn't spoil it
    const r = doneDays('read', START, 7).map((x) => (x.date === '2026-11-05' ? log('read', x.date, 'rest') : x));
    expect(perfectWeeks([read], new HabitIndex(r), '2026-11-20')).toEqual(['2026-11-08']);
    // tracking started on Saturday: that partial week never counts
    const late = habit({ id: 'late', startDate: '2026-11-07' });
    expect(perfectWeeks([late], new HabitIndex(doneDays('late', '2026-11-07', 2)), '2026-11-20')).toEqual([]);
    // the week isn't over yet → not yet
    expect(perfectWeeks([read], new HabitIndex(doneDays('read', START, 5)), '2026-11-06')).toEqual([]);
  });

  it('comeback: completing the day after a miss; 10 of them earn "Volver"', () => {
    // pattern: miss, done, miss, done … starting 2 Nov
    const l: HabitLog[] = [];
    for (let i = 0; i < 20; i++) if (i % 2 === 1) l.push(log('read', addDays(START, i), 'done'));
    expect(comebacks([read], new HabitIndex(l), '2026-11-30')).toHaveLength(10);
    const ms = computeMedals(input({ logs: l, today: '2026-11-30' }));
    expect(get(ms, 'comeback:10')).toMatchObject({ earned: true, achievedOn: addDays(START, 19) });
    // two done days in a row after a miss count once
    expect(comebacks([read], new HabitIndex(doneDays('read', '2026-11-03', 5)), '2026-11-30')).toEqual(['2026-11-03']);
  });

  it('focus hours from completed sessions only', () => {
    const s = (i: number, status: FocusSession['status']): FocusSession => ({
      id: `f${i}`, date: addDays(START, i), label: '', plannedMin: 60, startAt: `${addDays(START, i)}T10:00:00.000Z`, status, createdAt: T, updatedAt: T,
    });
    const sessions = [...Array.from({ length: 10 }, (_, i) => s(i, 'done')), s(11, 'cancelled')];
    const ms = computeMedals(input({ focusSessions: sessions }));
    expect(get(ms, 'focus:10')).toMatchObject({ earned: true, achievedOn: addDays(START, 9) });
    expect(get(ms, 'focus:50')).toMatchObject({ earned: false, current: 10 });
  });

  it('first backup, first review and 4 reviews', () => {
    const rv = (i: number): WeeklyReview => ({ id: `r${i}`, weekStart: addDays(START, 7 * i), answers: ['algo'], createdAt: `2026-11-0${i + 1}T12:00:00.000Z`, updatedAt: T });
    let ms = computeMedals(input({ reviews: [rv(0)], lastBackupAt: '2026-11-10T15:00:00.000Z' }));
    expect(get(ms, 'backup:1').earned).toBe(true);
    expect(get(ms, 'review:1').earned).toBe(true);
    expect(get(ms, 'review:4')).toMatchObject({ earned: false, current: 1 });
    ms = computeMedals(input({ reviews: [0, 1, 2, 3].map(rv) }));
    expect(get(ms, 'review:4')).toMatchObject({ earned: true, achievedOn: '2026-11-04' });
    // an empty review doesn't count
    expect(get(computeMedals(input({ reviews: [{ ...rv(0), answers: ['', ' '] }] })), 'review:1').earned).toBe(false);
  });

  it('levels Brasa / Hierro / Acero', () => {
    const days = [
      { date: '2026-11-02', total: 300 }, { date: '2026-11-03', total: 600 }, { date: '2026-11-04', total: 1600 },
    ] as unknown as MedalInput['points']['days'];
    const ms = computeMedals(input({ points: { days } }));
    expect(get(ms, 'level:Brasa')).toMatchObject({ earned: true, achievedOn: '2026-11-03' });
    expect(get(ms, 'level:Hierro')).toMatchObject({ earned: true, achievedOn: '2026-11-04' });
    expect(get(ms, 'level:Acero')).toMatchObject({ earned: false });
  });
});

describe('medals are derived: deleting a record takes the medal away', () => {
  it('removing a log under the 7-day streak removes the medal and its unlock', () => {
    const l = doneDays('read', START, 7);
    const before = computeMedals(input({ logs: l, today: '2026-11-20' }));
    const plan1 = medalSyncPlan(before, []);
    expect(plan1.add.map((a) => a.medalId)).toContain('streak:7');
    const unlocks: MedalUnlock[] = plan1.add.map((a) => ({ id: a.medalId, ...a, seen: false, createdAt: T, updatedAt: T }));
    expect(unseenMedals(before, unlocks).map((m) => m.id)).toContain('streak:7');

    const after = computeMedals(input({ logs: l.filter((x) => x.date !== '2026-11-05'), today: '2026-11-20' }));
    expect(get(after, 'streak:7').earned).toBe(false);
    expect(medalSyncPlan(after, unlocks).remove).toContain('streak:7');
  });

  it('archived habits keep earned medals and hide the unearned ones; deleted habits lose them', () => {
    const archived = { ...read, lifecycle: 'archived' as const, archivedAt: '2026-11-15' };
    const ms = computeMedals(input({ habits: [archived], logs: doneDays('read', START, 8), today: '2026-11-20' }));
    expect(ms.filter((m) => m.id.startsWith('habit:read')).map((m) => m.id)).toEqual(['habit:read:7']);
    expect(computeMedals(input({ habits: [], logs: doneDays('read', START, 8) })).some((m) => m.id.startsWith('habit:read'))).toBe(false);
  });

  it('a year of history with 10 habits computes quickly', () => {
    const hs = Array.from({ length: 10 }, (_, i) => habit({ id: `h${i}`, name: `H${i}`, startDate: '2025-11-01' }));
    const logs = hs.flatMap((h) => doneDays(h.id, '2025-11-01', 380));
    const t0 = performance.now();
    computeMedals(input({ habits: hs, logs, today: '2026-11-15' }));
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});
