import type { Rng } from '../../core/rng';
import { byLevel, type Difficulty } from '../../core/types';
import { nbrs } from '../pathkit/grid';

export interface MowPuzzle {
  w: number;
  h: number;
  /** Rocks: cells the mower can never enter. */
  rocks: boolean[];
  /** Grass height per cell: how many more times the mower must enter it. */
  grass: number[];
  start: number;
  /** The generated solution: cells entered, in order (not used to validate). */
  walk: number[];
}

/** Lawn neighbours of every cell (rocks excluded). */
export const lawnAdj = (w: number, h: number, rocks: boolean[]) =>
  Array.from({ length: w * h }, (_, i) => (rocks[i] ? [] : nbrs(i, w, h).filter((j) => !rocks[j])));

/** Why a lawn can't be finished (see `blocker`). */
export type Blocker =
  | { kind: 'parity' }
  | { kind: 'starved'; cell: number }
  | { kind: 'ends'; cells: number[] }
  | { kind: 'cut'; cells: number[] };

/**
 * Cheap necessary conditions for finishing the lawn from `pos` with heights `g`:
 * colour parity (every move changes square colour), grass reachable through uncut cells,
 * and enough neighbouring visits to enter each cell as often as its height.
 * Returns the first broken one, or null when none is.
 */
export function blocker(w: number, adj: number[][], g: number[], pos: number): Blocker | null {
  const N = g.length;
  let same = 0,
    other = 0,
    left = 0;
  const col = (i: number) => (Math.floor(i / w) + (i % w)) & 1;
  const pc = col(pos);
  for (let i = 0; i < N; i++) {
    if (!g[i]) continue;
    left++;
    if (col(i) === pc) same += g[i];
    else other += g[i];
  }
  if (!left) return null;
  if (other !== same && other !== same + 1) return { kind: 'parity' };
  // The last cell entered has this colour.
  const endCol = other === same ? pc : 1 - pc;
  // Each visit to a cell sits between two moments on its neighbours (the starting moment or an
  // entry there), except after the very last visit of the walk. A cell whose neighbours can't
  // supply that extra moment has to be where the walk ends: at most one such cell.
  const ends: number[] = [];
  for (let i = 0; i < N; i++) {
    if (!g[i]) continue;
    let s = 0;
    for (const j of adj[i]) s += j === pos ? g[j] + 1 : g[j];
    if (s < g[i]) return { kind: 'starved', cell: i };
    if (s === g[i]) {
      ends.push(i);
      if (col(i) !== endCol || ends.length > 1) return { kind: 'ends', cells: ends };
    }
  }
  const seen = new Uint8Array(N);
  seen[pos] = 1;
  const st = [pos];
  let reached = g[pos] ? 1 : 0;
  while (st.length) {
    const x = st.pop()!;
    for (const y of adj[x])
      if (g[y] && !seen[y]) {
        seen[y] = 1;
        reached++;
        st.push(y);
      }
  }
  if (reached === left) return null;
  const cells: number[] = [];
  for (let i = 0; i < N; i++) if (g[i] && !seen[i]) cells.push(i);
  return { kind: 'cut', cells };
}

const viable = (w: number, adj: number[][], g: number[], pos: number) => !blocker(w, adj, g, pos);

/** Legal moves from `pos`: lawn neighbours with grass left. */
export const movesFrom = (adj: number[][], g: number[], pos: number) => adj[pos].filter((j) => g[j] > 0);

/**
 * Depth-first search for a full mowing order from (g, pos), within a node budget.
 * Returns the cells to enter, `null` when proven impossible, or `undefined` when the budget ran out.
 */
export function solveMow(w: number, adj: number[][], grass: number[], pos: number, budget = 60000): number[] | null | undefined {
  const g = grass.slice();
  let left = g.reduce((a, b) => a + b, 0);
  const out: number[] = [];
  let nodes = 0;
  let out_of_budget = false;
  const go = (p: number): boolean => {
    if (!left) return true;
    if (++nodes > budget) {
      out_of_budget = true;
      return false;
    }
    if (!viable(w, adj, g, p)) return false;
    // Fewest onward options first (Warnsdorff), then taller grass.
    const opts = movesFrom(adj, g, p)
      .map((j) => {
        g[j]--;
        const k = movesFrom(adj, g, j).length;
        g[j]++;
        return { j, k: k * 8 - g[j] };
      })
      .sort((a, b) => a.k - b.k);
    for (const { j } of opts) {
      g[j]--;
      left--;
      out.push(j);
      if (go(j)) return true;
      out.pop();
      g[j]++;
      left++;
      if (out_of_budget) return false;
    }
    return false;
  };
  if (go(pos)) return out;
  return out_of_budget ? undefined : null;
}

/** A plain greedy player (fixed tie-breaks). Boards it finishes are too easy to keep. */
function greedySolves(adj: number[][], grass: number[], pos: number, rule: 0 | 1): boolean {
  const g = grass.slice();
  let left = g.reduce((a, b) => a + b, 0);
  while (left) {
    const opts = movesFrom(adj, g, pos);
    if (!opts.length) return false;
    let best = opts[0],
      bestK = Infinity;
    for (const j of opts) {
      g[j]--;
      const k = rule ? -g[j] * 8 + movesFrom(adj, g, j).length : movesFrom(adj, g, j).length;
      g[j]++;
      if (k < bestK) {
        bestK = k;
        best = j;
      }
    }
    g[best]--;
    left--;
    pos = best;
  }
  return true;
}

