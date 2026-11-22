// Sightlines generator and solver: shade cells so every number sees exactly that many white cells
// (itself included) along its row and column, shades never touch and the white cells stay connected.
import type { Rng } from '../../core/rng';
import { nb4 } from './lightup';

/** Cells in each direction from every cell, nearest first: up, right, down, left. */
export function rays(n: number): number[][][] {
  const steps = [
    [-1, 0],
    [0, 1],
    [1, 0],
    [0, -1],
  ];
  return Array.from({ length: n * n }, (_, i) =>
    steps.map(([dr, dc]) => {
      const out: number[] = [];
      for (let r = Math.floor(i / n) + dr, c = (i % n) + dc; r >= 0 && r < n && c >= 0 && c < n; r += dr, c += dc) out.push(r * n + c);
      return out;
    }),
  );
}

/**
 * How far a number at `c` surely sees (`lo`, through known white cells) and could see (`hi`, up to
 * the first shaded cell), per direction. `at(i)`: -1 undecided, 0 white, 1 shaded.
 */
export function reach(R: number[][][], c: number, at: (i: number) => number): { lo: number[]; hi: number[] } {
  const lo = [0, 0, 0, 0],
    hi = [0, 0, 0, 0];
  for (let d = 0; d < 4; d++) {
    const ray = R[c][d];
    let k = 0;
    while (k < ray.length && at(ray[k]) === 0) k++;
    lo[d] = k;
    while (k < ray.length && at(ray[k]) !== 1) k++;
    hi[d] = k;
  }
  return { lo, hi };
}

/**
 * Undecided cells (-1) that must stay white so the white cells stay in one piece, and the cells no
 * white cell can reach (they must be shaded). `null` when the white cells are already split.
 */
export function cutCells(n: number, at: (i: number) => number): { cuts: number[]; cutOff: number[] } | null {
  const N = n * n;
  const disc = new Int32Array(N).fill(-1);
  const low = new Int32Array(N);
  const whites = new Int32Array(N); // white cells in each DFS subtree
  let total = 0;
  let start = -1;
  for (let i = 0; i < N; i++)
    if (at(i) === 0) {
      total++;
      if (start < 0) start = i;
    }
  if (start < 0) return { cuts: [], cutOff: [] };
  const cuts = new Set<number>();
  let time = 0;
  const dfs = (v: number, parent: number) => {
    disc[v] = low[v] = time++;
    whites[v] = at(v) === 0 ? 1 : 0;
    for (const w of nb4(v, n)) {
      if (at(w) === 1 || w === parent) continue;
      if (disc[w] < 0) {
        dfs(w, v);
        whites[v] += whites[w];
        low[v] = Math.min(low[v], low[w]);
        if (low[w] >= disc[v] && whites[w] > 0 && total - whites[w] > 0 && at(v) < 0) cuts.add(v);
      } else low[v] = Math.min(low[v], disc[w]);
    }
  };
  dfs(start, -1);
  if (whites[start] < total) return null;
  const cutOff: number[] = [];
  for (let i = 0; i < N; i++) if (disc[i] < 0 && at(i) < 0) cutOff.push(i);
  return { cuts: [...cuts], cutOff };
}

/** Number of white cells `i` sees in a straight line, itself included, on a finished shading. */
export function sees(R: number[][][], i: number, black: ArrayLike<boolean | number>): number {
  let k = 1;
  for (const ray of R[i]) {
    let d = 0;
    while (d < ray.length && !black[ray[d]]) d++;
    k += d;
  }
  return k;
}

/**
 * Applies the forced moves to `st` (-1 undecided, 0 white, 1 shaded) in place. Returns false on a
 * contradiction.
 */
function propagate(n: number, R: number[][][], clue: number[], clues: number[], st: Int8Array): boolean {
  const at = (i: number) => st[i];
  for (;;) {
    let changed = false;
    for (let i = 0; i < st.length; i++) {
      if (st[i] !== 1) continue;
      for (const j of nb4(i, n)) {
        if (st[j] === 1) return false;
        if (st[j] < 0) {
          st[j] = 0;
          changed = true;
        }
      }
    }
    for (const c of clues) {
      const need = clue[c] - 1;
      const { lo, hi } = reach(R, c, at);
      const sumLo = lo[0] + lo[1] + lo[2] + lo[3],
        sumHi = hi[0] + hi[1] + hi[2] + hi[3];
      if (sumLo > need || sumHi < need) return false;
      if (sumLo === sumHi) continue;
      for (let d = 0; d < 4; d++) {
        const ray = R[c][d];
        // At least `must` cells this way are white, at most `may`.
        const must = need - (sumHi - hi[d]);
        const may = need - (sumLo - lo[d]);
        for (let k = lo[d]; k < must; k++)
          if (st[ray[k]] < 0) {
            st[ray[k]] = 0;
            changed = true;
          }
        if (lo[d] === may && lo[d] < ray.length && st[ray[lo[d]]] < 0) {
          st[ray[lo[d]]] = 1;
          changed = true;
        }
      }
    }
    if (changed) continue;
    const cut = cutCells(n, at);
    if (!cut) return false;
    for (const i of cut.cuts) st[i] = 0;
    for (const i of cut.cutOff) st[i] = 1;
    if (!cut.cuts.length && !cut.cutOff.length) return true;
  }
}

