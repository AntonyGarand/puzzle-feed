// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { Difficulty } from '../src/core/types';
import { apply, code, distances, genRings, legal, moves, towerCost, towerMove, type Pos } from '../src/games/rings/gen';
import { mountGame } from './support/mount';

describe('rings rules', () => {
  it('only moves a top ring onto an empty peg or a bigger ring', () => {
    const pos: Pos = [0, 1, 0]; // left: 1, 3 · middle: 2
    expect(legal(pos, 0, 1)).toEqual({ ring: 0, from: 0, to: 1 });
    expect(legal(pos, 1, 0)).toBeNull(); // 2 onto 1
    expect(legal(pos, 1, 2)).toEqual({ ring: 1, from: 1, to: 2 });
    expect(legal(pos, 2, 0)).toBeNull(); // empty
    expect(moves(pos)).toHaveLength(3);
  });

  it('finds the classic 2^n − 1 moves', () => {
    for (let n = 1; n <= 7; n++) {
      const goal = new Array<number>(n).fill(2);
      expect(distances(goal)[code(new Array<number>(n).fill(0))]).toBe(2 ** n - 1);
      expect(towerCost(new Array<number>(n).fill(0), n - 1, 2)).toBe(2 ** n - 1);
    }
  });

  it('towerMove follows a shortest route to a tower', () => {
    const rng = new Rng(5);
    for (let t = 0; t < 200; t++) {
      const n = rng.int(1, 6);
      const peg = rng.int(0, 2);
      let pos = Array.from({ length: n }, () => rng.int(0, 2));
      const dist = distances(new Array<number>(n).fill(peg));
      expect(towerCost(pos, n - 1, peg)).toBe(dist[code(pos)]);
      for (let m = towerMove(pos, n - 1, peg); m; m = towerMove(pos, n - 1, peg)) {
        expect(legal(pos, m.from, m.to)).toEqual(m);
        const next = apply(pos, m);
        expect(dist[code(next)]).toBe(dist[code(pos)] - 1);
        pos = next;
      }
      expect(dist[code(pos)]).toBe(0);
    }
  });

  it.each([1, 2, 3, 4, 5] as Difficulty[])('level %i never starts solved and gets longer', (d) => {
    for (let seed = 1; seed <= 15; seed++) {
      const r = genRings(new Rng(seed), d);
      const k = r.dist[code(r.start)];
      expect(k).toBeGreaterThan(0);
      expect(k).toBeGreaterThanOrEqual([7, 9, 13, 24, 42][d - 1] - 3);
    }
  });
});

describe('rings guide', () => {
  it.each([1, 2, 3, 4, 5] as Difficulty[])('hints solve level %i in the fewest moves', (d) => {
    for (let seed = 1; seed <= 4; seed++) {
      const g = mountGame('rings', d, seed * 101 + d, { attach: true });
      const best = genRings(new Rng(seed * 101 + d), d);
      const want = best.dist[code(best.start)];
      let steps = 0;
      for (let h = g.inst.hint?.(); h && steps < 200; h = g.inst.hint?.()) {
        h.play();
        steps++;
      }
      expect(g.outcome).toBe('solved');
      expect(steps).toBe(want);
      g.root.remove();
    }
  });
});
