// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { LEVELS, type PuzzleCtx } from '../src/core/types';
import { PUZZLES } from '../src/puzzles';
import { WORDS } from '../src/puzzles/words';

// happy-dom lacks a few APIs some puzzles touch.
(globalThis as any).ResizeObserver ??= class {
  observe() {}
  disconnect() {}
};
(globalThis as any).matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

function ctx(d: (typeof LEVELS)[number], seed: number) {
  const root = document.createElement('div');
  const events: string[] = [];
  const c: PuzzleCtx = {
    difficulty: d,
    rng: new Rng(seed),
    root,
    solved: () => events.push('solved'),
    failed: () => events.push('failed'),
    mistake: () => events.push('mistake'),
    touch: () => {},
    status: () => {},
    lives: () => {},
    controls: () => {},
  };
  return { c, root, events };
}

describe.each(PUZZLES.map((p) => [p.id, p] as const))('%s', (_id, def) => {
  it.each(LEVELS)('generates quickly and unsolved at level %i', (d) => {
    for (let seed = 1; seed <= 15; seed++) {
      const time = () => {
        const run = ctx(d, seed * 7919 + d);
        const t = performance.now();
        const inst = def.create(run.c) || {};
        return { ...run, inst, ms: performance.now() - t };
      };
      // Generation is deterministic, so a slow seed is timed again: test files run in parallel, and a busy
      // CI runner can stall a worker for a second or more. A generator that is really too slow stays slow.
      let r = time();
      if (r.ms >= 1500) {
        r.inst.destroy?.();
        const again = time();
        if (again.ms < r.ms) r = again;
      }
      const { root, events, inst, ms } = r;
      expect(ms, `seed ${seed} took ${ms.toFixed(0)}ms`).toBeLessThan(1500);
      expect(root.childElementCount).toBeGreaterThan(0);
      expect(events).toEqual([]);
      inst.destroy?.();
    }
  });

  it('explains at least one move in the guide, without mistakes', () => {
    // Same board as the "?" walkthrough: Easy, fixed seed.
    const { c, root, events } = ctx(1, 0x5eed);
    const inst = def.create(c) || {};
    expect(inst.hint, 'instance.hint() is missing').toBeTypeOf('function');
    let steps = 0;
    for (let hint = inst.hint!(); hint && steps < 6; hint = inst.hint!(), steps++) {
      expect(hint.text.length).toBeGreaterThan(10);
      expect(hint.at.length).toBeGreaterThan(0);
      for (const el of [...hint.at, ...(hint.why ?? [])]) expect(root.contains(el)).toBe(true);
      hint.play();
    }
    expect(steps).toBeGreaterThan(0);
    expect(events.filter((e) => e !== 'solved')).toEqual([]);
    inst.destroy?.();
  });
});

describe('words', () => {
  it('has enough words of every anagram length', () => {
    for (const len of [4, 5, 6, 7, 8]) expect(WORDS[len].length).toBeGreaterThan(80);
  });
});
