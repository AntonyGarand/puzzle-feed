import type { Rng } from '../../core/rng';
import { byLevel, type Difficulty } from '../../core/types';
import { ORTHO } from '../../kits/path/grid';

/** Cell contents. */
const ICE = 0;
export const ROCK = 1,
  MINE = 2;

/** Eight directions, clockwise from up: ↑ ↗ → ↘ ↓ ↙ ← ↖ (each diagonal sits between its two orthogonals). */
export const DIRS8: (readonly [number, number])[] = ORTHO.flatMap(([r, c], k) => {
  const [r2, c2] = ORTHO[(k + 1) % 4];
  return [[r, c] as const, [r + r2, c + c2] as const];
});

export interface GemsPuzzle {
  n: number;
  /** ICE, ROCK or MINE per cell. */
  cell: Uint8Array;
  start: number;
  gems: number[];
  /** Fewest moves to collect everything without touching a mine. */
  best: number;
  /** Move limit, or 0 for none. */
  limit: number;
  /** A shortest safe solution (directions), for tests and debugging. */
  path: number[];
}

/**
 * Slide from i in direction dir; returns the cells passed through (excluding i). The slide stops
 * before a rock or the edge. A diagonal step can't squeeze between two rocks that touch corners
 * (both side cells are rocks). Entering a mine ends the slide on the mine (the caller decides the
 * penalty): check `cell[last] === MINE`.
 */
export function slide(n: number, cell: Uint8Array, i: number, dir: number): number[] {
  const [dr, dc] = DIRS8[dir];
  let r = Math.floor(i / n),
    c = i % n;
  const out: number[] = [];
  for (;;) {
    const rr = r + dr,
      cc = c + dc;
    if (rr < 0 || rr >= n || cc < 0 || cc >= n || cell[rr * n + cc] === ROCK) break;
    if (dr && dc && cell[rr * n + c] === ROCK && cell[r * n + cc] === ROCK) break;
    r = rr;
    c = cc;
    out.push(r * n + c);
    if (cell[r * n + c] === MINE) break;
  }
  return out;
}

/**
 * BFS over (position, collected mask), never entering a mine. Returns a shortest move list, or null.
 * `have` lists gems already collected (the start cell's own gem counts as collected too).
 */
export function solveGems(n: number, cell: Uint8Array, start: number, gems: number[], have: Iterable<number> = []): number[] | null {
  const G = gems.length;
  const N = n * n;
  const gemBit = new Int32Array(N);
  gems.forEach((g, k) => (gemBit[g] = 1 << k));
  const endAt = new Int32Array(N * 8).fill(-1);
  const maskAt = new Int32Array(N * 8);
  for (let i = 0; i < N; i++) {
    if (cell[i] !== ICE) continue;
    for (let d = 0; d < 8; d++) {
      const s = slide(n, cell, i, d);
      if (!s.length || cell[s[s.length - 1]] === MINE) continue;
      endAt[i * 8 + d] = s[s.length - 1];
      maskAt[i * 8 + d] = s.reduce((m, x) => m | gemBit[x], 0);
    }
  }
  const full = (1 << G) - 1;
  const S = N << G;
  const prev = new Int32Array(S).fill(-1);
  const how = new Int8Array(S);
  const q = new Int32Array(S);
  let head = 0,
    tail = 0;
  let m0 = gemBit[start];
  for (const g of have) m0 |= gemBit[g];
  const s0 = m0 * N + start;
  prev[s0] = s0;
  q[tail++] = s0;
  while (head < tail) {
    const st = q[head++];
    const m = Math.floor(st / N),
      i = st % N;
    if (m === full) {
      const path: number[] = [];
      for (let x = st; x !== s0; x = prev[x]) path.push(how[x]);
      return path.reverse();
    }
    for (let d = 0; d < 8; d++) {
      const e = endAt[i * 8 + d];
      if (e < 0) continue;
      const ns = (m | maskAt[i * 8 + d]) * N + e;
      if (prev[ns] < 0) {
        prev[ns] = st;
        how[ns] = d;
        q[tail++] = ns;
      }
    }
  }
  return null;
}

export function genGems(rng: Rng, d: Difficulty): GemsPuzzle {
  const n = byLevel(d, [6, 7, 8, 9, 10]);
  const rockP = byLevel(d, [0.12, 0.14, 0.15, 0.16, 0.17]);
  const mines = byLevel(d, [0, 2, 4, 6, 9]);
  const G = byLevel(d, [3, 5, 6, 8, 10]);
  const walk = byLevel(d, [5, 8, 11, 14, 18]);
  const minBest = byLevel(d, [3, 4, 6, 8, 10]);
  const slack = byLevel(d, [0, 0, 0, 3, 1]);
  const N = n * n;
  let fallback: GemsPuzzle | null = null;
  for (let attempt = 0; attempt < 80; attempt++) {
    const cell = new Uint8Array(N);
    for (let i = 0; i < N; i++) cell[i] = rng.chance(rockP) ? ROCK : ICE;
    const free = Array.from({ length: N }, (_, i) => i).filter((i) => !cell[i]);
    const start = rng.pick(free);
    // A random walk of slides; gems go on cells it passes, mines never do.
    const used = new Uint8Array(N);
    used[start] = 1;
    const stops = [start];
    const seen: number[] = [];
    let at = start,
      lastDir = -1;
    for (let k = 0; k < walk; k++) {
      const opts = [0, 1, 2, 3, 4, 5, 6, 7].filter((dir) => dir !== (lastDir + 4) % 8 && slide(n, cell, at, dir).length);
      if (!opts.length) break;
      const dir = rng.pick(opts);
      const s = slide(n, cell, at, dir);
      for (const x of s) {
        used[x] = 1;
        // prefer recording the stopping cell, plus some pass-through cells
        if (x !== start && (x === s[s.length - 1] || rng.chance(0.35))) seen.push(x);
      }
      at = s[s.length - 1];
      stops.push(at);
      lastDir = dir;
    }
    const cand = rng.shuffle([...new Set(seen)]);
    if (cand.length < G) continue;
    const gems = cand.slice(0, G);
    // Mines: mostly on tempting lines (cells some slide from a walk stop would cross), never on the walk.
    // The walk's slides stop at rocks/edges, so they're unchanged and the puzzle stays solvable.
    if (mines) {
      const trap = new Set<number>();
      for (const p of stops) for (let dir = 0; dir < 8; dir++) for (const x of slide(n, cell, p, dir)) if (!used[x]) trap.add(x);
      const traps = rng.shuffle([...trap]);
      const rest = rng.shuffle(free.filter((i) => !used[i] && !trap.has(i)));
      const pool = [...traps.slice(0, Math.ceil(mines * 0.7)), ...rest, ...traps.slice(Math.ceil(mines * 0.7))];
      for (const x of pool.slice(0, mines)) cell[x] = MINE;
    }
    const path = solveGems(n, cell, start, gems);
    if (!path) continue;
    const best = path.length;
    const p: GemsPuzzle = { n, cell, start, gems, best, limit: slack ? best + slack : 0, path };
    if (best >= minBest) return p;
    if (!fallback || best > fallback.best) fallback = p;
  }
  if (fallback) return fallback;
  // Last resort: open board, gems in the far corners.
  const cell = new Uint8Array(N);
  const gems = [n - 1, N - 1, N - n].slice(0, Math.min(3, G));
  const path = solveGems(n, cell, 0, gems)!;
  return { n, cell, start: 0, gems, best: path.length, limit: 0, path };
}
