// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { LEVELS, type Difficulty } from '../src/core/types';
import {
  bestMove,
  createLevel,
  findLines,
  hasLine,
  hasMove,
  levelFor,
  lineScore,
  play,
  preview,
  reshuffle,
  restore,
  validMoves,
  type State,
} from '../src/games/swap/rules';
import { mountGame } from './support/mount';

/** Play the guide's pick until the game ends; the board must offer a move, and no line, between turns. */
function autopilot(d: Difficulty, seed: number) {
  const s = createLevel(d, new Rng(seed));
  let out = '';
  while (!out) {
    expect(hasMove(s.grid, s.n)).toBe(true);
    expect(hasLine(s.grid, s.n)).toBe(false);
    const p = bestMove(s)!;
    out = play(s, p.a, p.b)!.outcome;
  }
  return { s, out };
}

/** A copy that shares nothing with `s`. */
const clone = (s: State): State => ({ ...s, grid: [...s.grid] });

describe('swap rules', () => {
  it('deals the same board from the same seed', () => {
    expect(createLevel(3, new Rng(9))).toEqual(createLevel(3, new Rng(9)));
    expect(createLevel(3, new Rng(9)).grid).not.toEqual(createLevel(3, new Rng(10)).grid);
  });

  it('never deals a board with a line already made, and always deals a move', () => {
    for (const d of LEVELS)
      for (let seed = 1; seed <= 60; seed++) {
        const s = createLevel(d, new Rng(seed));
        expect(hasLine(s.grid, s.n), `${d}/${seed}`).toBe(false);
        expect(hasMove(s.grid, s.n), `${d}/${seed}`).toBe(true);
        expect(Math.max(...s.grid)).toBeLessThan(s.colours);
      }
  });

  it('gets harder: bigger boards, more colours', () => {
    for (const d of LEVELS.slice(1)) {
      const lo = levelFor((d - 1) as Difficulty);
      expect(levelFor(d).colours).toBeGreaterThanOrEqual(lo.colours);
      expect(levelFor(d).n).toBeGreaterThanOrEqual(lo.n);
    }
    expect(levelFor(5).colours).toBeGreaterThan(levelFor(1).colours);
    expect(levelFor(5).n).toBeGreaterThan(levelFor(1).n);
  });

  it('finds runs of 3 or more, across and down', () => {
    // 4×4: a row of 4 zeros on top, a column of 3 ones on the right below it.
    const g = [0, 0, 0, 0, 2, 3, 2, 1, 3, 2, 3, 1, 2, 3, 2, 1];
    expect(findLines(g, 4)).toEqual([
      [0, 1, 2, 3],
      [7, 11, 15],
    ]);
    expect(lineScore(3)).toBeLessThan(lineScore(4));
    expect(lineScore(4)).toBeLessThan(lineScore(5));
  });

  it('refuses a swap that makes no line, for free', () => {
    const s = createLevel(1, new Rng(4));
    const n = s.n;
    const valid = new Set(validMoves(s.grid, n).map(([a, b]) => `${a},${b}`));
    const i = [...Array(n * n).keys()].find((k) => k % n < n - 1 && s.grid[k] !== s.grid[k + 1] && !valid.has(`${k},${k + 1}`))!;
    const before = clone(s);
    expect(play(s, i, i + 1)).toBeNull();
    expect(play(s, 0, 2)).toBeNull(); // not neighbours
    expect(play(s, n - 1, n)).toBeNull(); // end of one row, start of the next
    expect(s).toEqual(before);
  });

  it('spends a move, scores, cascades and refills the board completely', () => {
    const s = createLevel(2, new Rng(8));
    const [a, b] = validMoves(s.grid, s.n)[0];
    const res = play(s, a, b)!;
    expect(res.outcome).toBe('');
    expect(res.steps[0].lines.length).toBeGreaterThan(0);
    expect(res.steps.map((x) => x.chain)).toEqual(res.steps.map((_, k) => k + 1));
    expect(s.score).toBe(res.steps.reduce((t, x) => t + x.points, 0));
    expect(s.grid.every((v) => v >= 0 && v < s.colours)).toBe(true);
    expect(hasLine(s.grid, s.n)).toBe(false);
    expect(s.moves).toBe(levelFor(2).moves - 1);
    expect(s.k).toBeGreaterThanOrEqual(res.steps.length);
  });

  it('replays exactly from a saved (grid, k): refills are reproducible', () => {
    const a = createLevel(4, new Rng(21));
    for (let m = 0; m < 3; m++) {
      const p = bestMove(a)!;
      play(a, p.a, p.b);
    }
    const saved = JSON.parse(JSON.stringify({ grid: a.grid, score: a.score, moves: a.moves, k: a.k })) as unknown;
    const b = restore(createLevel(4, new Rng(21)), saved)!;
    expect(b).toEqual(a);
    for (let m = 0; m < 4; m++) {
      const p = bestMove(a)!;
      expect(play(b, p.a, p.b)).toEqual(play(a, p.a, p.b));
    }
    expect(b).toEqual(a);
  });

  it('ignores a saved board that is broken or not from this level', () => {
    const s = createLevel(1, new Rng(1));
    expect(restore(s, null)).toBeNull();
    expect(restore(s, { grid: [1, 2], score: 0, moves: 3, k: 0 })).toBeNull();
    expect(restore(s, { grid: s.grid.map(() => 9), score: 0, moves: 3, k: 0 })).toBeNull();
    expect(restore(s, { grid: s.grid, score: s.target, moves: 3, k: 0 })).toBeNull();
    expect(restore(s, { grid: s.grid, score: 0, moves: s.moves + 1, k: 0 })).toBeNull();
    expect(restore(s, { grid: s.grid, score: 0, moves: 3, k: 2 })).toMatchObject({ moves: 3, k: 2 });
  });

  it('reshuffles a stuck board into one with a move and no line', () => {
    const s = createLevel(1, new Rng(2));
    // Colours in a 5-cycle along each row, shifted by 2 each row, can't make a line.
    s.grid = s.grid.map((_, i) => ((i % s.n) + 2 * Math.floor(i / s.n)) % 5);
    expect(hasMove(s.grid, s.n)).toBe(false);
    expect(hasLine(s.grid, s.n)).toBe(false);
    reshuffle(s);
    expect(hasMove(s.grid, s.n)).toBe(true);
    expect(hasLine(s.grid, s.n)).toBe(false);
  });

  it('previews only what is sure: the swap’s lines plus known gems falling into place', () => {
    const s = createLevel(3, new Rng(5));
    for (const [a, b] of validMoves(s.grid, s.n)) {
      const p = preview(s, a, b)!;
      const real = clone(s);
      const res = play(real, a, b)!;
      expect(p.lines).toEqual(res.steps[0].lines);
      expect(p.points).toBeGreaterThanOrEqual(res.steps[0].points);
    }
  });

  it('is won by the guide on most seeds, and harder levels win less often', () => {
    const rate = (d: Difficulty) => {
      let won = 0;
      for (let seed = 1; seed <= 40; seed++) if (autopilot(d, seed * 13 + d).out === 'win') won++;
      return won / 40;
    };
    const rates = LEVELS.map(rate);
    expect(rates[0]).toBeGreaterThanOrEqual(0.95);
    expect(rates[4]).toBeGreaterThanOrEqual(0.6);
    expect(rates[4]).toBeLessThan(1);
  });

  it('is lost when the moves run out short of the target', () => {
    const s = createLevel(5, new Rng(3));
    s.target = 1e9;
    let out = '';
    while (!out) {
      const [a, b] = validMoves(s.grid, s.n)[0];
      out = play(s, a, b)!.outcome;
    }
    expect(out).toBe('lose');
    expect(s.moves).toBe(0);
  });
});

