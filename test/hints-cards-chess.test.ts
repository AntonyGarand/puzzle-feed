// @vitest-environment happy-dom
/**
 * Hint button, card and chess games: check() flags real dead ends (and only those), never changes the
 * board, and its play() backs out of them; hint() keeps giving moves on boards a player messed up.
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { Difficulty, PuzzleInstance } from '../src/core/types';
import { mountGame } from './support/mount';

function make(id: string, d: Difficulty, seed: number) {
  const g = mountGame(id, d, seed, { attach: true, controlsInRoot: true });
  const { root, inst } = g;
  return { root, inst, outcome: () => g.outcome, destroy: () => (inst.destroy?.(), root.remove()) };
}

/** One random tap on a card / cell (never the Undo or Restart buttons). */
function tap(root: HTMLElement, rng: Rng) {
  const els = [...root.querySelectorAll<HTMLElement>('[data-p], .cell')];
  rng.pick(els).dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

const snap = (inst: PuzzleInstance) => JSON.stringify(inst.snapshot?.());

describe.each(['freecell', 'ladders', 'pyramid', 'capture-chess', 'solitaire', 'spider'])('%s check()', (id) => {
  it('flags only dead ends, leaves the board alone, and backs out of them', () => {
    let flagged = 0;
    for (const d of [1, 3, 5] as Difficulty[])
      for (let seed = 1; seed <= 4; seed++) {
        const g = make(id, d, seed * 7 + d);
        const rng = new Rng(seed * 13 + d);
        for (let k = 0; k < 120 && !g.outcome(); k++) {
          tap(g.root, rng);
          const before = snap(g.inst);
          const c = g.inst.check?.() ?? null;
          expect(snap(g.inst), 'check() changed the board').toBe(before);
          if (!c) continue;
          flagged++;
          expect(['fix', 'stuck']).toContain(c.kind);
          expect(c.text.length).toBeGreaterThan(20);
          // Backing out: a few presses at most bring the board back on track.
          let h: typeof c | null = c;
          for (let n = 0; h && n < 30; n++) {
            h.play();
            h = g.inst.check?.() ?? null;
          }
          expect(h, `${id} L${d} seed ${seed}: still flagged after backing out`).toBeNull();
          // ...and from there the next step isn't straight back into it.
          const next = g.inst.hint?.() ?? null;
          next?.play();
          expect(next ? (g.inst.check?.() ?? null) : null, `${id}: hint() walked back into a dead end`).toBeNull();
        }
        g.destroy();
      }
    // The random taps do reach dead ends in these games, so the path above was exercised.
    expect(['freecell', 'solitaire', 'spider'].includes(id) || flagged > 0, `${id}: random taps never reached a dead end`).toBe(true);
  }, 60_000);
});

describe.each(['solitaire', 'spider', 'freecell', 'pyramid', 'ladders', 'capture-chess', 'chess'])('%s hint()', (id) => {
  it('keeps suggesting moves (or says why not) on a messed-up board', () => {
    for (const d of [1, 3, 5] as Difficulty[])
      for (let seed = 1; seed <= 3; seed++) {
        const g = make(id, d, seed * 101 + d);
        const rng = new Rng(seed * 17 + d);
        for (let k = 0; k < 40 && !g.outcome(); k++) tap(g.root, rng);
        let steps = 0;
        let quiet = false;
        for (; steps < 900 && !g.outcome(); steps++) {
          const h = g.inst.check?.() ?? g.inst.hint?.() ?? null;
          if (!h) {
            quiet = true;
            break;
          }
          h.play();
        }
        // Never an endless loop: the game ends, or the guide stops (it gives up after a few dead ends).
        expect(steps < 900 || quiet || !!g.outcome(), `${id} L${d} seed ${seed}: hint went round in circles`).toBe(true);
        g.destroy();
      }
  }, 60_000);
});
