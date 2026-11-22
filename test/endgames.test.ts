// @vitest-environment happy-dom
// Dead ends and lost positions: games must notice them (end the card, or say so when Undo can fix it).
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { LEVELS } from '../src/core/types';
import { outOfReach } from '../src/games/flood/index';
import { pairs } from '../src/games/pairs/index';
import { genGems, ROCK, slide, solveGems } from '../src/games/gems/gen';
import { stranded } from '../src/games/collapse/gen';
import { solvePush } from '../src/games/push/hint';
import { generateRoom, stepper, stuckCrates } from '../src/kits/move/pushgen';
import { target } from '../src/games/target/index';
import { tower } from '../src/games/tower/index';
import { trail } from '../src/games/trail/index';
import { mountGame } from './support/mount';

describe('flood', () => {
  it('is lost as soon as more colours remain than moves', () => {
    // 2×2 board: the corner area is colour 0, three other colours remain.
    expect(outOfReach([0, 1, 2, 3], 2, 2)).toBe(true);
    expect(outOfReach([0, 1, 2, 3], 2, 3)).toBe(false);
    // The corner area itself doesn't count: only colour 1 is left outside it.
    expect(outOfReach([0, 0, 0, 1], 2, 1)).toBe(false);
  });
});

describe('collapse', () => {
  it('counts the last block of a colour as stranded', () => {
    expect(
      stranded([
        [0, 1, 1],
        [0, 2],
      ]),
    ).toBe(1);
    expect(
      stranded([
        [0, 0],
        [1, 1],
      ]),
    ).toBe(0);
  });
});

describe('push', () => {
  it('flags a crate in a non-target corner and a frozen 2×2 block', () => {
    const w = 5,
      h = 5;
    const floor = new Array<boolean>(w * h).fill(true);
    expect(stuckCrates(w, h, floor, [12], [0])).toEqual([0]);
    expect(stuckCrates(w, h, floor, [12], [7])).toEqual([]);
    // Two crates side by side against the top wall: neither can move.
    expect(stuckCrates(w, h, floor, [12, 13], [1, 2]).sort((a, b) => a - b)).toEqual([1, 2]);
    // ...unless they're both home.
    expect(stuckCrates(w, h, floor, [1, 2], [1, 2])).toEqual([]);
  });

  it('never flags a crate on a generated room or along its solution', () => {
    const cfg: [number, number, number, number][] = [
      [6, 6, 1, 5],
      [7, 6, 2, 9],
      [7, 7, 3, 12],
    ];
    for (const [w, h, nb, minPush] of cfg)
      for (let seed = 1; seed <= 8; seed++) {
        const r = generateRoom(new Rng(seed), w, h, nb, minPush, 20000, 150);
        const sol = solvePush(w, h, r.floor, r.targets, r.boxes, r.player)!;
        expect(sol).not.toBeNull();
        const step = stepper(w, h);
        const boxes = r.boxes.slice();
        expect(stuckCrates(w, h, r.floor, r.targets, boxes)).toEqual([]);
        for (const { box, dir } of sol) {
          boxes[boxes.indexOf(box)] = step(box, dir);
          expect(stuckCrates(w, h, r.floor, r.targets, boxes)).toEqual([]);
        }
      }
  });
});

describe('gems', () => {
  it('finds the rest of a shortest route from any point on it', () => {
    for (const d of LEVELS)
      for (let seed = 1; seed <= 5; seed++) {
        const P = genGems(new Rng(seed * 31 + d), d);
        let at = P.start;
        const got = new Set<number>();
        P.path.forEach((dir, k) => {
          expect(solveGems(P.n, P.cell, at, P.gems, got)!.length).toBe(P.path.length - k);
          const s = slide(P.n, P.cell, at, dir);
          for (const x of s) if (P.gems.includes(x)) got.add(x);
          at = s[s.length - 1];
        });
      }
  });

  it('reports a gem walled off by rocks as unreachable', () => {
    const cell = new Uint8Array(9);
    for (const i of [1, 3, 5, 7]) cell[i] = ROCK;
    expect(solveGems(3, cell, 0, [4])).toBeNull();
  });
});

describe('pairs', () => {
  it('ends the game once fewer tries are left than pairs to find', () => {
    const g = mountGame(pairs, 5, 42);
    const cards = [...g.root.querySelectorAll<HTMLElement>('.pc')];
    const face = (i: number) => cards[i].querySelector('.pc-face')!.innerHTML;
    const np = cards.length / 2;
    // Two disjoint mismatched pairs, used in turn (tapping a card of the pair still showing only hides it).
    const b = cards.findIndex((_, i) => i > 0 && face(i) !== face(0));
    const c = cards.findIndex((_, i) => i !== 0 && i !== b);
    const e = cards.findIndex((_, i) => i !== 0 && i !== b && i !== c && face(i) !== face(c));
    const misses = [
      [0, b],
      [c, e],
    ];
    let tries = 0;
    while (!g.events.includes('failed') && tries < 40) {
      for (const i of misses[tries % 2]) cards[i].click();
      tries++;
    }
    // 40 tries for 18 pairs: after 23 misses only 17 remain.
    expect(g.events).toContain('failed');
    expect(tries).toBe(40 - np + 1);
  });
});

describe('target', () => {
  type Op = (a: number, b: number) => number | null;
  const ops: Op[] = [(a, b) => a + b, (a, b) => (a - b > 0 ? a - b : null), (a, b) => a * b, (a, b) => (b && a % b === 0 ? a / b : null)];
  const reach = (vs: number[], goal: number): boolean =>
    vs.length === 1
      ? vs[0] === goal
      : vs.some((a, i) =>
          vs.some((b, j) => {
            if (i === j) return false;
            const rest = vs.filter((_, k) => k !== i && k !== j);
            return ops.some((o) => {
              const v = o(a, b);
              return v != null && reach([...rest, v], goal);
            });
          }),
        );

  it('says so when the target can no longer be reached', () => {
    let flagged = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const g = mountGame(target, 2, seed);
      const goal = Number(g.root.querySelector('.big')!.textContent);
      const undo = g.controls[0];
      const chips = () => [...g.root.querySelectorAll<HTMLElement>('.chip')];
      const keys = () => [...g.root.querySelectorAll<HTMLElement>('.pad .key')];
      const n = chips().length;
      for (let a = 0; a < n; a++)
        for (let b = 0; b < n; b++)
          for (let o = 0; o < 4; o++) {
            if (a === b) continue;
            chips()[a].click();
            keys()[o].click();
            chips()[b].click();
            const vs = chips().map((c) => Number(c.textContent));
            if (vs.length === n) {
              // illegal merge: nothing happened; drop the selection
              chips()
                .find((c) => c.classList.contains('sel'))
                ?.click();
              continue;
            }
            const lost = !reach(vs, goal);
            expect(g.status.includes('out of reach'), `${vs.join(',')} → ${goal}`).toBe(lost);
            if (lost) flagged++;
            undo.click();
          }
    }
    expect(flagged).toBeGreaterThan(0);
  });
});

describe('guides play through to a win', () => {
  it.each([trail, tower].map((p) => [p.id, p] as const))('%s', (_id, def) => {
    for (const d of LEVELS)
      for (let seed = 1; seed <= 4; seed++) {
        const g = mountGame(def, d, seed * 104729 + d * 31);
        for (let k = 0, hint = g.inst.hint!(); hint && k < 300 && g.outcome !== 'solved'; hint = g.inst.hint!(), k++) hint.play();
        expect(g.outcome, `${def.id} level ${d} seed ${seed}`).toBe('solved');
      }
  });
});
