// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { getProfile, record, resetProfile, stats, totalXp, xpByDay } from '../src/core/store';
import { xpGains, xpLevel } from '../src/core/xp';

const solve = (id: string, ms = 20_000, m = 0) => record(id, { d: 1, o: 'solved', ms, m }, 30_000);

describe('xp', () => {
  beforeEach(() => resetProfile());

  it('levels: 100 XP for level 1, then +50 per level', () => {
    expect(xpLevel(0)).toEqual({ level: 1, into: 0, need: 100 });
    expect(xpLevel(99).level).toBe(1);
    expect(xpLevel(100)).toEqual({ level: 2, into: 0, need: 150 });
    expect(xpLevel(250)).toEqual({ level: 3, into: 0, need: 200 });
  });

  it('daily bonus stops after the 10th solve of the day', () => {
    const today = (n: number) =>
      xpGains({ d: 1, m: 1, ms: 1, parMs: 0, first: false, best: false, daily: false, gameToday: false, today: n });
    expect(today(10).some((g) => g.why === 'today')).toBe(true);
    expect(today(11).some((g) => g.why === 'today')).toBe(false);
  });

  it('a solve adds to the game, the total and the day history', () => {
    const a = solve('sudoku').xp!;
    // base 10 + flawless 5 + under par 5 + first clear 10 + first sudoku today 10 + daily bonus 5
    expect(a.total).toBe(45);
    const b = solve('sudoku', 25_000, 1).xp!;
    expect(b.gains.map((g) => g.why)).toEqual(['solve', 'par', 'today']);
    solve('queens');
    expect(stats('sudoku').xp).toBe(a.total + b.total);
    expect(totalXp()).toBe(stats('sudoku').xp! + stats('queens').xp!);
    const days = [...xpByDay().values()];
    expect(days).toEqual([totalXp()]);
    expect([...xpByDay('sudoku').values()]).toEqual([stats('sudoku').xp]);
  });

  it('old profiles start with 10 XP per past solve, dated from recent results', () => {
    const p = getProfile();
    const at = Date.now() - 3 * 86_400_000;
    p.stats['mines'] = { played: 4, solved: 3, failed: 1, skipped: 0, time: 0, best: {}, recent: [{ d: 1, o: 'solved', ms: 1, m: 0, at }] };
    expect(stats('mines').xp).toBe(30);
    expect([...xpByDay('mines').values()]).toEqual([10]);
  });
});
