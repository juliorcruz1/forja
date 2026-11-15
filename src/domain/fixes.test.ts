import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultHabits, defaultSettings } from '../config/defaults';
import { addDays, todayKey, weekday } from '../lib/dates';
import { dayProgress, HabitIndex, weeklyGoal, weeklyStreak } from './habits';
import { nightInfo } from './sleep';
import { habitTally } from './stats';
import { habit, logs } from './testUtils';

afterEach(() => {
  vi.useRealTimers();
});

describe('Gym weekly goal (regression: showed "de 2" when created on a Saturday)', () => {
  const gym = () => defaultHabits('2026-11-14').find((h) => h.name === 'Gym')!; // created Saturday

  it('the default Gym has a goal of 5 and no planned days', () => {
    const g = gym();
    expect(g.frequency).toEqual({ type: 'weekly', target: 5, plannedDays: [] });
  });

  it('shows "X de 5" even in the week it was created', () => {
    const goal = weeklyGoal(gym(), new HabitIndex(), '2026-11-14');
    expect(goal.target).toBe(5);
    expect(goal.message).toContain('de 5');
  });

  it('a partial first week is never counted as a failure', () => {
    const g = { ...gym(), id: 'gym' };
    const idx = new HabitIndex(logs('gym', { '2026-11-14': 'done' }));
    // Next week, looking back: start week (Sat–Sun only) didn't reach 5, but it isn't "missed"
    expect(weeklyStreak(g, idx, '2026-11-18')).toBe(0);
    expect(habitTally(g, idx, '2026-11-09', '2026-11-15', '2026-11-18')).toEqual({ done: 1, slots: 1, pct: 100 });
  });

  it('full weeks below the goal still count as missed', () => {
    const g = habit({ id: 'g2', startDate: '2026-11-01', frequency: { type: 'weekly', target: 5, plannedDays: [] } });
    const idx = new HabitIndex(logs('g2', { '2026-11-02': 'done', '2026-11-03': 'done' }));
    expect(habitTally(g, idx, '2026-11-02', '2026-11-08', '2026-11-12')).toEqual({ done: 2, slots: 5, pct: 40 });
  });

  it('with no planned days, the Gym does not lower the daily percentage until done', () => {
    const g = { ...gym(), id: 'gym' };
    expect(dayProgress([g], '2026-11-14', new HabitIndex(), '2026-11-14').total).toBe(0);
    const done = new HabitIndex(logs('gym', { '2026-11-14': 'done' }));
    expect(dayProgress([g], '2026-11-14', done, '2026-11-14')).toMatchObject({ total: 1, done: 1, pct: 100 });
  });
});

describe('critical nights with a simulated clock', () => {
  const settings = defaultSettings();

  // Week of Mon 16 – Sun 22 Nov 2026, at 8:00 PM local time
  const at = (day: number) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, day, 20, 0));
    return todayKey();
  };

  it('Thursday night is critical: work Friday at 5:00 AM → bed at 9:00 PM', () => {
    const today = at(19);
    expect(weekday(today)).toBe(3); // Thursday
    expect(nightInfo(settings, today)).toEqual({ critical: true, bedtime: '21:00', nextStart: '05:00' });
  });

  it('Friday night is critical: work Saturday at 5:00 AM', () => {
    const today = at(20);
    expect(weekday(today)).toBe(4);
    expect(nightInfo(settings, today)).toEqual({ critical: true, bedtime: '21:00', nextStart: '05:00' });
  });

  it('every other night is not critical and uses 10:00 PM', () => {
    for (const day of [16, 17, 18, 21, 22]) {
      const today = at(day);
      const n = nightInfo(settings, today);
      expect(n.critical, `night of ${today}`).toBe(false);
      expect(n.bedtime).toBe('22:00');
    }
  });

  it('late at night (11:30 PM) is still the same local day', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 19, 23, 30));
    expect(todayKey()).toBe('2026-11-19');
    expect(nightInfo(settings, todayKey()).critical).toBe(true);
    expect(nightInfo(settings, addDays(todayKey(), 2)).critical).toBe(false); // Saturday night → Sunday off
  });

  it('a custom critical bedtime is respected', () => {
    const custom = { ...settings, criticalBedtime: '20:30' };
    expect(nightInfo(custom, at(19)).bedtime).toBe('20:30');
  });
});
