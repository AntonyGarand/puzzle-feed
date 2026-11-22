// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { Difficulty, PuzzleCtx, PuzzleDef } from '../src/core/types';
import { PUZZLES } from '../src/puzzles';

(globalThis as any).ResizeObserver ??= class {
  observe() {}
  disconnect() {}
};
(globalThis as any).matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

function make(def: PuzzleDef, d: Difficulty, seed: number, saved?: unknown) {
  const root = document.createElement('div');
  let done = false;
  const ctx: PuzzleCtx = {
    difficulty: d,
    rng: new Rng(seed),
    root,
    saved,
    solved: () => (done = true),
    failed: () => (done = true),
    mistake() {},
    touch() {},
    status() {},
    lives() {},
    controls() {},
  };
  const inst = def.create(ctx) || {};
  return { root, inst, isDone: () => done };
}

/** Visible board state: classes, text and inline colours. */
const view = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('.cell, .peg, .term, .chip, .big, .dot, .fb i')]
    .map((e) => `${e.className}|${e.textContent}|${e.getAttribute('style') ?? ''}`)
    .join('\n');

// Memory deliberately restarts its reveal on resume (same board, same seed).
describe.each(PUZZLES.filter((p) => p.id !== 'memory').map((p) => [p.id, p] as const))('%s resumes', (_id, def) => {
  it.each([1, 3, 5] as Difficulty[])('level %i', (d) => {
    for (let seed = 11; seed < 16; seed++) {
      const a = make(def, d, seed);
      const pick = new Rng(seed * 31);
      for (let k = 0; k < 6 && !a.isDone(); k++) {
        const buttons = [...a.root.querySelectorAll<HTMLButtonElement>('button')];
        if (!buttons.length) break;
        pick.pick(buttons).click();
      }
      if (a.isDone()) continue; // finished puzzles aren't saved
      const snap = JSON.parse(JSON.stringify(a.inst.snapshot?.() ?? null));
      expect(snap, 'puzzle must implement snapshot()').not.toBeNull();
      const b = make(def, d, seed, snap);
      expect(view(b.root)).toBe(view(a.root));
    }
  });
});
