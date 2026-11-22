// Arrange's pure rules: fit checks, the fill solver, saved-game restore, and the guide's reasoning.
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { Difficulty } from '../src/core/types';
import { genArrange, type ArrangePuzzle } from '../src/games/arrange/gen';
import {
  atHome,
  copyPos,
  deadEnd,
  fitsAt,
  gaps,
  isSolved,
  legal,
  makeSolver,
  nextStep,
  occupancy,
  placeChanged,
  restore,
  shapeOf,
  solCells,
  solveFill,
  type Pos,
} from '../src/games/arrange/rules';

const LEVELS: Difficulty[] = [1, 2, 3, 4, 5];

/** A fresh position: every piece in the tray, turned as in the stored solution. */
const empty = (P: ArrangePuzzle): Pos => ({ place: P.pieces.map(() => null), rot: P.pieces.map(() => 0) });
/** The stored solution as a position. */
const solved = (P: ArrangePuzzle): Pos => ({ place: P.pieces.map((pc) => [pc.r, pc.c]), rot: P.pieces.map(() => 0) });

describe('arrange generator', () => {
  it('stores a solution that fills the board exactly', () => {
    for (const d of LEVELS)
      for (let seed = 1; seed <= 15; seed++) {
        const P = genArrange(new Rng(seed), d);
        const pos = solved(P);
        expect(legal(P, pos)).toBe(true);
        expect(isSolved(pos)).toBe(true);
        expect([...occupancy(P, pos)].every((o) => o >= 0)).toBe(true);
        expect(P.pieces.every((_, p) => atHome(P, pos, p))).toBe(true);
        expect(P.rotate).toBe(d >= 3);
      }
  });
});

describe('arrange fit checks', () => {
  const P = genArrange(new Rng(7), 2);

  it('accepts a piece at its solution spot on an empty board', () => {
    const owner = occupancy(P, empty(P));
    P.pieces.forEach((pc) => expect(fitsAt(P, owner, pc.shape, pc.r, pc.c)).toBe(true));
  });

  it('rejects overlaps and pieces hanging off the board', () => {
    const pos = empty(P);
    pos.place[0] = [P.pieces[0].r, P.pieces[0].c];
    const owner = occupancy(P, pos);
    expect(fitsAt(P, owner, P.pieces[0].shape, P.pieces[0].r, P.pieces[0].c)).toBe(false);
    const sh = P.pieces[1].shape;
    expect(fitsAt(P, occupancy(P, empty(P)), sh, -1, 0)).toBe(false);
    expect(fitsAt(P, occupancy(P, empty(P)), sh, 0, P.cols)).toBe(false);
  });

  it('flags overlapping and out-of-board positions as illegal', () => {
    const pos = solved(P);
    expect(legal(P, pos)).toBe(true);
    pos.place[1] = pos.place[0];
    expect(legal(P, pos)).toBe(false);
    const off = empty(P);
    off.place[0] = [P.rows, 0];
    expect(legal(P, off)).toBe(false);
  });

  it('splits empty cells into connected gaps', () => {
    const pos = solved(P);
    pos.place[0] = null;
    pos.place[1] = null;
    const owner = occupancy(P, pos);
    const gs = gaps(P, (i) => owner[i] < 0);
    expect(gs.flat().sort((a, b) => a - b)).toEqual([...solCells(P, 0), ...solCells(P, 1)].sort((a, b) => a - b));
  });

  it('records undo only when a placement changes, not a turn', () => {
    const a = empty(P);
    const b = copyPos(a);
    b.rot[0] = 2;
    expect(placeChanged(a, b)).toBe(false);
    b.place[0] = [0, 0];
    expect(placeChanged(a, b)).toBe(true);
    expect(a.place[0]).toBeNull(); // copyPos is deep
  });
});

describe('arrange solver', () => {
  it('fills a fresh board, with pieces dealt turned when the level allows it', () => {
    for (const d of LEVELS)
      for (let seed = 1; seed <= 6; seed++) {
        const rng = new Rng(seed);
        const P = genArrange(rng, d);
        const pos = empty(P);
        if (P.rotate) pos.rot = P.pieces.map(() => rng.int(0, 3));
        const { sol, capped } = solveFill(P, pos, 200_000);
        expect(capped).toBe(false);
        expect(sol).not.toBeNull();
        const done: Pos = copyPos(pos);
        for (const sp of sol ?? []) {
          done.place[sp.p] = [sp.r, sp.c];
          done.rot[sp.p] = sp.rot;
        }
        expect(legal(P, done)).toBe(true);
        expect(isSolved(done)).toBe(true);
      }
  });

  it('proves a board impossible when a gap is smaller than every piece left', () => {
    // Find a misplaced piece that walls off a dead gap, and check the solver and deadEnd agree.
    let found = 0;
    for (let seed = 1; seed <= 20 && found < 5; seed++) {
      const P = genArrange(new Rng(seed), 1);
      const solve = makeSolver(P);
      for (let p = 0; p < P.pieces.length; p++)
        for (let r = 0; r < P.rows; r++)
          for (let c = 0; c < P.cols; c++) {
            const pos = empty(P);
            if (!fitsAt(P, occupancy(P, pos), shapeOf(P, pos.rot, p), r, c)) continue;
            pos.place[p] = [r, c];
            const dead = deadEnd(P, pos, solve);
            const res = solveFill(P, pos, 100_000);
            // At home is never flagged; elsewhere, flagged exactly when the solver proves it impossible.
            const want = !atHome(P, pos, p) && res.sol === null && !res.capped;
            expect(dead !== null).toBe(want);
            // The culprit is the only piece on the board, next to a non-empty gap.
            expect(dead ? [dead.p, dead.gap.length > 0] : [p, true]).toEqual([p, true]);
            if (dead) found++;
          }
    }
    expect(found).toBeGreaterThan(0);
  });
});

