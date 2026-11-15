import { describe, expect, it } from 'vitest';
import {
  checklistStatus, counterStatus, dailyStreak, bestDailyStreak, dayProgress, evalDay, habitStreak, HabitIndex,
  missedYesterday, overallStreak, weeklyGoal, weeklyStreak,
} from './habits';
import { habit, log, logs, plan } from './testUtils';
import type { ChecklistItem } from '../db/types';

// November 2026: Mon 2, Mon 9, Mon 16. Thu 12, Sun 15.

describe('daily streaks', () => {
  it('counts consecutive completed days; minimum counts as done', () => {
    const h = habit({ id: 'read' });
    const idx = new HabitIndex(logs('read', { '2026-11-10': 'done', '2026-11-11': 'min', '2026-11-12': 'done' }));
    expect(dailyStreak(h, idx, '2026-11-12')).toBe(3);
  });

  it('today pending does not break the streak', () => {
    const h = habit({ id: 'read' });
    const idx = new HabitIndex(logs('read', { '2026-11-10': 'done', '2026-11-11': 'done' }));
    expect(dailyStreak(h, idx, '2026-11-12')).toBe(2);
  });

  it('a missed past day breaks it', () => {
    const h = habit({ id: 'read' });
    const idx = new HabitIndex(logs('read', { '2026-11-09': 'done', '2026-11-11': 'done', '2026-11-12': 'done' }));
    expect(dailyStreak(h, idx, '2026-11-12')).toBe(2);
    expect(bestDailyStreak(h, idx, '2026-11-12')).toBe(2);
  });

  it('skipped counts as a miss, rest does not', () => {
    const h = habit({ id: 'read' });
    const skip = new HabitIndex(logs('read', { '2026-11-10': 'done', '2026-11-11': 'skipped', '2026-11-12': 'done' }));
    expect(dailyStreak(h, skip, '2026-11-12')).toBe(1);
    const rest = new HabitIndex(logs('read', { '2026-11-10': 'done', '2026-11-11': 'rest', '2026-11-12': 'done' }));
    expect(dailyStreak(h, rest, '2026-11-12')).toBe(2);
  });

  it('non-scheduled days are skipped (specific weekdays)', () => {
    // Mon, Wed, Fri only
    const h = habit({ id: 'x', frequency: { type: 'days', days: [0, 2, 4] } });
    const idx = new HabitIndex(logs('x', { '2026-11-09': 'done', '2026-11-11': 'done', '2026-11-13': 'done' }));
    expect(dailyStreak(h, idx, '2026-11-15')).toBe(3); // Sat/Sun not scheduled
    expect(evalDay(h, '2026-11-10', idx, '2026-11-15').counts).toBe(false);
  });

  it('paused periods do not break streaks', () => {
    const h = habit({ id: 'p', pauses: [{ from: '2026-11-10', to: '2026-11-11' }] });
    const idx = new HabitIndex(logs('p', { '2026-11-08': 'done', '2026-11-09': 'done', '2026-11-12': 'done' }));
    expect(dailyStreak(h, idx, '2026-11-12')).toBe(3);
  });

  it('days before the start date never count', () => {
    const h = habit({ id: 's', startDate: '2026-11-11' });
    const idx = new HabitIndex(logs('s', { '2026-11-11': 'done', '2026-11-12': 'done' }));
    expect(dailyStreak(h, idx, '2026-11-12')).toBe(2);
    expect(dayProgress([h], '2026-11-10', idx, '2026-11-12').total).toBe(0);
  });
});

