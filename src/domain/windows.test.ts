import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../config/defaults';
import { activeWindow, nextWindow, windowOver, windowsFor } from './windows';

const s = defaultSettings('2026-11-15');

describe('phone-free windows', () => {
  it('morning: first 30 min after waking; night: last hour before that day\'s bedtime', () => {
    // Tue 2026-11-17: wake 6:00, bed 10:00 PM
    expect(windowsFor(s, '2026-11-17')).toEqual([
      { kind: 'morning', date: '2026-11-17', start: '06:00', end: '06:30' },
      { kind: 'night', date: '2026-11-17', start: '21:00', end: '22:00' },
    ]);
  });

  it('critical nights (Thu/Fri) end at 9:00 PM', () => {
    expect(windowsFor(s, '2026-11-19')[1]).toMatchObject({ start: '20:00', end: '21:00' }); // Thu
    expect(windowsFor(s, '2026-11-20')[1]).toMatchObject({ start: '20:00', end: '21:00' }); // Fri
    expect(windowsFor(s, '2026-11-21')[1]).toMatchObject({ start: '21:00', end: '22:00' }); // Sat
    expect(windowsFor(s, '2026-11-20')[0]).toMatchObject({ start: '04:00', end: '04:30' }); // Fri 5 AM shift
  });

  it('detects the active and the next window with the local clock', () => {
    expect(activeWindow(s, new Date(2026, 10, 19, 20, 30))?.kind).toBe('night');
    expect(activeWindow(s, new Date(2026, 10, 19, 21, 0))).toBeUndefined(); // ended
    expect(activeWindow(s, new Date(2026, 10, 17, 6, 10))?.kind).toBe('morning');
    expect(nextWindow(s, new Date(2026, 10, 17, 12, 0))).toMatchObject({ kind: 'night', start: '21:00' });
    expect(windowOver({ kind: 'night', date: '2026-11-17', start: '21:00', end: '22:00' }, new Date(2026, 10, 18, 1, 0))).toBe(true);
  });

  it('respects settings (disabled, custom length)', () => {
    const custom = { ...s, noPhone: { morningEnabled: false, morningMinutes: 30, nightEnabled: true, nightMinutes: 90 } };
    expect(windowsFor(custom, '2026-11-17')).toEqual([{ kind: 'night', date: '2026-11-17', start: '20:30', end: '22:00' }]);
  });
});
