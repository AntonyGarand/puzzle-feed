import type { Rng } from '../../core/rng';
import { byLevel, type Difficulty } from '../../core/types';

const HEX_DIRS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
] as const;

export interface BeehivePuzzle {
  /** Axial coordinates of the board cells. */
  cells: { q: number; r: number }[];
  adj: number[][];
  /** Solution order: path[k] is the cell holding number k+1. */
  path: number[];
  /** cell -> given number (0 = empty). */
  givens: number[];
}

function buildBoard(R: number, holes: Set<string>) {
  const cells: { q: number; r: number }[] = [];
  const idx = new Map<string, number>();
  for (let r = -R; r <= R; r++)
    for (let q = -R; q <= R; q++) {
      if (Math.abs(q + r) > R || holes.has(`${q},${r}`)) continue;
      idx.set(`${q},${r}`, cells.length);
      cells.push({ q, r });
    }
  const adj = cells.map(({ q, r }) => HEX_DIRS.map(([dq, dr]) => idx.get(`${q + dq},${r + dr}`)).filter((x): x is number => x != null));
  return { cells, adj };
}

const connected = (adj: number[][]) => {
  const seen = new Uint8Array(adj.length);
  const st = [0];
  seen[0] = 1;
  let k = 1;
  while (st.length) {
    for (const j of adj[st.pop()!]) {
      if (seen[j]) continue;
      seen[j] = 1;
      k++;
      st.push(j);
    }
  }
  return k === adj.length;
};

/** Hamiltonian path by DFS with Warnsdorff ordering and a node budget. */
function hamilton(rng: Rng, adj: number[][], budget: number): number[] | null {
  const N = adj.length;
  const deg1 = adj.map((a, i) => (a.length === 1 ? i : -1)).filter((i) => i >= 0);
  if (deg1.length > 2) return null;
  const start = deg1.length ? rng.pick(deg1) : rng.int(0, N - 1);
  const used = new Uint8Array(N);
  const path = [start];
  used[start] = 1;
  const free = (i: number) => adj[i].filter((j) => !used[j]).length;
  const order = (i: number) => rng.shuffle(adj[i].filter((j) => !used[j])).sort((x, y) => free(x) - free(y));
  const stack: number[][] = [order(start)];
  let nodes = 0;
  while (stack.length) {
    if (path.length === N) return path;
    if (++nodes > budget) return null;
    const opts = stack[stack.length - 1];
    if (!opts.length) {
      stack.pop();
      used[path.pop()!] = 0;
      continue;
    }
    const j = opts.shift()!;
    used[j] = 1;
    path.push(j);
    // prune: an unvisited cell away from the end with no free neighbours can never be entered,
    // and at most one such cell with a single free neighbour can exist (it must be the last cell).
    let dead = false,
      tails = 0;
    for (let i = 0; i < N && !dead; i++) {
      if (used[i] || adj[i].includes(j)) continue;
      const f = free(i);
      if (f === 0) dead = true;
      else if (f === 1 && ++tails > 1) dead = true;
    }
    const nx = dead ? [] : order(j);
    if (dead && path.length < N) {
      used[path.pop()!] = 0;
      continue;
    }
    stack.push(nx);
  }
  return path.length === N ? path : null;
}

export function genBeehive(rng: Rng, d: Difficulty): BeehivePuzzle {
  const R = byLevel(d, [2, 3, 3, 4, 4]);
  const holeCount = byLevel(d, [0, 0, 2, 2, 4]);
  const giveFrac = byLevel(d, [0.5, 0.4, 0.32, 0.27, 0.21]);
  let board = buildBoard(R, new Set());
  let path: number[] | null = null;
  for (let attempt = 0; attempt < 12 && !path; attempt++) {
    const holes = new Set<string>();
    const all = buildBoard(R, holes).cells.filter((c) => c.q || c.r);
    const want = attempt < 8 ? holeCount : 0;
    while (holes.size < want) {
      const c = rng.pick(all);
      holes.add(`${c.q},${c.r}`);
    }
    board = buildBoard(R, holes);
    if (!connected(board.adj)) continue;
    path = hamilton(rng, board.adj, 4000);
  }
  if (!path) {
    // Fallback: serpentine over the rows of the full hexagon (row ends are always neighbours).
    board = buildBoard(R, new Set());
    path = [];
    let k = 0;
    for (let r = -R; r <= R; r++) {
      const row = board.cells.map((c, i) => (c.r === r ? i : -1)).filter((i) => i >= 0);
      path.push(...(k++ % 2 ? row.reverse() : row));
    }
  }
  const N = path.length;
  const givens = new Array<number>(N).fill(0);
  givens[path[0]] = 1;
  givens[path[N - 1]] = N;
  const extra = Math.max(0, Math.round(N * giveFrac) - 2);
  // spread the givens out: pick from evenly spaced buckets
  const inner = Array.from({ length: N - 2 }, (_, i) => i + 1);
  for (let g = 0; g < extra; g++) {
    const lo = Math.floor((g * inner.length) / extra),
      hi = Math.floor(((g + 1) * inner.length) / extra) - 1;
    const k = inner[rng.int(lo, Math.max(lo, hi))];
    givens[path[k]] = k + 1;
  }
  return { ...board, path, givens };
}
