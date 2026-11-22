// @vitest-environment happy-dom
/**
 * Hint button for the movekit-solver games (slide, unblock, push, tether, worms, tilt, arrows, week),
 * from boards messed up harder than `hints.test.ts` does: random arrow keys and Tab (the keyboard
 * moves exercise what drags do) mixed with taps, at every level. The button must finish the puzzle
 * (or say why it can't) and every check()/hint() call must stay fast.
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

const IDS = ['slide', 'unblock', 'push', 'tether', 'worms', 'tilt', 'arrows', 'week'];
const ONLY = (process.env.ONLY ?? '').split(',').filter(Boolean);
/** Generous for happy-dom; a browser is several times faster. */
const SLOW_MS = 800;
const KEYS = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'Tab', ' ', 'e'];

function make(id: string, d: Difficulty, seed: number) {
  const def = PUZZLES.find((p) => p.id === id)!;
  const root = document.createElement('div');
  document.body.append(root);
  let outcome: '' | 'solved' | 'failed' = '';
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

function mess(g: ReturnType<typeof make>, rng: Rng, n: number) {
  for (let k = 0; k < n && !g.outcome(); k++) {
    if (g.inst.onKey && rng.int(0, 2) > 0) {
      g.inst.onKey(new KeyboardEvent('keydown', { key: rng.pick(KEYS) }));
      continue;
    }
    // Taps only on the board: Undo / Restart buttons would just tidy up.
    const els = [...g.root.querySelectorAll<HTMLElement>('.cell, [data-i], .tile, .card, .key')];
    if (!els.length) continue;
    rng.pick(els).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }
}

/** Runs `f`, noting in `problems` when it took longer than SLOW_MS. */
function timed<T>(problems: string[], what: string, f: () => T): T {
  const t = performance.now();
  const r = f();
  const ms = performance.now() - t;
  if (ms >= SLOW_MS) problems.push(`${what} took ${Math.round(ms)} ms`);
  return r;
}

describe.each(IDS.filter((id) => !ONLY.length || ONLY.includes(id)))('%s', (id) => {
  it.each([1, 2, 3, 4, 5] as Difficulty[])('hint button recovers from a messy board, level %i', (d) => {
    const problems: string[] = [];
    for (let seed = 1; seed <= 3; seed++) {
      const g = make(id, d, seed * 6151 + d);
      mess(g, new Rng(seed * 97 + d), 30 + seed * 20);
      if (g.outcome()) {
        g.destroy();
        continue;
      }
      const log: string[] = [];
      let last: Hint | null = null;
      for (let step = 0; step < 900 && !g.outcome(); step++) {
        const h = timed(problems, 'check()', () => g.inst.check?.() ?? null) ?? timed(problems, 'hint()', () => g.inst.hint?.() ?? null);
        if (!h) break;
        log.push(`[${h.kind ?? 'step'}] ${h.text}`);
        last = h;
        h.play();
      }
      // Ending without a solve is only fine when the button said why (a dead end it can't back out of).
      if (g.outcome() !== 'solved' && last?.kind !== 'stuck')
        problems.push(`seed ${seed}: ended ${g.outcome() || 'unsolved'} after\n${log.slice(-5).join('\n')}`);
      g.destroy();
    }
    expect(problems).toEqual([]);
  });
});
