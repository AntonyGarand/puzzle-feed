// Busy Week's pure rules: the generator's built plan, task geometry, scoring, save validation and the
// guide's searches, without mounting the game.
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { LEVELS } from '../src/core/types';
import {
  bestPut,
  cellsAt,
  ext,
  finishFrom,
  fits,
  generate,
  isLayout,
  type Layout,
  levelOf,
  offPlan,
  owners,
  type Put,
  restore,
  scoreOf,
  search,
  stranded,
  topAround,
  turn,
  type Week,
} from '../src/games/week/rules';

const score = (w: Week, lay: Layout) => scoreOf(owners(w, lay), (k) => w.tasks[k].col, w.R, w.C);
/** The generator's own plan: every non-decoy task on its slot, unturned. */
const planOf = (w: Week): Layout => ({ pos: w.tasks.map((t) => t.sol), rot: w.tasks.map(() => 0) });
/** A layout after playing `puts` from `lay`. */
const apply = (lay: Layout, puts: Put[]): Layout => {
  const out = { pos: lay.pos.slice(), rot: lay.rot.slice() };
  for (const p of puts) {
    out.pos[p.k] = p.top;
    out.rot[p.k] = p.r;
  }
  return out;
};
const empty = (w: Week): Layout => ({ pos: w.tasks.map(() => -1), rot: w.tasks.map(() => 0) });
const boards = function* () {
  for (const d of LEVELS) for (let seed = 1; seed <= 15; seed++) yield { d, seed, w: generate(new Rng(seed), levelOf(d)) };
};

/** One row of four free hours and two same-colour dominoes. */
const strip: Week = {
  R: 1,
  C: 4,
  busy: [false, false, false, false],
  tasks: [
    {
      shape: [
        [0, 0],
        [0, 1],
      ],
      col: 0,
      sol: 0,
    },
    {
      shape: [
        [0, 0],
        [0, 1],
      ],
      col: 0,
      sol: 2,
    },
  ],
  target: 5,
};

describe('week shapes', () => {
  const L4: [number, number][] = [
    [0, 0],
    [1, 0],
    [2, 0],
    [2, 1],
  ];
  it('comes back to the start after four quarter turns', () => {
    expect(turn(L4, 4)).toEqual(turn(L4, 0));
    expect(turn(L4, 1)).not.toEqual(turn(L4, 0));
  });
  it('swaps height and width on a quarter turn', () => {
    expect(ext(L4)).toEqual({ h: 3, w: 2 });
    expect(ext(turn(L4, 1))).toEqual({ h: 2, w: 3 });
  });
});

describe('week scoring', () => {
  it('scores 1 per covered hour and 1 per edge between different tasks of the same colour', () => {
    // Two same-colour dominoes side by side share one edge; a third of another colour adds none.
    const own = [0, 0, 1, 1, 2, 2];
    const col = (k: number) => (k === 2 ? 1 : 0);
    expect(scoreOf(own, col, 1, 6)).toEqual({ cells: 6, bonus: 1, total: 7 });
    expect(scoreOf([0, 0, -1, 1, 1, -1], col, 1, 6)).toEqual({ cells: 4, bonus: 0, total: 4 });
  });
});

describe('week generator', () => {
  it('builds a legal plan that fills every free hour and reaches the target', () => {
    for (const { d, seed, w } of boards()) {
      const plan = planOf(w);
      expect(isLayout(w, plan), `d${d} s${seed}`).toBe(true);
      const own = owners(w, plan);
      expect(
        own.every((k, i) => k >= 0 !== w.busy[i]),
        `d${d} s${seed}`,
      ).toBe(true);
      expect(score(w, plan).total).toBeGreaterThanOrEqual(w.target);
      expect(offPlan(w, plan)).toEqual([]);
    }
  });

  it('never starts solved and is the same for the same seed', () => {
    for (const { d, seed, w } of boards()) {
      expect(score(w, empty(w)).total).toBeLessThan(w.target);
      expect(generate(new Rng(seed), levelOf(d))).toEqual(w);
    }
  });

  it('adds decoys only on the harder levels', () => {
    for (const { d, w } of boards()) expect(w.tasks.filter((t) => t.sol < 0).length).toBe(levelOf(d).nDecoys);
  });
});

