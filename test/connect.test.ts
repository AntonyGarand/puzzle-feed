import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { Difficulty } from '../src/core/types';
import { genConnect, touchesSelf } from '../src/games/connect/gen';
import { adjacent } from '../src/kits/path/grid';

describe('connect', () => {
  it('flags lines that double back alongside themselves', () => {
    // 3x3: 0 1 2 / 3 4 5 / 6 7 8
    expect(touchesSelf([0, 1, 4, 3], 3)).toBe(true); // U: 0 touches 3
    expect(touchesSelf([0, 1, 2, 5, 8], 3)).toBe(false);
    expect(touchesSelf([0, 3, 4, 5, 2], 3)).toBe(false);
    expect(touchesSelf([0, 1, 2, 5, 4], 3)).toBe(true); // 4 touches 1
  });

  it('generates boards whose solution lines never touch themselves', () => {
    for (let d = 1; d <= 5; d++)
      for (let seed = 1; seed <= 10; seed++) {
        const { n, paths } = genConnect(new Rng(seed * 31 + d), d as Difficulty);
        const cells = paths.flat();
        expect(new Set(cells).size).toBe(n * n);
        expect(paths.length).toBe([4, 5, 6, 7, 8][d - 1]);
        for (const p of paths) {
          expect(p.length).toBeGreaterThanOrEqual(3);
          p.slice(1).forEach((v, i) => expect(adjacent(p[i], v, n)).toBe(true));
          expect(touchesSelf(p, n)).toBe(false);
        }
      }
  });
});
