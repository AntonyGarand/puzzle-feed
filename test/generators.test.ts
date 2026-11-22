import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { genBridges } from '../src/puzzles/logickit/bridgesgen';
import { genPearls, isSolved } from '../src/puzzles/gridkit/pearls';
import { genMines, solvableByLogic } from '../src/puzzles/logickit/minesgen';
import { drawPiece, PIECES } from '../src/puzzles/movekit/pieces';

describe('bridges', () => {
  it('spreads islands to all four edges of the grid', () => {
    for (const [n, target] of [
      [7, 8],
      [10, 16],
      [13, 28],
    ])
      for (let seed = 1; seed <= 15; seed++) {
        const p = genBridges(n, target, new Rng(seed));
        const rs = p.islands.map((s) => s.r),
          cs = p.islands.map((s) => s.c);
        expect([Math.min(...rs), Math.max(...rs), Math.min(...cs), Math.max(...cs)]).toEqual([0, n - 1, 0, n - 1]);
        expect(p.unique).toBe(true);
      }
  });
});

describe('mines', () => {
  it('never needs a guess, even on the densest boards', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = new Rng(seed);
      const first = rng.int(0, 129);
      const mine = genMines(10, 13, 28, first, rng, 20);
      expect(solvableByLogic(mine, 10, 13, first)).toBe(true);
    }
  });
});

describe('blocks', () => {
  it('never deals 1×1 or 2×1 pieces', () => {
    const rng = new Rng(7);
    for (let k = 0; k < 2000; k++) expect(PIECES[drawPiece(rng, 5, 0)].cells.length).toBeGreaterThanOrEqual(3);
  });
});

describe('pearls', () => {
  it('generates unique puzzles whose loop obeys every pearl', () => {
    for (const n of [6, 8, 10])
      for (let seed = 1; seed <= 10; seed++) {
        const p = genPearls(n, 0, 0.35, new Rng(seed));
        expect(p.unique).toBe(true);
        expect(isSolved(p, p.pearl, (e) => p.sol[e])).toBe(true);
      }
  });
});