/** True when the forced moves alone decide every cell (so the solution is unique). */
function byLogic(n: number, R: number[][][], clue: number[]): boolean {
  const clues = clue.flatMap((k, i) => (k > 0 ? [i] : []));
  const st = new Int8Array(n * n).fill(-1);
  for (const c of clues) st[c] = 0;
  return propagate(n, R, clue, clues, st) && !st.includes(-1);
}

/** Counts solutions up to 2. `count` is 2 (not unique) when the node budget runs out. */
export function countSolutions(n: number, R: number[][][], clue: number[], budget: number): { count: number; nodes: number } {
  const clues = clue.flatMap((k, i) => (k > 0 ? [i] : []));
  let count = 0,
    nodes = 0;
  const rec = (st: Int8Array): boolean => {
    if (++nodes > budget) {
      count = 2;
      return true;
    }
    if (!propagate(n, R, clue, clues, st)) return false;
    // Branch on the end of a number's sure sight line, else on any undecided cell.
    let pick = -1;
    for (const c of clues) {
      const { lo } = reach(R, c, (i) => st[i]);
      for (let d = 0; d < 4 && pick < 0; d++) if (lo[d] < R[c][d].length && st[R[c][d][lo[d]]] < 0) pick = R[c][d][lo[d]];
      if (pick >= 0) break;
    }
    if (pick < 0) pick = st.indexOf(-1);
    if (pick < 0) return ++count >= 2;
    for (const v of [1, 0]) {
      const s2 = st.slice();
      s2[pick] = v;
      if (rec(s2)) return true;
    }
    return false;
  };
  const st = new Int8Array(n * n).fill(-1);
  for (const c of clues) st[c] = 0;
  rec(st);
  return { count, nodes };
}

/** A random shading: no two shaded cells touch and the rest stays connected. */
function randomShade(n: number, want: number, rng: Rng): boolean[] {
  const sh = new Array<boolean>(n * n).fill(false);
  let count = 0;
  for (const i of rng.shuffle([...sh.keys()])) {
    if (count >= want) break;
    if (nb4(i, n).some((j) => sh[j])) continue;
    sh[i] = true;
    if (cutCells(n, (k) => (sh[k] ? 1 : 0))) count++;
    else sh[i] = false;
  }
  return sh;
}

export interface Sightlines {
  n: number;
  /** Number on each cell, 0 when blank. */
  clue: number[];
  /** The unique solution (true = shaded). */
  black: boolean[];
}

/**
 * Builds a puzzle with a unique solution. Numbers are removed in random order while logic alone
 * still decides every cell, so it never needs a guess; `keep` is the fewest numbers to leave.
 */
export function genSightlines(n: number, opts: { density: number; keep: number }, rng: Rng): Sightlines {
  const R = rays(n);
  let black: boolean[] = [];
  let clue: number[] = [];
  for (let attempt = 0; attempt < 20; attempt++) {
    black = randomShade(n, Math.round(n * n * opts.density), rng);
    clue = black.map((b, i) => (b ? 0 : sees(R, i, black)));
    // With every white cell numbered, logic practically always finishes the board.
    if (byLogic(n, R, clue)) break;
    // Otherwise a bounded search proves the full set unique; keep it as is.
    if (countSolutions(n, R, clue, 3000).count === 1) return { n, clue, black };
  }
  let left = clue.filter((k) => k > 0).length;
  for (const i of rng.shuffle(clue.flatMap((k, j) => (k > 0 ? [j] : [])))) {
    if (left <= opts.keep) break;
    const k = clue[i];
    clue[i] = 0;
    if (byLogic(n, R, clue)) left--;
    else clue[i] = k;
  }
  return { n, clue, black };
}
