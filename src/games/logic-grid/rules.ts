// Logic Grid board rules without the DOM: reading the board, broken rules, the solve test, save
// validation and the guide's "what's wrong" / "what's next" steps.
//
// The board is `vals`: one cell per (row g, house p) at index `g * n + p`, holding a value index or -1.
// `xs` holds each cell's ruled-out values as a bitmask. Items are `g * n + v` (see gen.ts).
import { byLevel, type Difficulty } from '../../core/types';
import { type Clue, type ClueType, clueItems, holds, propagate } from './gen';

/**
 * Board size and clue mix for difficulty `d` (1–5): `n` houses, `K` rows, the weight of each clue type
 * while generating, and the types pruning drops first (easy levels keep the simple clues, hard levels
 * keep the relational ones).
 */
export function levelOf(d: Difficulty) {
  const n = byLevel(d, [3, 4, 4, 5, 5]);
  const K = byLevel(d, [3, 3, 4, 3, 4]);
  const weights = byLevel<Partial<Record<ClueType, number>>>(d, [
    { same: 5, at: 3, diff: 2, notAt: 1, next: 1, adj: 1 },
    { same: 4, at: 2, diff: 2, notAt: 2, adj: 2, next: 2, before: 1 },
    { same: 3, at: 1.5, diff: 2, notAt: 1.5, adj: 2, next: 2, before: 2, either: 1 },
    { same: 2, at: 1, diff: 2, notAt: 1, adj: 2, next: 2, before: 2, either: 2 },
    { same: 1.5, at: 0.6, diff: 2, notAt: 1, adj: 2, next: 2.5, before: 2.5, either: 2.5 },
  ]);
  const hard: ClueType[] = ['either', 'before', 'next', 'adj', 'notAt', 'diff'];
  const easy: ClueType[] = ['at', 'same', 'diff', 'notAt'];
  const dropFirst = byLevel(d, [hard, hard, [], easy, easy]);

  return { n, K, weights, dropFirst };
}

/** The item (row's value) that value `v` stands for in cell `i`. */
export const itemIn = (n: number, i: number, v: number) => Math.floor(i / n) * n + v;

/** House of each item on the board, or -1 when it isn't placed exactly once in its row. */
export function placed(n: number, vals: readonly number[]): number[] {
  const out = new Array<number>(vals.length).fill(-1);
  for (let g = 0; g < vals.length / n; g++)
    for (let v = 0; v < n; v++) {
      let at = -1,
        cnt = 0;
      for (let p = 0; p < n; p++)
        if (vals[g * n + p] === v) {
          at = p;
          cnt++;
        }
      if (cnt === 1) out[g * n + v] = at;
    }
  return out;
}

/** Cells holding a value that appears more than once in their row (each value goes in one house). */
export function dupes(n: number, vals: readonly number[]): Set<number> {
  const bad = new Set<number>();
  for (let g = 0; g < vals.length / n; g++)
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        const i = g * n + p,
          j = g * n + q;
        if (vals[i] >= 0 && vals[i] === vals[j]) bad.add(i).add(j);
      }
  return bad;
}

/** A clue against the placed items: 0 while one of its items is missing, 1 if it holds, -1 if broken. */
export const clueState = (cl: Clue, pos: readonly number[]): -1 | 0 | 1 =>
  clueItems(cl).some((it) => pos[it] < 0) ? 0 : holds(cl, pos) ? 1 : -1;

/** Whether the value just put in cell `i` breaks a visible rule: a repeat in its row, or a clue about it now broken. */
export function breaksRule(n: number, clues: readonly Clue[], vals: readonly number[], i: number): boolean {
  if (dupes(n, vals).has(i)) return true;
  const pos = placed(n, vals);
  const item = itemIn(n, i, vals[i]);
  return clues.some((cl) => clueItems(cl).includes(item) && clueState(cl, pos) === -1);
}

/** Every cell filled, no repeats, and every clue holds (validated by the rules, not the stored solution). */
export function isSolved(n: number, clues: readonly Clue[], vals: readonly number[]): boolean {
  if (vals.some((v) => v < 0) || dupes(n, vals).size) return false;
  const pos = placed(n, vals);
  return clues.every((cl) => holds(cl, pos));
}

/** A newly deducible placement: item `it` goes to house `p`, which is board cell `cell`. */
export interface Fact {
  it: number;
  p: number;
  cell: number;
}

/**
 * First item that clues `cs` (plus "each value once per row" and the values on the board) pin to one
 * house whose cell is still empty. Null when there is none, or when the board contradicts `cs`.
 */
export function newFact(n: number, vals: readonly number[], cs: readonly Clue[]): Fact | null {
  const size = vals.length;
  const dom = new Uint8Array(size).fill((1 << n) - 1);
  vals.forEach((v, i) => {
    if (v >= 0) dom[itemIn(n, i, v)] = 1 << (i % n);
  });
  if (!propagate(n, size / n, cs, dom)) return null;
  for (let it = 0; it < size; it++) {
    const m = dom[it];
    if (m & (m - 1)) continue;
    const p = 31 - Math.clz32(m);
    const cell = Math.floor(it / n) * n + p;
    if (vals[cell] < 0) return { it, p, cell };
  }
  return null;
}

