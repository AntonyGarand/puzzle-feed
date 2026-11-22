// @vitest-environment happy-dom
/**
 * check() of the info/word batch: real mistakes and dead ends (set up directly or through a saved
 * game) are flagged with the right kind, play() backs out of them, and the button then finishes.
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { Difficulty, Hint, PuzzleCtx, PuzzleDef, PuzzleInstance } from '../src/core/types';
import { PUZZLES } from '../src/puzzles';
import { isWord, whenDict } from '../src/puzzles/wordkit/lexicon';

(globalThis as any).ResizeObserver ??= class {
  observe() {}
  disconnect() {}
};
(globalThis as any).matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

const def = (id: string) => PUZZLES.find((p) => p.id === id)!;

function make(p: PuzzleDef, d: Difficulty, seed: number, saved?: unknown) {
  const root = document.createElement('div');
  document.body.append(root);
  let outcome = '';
  const ctx: PuzzleCtx = {
    difficulty: d,
    rng: new Rng(seed),
    root,
    saved,
    solved: () => (outcome ||= 'solved'),
    failed: () => (outcome ||= 'failed'),
    mistake() {},
    touch() {},
    status() {},
    controls: (...els) => root.append(...els),
  };
  const inst: PuzzleInstance = p.create(ctx) || {};
  inst.activate?.();
  return { root, inst, outcome: () => outcome, snap: () => JSON.parse(JSON.stringify(inst.snapshot?.() ?? null)) };
}

/** Press the button until the game ends; returns the kinds seen. */
function finish(g: ReturnType<typeof make>) {
  const kinds: string[] = [];
  for (let k = 0; k < 600 && !g.outcome(); k++) {
    const h: Hint | null = g.inst.check?.() ?? g.inst.hint?.() ?? null;
    if (!h) break;
    kinds.push(h.kind ?? 'step');
    h.play();
  }
  return kinds;
}

const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));

describe('target', () => {
  it('flags a dead end as stuck, undoes it, then finishes', () => {
    const kinds: string[] = [];
    const after: unknown[] = [];
    for (let seed = 1; seed <= 30; seed++) {
      const g = make(def('target'), 3, seed);
      const chips = () => [...g.root.querySelectorAll<HTMLElement>('.chip')];
      const keys = () => [...g.root.querySelectorAll<HTMLElement>('.pad .key')];
      // Multiply the two first numbers, then add the next: often off every route.
      click(chips()[0]);
      click(keys()[2]);
      click(chips()[1]);
      const c = g.inst.check!();
      if (c) {
        kinds.push(c.kind ?? 'step');
        c.play();
        after.push(g.inst.check!());
      }
      finish(g);
      expect(g.outcome()).toBe('solved');
    }
    expect(kinds.length).toBeGreaterThan(0);
    expect(new Set(kinds)).toEqual(new Set(['stuck']));
    expect(after.every((x) => x === null)).toBe(true);
  });
});

describe.each(['codebreaker', 'guess'])('%s', (id) => {
  it('flags a row that repeats an earlier guess, clears it, then finishes', () => {
    for (const d of [1, 3, 5] as Difficulty[]) {
      const g = make(def(id), d, 11 + d);
      g.inst.hint!()!.play(); // first guess
      const first = g.snap().guesses[0].g as number[];
      const pad = [...g.root.querySelectorAll<HTMLElement>('.pad .key')];
      for (const v of first) click(id === 'guess' ? pad.find((k) => k.textContent === String(v))! : pad[v]);
      const c = g.inst.check!();
      expect(c?.kind).toBe('fix');
      c!.play();
      expect(g.snap().cur.length).toBeLessThan(first.length);
      finish(g);
      expect(g.outcome()).toBe('solved');
    }
  });
});

describe('word-guess', () => {
  it('flags a grey letter typed again', async () => {
    isWord('zzzz');
    await new Promise<void>((r) => whenDict(r));
    const kinds: string[] = [];
    const after: unknown[] = [];
    for (let seed = 1; seed <= 6; seed++) {
      const g = make(def('word-guess'), 2, seed);
      g.inst.hint!()!.play();
      const w = g.snap().g[0] as string;
      for (const ch of w) g.inst.onKey!(new KeyboardEvent('keydown', { key: ch }));
      const c = g.inst.check!();
      if (c) {
        kinds.push(c.kind ?? 'step');
        c.play();
      }
      finish(g);
      expect(g.outcome()).toBe('solved');
    }
    expect(kinds.length).toBeGreaterThan(0);
    expect(new Set(kinds)).toEqual(new Set(['fix']));
    expect(after.every((x) => x === null)).toBe(true);
  });
});

describe('anagram', () => {
  it('flags a start no word has', () => {
    const kinds: string[] = [];
    const after: unknown[] = [];
    for (let seed = 1; seed <= 10; seed++) {
      const g = make(def('anagram'), 3, seed);
      const tiles = [...g.root.querySelectorAll<HTMLElement>('.tiles .cell')];
      click(tiles[tiles.length - 1]);
      click(tiles[tiles.length - 2]);
      click(tiles[tiles.length - 3]);
      const c = g.inst.check!();
      if (c) {
        kinds.push(c.kind ?? 'step');
        c.play();
        after.push(g.inst.check!());
      }
      finish(g);
      expect(g.outcome()).toBe('solved');
    }
    expect(kinds.length).toBeGreaterThan(0);
    expect(new Set(kinds)).toEqual(new Set(['fix']));
    expect(after.every((x) => x === null)).toBe(true);
  });
});