describe('swap game', () => {
  const cellsOf = (root: HTMLElement) => [...root.querySelectorAll<HTMLButtonElement>('.cell')];

  it('swaps with two taps, refuses a swap that makes no line without a mistake', () => {
    const g = mountGame('swap', 1, 77, { attach: true });
    const s = createLevel(1, new Rng(77));
    const cells = cellsOf(g.root);
    const valid = new Set(validMoves(s.grid, s.n).map(([a, b]) => `${a},${b}`));
    const bad = [...Array(s.n * s.n).keys()].find((k) => k % s.n < s.n - 1 && s.grid[k] !== s.grid[k + 1] && !valid.has(`${k},${k + 1}`))!;
    cells[bad].click();
    expect(cells[bad].classList.contains('sel')).toBe(true);
    cells[bad + 1].click();
    expect(cells[bad].classList.contains('sel')).toBe(false);
    expect(g.events).toEqual([]);
    expect(g.status).toContain(`${levelFor(1).moves} moves left`);

    const [a, b] = validMoves(s.grid, s.n)[0];
    cells[a].click();
    cells[b].click();
    expect(g.status).toContain(`${levelFor(1).moves - 1} moves left`);
    expect(g.events).not.toContain('mistake');
    g.root.remove();
  });

  it('fails when the move budget runs out', () => {
    const s = createLevel(5, new Rng(3));
    const g = mountGame('swap', 5, 3, { saved: { grid: s.grid, score: 0, moves: 1, k: 0, sel: -1, cur: -1 } });
    expect(g.status).toContain('1 move left');
    const [a, b] = validMoves(s.grid, s.n)[0];
    cellsOf(g.root)[a].click();
    cellsOf(g.root)[b].click();
    expect(g.outcome).toBe('failed');
    expect(g.events).toEqual(['failed']);
  });

  it('is solved by following the guide on Easy', () => {
    const g = mountGame('swap', 1, 0x5eed);
    for (let k = 0; k < 30 && !g.outcome; k++) g.inst.hint!()!.play();
    expect(g.outcome).toBe('solved');
  });
});
