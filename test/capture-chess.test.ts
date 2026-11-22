// Capture Chess's pure rules: legal captures, the solver, the generator, saved games, and the guide's reasoning.
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { Difficulty } from '../src/core/types';
import {
  apply,
  BISHOP,
  count,
  findMistake,
  generate,
  type Game,
  KING,
  KNIGHT,
  legalLine,
  mFrom,
  moves,
  mTo,
  noCaptures,
  PAWN,
  parseSaved,
  planHint,
  QUEEN,
  replay,
  ROOK,
  solver,
} from '../src/games/capture-chess/rules';

const LEVELS: Difficulty[] = [1, 2, 3, 4, 5];

/** A hand-made game on an n×n board; squares by (row from the top, column). */
function game(n: number, pieces: [number, number, number][], limit = 0): Game {
  const type = new Int8Array(n * n);
  for (const [r, c, p] of pieces) type[r * n + c] = p;
  return { n, limit, start: { type, used: new Int8Array(n * n) }, line: [] };
}
const sq = (g: Game, r: number, c: number) => r * g.n + c;
const mv = (g: Game, from: [number, number], to: [number, number]) => sq(g, ...from) * 64 + sq(g, ...to);

describe('capture-chess moves', () => {
  it('a capture moves the piece onto its target and counts it', () => {
    const g = game(4, [
      [3, 0, ROOK],
      [1, 0, KNIGHT],
    ]);
    const m = mv(g, [3, 0], [1, 0]);
    expect(moves(g, g.start)).toContain(m);
    const s = apply(g.start, m);
    expect(s.type[sq(g, 1, 0)]).toBe(ROOK);
    expect(s.type[sq(g, 3, 0)]).toBe(0);
    expect(s.used[sq(g, 1, 0)]).toBe(1);
    expect(count(s)).toBe(1);
    // The original position is untouched.
    expect(g.start.type[sq(g, 3, 0)]).toBe(ROOK);
  });

  it('sliders stop at the first piece, and nothing moves without capturing', () => {
    const g = game(4, [
      [3, 0, ROOK],
      [2, 0, PAWN],
      [0, 0, QUEEN],
    ]);
    const rook = moves(g, g.start, sq(g, 3, 0));
    expect(rook).toEqual([mv(g, [3, 0], [2, 0])]);
    expect(rook).not.toContain(mv(g, [3, 0], [0, 0]));
    // The pawn attacks nothing diagonally, so it has no move.
    expect(moves(g, g.start, sq(g, 2, 0))).toEqual([]);
  });

  it('pawns take one square diagonally upward only', () => {
    const g = game(4, [
      [2, 1, PAWN],
      [1, 0, KNIGHT],
      [1, 1, BISHOP],
      [3, 2, KING],
    ]);
    expect(moves(g, g.start, sq(g, 2, 1))).toEqual([mv(g, [2, 1], [1, 0])]);
  });

  it('knights jump and kings step one square', () => {
    const g = game(4, [
      [3, 0, KNIGHT],
      [2, 0, BISHOP],
      [1, 1, KING],
    ]);
    expect(moves(g, g.start, sq(g, 3, 0))).toEqual([mv(g, [3, 0], [1, 1])]);
    expect(moves(g, g.start, sq(g, 1, 1))).toEqual([mv(g, [1, 1], [2, 0])]);
  });

  it('a piece that used up its captures can no longer move', () => {
    const g = game(
      4,
      [
        [3, 0, ROOK],
        [2, 0, KNIGHT],
        [1, 0, BISHOP],
      ],
      1,
    );
    const s = apply(g.start, mv(g, [3, 0], [2, 0]));
    expect(moves(g, s, sq(g, 2, 0))).toEqual([]);
    expect(noCaptures(g, s)).toBe(true);
    // Without a limit it could go on.
    expect(moves({ ...g, limit: 0 }, s, sq(g, 2, 0))).toEqual([mv(g, [2, 0], [1, 0])]);
  });
});

describe('capture-chess generator and solver', () => {
  it('every generated puzzle is cleared by its stored line, one legal capture at a time', () => {
    for (const d of LEVELS)
      for (let seed = 1; seed <= 10; seed++) {
        const g = generate(new Rng(seed), d);
        let s = g.start;
        for (const m of g.line) {
          expect(moves(g, s)).toContain(m);
          s = apply(s, m);
        }
        expect(count(s)).toBe(1);
        expect(count(g.start)).toBe(g.line.length + 1);
        expect(count(g.start)).toBeGreaterThan(2); // never starts solved
      }
  });

  it('is deterministic for a seed', () => {
    const a = generate(new Rng(42), 4),
      b = generate(new Rng(42), 4);
    expect([...a.start.type]).toEqual([...b.start.type]);
    expect(a.line).toEqual(b.line);
  });

  it('the solver agrees with the stored line and spots dead ends', () => {
    const g = generate(new Rng(9), 3);
    expect(solver(g, 100_000)(g.start)).toBe(true);
    const stuck = game(4, [
      [0, 0, ROOK],
      [1, 2, ROOK],
    ]);
    expect(solver(stuck, 1000)(stuck.start)).toBe(false);
    // A one-node budget can't decide a real puzzle.
    expect(solver(generate(new Rng(9), 5), 1)(generate(new Rng(9), 5).start)).toBeNull();
  });
});

