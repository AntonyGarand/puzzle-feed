// @vitest-environment happy-dom
/**
 * Hint button on the logickit games, from boards messed up the way a player would: drags across
 * the grid, keyboard entries, taps. check() must never change the board, the button must never go
 * quiet on an unsolved board, and following it must always finish the puzzle.
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { Difficulty, PuzzleCtx, PuzzleInstance } from '../src/core/types';
import { PUZZLES } from '../src/puzzles';

(globalThis as any).ResizeObserver ??= class {
  observe() {}
  disconnect() {}
};
(globalThis as any).matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

const IDS = ['fill', 'galaxies', 'stars', 'tents', 'tetrominoes', 'tiles', 'haunted', 'bridges', 'logic-grid'];
const KEYS = ['1', '2', '3', '4', '5', '6', 'g', 'v', 'z', 'x', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

function make(id: string, d: Difficulty, seed: number) {
  const def = PUZZLES.find((p) => p.id === id)!;
  const root = document.createElement('div');
  document.body.append(root);
  let outcome = '';
  const ctx: PuzzleCtx = {
    difficulty: d,
    rng: new Rng(seed),
    root,
    solved: () => (outcome ||= 'solved'),
    failed: () => (outcome ||= 'failed'),
    mistake() {},
    touch() {},
    status() {},
    lives: () => {},
    controls: (...els) => root.append(...els),
  };
  const inst: PuzzleInstance = def.create(ctx) || {};
  inst.activate?.();
  return { root, inst, outcome: () => outcome, destroy: () => (inst.destroy?.(), root.remove()) };
}

const ptr = (el: Element, type: string) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0 }));

/** Drags along neighbouring cells, keyboard entries and taps. */
function mess(g: ReturnType<typeof make>, rng: Rng, n: number) {
  const byI = new Map<number, Element>();
  for (const el of g.root.querySelectorAll('[data-i]')) byI.set(Number(el.getAttribute('data-i')), el);
  const ids = [...byI.keys()];
  const w = Math.max(1, Math.round(Math.sqrt(ids.length)));
  for (let k = 0; k < n && !g.outcome(); k++) {
    const r = rng.int(0, 2);
    if (r === 0 && ids.length) {
      // A drag through a few neighbouring cells (or two far islands for bridges).
      let i = rng.pick(ids);
      ptr(byI.get(i)!, 'pointerdown');
      for (let s = rng.int(1, 4); s > 0; s--) {
        const j = rng.chance(0.3) ? rng.pick(ids) : i + rng.pick([1, -1, w, -w]);
        if (!byI.has(j)) continue;
        i = j;
        ptr(byI.get(i)!, 'pointermove');
      }
      ptr(byI.get(i)!, 'pointerup');
    } else if (r === 1 && g.inst.onKey) {
      if (ids.length) byI.get(rng.pick(ids))!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      g.inst.onKey(new KeyboardEvent('keydown', { key: rng.pick(KEYS) }));
    } else {
      const els = [...g.root.querySelectorAll<HTMLElement>('button, .cell, [data-i]')];
      if (els.length) rng.pick(els).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  }
}

const snap = (inst: PuzzleInstance) => JSON.stringify(inst.snapshot?.() ?? null);

describe.each(IDS)('%s hint button after player mistakes', (id) => {
  it.each([1, 2, 3, 4, 5] as Difficulty[])('level %i', (d) => {
    for (let seed = 1; seed <= 4; seed++) {
      const g = make(id, d, seed * 7717 + d);
      mess(g, new Rng(seed * 97 + d), 40);
      const log: string[] = [];
      for (let step = 0; step < 900 && !g.outcome(); step++) {
        const before = snap(g.inst);
        let t = performance.now();
        const c = g.inst.check?.() ?? null;
        expect(performance.now() - t, 'check() time').toBeLessThan(800);
        expect(snap(g.inst), 'check() changed the board').toBe(before);
        t = performance.now();
        const h = c ?? g.inst.hint?.() ?? null;
        expect(performance.now() - t, 'hint() time').toBeLessThan(800);
        expect(h, `seed ${seed}: button went quiet on an unsolved board after\n${log.slice(-4).join('\n')}`).not.toBeNull();
        log.push(`[${h!.kind ?? 'step'}] ${h!.text}`);
        h!.play();
      }
      expect(g.outcome(), `seed ${seed}:\n${log.slice(-4).join('\n')}`).toBe('solved');
      g.destroy();
    }
  });
});
