// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/core/types';
import { PUZZLES } from '../src/games';
import { WORDS } from '../src/kits/word/words';
import { mountGame } from './support/mount';

/** Generation budget per board. Coverage instrumentation slows everything down, so it isn't timed then. */
const GEN_LIMIT_MS = process.env['COVERAGE'] ? Infinity : 1500;

describe.each(PUZZLES.map((p) => [p.id, p] as const))('%s', (_id, def) => {
  it.each(LEVELS)('generates quickly and unsolved at level %i', (d) => {
    for (let seed = 1; seed <= 15; seed++) {
      const time = () => {
        const t = performance.now();
        const g = mountGame(def, d, seed * 7919 + d);
        return { ...g, ms: performance.now() - t };
      };
      // Generation is deterministic, so a slow seed is timed again: test files run in parallel, and a busy
      // CI runner can stall a worker for a second or more. A generator that is really too slow stays slow.
      let r = time();
      if (r.ms >= GEN_LIMIT_MS) {
        r.inst.destroy?.();
        const again = time();
        if (again.ms < r.ms) r = again;
      }
      const { root, events, inst, ms } = r;
      expect(ms, `seed ${seed} took ${ms.toFixed(0)}ms`).toBeLessThan(GEN_LIMIT_MS);
      expect(root.childElementCount).toBeGreaterThan(0);
      expect(events).toEqual([]);
      inst.destroy?.();
    }
  });

  it('explains at least one move in the guide, without mistakes', () => {
    // Same board as the "?" walkthrough: Easy, fixed seed.
    const { root, events, inst } = mountGame(def, 1, 0x5eed);
    expect(inst.hint, 'instance.hint() is missing').toBeTypeOf('function');
    let steps = 0;
    for (let hint = inst.hint!(); hint && steps < 6; hint = inst.hint!(), steps++) {
      expect(hint.text.length).toBeGreaterThan(10);
      expect(hint.at.length).toBeGreaterThan(0);
      for (const el of [...hint.at, ...(hint.why ?? [])]) expect(root.contains(el)).toBe(true);
      hint.play();
    }
    expect(steps).toBeGreaterThan(0);
    expect(events.filter((e) => e !== 'solved' && e !== 'reached')).toEqual([]);
    inst.destroy?.();
  });
});

describe('words', () => {
  it('has enough words of every anagram length', () => {
    for (const len of [4, 5, 6, 7, 8]) expect(WORDS[len].length).toBeGreaterThan(80);
  });
});