describe('capture-chess saved games', () => {
  const g = generate(new Rng(11), 3);

  it('keeps the longest legal prefix, and never a finished board', () => {
    expect(legalLine(g, g.line.slice(0, 2))).toEqual(g.line.slice(0, 2));
    expect(legalLine(g, [g.line[0], 99999, g.line[1]])).toEqual([g.line[0]]);
    expect(legalLine(g, g.line)).toEqual(g.line.slice(0, -1));
    expect(legalLine(g, 'junk')).toEqual([]);
  });

  it('restores moves, restarts and a selection that is still a piece', () => {
    const played = g.line.slice(0, 2);
    const cur = replay(g, played);
    const piece = cur.type.findIndex((p) => p > 0);
    const blank = cur.type.findIndex((p) => p === 0);
    expect(parseSaved(g, { moves: played, sel: piece, restarts: [g.line.slice(0, 1), [12345]] })).toEqual({
      moves: played,
      restarts: [g.line.slice(0, 1)],
      sel: piece,
    });
    expect(parseSaved(g, { moves: played, sel: blank }).sel).toBe(-1);
    expect(parseSaved(g, null)).toEqual({ moves: [], restarts: [], sel: -1 });
  });
});

describe('capture-chess guide', () => {
  it('suggests the stored line from the start, and finishes with two pieces left', () => {
    const g = generate(new Rng(3), 2);
    const memo = new Map<string, boolean>();
    const plan = planHint(g, g.start, [], memo);
    expect(plan?.type).toBe('capture');
    if (plan?.type !== 'capture') return;
    expect(plan.move).toBe(g.line[0]);
    expect(plan.kinds[0]).toBe('start');
    expect(plan.kinds.at(-1)).toBe('plain');
    const done = g.line.slice(0, -1);
    const last = planHint(g, replay(g, done), done, memo);
    expect(last?.type === 'capture' && last.kinds.includes('last')).toBe(true);
  });

  it('a stuck board asks to take back, and nothing is suggested before any move', () => {
    const g = game(4, [
      [0, 0, ROOK],
      [1, 2, ROOK],
    ]);
    expect(planHint(g, g.start, [], new Map())).toBeNull();
    expect(planHint(g, g.start, [0], new Map())).toEqual({ type: 'stuck' });
  });

  it('finds the capture that lost the game, however long ago', () => {
    let seen = 0;
    for (let seed = 1; seed <= 20 && seen < 3; seed++) {
      const g = generate(new Rng(seed), 3);
      const memo = new Map<string, boolean>();
      const wins = solver(g, 100_000, memo);
      const bad = moves(g, g.start).find((m) => wins(apply(g.start, m)) === false);
      if (bad == null) continue;
      const after = apply(g.start, bad);
      expect(findMistake(g, [bad], memo)).toEqual({ before: g.start, move: bad, back: 1, noCapture: !moves(g, after).length });
      // One more capture after the mistake (if any): still blamed on the first one, two Undos back.
      const next = moves(g, after)[0];
      const line = next == null ? [bad] : [bad, next];
      expect(findMistake(g, line, memo)).toMatchObject({ move: bad, back: line.length });
      // Off the line and lost: the guide says so instead of suggesting a capture.
      const plan = planHint(g, after, [bad], memo);
      expect(plan?.type === 'stuck' || plan?.type === 'lost').toBe(true);
      seen++;
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('stays quiet while the line is still winnable', () => {
    const g = generate(new Rng(4), 3);
    expect(findMistake(g, [], new Map())).toBeNull();
    expect(findMistake(g, g.line.slice(0, 2), new Map())).toBeNull();
    const plan = planHint(g, replay(g, g.line.slice(0, 1)), g.line.slice(0, 1), new Map());
    const move = plan?.type === 'capture' ? plan.move : -1;
    expect(move).toBe(g.line[1]);
    // ...a capture by a piece that is on the board, of a piece that is on the board.
    const s = replay(g, g.line.slice(0, 1));
    expect(s.type[mFrom(move)] && s.type[mTo(move)]).toBeGreaterThan(0);
  });
});
