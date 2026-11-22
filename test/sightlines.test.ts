// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { Difficulty, PuzzleCtx } from '../src/core/types';
import { countSolutions, genSightlines, rays, sees } from '../src/puzzles/gridkit/sightlines';
import { sightlines } from '../src/puzzles/sightlines';

describe('sightlines', () => {
  it('generates boards with one solution that matches every number', () => {
    for (const n of [5, 7, 9])
      for (let seed = 1; seed <= 10; seed++) {
        const p = genSightlines(n, { density: 0.24, keep: 0 }, new Rng(seed));
        const R = rays(n);
        const numbered = p.clue.flatMap((k, i) => (k ? [i] : []));
        expect(numbered.filter((i) => p.black[i])).toEqual([]);
        expect(numbered.map((i) => sees(R, i, p.black))).toEqual(numbered.map((i) => p.clue[i]));
        expect(countSolutions(n, R, p.clue, 20000).count).toBe(1);
      }
  });

  it('is solved by the guide alone, without guessing', () => {
    for (const d of [1, 3, 5] as Difficulty[])
      for (let seed = 1; seed <= 5; seed++) {
        let done = false;
        const ctx: PuzzleCtx = {
          difficulty: d,
          rng: new Rng(seed * 101 + d),
          root: document.createElement('div'),
          solved: () => (done = true),
          failed() {},
          mistake() {},
          touch() {},
          status() {},
          controls() {},
        };
        const inst = sightlines.create(ctx) || {};
        for (let k = 0, hint = inst.hint!(); hint && k < 200; hint = inst.hint!(), k++) {
          expect(hint.text).not.toMatch(/^No single/);
          hint.play();
        }
        expect(done).toBe(true);
        inst.destroy?.();
      }
  });
});
