// @vitest-environment happy-dom
/**
 * Hint button stress test for the "paths & links" batch: more seeds and heavier random play than
 * test/hints.test.ts, every level, with timing. `ONLY=queens npx vitest run test/hints-pathkit.test.ts`.
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

const IDS = ['arrange', 'beehive', 'connect', 'tracks', 'untangle', 'zigzag', 'maze', 'pipes', 'queens', 'nonogram', 'lights'];
const ONLY = (process.env.ONLY ?? '').split(',').filter(Boolean);
const SEEDS = Number(process.env.SEEDS ?? 4);
const SLOW_MS = 600;

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
    controls: (...els) => root.append(...els),
  };
  const inst: PuzzleInstance = def.create(ctx) || {};
  inst.activate?.();
  return { root, inst, outcome: () => outcome, destroy: () => (inst.destroy?.(), root.remove()) };
}

// Every element reports the same 300×300 box, so pointer coordinates map onto board cells.
Element.prototype.getBoundingClientRect = function () {
  return { left: 0, top: 0, right: 300, bottom: 300, width: 300, height: 300, x: 0, y: 0, toJSON() {} } as DOMRect;
};

const pe = (type: string, x: number, y: number) =>
  new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, clientX: x, clientY: y });

/** Taps, plus pointer drags that wander across the board (the path games are drag-driven). */
function mess(root: HTMLElement, inst: PuzzleInstance, rng: Rng, n: number, done: () => boolean) {
  const KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'x', 'Delete', 'Enter'];
  for (let k = 0; k < n && !done(); k++) {
    if (inst.onKey && rng.int(0, 2) === 0) {
      for (let j = rng.int(1, 4); j > 0; j--) inst.onKey(new KeyboardEvent('keydown', { key: rng.pick(KEYS) }));
      continue;
    }
    const els = [
      ...root.querySelectorAll<HTMLElement>('button:not(.ghost), .cell, [data-i], [data-k], [data-v], .tile, circle, rect, svg'),
    ];
    if (!els.length) return;
    const el = rng.pick(els);
    const kind = rng.int(0, 2);
    let x = rng.int(2, 298),
      y = rng.int(2, 298);
    if (kind === 0) el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
    else {
      el.dispatchEvent(pe('pointerdown', x, y));
      if (kind === 2)
        for (let j = rng.int(1, 12); j > 0; j--) {
          if (rng.int(0, 1)) x = Math.max(1, Math.min(299, x + rng.int(-40, 40)));
          else y = Math.max(1, Math.min(299, y + rng.int(-40, 40)));
          el.dispatchEvent(pe('pointermove', x, y));
        }
      el.dispatchEvent(pe('pointerup', x, y));
      if (kind === 1) el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
    }
  }
}

const stats = { max: 0, fix: 0, stuck: 0, step: 0 };
function timed<T>(what: string, f: () => T): T {
  const t = performance.now();
  const r = f();
  const ms = performance.now() - t;
  stats.max = Math.max(stats.max, ms);
  expect(ms, `${what} took ${Math.round(ms)} ms`).toBeLessThan(SLOW_MS);
  return r;
}

describe.each(IDS.filter((id) => !ONLY.length || ONLY.includes(id)))('%s', (id) => {
  it.each([1, 2, 3, 4, 5] as Difficulty[])('hint button finishes after heavy random play, level %i', (d) => {
    const problems: string[] = [];
    for (let seed = 1; seed <= SEEDS; seed++) {
      for (const taps of [0, 8, 60]) {
        const g = make(id, d, seed * 7717 + d * 13 + taps);
        mess(g.root, g.inst, new Rng(seed * 97 + taps + d), taps, () => !!g.outcome());
        const log: string[] = [];
        let last: Hint | null = null;
        for (let step = 0; step < 1500 && !g.outcome(); step++) {
          const c = g.inst.check ? timed('check()', () => g.inst.check!()) : null;
          // Following the guide from a clean board never walks into a mistake.
          if (c && !taps) problems.push(`seed ${seed}: check() flagged the guide's own board: ${c.text}`);
          const h = c ?? (g.inst.hint ? timed('hint()', () => g.inst.hint!()) : null);
          if (!h) break;
          log.push(`[${h.kind ?? 'step'}] ${h.text}`);
          stats[h.kind ?? 'step']++;
          last = h;
          h.play();
          // A fix must change something: the same complaint twice in a row means play() did nothing.
          const again = c && g.inst.check!();
          if (c && again?.text === c.text && again.at[0] === c.at[0]) problems.push(`seed ${seed}: fix did nothing: ${c.text}`);
        }
        if (g.outcome() !== 'solved' && last?.kind !== 'stuck')
          problems.push(`seed ${seed} taps ${taps}: unsolved after\n${log.slice(-5).join('\n')}`);
        g.destroy();
      }
    }
    expect(problems).toEqual([]);
    if (process.env.STATS)
      console.log(
        id,
        d,
        JSON.stringify(stats, (k, v) => (k === 'max' ? Math.round(v) : v)),
      );
    Object.assign(stats, { max: 0, fix: 0, stuck: 0, step: 0 });
  });
});
