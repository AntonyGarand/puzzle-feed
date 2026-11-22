// @vitest-environment happy-dom
/**
 * The in-game hint button asks `check()` (what's wrong) and then `hint()` (next step). These tests
 * play whole puzzles with nothing but that button, from a fresh board and from a board messed up by
 * random taps, and check that it never lies, never hangs and (for games of pure logic) always finishes.
 *
 * `ONLY=sudoku,push npx vitest run test/hints.test.ts` runs a few games.
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { Difficulty, Hint, PuzzleCtx, PuzzleDef, PuzzleInstance } from '../src/core/types';
import { PUZZLES } from '../src/puzzles';

(globalThis as any).ResizeObserver ??= class {
  observe() {}
  disconnect() {}
};
(globalThis as any).matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

/**
 * Games the button can't always finish, and why. Every other game must be solved by the button
 * alone from any position (a fresh board or one messed up by random taps).
 */
const MAY_NOT_FINISH: Record<string, string> = {
  // Luck: some boards need a guess, and random taps can lose the game before the button is pressed.
  mines: 'luck',
  'shape-mines': 'luck',
  // Card games: the guide plays a strategy, not a solver, so some deals end without a win.
  solitaire: 'cards strategy',
  spider: 'cards strategy',
  pyramid: 'cards strategy',
  freecell: 'cards strategy',
  // Random taps can end these before the button is pressed (out of moves, lost).
  flood: 'move limit',
  // Random pieces and no undo: the planner keeps the board open but can't always survive Master.
  blocks: 'random pieces',
  'hidden-rule': 'random taps can lose',
};

/** Longest a single check()/hint() may take, in ms (happy-dom is slower than a browser). */
const SLOW_MS = 1500;
const MAX_STEPS = 900;
/** Each test plays several whole games: allow more than vitest's 5 s default when files run in parallel. */
const TEST_MS = 30_000;

function make(def: PuzzleDef, d: Difficulty, seed: number) {
  const root = document.createElement('div');
  document.body.append(root);
  let outcome: '' | 'solved' | 'failed' = '';
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
    lives: () => {},
    controls: (...els) => root.append(...els),
  };
  const inst: PuzzleInstance = def.create(ctx) || {};
  inst.activate?.();
  return {
    root,
    inst,
    outcome: () => outcome,
    destroy() {
      inst.destroy?.();
      root.remove();
    },
  };
}

/** Random taps and short drags on anything that looks interactive. */
function mess(root: HTMLElement, rng: Rng, n: number, done: () => boolean) {
  for (let k = 0; k < n && !done(); k++) {
    const els = [...root.querySelectorAll<HTMLElement>('button, .cell, [data-i], [data-k], .key, .chip, .tile, .card, circle, rect')];
    if (!els.length) return;
    const el = rng.pick(els);
    if (rng.int(0, 3) === 0) {
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, button: 0 }));
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, button: 0 }));
    }
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }
}

function timed<T>(what: string, f: () => T): T {
  const t = performance.now();
  const r = f();
  const ms = performance.now() - t;
  expect(ms, `${what} took ${Math.round(ms)} ms`).toBeLessThan(SLOW_MS);
  return r;
}

/** Press the hint button and follow it until the game ends or it has nothing to say. */
function assist(g: ReturnType<typeof make>, opts: { cleanStart: boolean }) {
  const log: string[] = [];
  let last: Hint | null = null;
  for (let step = 0; step < MAX_STEPS && !g.outcome(); step++) {
    const c = g.inst.check ? timed('check()', () => g.inst.check!()) : null;
    // Following the guide from a clean board never walks into a mistake.
    expect(opts.cleanStart ? c : null, `check() flagged a board the guide played: ${c?.text}\n${log.slice(-4).join('\n')}`).toBeNull();
    const h = c ?? (g.inst.hint ? timed('hint()', () => g.inst.hint!()) : null);
    if (!h) break;
    expect(h.text.length, 'hint text').toBeGreaterThan(5);
    expect(Array.isArray(h.at), 'hint.at').toBe(true);
    log.push(`[${h.kind ?? 'step'}] ${h.text}`);
    last = h;
    h.play();
  }
  return { log, last };
}

const ONLY = (process.env.ONLY ?? '').split(',').filter(Boolean);
const games = PUZZLES.filter((p) => !ONLY.length || ONLY.includes(p.id));

describe.each(games.map((p) => [p.id, p] as const))('%s hint button', (id, def) => {
  const mustFinish = !MAY_NOT_FINISH[id];

  it.each([1, 3, 5] as Difficulty[])(
    'finishes a fresh board, level %i',
    (d) => {
      for (let seed = 1; seed <= 2; seed++) {
        const g = make(def, d, seed * 7919 + d);
        if (!g.inst.hint && !g.inst.check) return g.destroy();
        const { log } = assist(g, { cleanStart: true });
        const ok = !mustFinish || g.outcome() === 'solved';
        expect(ok, `seed ${seed}: ended unsolved with\n${log.slice(-5).join('\n')}`).toBe(true);
        g.destroy();
      }
    },
    TEST_MS,
  );

  it.each([1, 3, 5] as Difficulty[])(
    'recovers from random taps, level %i',
    (d) => {
      for (let seed = 1; seed <= 3; seed++) {
        const g = make(def, d, seed * 104729 + d);
        if (!g.inst.hint && !g.inst.check) return g.destroy();
        mess(g.root, new Rng(seed * 31 + d), 25, () => !!g.outcome());
        if (g.outcome()) {
          g.destroy();
          continue;
        }
        const { log, last } = assist(g, { cleanStart: false });
        // Ending without a solve is only fine when the button said why (a dead end it can't back out of).
        const ok = !mustFinish || g.outcome() === 'solved' || last?.kind === 'stuck';
        expect(ok, `seed ${seed}: button went quiet on an unsolved board after\n${log.slice(-5).join('\n')}`).toBe(true);
        g.destroy();
      }
    },
    TEST_MS,
  );
});