/**
 * What check() reports, most telling first: a wrong value that repeats in its row (`twins` = the other
 * cells with it), a wrong value that breaks clue `clue`, any other wrong value (a dead end), then a ✗
 * on the right value `v` of an empty cell.
 */
type Fix =
  | { kind: 'dupe'; cell: number; twins: number[] }
  | { kind: 'clue'; cell: number; clue: number }
  | { kind: 'deadEnd'; cell: number }
  | { kind: 'ruledOut'; cell: number; v: number };

/**
 * The first mistake on the board, judged against the (unique) solution `solPos` (house of each item).
 * ✗ marks are the player's eliminations, so crossing out the answer counts as a mistake too.
 */
export function findFix(
  n: number,
  clues: readonly Clue[],
  solPos: readonly number[],
  vals: readonly number[],
  xs: readonly number[],
): Fix | null {
  /** Whether value `v` sits in cell `c` in the solution. */
  const right = (c: number, v: number) => solPos[itemIn(n, c, v)] === c % n;
  const wrongs = vals.flatMap((v, c) => (v >= 0 && !right(c, v) ? [c] : []));
  if (wrongs.length) {
    const twice = dupes(n, vals);
    const dup = wrongs.find((i) => twice.has(i));
    if (dup !== undefined)
      return {
        kind: 'dupe',
        cell: dup,
        twins: [...twice].filter((j) => j !== dup && Math.floor(j / n) === Math.floor(dup / n) && vals[j] === vals[dup]),
      };
    const pos = placed(n, vals);
    for (let k = 0; k < clues.length; k++) {
      if (clueState(clues[k], pos) !== -1) continue;
      const items = clueItems(clues[k]);
      const c = wrongs.find((i) => items.includes(itemIn(n, i, vals[i])));
      if (c !== undefined) return { kind: 'clue', cell: c, clue: k };
    }
    return { kind: 'deadEnd', cell: wrongs[0] };
  }
  for (let i = 0; i < vals.length; i++) {
    if (vals[i] >= 0 || !xs[i]) continue;
    let v = -1;
    for (let x = 0; x < n && v < 0; x++) if (right(i, x)) v = x;
    if (v < 0 || !(xs[i] & (1 << v))) continue;
    return { kind: 'ruledOut', cell: i, v };
  }
  return null;
}

/**
 * The guide's next deduction, simplest rule first: the last gap of a row, then one clue on its own
 * (`how`: the clue names the house, pairs the item with `mate` already placed there, or only leaves
 * that house), then several clues together (`clues` = those about the item).
 */
type Step =
  | { kind: 'lastGap'; fact: Fact }
  | { kind: 'clue'; fact: Fact; clue: number; how: 'at' | 'pair' | 'only'; mate: number }
  | { kind: 'combined'; fact: Fact; clues: number[] };

/** Next placement a person can deduce from the clues and the board, or null when there is none. */
export function nextStep(n: number, clues: readonly Clue[], vals: readonly number[]): Step | null {
  const last = newFact(n, vals, []);
  if (last) return { kind: 'lastGap', fact: last };
  for (let k = 0; k < clues.length; k++) {
    const f = newFact(n, vals, [clues[k]]);
    if (!f) continue;
    const cl = clues[k];
    let mate = cl.t !== 'same' ? -1 : cl.a === f.it ? cl.b : cl.b === f.it ? cl.a : -1;
    if (mate >= 0 && vals[Math.floor(mate / n) * n + f.p] !== mate % n) mate = -1;
    const how = cl.t === 'at' && cl.a === f.it ? 'at' : mate >= 0 ? 'pair' : 'only';
    return { kind: 'clue', fact: f, clue: k, how, mate };
  }
  const f = newFact(n, vals, clues);
  if (!f) return null;
  return { kind: 'combined', fact: f, clues: clues.flatMap((cl, k) => (clueItems(cl).includes(f.it) ? [k] : [])) };
}

/** Progress as saved by snapshot(). */
interface State {
  vals: number[];
  xs: number[];
  /** Per clue: 1 when the player crossed it off. */
  struck: number[];
  /** Selected cell. */
  sel: number;
  /** ✗ (rule-out) mode is on. */
  mark: boolean;
}

/**
 * Reads a saved `{ vals, xs, struck, sel, mark }` for a board of `size` cells and `nClues` clues,
 * field by field: an array of the wrong length is ignored and an out-of-range entry stays blank, so a
 * stale save can only lose progress, never break the game.
 */
export function restore(n: number, size: number, nClues: number, saved: unknown): State {
  const sv = (saved && typeof saved === 'object' ? saved : {}) as {
    vals?: unknown;
    xs?: unknown;
    struck?: unknown;
    sel?: unknown;
    mark?: unknown;
  };
  const okInt = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
  const read = (v: unknown, len: number, blank: number, lo: number, hi: number) => {
    const out = new Array<number>(len).fill(blank);
    if (Array.isArray(v) && v.length === len) v.forEach((x: unknown, i) => okInt(x, lo, hi) && (out[i] = x));
    return out;
  };
  return {
    vals: read(sv.vals, size, -1, -1, n - 1),
    xs: read(sv.xs, size, 0, 0, (1 << n) - 1),
    struck: read(sv.struck, nClues, 0, 0, 1),
    sel: okInt(sv.sel, 0, size - 1) ? sv.sel : 0,
    mark: sv.mark === true,
  };
}
