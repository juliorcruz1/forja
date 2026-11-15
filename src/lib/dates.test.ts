import { describe, expect, it } from 'vitest';
import {
  addDays, diffDays, formatLong, formatTime, fromKey, isValidKey, monthDays, toKey, todayKey, weekStart, weekday,
} from './dates';

describe('local dates', () => {
  it('uses the local calendar day, not UTC', () => {
    // 11:30 PM local time must still be the same local day
    const late = new Date(2026, 10, 12, 23, 30);
    expect(todayKey(late)).toBe('2026-11-12');
    const early = new Date(2026, 10, 13, 0, 15);
    expect(todayKey(early)).toBe('2026-11-13');
  });

  it('round-trips keys', () => {
    expect(toKey(fromKey('2026-03-08'))).toBe('2026-03-08');
    expect(isValidKey('2026-02-30')).toBe(false);
    expect(isValidKey('2026-02-28')).toBe(true);
  });

  it('adds days across month, year and DST boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-07', 2)).toBe('2026-03-09'); // US DST change
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(diffDays('2026-03-01', '2026-04-01')).toBe(31);
  });

  it('weeks start on Monday', () => {
    expect(weekday('2026-11-09')).toBe(0); // Monday
    expect(weekday('2026-11-15')).toBe(6); // Sunday
    expect(weekStart('2026-11-15')).toBe('2026-11-09');
    expect(weekStart('2026-11-09')).toBe('2026-11-09');
  });

  it('formats in Spanish', () => {
    expect(formatLong('2026-11-12')).toBe('Jueves, 12 de noviembre');
    expect(formatTime('21:00')).toBe('9:00 PM');
    expect(formatTime('05:00')).toBe('5:00 AM');
    expect(formatTime('00:30')).toBe('12:30 AM');
    expect(monthDays('2028-02-10')).toHaveLength(29);
  });
});
