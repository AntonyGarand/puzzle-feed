// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { byLevel, LEVELS, type Difficulty, type PuzzleCtx } from '../src/core/types';
import { genF, solveF } from '../src/puzzles/cardkit/freecell';
import { genK, greedyK, hasProgress, type KRules, type KState } from '../src/puzzles/cardkit/klondike';
import { deadP, genP, solveP, type PState } from '../src/puzzles/cardkit/pyramid';
import { genS, hasMoveS, playLineS, progressS, type SState } from '../src/puzzles/cardkit/spider';
import { pyramid } from '../src/puzzles/pyramid';

const SEEDS = 12;
const seedOf = (k: number, d: number) => k * 7919 + d;

/** Card id: suit (0 ♠, 1 ♥, 2 ♦, 3 ♣) * 13 + rank - 1. */
const C = (suit: number, rank: number) => suit * 13 + rank - 1;

describe('pyramid', () => {
  // Same settings as pyramid.ts.
  const passes = (d: Difficulty) => byLevel(d, [-1, 3, 2, 2, 1]);

  it('only deals winnable games', () => {
    for (const d of LEVELS)
      for (let k = 1; k <= SEEDS; k++) {
        const s = genP(new Rng(seedOf(k, d)), passes(d), byLevel(d, [10, 10, 16, 6, 30]), d === 5 ? 2000 : 5000);
        expect(solveP(s, passes(d), 500000), `level ${d} seed ${k}`).toBe('win');
      }
  }, 60_000);

  it('builds winnable deals when no random deal is proven', () => {
    for (const d of LEVELS)
      for (let k = 1; k <= SEEDS; k++) expect(solveP(genP(new Rng(seedOf(k, d)), passes(d), 0, 0), passes(d), 500000)).toBe('win');
  }, 60_000);

  // Bottom-left 5♠ and 6♠ are open; the waste holds 2♥ 3♥, so nothing can ever pair (they need an 8 or a 7).
  const blank = () => new Array<number>(28).fill(-1);
  const dead = (): PState => {
    const pyr = blank();
    pyr[21] = C(0, 5);
    pyr[22] = C(0, 6);
    return { pyr, stock: [], waste: [C(1, 2), C(1, 3)], passes: 4, moves: 9 };
  };

  it('detects a dead game even with unlimited passes', () => {
    expect(deadP(dead(), -1)).toBe(true);
    expect(deadP(dead(), 3)).toBe(true);
    // A 7 still in the talon can pair with the 6.
    expect(deadP({ ...dead(), stock: [C(2, 7)] }, -1)).toBe(false);
    // Without another pass, a 7 buried in the waste is out of reach…
    const buried = { ...dead(), waste: [C(2, 7), C(1, 2)], passes: 0 };
    expect(deadP(buried, 1)).toBe(true);
    expect(deadP(buried, -1)).toBe(false);
    // …unless only kings lie on top of it.
    expect(deadP({ ...buried, waste: [C(2, 7), C(1, 13)] }, 1)).toBe(false);
  });

  it('proves a mid-game position lost while moves remain', () => {
    // 5♠ + 8♠ pair off, but that opens a 4♥ that nothing left can match (no 9).
    const pyr = blank();
    pyr[21] = C(0, 5);
    pyr[22] = C(0, 8);
    pyr[15] = C(1, 4);
    const s: PState = { pyr, stock: [C(1, 3)], waste: [C(1, 2)], passes: 2, moves: 9 };
    expect(deadP(s, -1)).toBe(false);
    expect(solveP(s, -1)).toBe('dead');
    expect(solveP({ ...s, stock: [C(2, 9)] }, -1)).toBe('win');
    // With limited passes, a 9 at the bottom of the waste needs one more pass.
    const w9 = { ...s, waste: [C(2, 9), C(1, 2)], stock: [] };
    expect(solveP(w9, 3)).toBe('dead');
    expect(solveP(w9, 4)).toBe('win');
  });

  function play(saved: unknown) {
    const events: string[] = [];
    let line = '';
    const ctx: PuzzleCtx = {
      difficulty: 1,
      rng: new Rng(1),
      root: document.createElement('div'),
      saved,
      solved: () => events.push('solved'),
      failed: () => events.push('failed'),
      mistake: () => events.push('mistake'),
      touch: () => {},
      status: (t) => (line = t),
      lives: () => {},
      controls: () => {},
    };
    const inst = pyramid.create(ctx) || {};
    return { inst, events, line: () => line };
  }

  it('flags a dead game on Easy as a dead end (undo, not a loss) instead of recycling the stock forever', () => {
    const { inst, events, line } = play({ s: dead(), hist: [] });
    inst.onKey!({ key: 'd' } as KeyboardEvent); // starts another pass: nothing can pair
    expect(events).toEqual([]);
    expect(line()).toMatch(/· undo$/);
    expect(inst.check!()?.kind).toBe('stuck');
  });

  it('warns when the position is lost but moves remain', () => {
    const pyr = blank();
    pyr[21] = C(0, 5);
    pyr[22] = C(0, 8);
    pyr[15] = C(1, 4);
    const { events, line } = play({ s: { pyr, stock: [C(1, 3)], waste: [C(1, 2)], passes: 0, moves: 3 }, hist: [] });
    expect(events).toEqual([]);
    expect(line()).toMatch(/· undo$/);
  });
});

