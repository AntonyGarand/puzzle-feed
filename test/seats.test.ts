// Seats' pure rules: venues, wish states, stages, the generator's unique seatings and save checks.
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { LEVELS } from '../src/core/types';
import { generate } from '../src/games/seats/gen';
import {
  count,
  type Person,
  type Puzzle,
  restore,
  seating,
  seatsFor,
  solved,
  stageOf,
  startOf,
  type Wish,
  wishState,
} from '../src/games/seats/rules';
import { bus, cinema, diner } from '../src/games/seats/venues';

const person = (wish: Wish[] = [], trait: Person['trait'] = null, arrive = 0, leave = 1): Person => ({ trait, wish, arrive, leave });

/** The state of `p`'s first wish with seats `pos`. */
const state = (z: Puzzle, pos: number[], p: number, k = 0) => wishState(z, stageOf(z, k), pos, seating(z, pos), p, z.people[p].wish[0]);

describe('seats venues', () => {
  it('neighbours stop at aisles and table ends', () => {
    const b = bus(2);
    expect(b.seats[0].side).toEqual([1]);
    expect(b.seats[1].side).toEqual([0]);
    expect(b.seats[2].side).toEqual([3]);
    expect(b.seats[5].front).toBe(0);
    const c = cinema(2, 5);
    expect(c.seats[4].tags).toContain('aisle');
    expect(c.seats[2].tags).toContain('center');
    const d = diner(1, 2);
    // Table 1: seats 0, 1 on top (by the windows), 2, 3 below (by the kitchen); 0 faces 2.
    expect(d.seats[0].across).toBe(2);
    expect(d.seats[0].near).toEqual([1, 2]);
    expect(d.seats[0].tags).toContain('window');
    expect(d.seats[3].tags).toEqual(expect.arrayContaining(['kitchen', 'aisle']));
    expect(d.seats[4].table).toBe(2);
  });
});

describe('seats wishes', () => {
  it('judges people wishes', () => {
    // A by a window, B beside A, C right behind A, D not beside A, E left of A.
    const z: Puzzle = {
      v: bus(2),
      people: [
        person([{ t: 'window' }]),
        person([{ t: 'next', o: 0 }]),
        person([{ t: 'behind', o: 0 }]),
        person([{ t: 'apart', o: 0 }]),
        person([{ t: 'left', o: 0 }]),
      ],
      sol: [],
      given: [],
      stages: 1,
    };
    expect(state(z, [0, -1, -1, -1, -1], 0)).toBe('ok');
    expect(state(z, [1, -1, -1, -1, -1], 0)).toBe('bad');
    expect(state(z, [0, -1, -1, -1, -1], 1)).toBe('open');
    expect(state(z, [0, -1, -1, 1, -1], 1)).toBe('bad');
    expect(state(z, [0, 1, -1, -1, -1], 1)).toBe('ok');
    expect(state(z, [-1, -1, 0, -1, -1], 2)).toBe('bad');
    expect(state(z, [0, -1, 5, -1, -1], 2)).toBe('ok');
    expect(state(z, [0, -1, -1, 1, -1], 3)).toBe('bad');
    expect(state(z, [1, -1, -1, -1, 0], 4)).toBe('ok');
    expect(state(z, [0, -1, -1, -1, 1], 4)).toBe('bad');
  });

  it('judges traits: smells, noise, kids, hats, leftovers', () => {
    const z: Puzzle = {
      v: cinema(2, 5),
      people: [
        person([{ t: 'quiet' }]),
        person([], 'loud'),
        person([{ t: 'adult' }], 'kid'),
        person([{ t: 'see' }]),
        person([], 'hat'),
        person([{ t: 'nosmell' }], null, 0, 2),
        person([], 'food', 0, 1),
      ],
      sol: [-1, -1, -1, -1, -1, -1, 3],
      given: [],
      stages: 2,
    };
    expect(state(z, [0, 1, -1, -1, -1, -1, -1], 0)).toBe('bad');
    expect(state(z, [0, 2, -1, -1, -1, -1, -1], 0)).toBe('open');
    // The kid needs a grown-up beside: open while a side seat is free, bad once only kids are left around.
    expect(state(z, [-1, -1, 0, -1, -1, -1, -1], 2)).toBe('open');
    expect(state(z, [-1, 1, 0, -1, -1, -1, -1], 2)).toBe('ok');
    expect(state(z, [-1, -1, 4, -1, -1, -1, 3], 2)).toBe('ok');
    expect(state(z, [-1, -1, -1, 5, 0, -1, -1], 3)).toBe('bad');
    expect(state(z, [-1, -1, -1, 5, 1, -1, -1], 3)).toBe('open');
    // The eater leaves at stage 1, and their leftovers on seat 3 still smell.
    expect(state(z, [-1, -1, -1, -1, -1, 2, 3], 5, 0)).toBe('bad');
    expect(stageOf(z, 1).dirty[3]).toBe(true);
    expect(state(z, [-1, -1, -1, -1, -1, 2, -1], 5, 1)).toBe('bad');
    expect(state(z, [-1, -1, -1, -1, -1, 0, -1], 5, 1)).toBe('open');
  });
});

describe('seats generator', () => {
  it('every stage has exactly one seating, generated quickly', () => {
    for (const d of LEVELS) {
      let worst = 0;
      const kinds = new Set<string>();
      for (let seed = 1; seed <= 15; seed++) {
        const t = performance.now();
        const z = generate(new Rng(seed), d);
        worst = Math.max(worst, performance.now() - t);
        kinds.add(z.v.kind);
        expect(z.stages, `d${d}`).toBe(d <= 2 ? 1 : d === 5 ? 3 : 2);
        for (let k = 0; k < z.stages; k++) {
          const st = stageOf(z, k);
          const r = count(z, st, startOf(z, st), 2, 2_000_000);
          expect(r.count, `d${d} seed ${seed} stage ${k}`).toBe(1);
          expect(r.sols[0].filter((_, p) => st.here[p])).toEqual(z.sol.filter((_, p) => st.here[p]));
          expect(
            solved(
              z,
              st,
              z.sol.map((s, p) => (st.here[p] ? s : -1)),
            ),
          ).toBe(true);
          expect(
            st.fresh.some((p) => !z.given.includes(p)),
            `d${d} seed ${seed} stage ${k} has something to do`,
          ).toBe(true);
        }
      }
      expect(kinds.size, `level ${d} venues`).toBe(3);
      expect(worst, `level ${d}`).toBeLessThan(1500);
    }
  });

  it('keeps every solution seat open for each newcomer', () => {
    for (const d of LEVELS)
      for (let seed = 1; seed <= 6; seed++) {
        const z = generate(new Rng(seed), d);
        const st = stageOf(z, 0);
        const start = startOf(z, st);
        const lost = st.fresh.filter((p) => start[p] < 0 && !seatsFor(z, st, start, p).includes(z.sol[p]));
        expect(lost).toEqual([]);
      }
  });

  it('restores only sensible saves', () => {
    const z = generate(new Rng(3), 4);
    const st = stageOf(z, 1);
    const pos = startOf(z, st);
    expect(restore(z, { k: 1, pos })).toEqual({ k: 1, pos });
    expect(restore(z, { k: 2, pos })).toBeNull();
    expect(restore(z, { k: 1, pos: pos.slice(1) })).toBeNull();
    expect(restore(z, { k: 1, pos: pos.map(() => 0) })).toBeNull();
    expect(restore(z, null)).toBeNull();
  });
});
