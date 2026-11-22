// @vitest-environment happy-dom
// Mounted Busy Week and Arrange: every guide move counts as a player action and can be undone.
import { describe, expect, it } from 'vitest';
import type { Difficulty } from '../src/core/types';
import { mountGame } from './support/mount';

const snap = (g: ReturnType<typeof mountGame>) => JSON.parse(JSON.stringify(g.inst.snapshot!())) as { pos: number[]; rot: number[] };
const button = (g: ReturnType<typeof mountGame>, i: number) => g.controls[i] as HTMLButtonElement;

describe('week', () => {
  it('undoes a rotation', () => {
    const g = mountGame('week', 3, 7);
    (g.root.querySelector('.wk-slot') as HTMLElement).click();
    const before = snap(g).rot;
    button(g, 0).click(); // Rotate
    expect(snap(g).rot).not.toEqual(before);
    button(g, 1).click(); // Undo
    expect(snap(g).rot).toEqual(before);
  });

  it('takes back a guided move (its turns and its drop) in one undo', () => {
    for (const d of [1, 3, 5] as Difficulty[])
      for (let seed = 1; seed <= 6; seed++) {
        const g = mountGame('week', d, seed);
        const before = snap(g);
        g.inst.hint!()!.play();
        expect(snap(g).pos, `d${d} s${seed}`).not.toEqual(before.pos);
        button(g, 1).click();
        expect({ pos: snap(g).pos, rot: snap(g).rot }, `d${d} s${seed}`).toEqual({ pos: before.pos, rot: before.rot });
      }
  });
});

describe('arrange', () => {
  it('counts every hint move as touching the board', () => {
    for (const d of [1, 3, 5] as Difficulty[])
      for (let seed = 1; seed <= 4; seed++) {
        const g = mountGame('arrange', d, seed);
        for (let k = 0; k < 60 && !g.outcome; k++) {
          const hint = g.inst.hint!();
          if (!hint) break;
          const n = g.touches;
          hint.play();
          expect(g.touches, `d${d} s${seed} step ${k}`).toBeGreaterThan(n);
        }
        expect(g.outcome, `d${d} s${seed}`).toBe('solved');
      }
  });
});
