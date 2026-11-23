// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { getProfile, recordLeave, resetProfile, stats, type Result, type TypeStats } from '../src/core/store';
import { affinity, SAME_CATEGORY, tasteWeights } from '../src/core/taste';

const NOW = 1_800_000_000_000;
const res = (o: Result['o'], at: number, extra: Partial<Result> = {}): Result => ({ d: 1, o, ms: 1000, m: 0, at, ...extra });
const st = (recent: Result[], left?: number[]): TypeStats => ({
  played: recent.length,
  solved: 0,
  failed: 0,
  skipped: 0,
  time: 0,
  best: {},
  recent,
  ...(left ? { left } : {}),
});
const many = (n: number, o: Result['o'], extra: Partial<Result> = {}) =>
  Array.from({ length: n }, (_, i) => res(o, NOW - 1000 * (n - i), extra));

describe('affinity', () => {
  it('is neutral without history', () => {
    expect(affinity(undefined, NOW)).toBe(1);
    expect(affinity(st([]), NOW)).toBe(1);
  });

  it('drops towards 0.5 for a game the player keeps skipping', () => {
    const a = affinity(st(many(20, 'skipped')), NOW);
    expect(a).toBeGreaterThanOrEqual(0.5);
    expect(a).toBeLessThan(0.65);
  });

  it('rises towards 1.5 for a game the player keeps finishing (solved or failed)', () => {
    expect(affinity(st(many(20, 'solved')), NOW)).toBeGreaterThan(1.35);
    expect(affinity(st(many(20, 'failed')), NOW)).toBeGreaterThan(1.35);
    expect(affinity(st(many(20, 'solved')), NOW)).toBeLessThanOrEqual(1.5);
  });

  it('counts leaving a started puzzle against the game', () => {
    const left = Array.from({ length: 6 }, (_, i) => NOW - 100 * i);
    expect(affinity(st([], left), NOW)).toBeLessThan(0.75);
    expect(affinity(st(many(4, 'solved'), left), NOW)).toBeLessThan(affinity(st(many(4, 'solved')), NOW));
  });

  it('ignores daily and shared puzzles', () => {
    expect(affinity(st([...many(10, 'skipped', { dy: true }), ...many(10, 'skipped', { sh: true })]), NOW)).toBe(1);
  });

  it('only looks at the latest 20 events, and forgets old ones', () => {
    const old = many(20, 'skipped').map((r) => ({ ...r, at: r.at - 1e6 }));
    expect(affinity(st([...old, ...many(20, 'solved')]), NOW)).toBeGreaterThan(1.35);
    const stale = many(10, 'skipped').map((r) => ({ ...r, at: NOW - 90 * 86_400_000 }));
    expect(affinity(st(stale), NOW)).toBe(1);
  });
});

describe('tasteWeights', () => {
  const pool = () => [
    { d: { id: 'a', category: 'logic' }, w: 2 },
    { d: { id: 'b', category: 'logic' }, w: 2 },
    { d: { id: 'c', category: 'words' }, w: 2 },
  ];

  it('spaces out the previous card’s category', () => {
    const p = pool();
    tasteWeights(p, { prevCategory: 'logic' });
    expect(p.map((x) => x.w)).toEqual([2 * SAME_CATEGORY, 2 * SAME_CATEGORY, 2]);
  });

  it('leaves a single-category pool alone', () => {
    const p = pool().slice(0, 2);
    tasteWeights(p, { prevCategory: 'logic' });
    expect(p.map((x) => x.w)).toEqual([2, 2]);
  });

  it('applies the affinity multiplier', () => {
    const p = pool();
    tasteWeights(p, { affinity: (d) => (d.id === 'a' ? 1.5 : 0.5) });
    expect(p.map((x) => x.w)).toEqual([3, 1, 1]);
  });
});

describe('recordLeave', () => {
  beforeEach(() => resetProfile());

  it('keeps the latest 10 leaves per game', () => {
    for (let i = 0; i < 13; i++) recordLeave('sudoku');
    expect(stats('sudoku').left).toHaveLength(10);
    expect(getProfile().stats['sudoku']?.left?.every((t) => typeof t === 'number')).toBe(true);
  });
});
