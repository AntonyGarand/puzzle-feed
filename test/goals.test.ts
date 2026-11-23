// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { allGoals, checkGoals, goalStates, goalTarget, weekDays, weekly } from '../src/core/goals';
import { getProfile, record, resetProfile, update } from '../src/core/store';
import type { Difficulty } from '../src/core/types';
import { PUZZLES } from '../src/games';

const defs = [
  { id: 'a', category: 'logic' as const },
  { id: 'b', category: 'logic' as const },
  { id: 'c', category: 'words' as const },
];
const solve = (id: string, d: Difficulty = 1) => record(id, { d, o: 'solved', ms: 30_000, m: 0 }, 60_000);
const state = (id: string) => goalStates(defs).find((s) => s.goal.id === id)!;

describe('goals', () => {
  beforeEach(() => resetProfile());

  it('have unique ids, and a target with the real games', () => {
    const ids = allGoals().map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of allGoals()) expect(goalTarget(g, PUZZLES)).toBeGreaterThan(0);
    // Categories without games here are left out rather than shown as 0 / 0.
    expect(goalStates(defs).some((s) => s.goal.id === 'category-paths')).toBe(false);
  });

  it('measure progress from the profile', () => {
    for (let i = 0; i < 4; i++) solve('a');
    solve('c', 5);
    expect(state('solves-10')).toMatchObject({ have: 5, need: 10, done: false });
    expect(state('master-1')).toMatchObject({ have: 1, done: true });
    expect(state('category-words')).toMatchObject({ have: 1, need: 1, done: true });
    expect(state('category-logic')).toMatchObject({ have: 1, need: 2, done: false });
    solve('b');
    expect(state('category-logic').done).toBe(true);
    expect(state('variety-all')).toMatchObject({ have: 3, need: 3, done: true });
  });

  it('record what a profile already earned silently, then announce each new goal once', () => {
    solve('c', 5);
    expect(checkGoals(defs).unlocked).toEqual([]);
    expect(getProfile().goals?.['master-1']).toBe(0);
    solve('a');
    solve('b');
    const news = checkGoals(defs);
    expect(news.unlocked.map((g) => g.id)).toContain('category-logic');
    expect(getProfile().goals?.['category-logic']).toBeGreaterThan(0);
    expect(checkGoals(defs).unlocked).toEqual([]);
  });

  it('records quietly when asked', () => {
    checkGoals(defs);
    solve('c');
    expect(checkGoals(defs, Date.now(), true).unlocked).toEqual([]);
    expect(getProfile().goals?.['category-words']).toBeGreaterThan(0);
  });
});

describe('weekly target', () => {
  beforeEach(() => resetProfile());

  // 2026-11-23 is a Monday.
  const monday = (h: number) => new Date(2026, 10, 23, h).getTime();

  it('runs Monday to Sunday, with days starting at 4 am', () => {
    expect(weekDays(monday(12))[0]).toBe('2026-11-23');
    expect(weekDays(monday(12))[6]).toBe('2026-11-29');
    // Monday 3 am still belongs to Sunday, so to the previous week.
    expect(weekDays(monday(3))[0]).toBe('2026-11-16');
    expect(weekDays(new Date(2026, 10, 30, 2).getTime())[0]).toBe('2026-11-23');
  });

  it('counts this week’s solves against the target, announced once', () => {
    const p = getProfile();
    p.days = { '2026-11-22': 7, '2026-11-23': 4, '2026-11-25': 5 };
    update({ weekly: 10 });
    expect(weekly(monday(12))).toEqual({ week: '2026-11-23', solved: 9, target: 10 });
    checkGoals(defs, monday(12)); // first check: silent
    p.days['2026-11-26'] = 1;
    expect(checkGoals(defs, monday(12)).weekly?.solved).toBe(10);
    expect(checkGoals(defs, monday(12)).weekly).toBeUndefined();
  });

  it('is off at 0', () => {
    update({ weekly: 0 });
    checkGoals(defs);
    getProfile().days[weekDays()[0]] = 50;
    expect(checkGoals(defs).weekly).toBeUndefined();
  });
});
