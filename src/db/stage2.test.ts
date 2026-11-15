import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { applyJoker, removeJoker } from './repo';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('joker (comodín)', () => {
  it('one per week (Monday–Sunday), stored as a dated record', async () => {
    expect(await applyJoker('2026-11-10')).toBe(true);
    expect(await applyJoker('2026-11-12')).toBe(false); // same week
    expect(await applyJoker('2026-11-17')).toBe(true); // next week
    expect((await db.jokers.toArray()).map((j) => [j.date, j.weekStart])).toEqual([
      ['2026-11-10', '2026-11-09'],
      ['2026-11-17', '2026-11-16'],
    ]);
    await removeJoker('2026-11-10');
    expect(await applyJoker('2026-11-12')).toBe(true); // freed after removing
  });
});
