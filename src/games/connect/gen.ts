import type { Rng } from '../../core/rng';
import { byLevel, type Difficulty } from '../../core/types';
import { nbrs } from '../../kits/path/grid';

export interface ConnectPuzzle {
  n: number;
  /** One solution: a path per colour, endpoints are the dots. */
  paths: number[][];
}

/** Random Hamiltonian path on an n x n grid: serpentine start, then many backbite moves. */
function hamiltonPath(rng: Rng, n: number, moves: number): number[] {
  let path: number[] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) path.push(r * n + (r % 2 ? n - 1 - c : c));
  const pos = new Int32Array(n * n);
  const reindex = () => path.forEach((v, i) => (pos[v] = i));
  reindex();
  for (let m = 0; m < moves; m++) {
    if (rng.chance(0.5)) {
      path.reverse();
      reindex();
    }
    // backbite at the head (index 0)
    const head = path[0];
    const opts = nbrs(head, n, n).filter((x) => x !== path[1]);
    if (!opts.length) continue;
    const j = pos[rng.pick(opts)];
    // join head to path[j]; path[j-1] becomes the new head
    const front = path.slice(0, j).reverse();
    path = front.concat(path.slice(j));
    for (let k = 0; k < j; k++) pos[path[k]] = k;
  }
  return path;
}

/**
 * True when a line touches itself somewhere other than between consecutive cells,
 * i.e. it doubles back alongside itself (a U-turn) instead of leaving room for others.
 */
export function touchesSelf(p: number[], n: number): boolean {
  const at = new Map(p.map((v, i) => [v, i]));
  return p.some((v, i) => nbrs(v, n, n).some((x) => Math.abs((at.get(x) ?? i) - i) > 1));
}

/**
 * Split `path` into `k` lines of 3..maxLen cells that never touch themselves,
 * uniformly among all such splits. Null when there is none.
 */
function cutPath(rng: Rng, path: number[], n: number, k: number, maxLen: number): number[][] | null {
  const N = path.length;
  const pos = new Int32Array(n * n);
  path.forEach((v, i) => (pos[v] = i));
  // lim[s]: a line starting at s stays clean up to (excluding) lim[s].
  const bad = path.map((v, i) =>
    Math.min(
      N + 1,
      ...nbrs(v, n, n)
        .map((x) => pos[x])
        .filter((q) => q > i + 1),
    ),
  );
  const lim = new Int32Array(N);
  for (let s = 0; s < N; s++) {
    let e = s;
    let cap = N + 1;
    while (e < N && e + 1 <= cap) cap = Math.min(cap, bad[e++]);
    lim[s] = Math.min(e, cap);
  }
  // ways[m][i]: number of ways to split path[i..] into m clean lines.
  const ways = Array.from({ length: k + 1 }, () => new Float64Array(N + 1));
  ways[0][N] = 1;
  for (let m = 1; m <= k; m++)
    for (let i = N - 3; i >= 0; i--) for (let e = i + 3; e <= Math.min(lim[i], i + maxLen); e++) ways[m][i] += ways[m - 1][e];
  if (!ways[k][0]) return null;
  const segs: number[][] = [];
  for (let i = 0, m = k; m > 0; m--) {
    let r = rng.next() * ways[m][i];
    let e = i + 3;
    for (; e < Math.min(lim[i], i + maxLen); e++) if ((r -= ways[m - 1][e]) < 0) break;
    segs.push(path.slice(i, e));
    i = e;
  }
  return segs;
}

/** Join two lines end to end while the result stays clean, until only `k` are left. */
function mergeDown(rng: Rng, start: number[][], n: number, k: number, maxLen: number): number[][] | null {
  let lines = start.map((l) => [...l]);
  const of = new Int32Array(n * n);
  while (lines.length > k) {
    lines.forEach((l, i) => l.forEach((v) => (of[v] = i)));
    // For each pair of touching lines, their single contact (or null if they touch more than once).
    // Two clean lines join into a clean one exactly when their only contact is end to end.
    const touch = new Map<number, [number, number] | null>();
    for (let v = 0; v < n * n; v++)
      for (const x of nbrs(v, n, n)) {
        if (of[v] >= of[x]) continue;
        const key = of[v] * 64 + of[x];
        touch.set(key, touch.has(key) ? null : [v, x]);
      }
    const joins: number[][] = [];
    for (const [key, t] of touch) {
      const [la, lb] = [lines[Math.floor(key / 64)], lines[key % 64]];
      if (!t || la.length + lb.length > maxLen) continue;
      const x = t[0] === la[la.length - 1] ? la : t[0] === la[0] ? la.toReversed() : null;
      const y = t[1] === lb[0] ? lb : t[1] === lb[lb.length - 1] ? lb.toReversed() : null;
      if (x && y) joins.push([Math.floor(key / 64), key % 64, ...x, ...y]);
    }
    if (!joins.length) return null;
    const [a, b, ...j] = rng.pick(joins);
    lines = lines.filter((_, i) => i !== a && i !== b);
    lines.push(j);
  }
  return lines;
}

export function genConnect(rng: Rng, d: Difficulty): ConnectPuzzle {
  const n = byLevel(d, [5, 6, 7, 8, 9]);
  const k = byLevel(d, [4, 5, 6, 7, 8]);
  const N = n * n;
  // Avoid one colour hogging the board.
  const maxLen = Math.max(6, Math.floor((N / k) * 2.2));
  for (let attempt = 0; attempt < 60; attempt++) {
    // Cut a random tour into as few clean lines as it allows, then join neighbours down to k.
    const path = hamiltonPath(rng, n, N * 25);
    let tries = 0;
    for (let m = k; m <= k + 12 && tries < 12; m++)
      for (let t = 0; t < 4; t++) {
        const segs = cutPath(rng, path, n, m, maxLen);
        if (!segs) break;
        tries++;
        const lines = mergeDown(rng, segs, n, k, maxLen);
        if (lines) return { n, paths: rng.shuffle(lines) };
      }
  }
  // Fallback: one straight line per row (never touches itself).
  const rows = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_c, c) => r * n + c));
  return { n, paths: rows };
}