interface Params {
  w: number;
  h: number;
  cap: number;
  rocks: number;
  /** Chance to step back onto cut grass while fresh grass is still next door. */
  revisit: number;
  /** Wanted share of lawn cells with height ≥ 2. */
  minMulti: number;
}

const PARAMS = (d: Difficulty): Params =>
  byLevel<Params>(d, [
    { w: 4, h: 4, cap: 1, rocks: 1, revisit: 0, minMulti: 0 },
    { w: 5, h: 5, cap: 2, rocks: 0, revisit: 0.18, minMulti: 0.16 },
    { w: 5, h: 5, cap: 2, rocks: 2, revisit: 0.3, minMulti: 0.28 },
    { w: 6, h: 6, cap: 3, rocks: 2, revisit: 0.32, minMulti: 0.3 },
    { w: 7, h: 7, cap: 3, rocks: 3, revisit: 0.36, minMulti: 0.34 },
  ]);

/** One random covering walk; returns entry counts, or null if it got stuck. */
function walkOnce(rng: Rng, p: Params, adj: number[][], lawn: number[], start: number) {
  const N = p.w * p.h;
  const cnt = new Array<number>(N).fill(0);
  const seen = new Uint8Array(N);
  seen[start] = 1;
  let unseen = lawn.length - 1;
  const walk: number[] = [];
  let cur = start;
  const fresh = (i: number) => adj[i].filter((j) => !seen[j]);
  while (unseen) {
    const open = adj[cur].filter((j) => cnt[j] < p.cap);
    if (!open.length) return null;
    const U = open.filter((j) => !seen[j]);
    let nx: number;
    if (U.length && !(rng.chance(p.revisit) && open.length > U.length)) {
      // Warnsdorff with noise: corridors and corners first.
      let best = Infinity;
      nx = U[0];
      for (const j of U) {
        const k = fresh(j).length + rng.next() * 1.5;
        if (k < best) {
          best = k;
          nx = j;
        }
      }
    } else if (U.length) {
      nx = rng.pick(open.filter((j) => seen[j]));
    } else {
      // Head for the nearest uncut cell through cells that can still be entered.
      const prev = new Map<number, number>([[cur, -1]]);
      const q = [cur];
      let goal = -1;
      for (let k = 0; k < q.length && goal < 0; k++)
        for (const y of rng.shuffle(adj[q[k]].slice())) {
          if (prev.has(y) || cnt[y] >= p.cap) continue;
          prev.set(y, q[k]);
          if (!seen[y]) {
            goal = y;
            break;
          }
          q.push(y);
        }
      if (goal < 0) return null;
      let x = goal;
      while (prev.get(x) !== cur) x = prev.get(x)!;
      nx = x;
    }
    cnt[nx]++;
    walk.push(nx);
    if (!seen[nx]) {
      seen[nx] = 1;
      unseen--;
    }
    cur = nx;
  }
  return { cnt, walk };
}

function connected(N: number, adj: number[][], lawn: number[]) {
  const seen = new Uint8Array(N);
  seen[lawn[0]] = 1;
  const st = [lawn[0]];
  let k = 1;
  while (st.length)
    for (const y of adj[st.pop()!])
      if (!seen[y]) {
        seen[y] = 1;
        k++;
        st.push(y);
      }
  return k === lawn.length;
}

export function genMow(rng: Rng, d: Difficulty, attempts = 160): MowPuzzle {
  const p = PARAMS(d);
  const { w, h } = p;
  const N = w * h;
  let best: { score: number; puz: MowPuzzle } | null = null;
  // A fixed attempt count, not a time budget: resume must regenerate the same lawn from the seed.
  for (let attempt = 0; attempt < attempts; attempt++) {
    const rocks = new Array<boolean>(N).fill(false);
    for (let k = 0; k < p.rocks; k++) {
      const i = rng.int(0, N - 1);
      rocks[i] = true;
    }
    const adj = lawnAdj(w, h, rocks);
    const lawn = [...Array(N).keys()].filter((i) => !rocks[i]);
    if (lawn.some((i) => !adj[i].length) || !connected(N, adj, lawn)) continue;
    const start = rng.pick(lawn);
    const res = walkOnce(rng, p, adj, lawn, start);
    if (!res) continue;
    const { cnt, walk } = res;
    const multi = lawn.filter((i) => cnt[i] >= 2).length / lawn.length;
    const top = Math.max(...cnt);
    let score = 0;
    if (multi >= p.minMulti) score += 4;
    if (top === p.cap) score += 2;
    if (!greedySolves(adj, cnt, start, 0)) score += 3;
    if (!greedySolves(adj, cnt, start, 1)) score += 3;
    // A start on the edge but off the corners reads better than a corner start.
    const r = Math.floor(start / w),
      c = start % w;
    if (!((r === 0 || r === h - 1) && (c === 0 || c === w - 1))) score += 1;
    score += rng.next() * 0.5;
    if (!best || score > best.score) best = { score, puz: { w, h, rocks, grass: cnt, start, walk } };
    if (score >= 13) break;
  }
  if (best) return best.puz;
  // Fallback (never expected): a serpentine over an empty lawn.
  const grass = new Array<number>(N).fill(1);
  grass[0] = 0;
  const walk: number[] = [];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) walk.push(r * w + (r % 2 ? w - 1 - c : c));
  walk.shift();
  return { w, h, rocks: new Array<boolean>(N).fill(false), grass, start: 0, walk };
}
