// Logic Grid's pure rules: reading the board, the solve test, check()'s diagnosis, the guide's
// deductions and save parsing, without mounting the game.
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { LEVELS } from '../src/core/types';
import { generateDeduct } from '../src/games/logic-grid/gen';
import { breaksRule, dupes, findFix, isSolved, itemIn, levelOf, newFact, nextStep, placed, restore } from '../src/games/logic-grid/rules';
import { clueTexts, MARK, pickGroups, plain } from '../src/games/logic-grid/words';

/** A puzzle generated the way the game does it, with its solution as a filled board. */
const make = (d: (typeof LEVELS)[number], seed: number) => {
  const rng = new Rng(seed);
  const { n, K, weights, dropFirst } = levelOf(d);
  const groups = pickGroups(rng, n, K);
  const { pos, clues } = generateDeduct({ n, groups: K, weights, dropFirst, rng });
  const solved = new Array<number>(n * K).fill(-1);
  pos.forEach((p, item) => (solved[Math.floor(item / n) * n + p] = item % n));
  return { n, K, groups, pos, clues, solved, flip: clues.map(() => rng.chance(0.5)) };
};
const puzzles = function* () {
  for (const d of LEVELS) for (let seed = 1; seed <= 15; seed++) yield { d, seed, ...make(d, seed) };
};

describe('logic-grid board', () => {
  it('reads where each item sits, ignoring values placed twice', () => {
    // n = 3, one row: value 0 twice, value 2 once.
    expect(placed(3, [0, 0, 2])).toEqual([-1, -1, 2]);
    expect([...dupes(3, [0, 0, 2])].sort((a, b) => a - b)).toEqual([0, 1]);
    expect(itemIn(3, 4, 2)).toBe(5);
  });

  it('accepts the solution and nothing short of it', () => {
    for (const { d, seed, n, clues, solved } of puzzles()) {
      expect(isSolved(n, clues, solved), `d${d} s${seed}`).toBe(true);
      const gap = solved.slice();
      gap[0] = -1;
      expect(isSolved(n, clues, gap)).toBe(false);
      // Swapping two houses in a row keeps it a permutation, but the unique solution means a clue breaks.
      const swap = solved.slice();
      [swap[0], swap[1]] = [swap[1], swap[0]];
      expect(isSolved(n, clues, swap), `d${d} s${seed}`).toBe(false);
    }
  });

  it('flags a repeated value as a broken rule', () => {
    const { n, clues, solved } = make(2, 3);
    const vals = solved.slice();
    vals[1] = vals[0];
    expect(breaksRule(n, clues, vals, 1)).toBe(true);
    expect(breaksRule(n, clues, solved, 1)).toBe(false);
  });
});

describe('logic-grid check', () => {
  it('finds nothing wrong on the solution or an empty board', () => {
    for (const { n, clues, pos, solved } of puzzles()) {
      expect(
        findFix(
          n,
          clues,
          pos,
          solved,
          solved.map(() => 0),
        ),
      ).toBeNull();
      expect(
        findFix(
          n,
          clues,
          pos,
          solved.map(() => -1),
          solved.map(() => 0),
        ),
      ).toBeNull();
    }
  });

  it('reports a single wrong value, and a repeat before anything else', () => {
    for (const { d, seed, n, clues, pos, solved } of puzzles()) {
      const vals = solved.map(() => -1);
      vals[0] = (solved[0] + 1) % n;
      const fix = findFix(n, clues, pos, vals, []);
      expect(fix, `d${d} s${seed}`).not.toBeNull();
      expect(fix!.kind === 'clue' || fix!.kind === 'deadEnd').toBe(true);
      expect(fix).toMatchObject({ cell: 0 });

      // The same wrong value next to the right one is reported as a repeat, pointing at the wrong copy.
      const twice = solved.slice();
      const right = solved.indexOf(vals[0]);
      twice[0] = vals[0];
      expect(findFix(n, clues, pos, twice, [])).toEqual({ kind: 'dupe', cell: 0, twins: [right] });
    }
  });

  it('reports a ✗ on the right value of an empty cell', () => {
    for (const { n, clues, pos, solved } of puzzles()) {
      const vals = solved.map(() => -1);
      const xs = solved.map(() => 0);
      xs[2] = 1 << solved[2];
      expect(findFix(n, clues, pos, vals, xs)).toEqual({ kind: 'ruledOut', cell: 2, v: solved[2] });
      xs[2] = ((1 << n) - 1) & ~(1 << solved[2]); // ruling out every wrong value is fine
      expect(findFix(n, clues, pos, vals, xs)).toBeNull();
    }
  });
});

describe('logic-grid guide', () => {
  it('deduces the whole solution step by step from an empty board', () => {
    for (const { d, seed, n, clues, solved } of puzzles()) {
      const vals = solved.map(() => -1);
      for (let guard = 0; guard < vals.length; guard++) {
        const step = nextStep(n, clues, vals);
        if (!step) break;
        const { it: item, cell } = step.fact;
        expect(item % n, `d${d} s${seed}`).toBe(solved[cell]);
        vals[cell] = item % n;
      }
      expect(vals, `d${d} s${seed}`).toEqual(solved);
      expect(nextStep(n, clues, vals)).toBeNull();
    }
  });

  it('fills the last gap of a row first', () => {
    const { n, clues, solved } = make(3, 5);
    const vals = solved.slice();
    vals[1] = -1;
    vals[n] = -1;
    expect(nextStep(n, clues, vals)).toEqual({ kind: 'lastGap', fact: { it: solved[1], p: 1, cell: 1 } });
    expect(newFact(n, vals, [])).toEqual({ it: solved[1], p: 1, cell: 1 });
  });
});

describe('logic-grid saves', () => {
  it('restores valid fields and blanks the rest', () => {
    const s = restore(3, 6, 2, { vals: [0, 1, 2, -1, 9, 'x'], xs: [7, 8, 0, 0, 0, 0], struck: [1, 0], sel: 5, mark: true });
    expect(s).toEqual({ vals: [0, 1, 2, -1, -1, -1], xs: [7, 0, 0, 0, 0, 0], struck: [1, 0], sel: 5, mark: true });
  });

  it('ignores arrays of the wrong length and junk saves', () => {
    const blank = { vals: [-1, -1, -1, -1], xs: [0, 0, 0, 0], struck: [0], sel: 0, mark: false };
    expect(restore(2, 4, 1, { vals: [0, 1], struck: [1, 1], sel: 4, mark: 'yes' })).toEqual(blank);
    expect(restore(2, 4, 1, undefined)).toEqual(blank);
    expect(restore(2, 4, 1, 42)).toEqual(blank);
  });
});

describe('logic-grid wording', () => {
  it('writes one capitalised sentence per clue, with an icon marker for every non-name item', () => {
    for (const { n, groups, clues, flip } of puzzles()) {
      const texts = clueTexts(groups, n, clues, flip);
      expect(texts).toHaveLength(clues.length);
      for (const t of texts) {
        expect(plain(t)).toMatch(/^[A-ZÀ-Ý].*\.$/);
        for (const m of t.matchAll(MARK)) expect(Number(m[1])).toBeGreaterThanOrEqual(n);
      }
    }
  });
});
