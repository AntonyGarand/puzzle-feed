// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { connect } from '../src/puzzles/connect';
import { mountGame } from './support/mount';

function make(seed: number, saved?: unknown) {
  return mountGame(connect, 3, seed, { saved }).root;
}

describe('connect X marks', () => {
  it('keeps a U-turn line and marks the cell that doubles back', () => {
    for (let seed = 1; seed < 40; seed++) {
      const root = make(seed);
      const n = Math.round(Math.sqrt(root.querySelectorAll('.cell').length));
      // circles come in pairs, one pair per colour
      const dots = [...root.querySelectorAll('circle')].map(
        (e) => (Number(e.getAttribute('cy')!) - 0.5) * n + (Number(e.getAttribute('cx')!) - 0.5),
      );
      const isDot = new Set(dots);
      for (let di = 0; di < dots.length; di++) {
        const d = dots[di];
        const r = Math.floor(d / n),
          c = d % n;
        if (r + 1 >= n || c + 1 >= n) continue;
        // walk the 2x2 square: d → right → down-right → down (back beside d)
        const u = [d, d + 1, d + n + 1, d + n];
        if (u.slice(1).some((v) => isDot.has(v))) continue;
        const paths: number[][] = Array.from({ length: dots.length / 2 }, () => []);
        paths[Math.floor(di / 2)] = u;
        const root2 = make(seed, { paths });
        expect(root2.querySelectorAll('.cell.on').length).toBe(4);
        expect(root2.querySelectorAll('.connect-bad path').length).toBe(1);
        return;
      }
    }
    throw new Error('no board with a free 2x2 next to a dot');
  });
});
