import { describe, expect, it } from 'vitest';
import { badHabitStats, badStrip, relapsesInRange } from './bad';
import { bad, relapse } from './testUtils';
import { nightInfo } from './sleep';
import { defaultSettings } from '../config/defaults';

describe('bad habits: days without', () => {
  it('counts days since start when there are no relapses', () => {
    const b = bad({ id: 'x', startDate: '2026-11-01' });
    const s = badHabitStats(b, [], '2026-11-12');
    expect(s.current).toBe(11);
    expect(s.best).toBe(11);
    expect(s.totalRelapses).toBe(0);
  });

  it('a relapse resets the counter but keeps the best mark', () => {
    const b = bad({ id: 'x', startDate: '2026-11-01' });
    const rs = [relapse('x', '2026-11-10', 'estrés')];
    const s = badHabitStats(b, rs, '2026-11-12');
    expect(s.current).toBe(2);
    expect(s.best).toBe(9);
    expect(s.lastRelapse?.note).toBe('estrés');
  });

  it('a relapse today means 0', () => {
    const b = bad({ id: 'x', startDate: '2026-11-01' });
    expect(badHabitStats(b, [relapse('x', '2026-11-12')], '2026-11-12').current).toBe(0);
  });

  it('deleting a relapse (removing the record) restores the count', () => {
    const b = bad({ id: 'x', startDate: '2026-11-01' });
    expect(badHabitStats(b, [], '2026-11-12').current).toBe(11);
  });

  it('ignores relapses of other habits and builds the 14-day strip', () => {
    const b = bad({ id: 'x', startDate: '2026-11-05' });
    const rs = [relapse('x', '2026-11-10'), relapse('other', '2026-11-11')];
    const strip = badStrip(b, rs, '2026-11-12');
    expect(strip).toHaveLength(14);
    expect(strip[13]).toEqual({ date: '2026-11-12', state: 'clean' });
    expect(strip.find((d) => d.date === '2026-11-10')?.state).toBe('relapse');
    expect(strip.find((d) => d.date === '2026-11-11')?.state).toBe('clean');
    expect(strip[0].state).toBe('none'); // before start
    expect(relapsesInRange(b, rs, '2026-11-09', '2026-11-15')).toBe(1);
  });
});

describe('critical nights', () => {
  const s = defaultSettings();
  it('Thursday and Friday nights are critical (5:00 AM next day)', () => {
    expect(nightInfo(s, '2026-11-12')).toEqual({ critical: true, bedtime: '21:00', nextStart: '05:00' }); // Thu
    expect(nightInfo(s, '2026-11-13').critical).toBe(true); // Fri
  });
  it('other nights use the usual bedtime', () => {
    expect(nightInfo(s, '2026-11-14').critical).toBe(false); // Sat -> Sun off
    expect(nightInfo(s, '2026-11-10')).toEqual({ critical: false, bedtime: '22:00', nextStart: '07:00' });
  });
  it('follows the edited schedule', () => {
    const edited = { ...s, work: s.work.map((d, i) => (i === 2 ? { ...d, start: '04:30' } : d)) };
    expect(nightInfo(edited, '2026-11-10').critical).toBe(true); // Tue night -> Wed 4:30
  });
});
