// @vitest-environment happy-dom
/**
 * Hint button on the sweep/grid games, from messy positions the random taps of hints.test.ts rarely
 * reach: wrong flags, random shades/dots/lines/✕ (as a drag would leave them), random dominoes.
 * Positions are injected through `ctx.saved`, then the button alone must clean up and finish.
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { Difficulty, PuzzleDef } from '../src/core/types';
import { dominoes } from '../src/puzzles/dominoes';
import { lightUp } from '../src/puzzles/light-up';
import { loop } from '../src/puzzles/loop';
import { mines } from '../src/puzzles/mines';
import { mosaic } from '../src/puzzles/mosaic';
import { mow } from '../src/puzzles/mow';
import { pearls } from '../src/puzzles/pearls';
import { shapeMines } from '../src/puzzles/shape-mines';
import { sightlines } from '../src/puzzles/sightlines';
import { mountGame } from './support/mount';

function make(def: PuzzleDef, d: Difficulty, seed: number, saved?: unknown) {
  const g = mountGame(def, d, seed, { saved, attach: true, controlsInRoot: true });
  const { root, inst } = g;
  inst.activate?.();
  return { root, inst, outcome: () => g.outcome, destroy: () => (inst.destroy?.(), root.remove()) };
}

function assist(g: ReturnType<typeof make>) {
  const log: string[] = [];
  const kinds: string[] = [];
  for (let step = 0; step < 1500 && !g.outcome(); step++) {
    let t = performance.now();
    const c = g.inst.check?.() ?? null;
    expect(performance.now() - t, 'check() slow').toBeLessThan(1500);
    t = performance.now();
    const h = c ?? g.inst.hint?.() ?? null;
    expect(performance.now() - t, 'hint() slow').toBeLessThan(1500);
    if (!h) break;
    log.push(`[${h.kind ?? 'step'}] ${h.text}`);
    kinds.push(h.kind ?? 'step');
    h.play();
  }
  return { log, kinds };
}

/** A random saved position for each game (len = board size from a fresh instance's snapshot). */
const messy: Record<string, (snap: any, rng: Rng) => unknown> = {
  'light-up': (s, rng) => ({ st: s.st.map(() => (rng.int(0, 5) === 0 ? 1 : rng.int(0, 3) === 0 ? 2 : 0)) }),
  sightlines: (s, rng) => ({ st: s.st.map(() => (rng.int(0, 5) === 0 ? 1 : rng.int(0, 3) === 0 ? 2 : 0)), cur: -1 }),
  mosaic: (s, rng) => ({ st: s.st.map(() => rng.int(0, 2)), cur: -1 }),
  loop: (s, rng) => ({ st: s.st.map(() => (rng.int(0, 3) === 0 ? 1 : rng.int(0, 3) === 0 ? 2 : 0)) }),
  pearls: (s, rng) => ({ st: s.st.map(() => (rng.int(0, 3) === 0 ? 1 : rng.int(0, 3) === 0 ? 2 : 0)) }),
  dominoes: (s, rng) => {
    const mate: number[] = s.mate.map(() => -1);
    const N = mate.length;
    const cols = Math.round((1 + Math.sqrt(1 + 4 * N)) / 2); // (n+2)(n+1) = N
    for (let k = 0; k < N; k++) {
      const i = rng.int(0, N - 1);
      const j = rng.chance(0.5) ? (i % cols < cols - 1 ? i + 1 : -1) : i + cols < N ? i + cols : -1;
      if (j < 0 || mate[i] >= 0 || mate[j] >= 0) continue;
      mate[i] = j;
      mate[j] = i;
    }
    return { mate, sel: -1 };
  },
};

const GRID = [lightUp, sightlines, mosaic, loop, pearls, dominoes];

describe.each(GRID.map((p) => [p.id, p] as const))('%s from a messy position', (id, def) => {
  it.each([1, 3, 5] as Difficulty[])('level %i', (d) => {
    for (let seed = 1; seed <= 4; seed++) {
      const fresh = make(def, d, seed * 977 + d);
      const snap = fresh.inst.snapshot!();
      fresh.destroy();
      const g = make(def, d, seed * 977 + d, messy[id](snap, new Rng(seed * 13 + d)));
      const { log, kinds } = assist(g);
      expect(g.outcome(), `seed ${seed}:\n${log.slice(-5).join('\n')}`).toBe('solved');
      // Once the fixes are done, the steps never lead back into a mistake.
      const firstStep = kinds.indexOf('step');
      expect(kinds.slice(firstStep).includes('fix'), log.join('\n')).toBe(false);
      g.destroy();
    }
  });
});

/** Open the board through a click, then plant flags on random closed tiles (wrong ones included). */
describe.each([mines, shapeMines, mow].map((p) => [p.id, p] as const))('%s with wrong flags', (id, def) => {
  it.each([1, 3, 5] as Difficulty[])('level %i', (d) => {
    for (let seed = 1; seed <= 4; seed++) {
      const g = make(def, d, seed * 31 + d);
      const step = g.inst.hint!()!;
      step.play(); // first dig (mines) or a first mow
      const snap = g.inst.snapshot!() as any;
      g.destroy();
      const rng = new Rng(seed);
      const N = g.root.querySelectorAll('[data-i]').length;
      const opened = new Set<number>(snap.open ?? snap.mown);
      const flag = rng.shuffle([...Array(N).keys()].filter((i) => !opened.has(i))).slice(0, 8);
      const h = make(def, d, seed * 31 + d, { ...snap, flag });
      const { log, kinds } = assist(h);
      expect(kinds.filter((k) => k === 'fix').length, log.join('\n')).toBeGreaterThan(0);
      // Mow is pure logic; mines can still need luck, but the button never walks into a loss.
      expect(h.outcome(), log.slice(-4).join('\n')).toMatch(id === 'mow' ? /^solved$/ : /^(solved|)$/);
      h.destroy();
    }
  });
});
