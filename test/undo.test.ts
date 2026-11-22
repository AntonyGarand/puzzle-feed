// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { Difficulty, PuzzleDef } from '../src/core/types';
import { PUZZLES } from '../src/games';
import { mountGame } from './support/mount';

function make(def: PuzzleDef, d: Difficulty, seed: number, saved?: unknown) {
  const g = mountGame(def, d, seed, { saved });
  const { root, inst } = g;
  return { root, inst, events: g.events };
}

const snap = (inst: { snapshot?(): unknown }) => JSON.stringify(inst.snapshot?.() ?? null);

// The card's Undo re-creates the game from an earlier snapshot: that must give back exactly that
// state, without side effects, or undo would add a phantom step or count a mistake.
const undoable = PUZZLES.filter((p) => p.undo);

describe('undo', () => {
  it('is enabled for some games, none of which have their own Undo button', () => {
    expect(undoable.length).toBeGreaterThan(10);
    for (const def of undoable) {
      const { root } = make(def, 1, 1);
      const own = [...root.querySelectorAll('button')].some((b) => /^(Undo|Annuler)$/.test(b.textContent ?? ''));
      expect(own, def.id).toBe(false);
    }
  });

  describe.each(undoable.map((p) => [p.id, p] as const))('%s', (_id, def) => {
    it.each([1, 3] as Difficulty[])('level %i restores earlier states exactly', (d) => {
      for (let seed = 21; seed < 24; seed++) {
        const a = make(def, d, seed);
        const states = [snap(a.inst)];
        const pick = new Rng(seed * 17);
        for (let k = 0; k < 5 && !a.events.includes('solved'); k++) {
          const targets = [...a.root.querySelectorAll<HTMLElement>('button, .cell')];
          if (!targets.length) break;
          pick.pick(targets).click();
          states.push(snap(a.inst));
        }
        for (const s of states) {
          const b = make(def, d, seed, JSON.parse(s));
          expect(snap(b.inst)).toBe(s);
          expect(b.events).toEqual([]);
        }
      }
    });
  });
});