describe('copy-paste', () => {
  it('flags a board out of pastes and one with a single hopeless paste left', () => {
    const spent: string[] = [];
    for (const d of [2, 3, 5] as Difficulty[]) {
      const fresh = make(def('copy-paste'), d, 5);
      const s0 = fresh.snap();
      const limit = Number(fresh.root.querySelector('.cp-num')!.textContent);
      // A scrambled board (a resumed save) with every paste spent, then with one left.
      const r = new Rng(9);
      const junk = s0.g.map(() => r.int(0, 1));
      for (const used of [limit, limit - 1]) {
        const g = make(def('copy-paste'), d, 5, { g: junk, hist: Array(used).fill(s0.g), clip: null, src: null });
        const c = g.inst.check!();
        expect(['stuck', 'fix'], `level ${d}, ${used} used`).toContain(c?.kind);
        if (used === limit) spent.push(c?.kind ?? '');
        const ks = finish(g);
        expect(g.outcome(), ks.join()).toBe('solved');
      }
    }
    expect(spent).toEqual(['stuck', 'stuck', 'stuck']);
  });
});

describe('factory', () => {
  it('flags a wrong tile and finishes', () => {
    const kinds: string[] = [];
    const after: unknown[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const g0 = make(def('factory'), 4, seed);
      const slots = g0.snap().place.length as number;
      const tiles = g0.root.querySelectorAll('.fx-tray .key').length;
      // Fill the slots with the tray in reverse order.
      const place = Array.from({ length: slots }, (_, s) => tiles - 1 - s);
      const g = make(def('factory'), 4, seed, { place, sel: -1 });
      const c = g.inst.check!();
      if (c) {
        kinds.push(c.kind ?? 'step');
      }
      finish(g);
      expect(g.outcome()).toBe('solved');
    }
    expect(kinds.length).toBeGreaterThan(0);
    expect(new Set(kinds)).toEqual(new Set(['fix']));
    expect(after.every((x) => x === null)).toBe(true);
  });
});

describe('black-box', () => {
  it('flags a ball guess no layout allows', () => {
    const kinds: string[] = [];
    const after: unknown[] = [];
    for (let seed = 1; seed <= 6; seed++) {
      const g = make(def('black-box'), 2, seed);
      // Fire a few rays with the guide, then fill the first cells with guesses.
      for (let k = 0; k < 5; k++) g.inst.hint!()!.play();
      const s = g.snap();
      const g2 = make(def('black-box'), 2, seed, { rays: s.rays, guess: [0, 1, 2, 3, 4, 5], checks: 0 });
      const c = g2.inst.check!();
      if (c) {
        kinds.push(c.kind ?? 'step');
      }
      finish(g2);
      expect(g2.outcome()).toBe('solved');
    }
    expect(kinds.length).toBeGreaterThan(0);
    expect(new Set(kinds)).toEqual(new Set(['fix']));
    expect(after.every((x) => x === null)).toBe(true);
  });
});

describe('cover', () => {
  it('flags a trace no hidden word follows', () => {
    const kinds: string[] = [];
    const after: unknown[] = [];
    for (let seed = 1; seed <= 8; seed++) {
      const g = make(def('cover'), 3, seed, { f: [], r: [], p: [0, 1, 2] });
      const c = g.inst.check!();
      if (c) {
        kinds.push(c.kind ?? 'step');
        c.play();
        after.push(g.inst.check!());
      }
      finish(g);
      expect(g.outcome()).toBe('solved');
    }
    expect(kinds.length).toBeGreaterThan(0);
    expect(new Set(kinds)).toEqual(new Set(['fix']));
    expect(after.every((x) => x === null)).toBe(true);
  });
});

describe('tower', () => {
  it('flags a tower that can no longer reach the top', async () => {
    isWord('zzzz');
    await new Promise<void>((r) => whenDict(r));
    const kinds: string[] = [];
    const after: unknown[] = [];
    for (let seed = 1; seed <= 10; seed++) {
      const g0 = make(def('tower'), 4, seed);
      const ks = finish(g0);
      expect(g0.outcome(), ks.join()).toBe('solved');
      const g = make(def('tower'), 4, seed);
      const typed = (w: string) => {
        for (const ch of w) g.inst.onKey!(new KeyboardEvent('keydown', { key: ch }));
        g.inst.onKey!(new KeyboardEvent('keydown', { key: 'Enter' }));
      };
      // Build floors from the first real word each letter change gives, ignoring the goal.
      const start = [...g.root.querySelectorAll('.tw-base')].map((el) => el.textContent).join('');
      for (let step = 0; step < 2; step++) {
        const rows = g.snap().r as string[];
        const prev = rows[rows.length - 1] ?? start;
        let done = false;
        for (let i = 0; i < prev.length && !done; i++)
          for (let ch = 97; ch <= 122 && !done; ch++) {
            const w = prev.slice(0, i) + String.fromCharCode(ch) + prev.slice(i + 1);
            if (w === prev || w === start || rows.includes(w) || !isWord(w)) continue;
            typed(w);
            done = (g.snap().r as string[]).length > rows.length || !!g.outcome();
            if (!done) while (g.snap().cur.length) g.inst.onKey!(new KeyboardEvent('keydown', { key: 'Backspace' }));
          }
        if (g.outcome()) break;
      }
      if (g.outcome()) continue;
      const c = g.inst.check!();
      if (c) {
        kinds.push(c.kind ?? 'step');
      }
      finish(g);
      expect(g.outcome()).toBe('solved');
    }
    expect(kinds.length).toBeGreaterThan(0);
    expect(new Set(kinds)).toEqual(new Set(['stuck']));
    expect(after.every((x) => x === null)).toBe(true);
  });
});
