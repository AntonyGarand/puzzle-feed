import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import {
  generate as generateEcho,
  search as echoSearch,
  track as echoTrack,
  walk as echoWalk,
  type GenOpts,
} from '../src/puzzles/echokit/gen';
import { genArrows, rounds } from '../src/puzzles/arrowkit/arrows';
import { genBridges } from '../src/puzzles/logickit/bridgesgen';
import { genPearls, isSolved } from '../src/puzzles/gridkit/pearls';
import { genMines, solvableByLogic } from '../src/puzzles/logickit/minesgen';
import { drawPiece, PIECES } from '../src/puzzles/movekit/pieces';
import { applyMove, genTether, legalMoves, solveTether } from '../src/puzzles/movekit/tethergen';

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

describe('tether', () => {
  it('generates rooms whose fewest-moves solution replays legally onto both goals', () => {
    const tune = { w: 6, h: 7, max: 4, minMoves: 14, maxMoves: 28, minExtra: 10, cap: 120000, budget: 500000 };
    for (let seed = 1; seed <= 8; seed++) {
      const g = genTether(new Rng(seed), tune);
      const sol = solveTether(g.w, g.h, g.floor, g.max, g.path, g.goals)!;
      expect(sol.length).toBe(g.moves);
      let path = g.path;
      for (const m of sol) {
        expect(legalMoves(g.w, g.h, g.floor, path, g.max)).toContainEqual(m);
        path = applyMove(path, m);
        expect(path.length - 2).toBeLessThanOrEqual(g.max);
      }
      expect([path[0], path[path.length - 1]]).toEqual(g.goals);
    }
  });
});

describe('echo', () => {
  const opts: GenOpts[] = [
    { w: 5, h: 6, doors: 1, runs: 2, slack: 5, loops: 1, minT: 7, maxT: 18 },
    { w: 7, h: 7, doors: 3, runs: 2, slack: 1, loops: 3, minT: 17, maxT: 34 },
    { w: 7, h: 7, doors: 3, runs: 3, slack: 2, loops: 3, minT: 14, maxT: 34 },
  ];
  it('needs every run, and its stored solution gets out', () => {
    for (const o of opts)
      for (let seed = 1; seed <= 10; seed++) {
        const room = generateEcho(new Rng(seed), o);
        expect(room.sol.length).toBe(room.runs);
        const tracks: number[][] = [];
        for (const rec of room.sol) {
          expect(rec.length).toBeLessThanOrEqual(room.T);
          const tr = echoTrack(room, rec, tracks);
          expect(tr).not.toBeNull();
          tracks.push(tr!);
        }
        expect(tracks[tracks.length - 1].at(-1)).toBe(room.exit);
        // one run alone never gets out, nor (with three runs) two
        expect(echoWalk(room, [], room.start, 0, room.exit, room.T)).toBeNull();
        expect(room.runs === 3 && echoSearch(room, [], room.T, true)).toBeFalsy();
      }
  });
});

describe('arrows', () => {
  it('fills the whole board with arrows that can all leave', () => {
    for (const [n, len] of [
      [5, 4],
      [7, 6],
      [16, 9],
    ])
      for (let seed = 1; seed <= 60; seed++) {
        const arrows = genArrows(n, len, 10, new Rng(seed));
        expect(rounds(n, arrows)).not.toBeNull();
        expect(rounds(n, arrows)!.length).toBeGreaterThan(1);
        const cells = arrows.flatMap((a) => a.cells);
        expect(new Set(cells).size).toBe(cells.length);
        expect(n * n - cells.length).toBeLessThanOrEqual(2);
      }
  });
});
