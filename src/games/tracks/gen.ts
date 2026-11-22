import type { Rng } from '../../core/rng';
import { byLevel, type Difficulty } from '../../core/types';
import { nbrs } from '../../kits/path/grid';

export interface TracksPuzzle {
  n: number;
  /** Entrance cell (left edge) and exit cell (bottom or right edge). */
  a: number;
  b: number;
  exitSide: 'bottom' | 'right';
  /** One solution, from a to b. */
  path: number[];
  rowCounts: number[];
  colCounts: number[];
  /** Cells that must be on the path (besides a and b). */
  givens: number[];
}

/** Random spanning tree (recursive backtracker with occasional random restarts for shorter corridors). */
function tree(rng: Rng, n: number, branchy: number): number[][] {
  const adj: number[][] = Array.from({ length: n * n }, () => []);
  const seen = new Uint8Array(n * n);
  const start = rng.int(0, n * n - 1);
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const at = rng.chance(branchy) ? rng.int(0, stack.length - 1) : stack.length - 1;
    const i = stack[at];
    const opts = nbrs(i, n, n).filter((j) => !seen[j]);
    if (!opts.length) {
      stack.splice(at, 1);
      continue;
    }
    const j = rng.pick(opts);
    seen[j] = 1;
    adj[i].push(j);
    adj[j].push(i);
    stack.push(j);
  }
  return adj;
}

function treePath(adj: number[][], a: number, b: number): number[] {
  const par = new Int32Array(adj.length).fill(-1);
  par[a] = a;
  const q = [a];
  while (q.length) {
    const i = q.shift()!;
    if (i === b) break;
    for (const j of adj[i])
      if (par[j] < 0) {
        par[j] = i;
        q.push(j);
      }
  }
  const out = [b];
  while (out[out.length - 1] !== a) out.push(par[out[out.length - 1]]);
  return out.reverse();
}

export function genTracks(rng: Rng, d: Difficulty): TracksPuzzle {
  const n = byLevel(d, [5, 6, 7, 8, 9]);
  const giveFrac = byLevel(d, [0.3, 0.2, 0.12, 0.06, 0]);
  const lo = n * n * 0.36,
    hi = n * n * 0.66;
  let best: number[] | null = null;
  let bestA = 0,
    bestB = 0,
    side: 'bottom' | 'right' = 'bottom';
  for (let attempt = 0; attempt < 60; attempt++) {
    const a = rng.int(0, n - 1) * n;
    const s: 'bottom' | 'right' = rng.chance(0.5) ? 'bottom' : 'right';
    const b = s === 'bottom' ? (n - 1) * n + rng.int(1, n - 1) : rng.int(1, n - 1) * n + n - 1;
    const path = treePath(tree(rng, n, 0.25), a, b);
    const score = (p: number[]) => (p.length < lo ? lo - p.length : p.length > hi ? p.length - hi : 0);
    if (!best || score(path) < score(best)) {
      best = path;
      bestA = a;
      bestB = b;
      side = s;
    }
    if (score(path) === 0) break;
  }
  const path = best!;
  const rowCounts = new Array<number>(n).fill(0);
  const colCounts = new Array<number>(n).fill(0);
  for (const i of path) {
    rowCounts[Math.floor(i / n)]++;
    colCounts[i % n]++;
  }
  const inner = rng.shuffle(path.slice(1, -1));
  const givens = inner.slice(0, Math.round(inner.length * giveFrac));
  return { n, a: bestA, b: bestB, exitSide: side, path, rowCounts, colCounts, givens };
}