describe('arrange restore', () => {
  const P = genArrange(new Rng(3), 4);
  const K = P.pieces.length;

  it('never resumes a solved board', () => {
    const pos = empty(P);
    restore(P, pos, solved(P));
    expect(isSolved(pos)).toBe(false);
    expect(pos.place.filter(Boolean).length).toBe(K - 1);
    expect(pos.place[K - 1]).toBeNull();
  });

  it('drops placements that overlap earlier ones and ignores bad turns', () => {
    const pos = empty(P);
    const first: [number, number] = [P.pieces[0].r, P.pieces[0].c];
    const rot = P.pieces.map(() => 0);
    rot[0] = 7;
    restore(P, pos, { rot, place: P.pieces.map(() => first), hist: [] });
    expect(pos.rot).toEqual(P.pieces.map(() => 0));
    expect(pos.place[0]).toEqual(first);
    expect(pos.place.filter(Boolean).length).toBeLessThan(K);
    expect(legal(P, pos)).toBe(true);
  });

  it('keeps a legal undo history and drops a corrupt one', () => {
    const ok = { place: P.pieces.map(() => null), rot: P.pieces.map(() => 1) };
    expect(restore(P, empty(P), { hist: [ok] })).toEqual([ok]);
    const clash = solved(P);
    clash.place[1] = clash.place[0];
    expect(restore(P, empty(P), { hist: [ok, clash] })).toEqual([]);
    expect(restore(P, empty(P), { hist: 'nope' })).toEqual([]);
    expect(restore(P, empty(P), undefined)).toEqual([]);
  });
});

describe('arrange guide', () => {
  it('walks a fresh board to the solution, varying its rules', () => {
    for (const d of [1, 2] as Difficulty[])
      for (let seed = 1; seed <= 8; seed++) {
        const P = genArrange(new Rng(seed), d);
        const solve = makeSolver(P);
        const pos = empty(P);
        let last = '';
        const kinds: string[] = [];
        for (let k = 0; k < P.pieces.length; k++) {
          const st = nextStep(P, pos, solve, last);
          if (!st || !(st.kind === 'gap' || st.kind === 'corner' || st.kind === 'big')) throw new Error(`unexpected step ${st?.kind}`);
          kinds.push(st.kind);
          last = st.kind;
          pos.place[st.p] = [P.pieces[st.p].r, P.pieces[st.p].c];
          expect(legal(P, pos)).toBe(true);
        }
        expect(isSolved(pos)).toBe(true);
        expect(nextStep(P, pos, solve, last)).toBeNull();
        // The rule just used is tried last, so two steps in a row differ whenever another rule applies.
        expect(new Set(kinds).size).toBeGreaterThan(1);
      }
  });

  it('asks for a turn when the only piece left is turned wrong', () => {
    const P = genArrange(new Rng(5), 3);
    const pos = solved(P);
    const rot = P.pieces.map(() => 1);
    // A piece that looks different after a quarter turn.
    const p = P.pieces.findIndex((pc, q) => JSON.stringify(shapeOf(P, rot, q)) !== JSON.stringify(pc.shape));
    expect(p).toBeGreaterThanOrEqual(0);
    pos.place[p] = null;
    pos.rot[p] = 1;
    expect(nextStep(P, pos, makeSolver(P), '')).toEqual({ kind: 'turn', p });
    pos.rot[p] = 0;
    expect(nextStep(P, pos, makeSolver(P), '')).toEqual({ kind: 'gap', p, size: P.pieces[p].shape.length, last: true });
  });

  it('sends back a piece that makes the board unfinishable', () => {
    let seen = 0;
    for (let seed = 1; seed <= 20 && !seen; seed++) {
      const P = genArrange(new Rng(seed), 1);
      const solve = makeSolver(P);
      for (let p = 0; p < P.pieces.length && !seen; p++)
        for (let r = 0; r < P.rows && !seen; r++)
          for (let c = 0; c < P.cols && !seen; c++) {
            const pos = empty(P);
            if (!fitsAt(P, occupancy(P, pos), shapeOf(P, pos.rot, p), r, c)) continue;
            pos.place[p] = [r, c];
            if (atHome(P, pos, p) || !deadEnd(P, pos, solve)) continue;
            expect(nextStep(P, pos, solve, '')).toEqual({ kind: 'send-back', p });
            seen++;
          }
    }
    expect(seen).toBe(1);
  });

  it('follows the solver when the board left the stored solution but can still be finished', () => {
    let seen = 0;
    for (let seed = 1; seed <= 30 && !seen; seed++) {
      const P = genArrange(new Rng(seed), 2);
      const solve = makeSolver(P);
      for (let p = 0; p < P.pieces.length && !seen; p++)
        for (let r = 0; r < P.rows && !seen; r++)
          for (let c = 0; c < P.cols && !seen; c++) {
            const pos = empty(P);
            if (!fitsAt(P, occupancy(P, pos), shapeOf(P, pos.rot, p), r, c)) continue;
            pos.place[p] = [r, c];
            if (atHome(P, pos, p) || !solve(pos).sol) continue;
            const st = nextStep(P, pos, solve, '');
            expect(st?.kind).toBe('alt-drop');
            if (st?.kind !== 'alt-drop') continue;
            pos.place[st.spot.p] = [st.spot.r, st.spot.c];
            expect(legal(P, pos)).toBe(true);
            seen++;
          }
    }
    expect(seen).toBe(1);
  });
});