describe('klondike', () => {
  // Same rules as solitaire.ts.
  const RULES: KRules[] = [
    { draw: 1, redeals: -1 },
    { draw: 1, redeals: 2 },
    { draw: 1, redeals: 1 },
    { draw: 3, redeals: -1 },
    { draw: 3, redeals: 2 },
  ];

  it('only deals games the greedy player wins under the real rules', () => {
    RULES.forEach((r, i) => {
      for (let k = 1; k <= SEEDS; k++) expect(greedyK(genK(new Rng(seedOf(k, i + 1)), r), r), `level ${i + 1} seed ${k}`).toBe(true);
    });
  }, 60_000);

  it('sees that recycling the stock forever leads nowhere', () => {
    const empty = () => ({ d: [], u: [] });
    const s: KState = {
      stock: [C(0, 2)],
      waste: [],
      found: [0, 0, 0, 0],
      tab: [{ d: [C(0, 1)], u: [C(1, 5)] }, empty(), empty(), empty(), empty(), empty(), empty()],
      redeals: 7,
      moves: 20,
    };
    expect(hasProgress(s, { draw: 1, redeals: -1 })).toBe(false);
    expect(hasProgress({ ...s, stock: [C(0, 4)] }, { draw: 1, redeals: -1 })).toBe(true); // 4♠ fits on the 5♥
  });
});

describe('spider', () => {
  // Same settings as spider.ts.
  const CFG = [
    { suits: [0], copies: 4, cols: 8, dealt: 36, help: 0.3 },
    { suits: [0], copies: 6, cols: 8, dealt: 46, help: 0.5 },
    { suits: [0, 1], copies: 3, cols: 8, dealt: 46, help: 0.8 },
    { suits: [0, 1], copies: 4, cols: 10, dealt: 54, help: 0.7 },
    { suits: [0, 1, 2, 3], copies: 2, cols: 10, dealt: 54, help: 0.9 },
  ];

  it('only deals games with a known winning line', () => {
    CFG.forEach((c, i) => {
      for (let k = 1; k <= SEEDS; k++) {
        const { s, line } = genS(new Rng(seedOf(k, i + 1)), c.suits, c.copies, c.cols, c.dealt, c.help);
        expect(line, `level ${i + 1} seed ${k}`).not.toBeNull();
        expect(playLineS(s, line!)).toBe(true);
      }
    });
  }, 60_000);

  it('ends the game when moves only shuffle cards around', () => {
    // The 5♠ can hop between the two sixes forever, but nothing can be turned or completed.
    const s: SState = {
      cols: [
        { d: [C(0, 1)], u: [C(0, 13), C(0, 5)] },
        { d: [C(1, 1)], u: [C(1, 13), C(1, 6)] },
        { d: [C(2, 1)], u: [C(2, 13), C(2, 6)] },
      ],
      stock: [],
      done: [],
      moves: 30,
    };
    expect(hasMoveS(s)).toBe(true);
    expect(progressS(s)).toBe(false);
    expect(progressS({ ...s, stock: [C(0, 2), C(0, 3), C(0, 4)] })).toBe(true);
  });
});

describe('freecell', () => {
  it('only deals games the solver has won', () => {
    for (const d of LEVELS)
      for (let k = 1; k <= SEEDS; k++) {
        const s = genF(d, new Rng(seedOf(k, d)));
        expect(s.cells.length).toBe(d === 5 ? 3 : 4);
        expect(solveF(s, 4000), `level ${d} seed ${k}`).toBe('win');
      }
  }, 60_000);
});
