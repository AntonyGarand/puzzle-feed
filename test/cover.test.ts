// @vitest-environment happy-dom
// Word cover: the hidden words tile the grid exactly, along clean paths, in both languages.
import { afterAll, describe, expect, it } from 'vitest';
import { _setLocaleForTests } from '../src/core/i18n';
import { Rng } from '../src/core/rng';
import { LEVELS } from '../src/core/types';
import { cover } from '../src/games/cover/index';
import { makeCover } from '../src/games/cover/gen';
import { answers } from '../src/kits/word/lexicon';
import { mountGame } from './support/mount';

afterAll(() => _setLocaleForTests('en'));

const SPECS = [
  { cols: 4, rows: 4, lo: 3, hi: 5, kMin: 4, kMax: 4, diag: 3 },
  { cols: 6, rows: 5, lo: 4, hi: 7, kMin: 5, kMax: 6, diag: 0.4 },
  { cols: 6, rows: 6, lo: 5, hi: 8, kMin: 5, kMax: 6, diag: 0 },
];

describe.each(['en', 'fr'] as const)('cover generator (%s)', (loc) => {
  it('partitions the grid into distinct common words along non-crossing paths', () => {
    _setLocaleForTests(loc);
    for (const s of SPECS)
      for (let seed = 1; seed <= 30; seed++) {
        const g = makeCover(new Rng(seed), s);
        const n = s.cols * s.rows;
        const cells = g.paths.flat().sort((a, b) => a - b);
        expect(cells).toEqual(Array.from({ length: n }, (_, i) => i));
        expect(new Set(g.words).size).toBe(g.words.length);
        const diag = new Map<number, number>();
        g.paths.forEach((p, k) => {
          const w = g.words[k];
          expect(w.length).toBeGreaterThanOrEqual(s.lo);
          expect(w.length).toBeLessThanOrEqual(s.hi);
          expect(answers(w.length)).toContain(w);
          expect(p.map((i) => g.letters[i]).join('')).toBe(w);
          for (let j = 1; j < p.length; j++) {
            const [a, b] = [p[j - 1], p[j]];
            const dr = Math.floor(b / s.cols) - Math.floor(a / s.cols);
            const dc = (b % s.cols) - (a % s.cols);
            expect(Math.max(Math.abs(dr), Math.abs(dc))).toBe(1);
            if (dr && dc) {
              const at = Math.min(Math.floor(a / s.cols), Math.floor(b / s.cols)) * s.cols + Math.min(a % s.cols, b % s.cols);
              const bit = dr === dc ? 1 : 2;
              diag.set(at, (diag.get(at) ?? 0) | bit);
            }
          }
        });
        for (const v of diag.values()) expect(v, 'diagonals cross').not.toBe(3);
      }
  });
});

describe('cover game', () => {
  it.each(LEVELS)('the guide solves level %i by tracing every hidden word', (d) => {
    _setLocaleForTests('en');
    for (let seed = 1; seed <= 5; seed++) {
      const { inst, events } = mountGame(cover, d, seed);
      for (let k = 0; k < 20 && !events.length; k++) inst.hint?.()?.play();
      expect(events).toEqual(['solved']);
      expect(inst.hint?.()).toBeNull();
      inst.destroy?.();
    }
  });
});