describe('week placement', () => {
  it('fits a task only on free, uncovered hours inside the board', () => {
    const lay: Layout = { pos: [0, -1], rot: [0, 0] };
    expect(fits(strip, lay, 1, 0, 2)).toBe(true);
    expect(fits(strip, lay, 1, 0, 1)).toBe(false); // overlaps task 0
    expect(fits(strip, lay, 1, 0, 3)).toBe(false); // runs off the board
    expect(fits(strip, lay, 0, 0, 1)).toBe(true); // a task's own cells don't block it
    expect(fits({ ...strip, busy: [false, false, true, false] }, lay, 1, 0, 2)).toBe(false);
  });

  it('centres a tapped task on the tapped hour, clamped to the board', () => {
    const w = generate(new Rng(1), levelOf(3));
    expect(topAround(w, { h: 3, w: 3 }, 0)).toBe(0);
    expect(topAround(w, { h: 3, w: 3 }, 2 * w.C + 3)).toBe(w.C + 2);
    expect(topAround(w, { h: 1, w: 2 }, w.R * w.C - 1)).toBe(w.R * w.C - 2);
  });
});

describe('week saves', () => {
  const w = strip;
  it('accepts only legal layouts', () => {
    expect(isLayout(w, { pos: [0, 2], rot: [0, 0] })).toBe(true);
    expect(isLayout(w, { pos: [0, 1], rot: [0, 0] })).toBe(false); // overlap
    expect(isLayout(w, { pos: [3, -1], rot: [0, 0] })).toBe(false); // off the edge
    expect(isLayout(w, { pos: [0, -1], rot: [0, 4] })).toBe(false); // bad turn
    expect(isLayout(w, { pos: [0], rot: [0] })).toBe(false); // wrong length
    expect(isLayout(w, null)).toBe(false);
  });

  it('restores a save, dropping a selection on a placed task and illegal history steps', () => {
    const r = restore(w, {
      pos: [0, -1],
      rot: [0, 1],
      sel: 0,
      hist: [{ pos: [-1, -1], rot: [0, 0] }, { pos: [0, 0], rot: [0, 0] }, 'junk'],
    });
    expect(r).toEqual({ pos: [0, -1], rot: [0, 1], sel: -1, hist: [{ pos: [-1, -1], rot: [0, 0] }] });
    expect(restore(w, { pos: [0, -1], rot: [0, 0], sel: 1 })?.sel).toBe(1);
    expect(restore(w, { pos: [0, 1], rot: [0, 0] })).toBeNull();
    expect(restore(w, undefined)).toBeNull();
  });
});

describe('week guide', () => {
  it('finishes the built plan from an empty board', () => {
    for (const { d, seed, w } of boards()) {
      const rest = finishFrom(w, empty(w));
      expect(Array.isArray(rest), `d${d} s${seed}`).toBe(true);
      const done = apply(empty(w), rest as Put[]);
      expect(isLayout(w, done)).toBe(true);
      expect(score(w, done).total).toBeGreaterThanOrEqual(w.target);
    }
  });

  it('searches a way to the target that keeps the placed tasks', () => {
    let found = 0;
    for (const { d, seed, w } of boards()) {
      if (d > 2) continue;
      const rest = search(w, empty(w).pos, owners(w, empty(w)));
      if (rest === 'capped') continue;
      expect(rest, `d${d} s${seed}`).not.toBeNull();
      const done = apply(empty(w), rest!);
      expect(isLayout(w, done)).toBe(true);
      expect(score(w, done).total).toBeGreaterThanOrEqual(w.target);
      found++;
    }
    expect(found).toBeGreaterThan(10);
  });

  it('proves a task that strands a lone hour puts the target out of reach', () => {
    // A domino in the middle of four hours leaves two lone hours: at most 2 points, target 5.
    const lay: Layout = { pos: [1, -1], rot: [0, 0] };
    expect(offPlan(strip, lay)).toEqual([0]);
    expect(finishFrom(strip, lay)).toBeNull();
    expect(stranded(strip, lay, 0)).toEqual([0]);
    expect(stranded(strip, { pos: [0, -1], rot: [0, 0] }, 0)).toBeNull();
  });

  it('suggests the most hemmed-in step and counts its bonus edges', () => {
    const lay: Layout = { pos: [0, -1], rot: [0, 0] };
    const rest = finishFrom(strip, lay) as Put[];
    expect(rest).toEqual([{ k: 1, r: 0, top: 2, cells: cellsAt(strip, 1, 2, 0) }]);
    const best = bestPut(strip, owners(strip, lay), rest);
    expect(best).toMatchObject({ k: 1, top: 2, walls: [1], bonus: 1 });
  });
});