describe('weekly goal with planned days', () => {
  const gym = () => habit({ id: 'gym', frequency: { type: 'weekly', target: 5, plannedDays: [0, 1, 2, 3, 6] } });

  it('shows progress message with remaining days', () => {
    // Week of Nov 9. Today Thu 12. Done Mon, Tue, Wed, Thu (4).
    const idx = new HabitIndex(logs('gym', { '2026-11-09': 'done', '2026-11-10': 'done', '2026-11-11': 'done', '2026-11-12': 'done' }));
    const g = weeklyGoal(gym(), idx, '2026-11-12');
    expect(g.count).toBe(4);
    expect(g.need).toBe(1);
    expect(g.remaining).toBe(3); // Fri, Sat, Sun
    expect(g.message).toBe('Llevas 4 de 5, te falta 1 y quedan 3 días.');
  });

  it('a planned day not done is NOT a failure while the goal is reachable', () => {
    const idx = new HabitIndex(logs('gym', { '2026-11-10': 'done' })); // missed planned Mon 9
    const e = evalDay(gym(), '2026-11-09', idx, '2026-11-11');
    expect(e.counts).toBe(false);
    expect(missedYesterday([gym()], idx, '2026-11-10')).toBe(false);
  });

  it('becomes a miss once the goal is unreachable', () => {
    // Today Sun 15; only Mon done -> by Thu 12 (planned), need 4 with 3 days left -> unreachable
    const idx = new HabitIndex(logs('gym', { '2026-11-09': 'done' }));
    expect(evalDay(gym(), '2026-11-12', idx, '2026-11-15').counts).toBe(true);
    expect(evalDay(gym(), '2026-11-10', idx, '2026-11-15').counts).toBe(false); // still reachable on Tue
  });

  it('an extra (unplanned) day counts toward the goal', () => {
    const idx = new HabitIndex(
      logs('gym', { '2026-11-09': 'done', '2026-11-10': 'done', '2026-11-11': 'done', '2026-11-13': 'done', '2026-11-14': 'done' }),
    );
    const g = weeklyGoal(gym(), idx, '2026-11-15');
    expect(g.count).toBe(5);
    expect(g.state).toBe('met');
  });

  it('moved planned days (week override) are used instead of the base plan', () => {
    const h = gym();
    // Move Thu (3) to Fri (4) for this week only
    const idx = new HabitIndex([], [plan('gym', '2026-11-09', [0, 1, 2, 4, 6])]);
    expect(weeklyGoal(h, idx, '2026-11-12').planned).toEqual([0, 1, 2, 4, 6]);
    expect(evalDay(h, '2026-11-12', idx, '2026-11-12').counts).toBe(false); // Thu no longer planned
    expect(evalDay(h, '2026-11-13', idx, '2026-11-13').counts).toBe(true); // Fri planned today
    // next week falls back to the base plan
    expect(weeklyGoal(h, idx, '2026-11-19').planned).toEqual([0, 1, 2, 3, 6]);
  });

  it('weekly streak counts consecutive weeks with the goal met; open week does not break', () => {
    const five = (ws: string[]) => Object.fromEntries(ws.map((d) => [d, 'done' as const]));
    const idx = new HabitIndex(
      logs('gym', {
        ...five(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']),
        ...five(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-14']),
        '2026-11-16': 'done',
      }),
    );
    expect(weeklyStreak(gym(), idx, '2026-11-17')).toBe(2);
    expect(habitStreak(gym(), idx, '2026-11-17').unit).toBe('semanas');
  });

  it('a missed week breaks the weekly streak', () => {
    const idx = new HabitIndex(logs('gym', { '2026-11-02': 'done', '2026-11-03': 'done' }));
    expect(weeklyStreak(gym(), idx, '2026-11-17')).toBe(0);
  });
});

describe('day percentage', () => {
  it('= required scheduled habits done (complete or minimum) / required scheduled', () => {
    const a = habit({ id: 'a' });
    const b = habit({ id: 'b' });
    const c = habit({ id: 'c' });
    const extra = habit({ id: 'e', required: false });
    const idx = new HabitIndex([log('a', '2026-11-12', 'done'), log('b', '2026-11-12', 'min'), log('e', '2026-11-12', 'done')]);
    const p = dayProgress([a, b, c, extra], '2026-11-12', idx, '2026-11-12');
    expect(p.total).toBe(3);
    expect(p.done).toBe(2);
    expect(p.pct).toBe(67);
    expect(p.extrasDone).toBe(1);
    expect(p.missing.map((h) => h.id)).toEqual(['c']);
  });

  it('optional habits never count as missed and never break streaks', () => {
    const a = habit({ id: 'a' });
    const extra = habit({ id: 'e', required: false });
    const idx = new HabitIndex(logs('a', { '2026-11-10': 'done', '2026-11-11': 'done', '2026-11-12': 'done' }));
    expect(overallStreak([a, extra], idx, '2026-11-12')).toBe(3);
    expect(missedYesterday([a, extra], idx, '2026-11-12')).toBe(false);
  });

  it('rest days are excluded from the percentage', () => {
    const a = habit({ id: 'a' });
    const b = habit({ id: 'b' });
    const idx = new HabitIndex([log('a', '2026-11-12', 'done'), log('b', '2026-11-12', 'rest')]);
    expect(dayProgress([a, b], '2026-11-12', idx, '2026-11-12').pct).toBe(100);
  });

  it('never miss twice: detects a missed yesterday', () => {
    const a = habit({ id: 'a' });
    const idx = new HabitIndex(logs('a', { '2026-11-10': 'done' }));
    expect(missedYesterday([a], idx, '2026-11-12')).toBe(true);
    expect(missedYesterday([a], idx, '2026-11-11')).toBe(false);
  });
});

describe('checklist and counter', () => {
  const items: ChecklistItem[] = [
    { id: 'a', name: 'A', required: true, essential: true },
    { id: 'b', name: 'B', required: true, essential: false },
    { id: 'c', name: 'C', required: false, essential: false },
  ];
  it('complete when all required are checked; minimum when essentials are', () => {
    expect(checklistStatus(items, [])).toBe('pending');
    expect(checklistStatus(items, ['a'])).toBe('min');
    expect(checklistStatus(items, ['a', 'b'])).toBe('done');
    expect(checklistStatus([], [])).toBe('pending');
  });
  it('counter is done when reaching the target', () => {
    expect(counterStatus(7, 8)).toBe('pending');
    expect(counterStatus(8, 8)).toBe('done');
    expect(counterStatus(1, 1)).toBe('done');
  });
});
