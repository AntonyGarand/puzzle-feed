// @vitest-environment happy-dom
/**
 * Hint button on the play-move games, from boards messed up the way `hints.test.ts` can't: arrow
 * keys (trail paths, lawn drives, gem slides, echo runs, 2048 slides). check() must never change the
 * board, and the button must either finish the puzzle or say why it can't (a `stuck` hint).
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { Difficulty, Hint, PuzzleCtx, PuzzleInstance } from '../src/core/types';
import { PUZZLES } from '../src/puzzles';

(globalThis as any).ResizeObserver ??= class {
  observe() {}
  disconnect() {}
};
(globalThis as any).matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

/** Games messed up with arrow keys (or taps, for pegs and collapse). */
const GAMES = ['trail', 'lawn', 'gems', 'echo', 'pegs', 'collapse'];
const KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'e', 'q', 'z', 'c'];

function make(id: string, d: Difficulty, seed: number) {
  const def = PUZZLES.find((p) => p.id === id)!;
  const root = document.createElement('div');
  document.body.append(root);
  let outcome = '';
  const ctx: PuzzleCtx = {
    difficulty: d,
    rng: new Rng(seed),
    root,
    solved: (o) => {
      if (!o?.keepPlaying || !outcome) outcome ||= 'solved';
    },
    failed: () => (outcome ||= 'failed'),
    mistake() {},
    touch() {},
    status() {},
    controls: (...els) => root.append(...els),
  };
  const inst: PuzzleInstance = def.create(ctx) || {};
  inst.activate?.();
  return { root, inst, outcome: () => outcome };
}

describe.each(GAMES)('%s hint button after arrow keys', (id) => {
  it.each([1, 3, 5] as Difficulty[])('level %i', (d) => {
    for (let seed = 1; seed <= 3; seed++) {
      const g = make(id, d, seed * 7717 + d);
      const rng = new Rng(seed * 13 + d);
      for (let k = 0; k < 24 && !g.outcome(); k++) g.inst.onKey?.(new KeyboardEvent('keydown', { key: rng.pick(KEYS) }));
      // Pegs and collapse have no arrow keys: tap random cells instead.
      const taps = id === 'pegs' || id === 'collapse' ? [...g.root.querySelectorAll<HTMLElement>('[data-i]')] : [];
      for (let k = 0; k < 20 && taps.length && !g.outcome(); k++) rng.pick(taps).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      if (g.outcome()) {
        g.root.remove();
        continue;
      }
      let last: Hint | null = null;
      for (let step = 0; step < 900 && !g.outcome(); step++) {
        const before = JSON.stringify(g.inst.snapshot?.());
        const c = g.inst.check?.() ?? null;
        expect(JSON.stringify(g.inst.snapshot?.()), 'check() changed the board').toBe(before);
        const h = c ?? g.inst.hint?.() ?? null;
        if (!h) break;
        last = h;
        h.play();
      }
      // Ending without a solve is only fine when the button said why.
      expect(g.outcome() === 'solved' || last?.kind === 'stuck', `seed ${seed}: ended without a solve: ${last?.text}`).toBe(true);
      g.inst.destroy?.();
      g.root.remove();
    }
  });
});
