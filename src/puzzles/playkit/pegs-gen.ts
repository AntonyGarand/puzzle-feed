import type { Rng } from '../../core/rng';
import { byLevel, type Difficulty } from '../../core/types';

const ORTHO: [number, number][] = [
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
];
const DIAG: [number, number][] = [
  [-1, -1],
  [-1, 1],
  [1, 1],
  [1, -1],
];

export interface PegsPuzzle {
  cols: number;
  rows: number;
  /** `holes[i]`: cell i is part of the board. */
  holes: boolean[];
  /** Starting pegs (cell indexes). */
  pegs: number[];
  diag: boolean;
  /** Cell the last peg must end on, or -1 for anywhere. */
  goal: number;
}

export interface Jump {
  from: number;
  over: number;
  to: number;
}

/** Every legal jump on a board (all of them, or only those from `only`). */
export function jumps(P: Pick<PegsPuzzle, 'cols' | 'rows' | 'holes' | 'diag'>, peg: boolean[], only = -1): Jump[] {
  const { cols, rows, holes } = P;
  const out: Jump[] = [];
  const dirs = P.diag ? [...ORTHO, ...DIAG] : ORTHO;
  for (let i = only < 0 ? 0 : only; i < (only < 0 ? cols * rows : only + 1); i++) {
    if (!peg[i]) continue;
    const r = Math.floor(i / cols),
      c = i % cols;
    for (const [dr, dc] of dirs) {
      const r2 = r + 2 * dr,
        c2 = c + 2 * dc;
      if (r2 < 0 || r2 >= rows || c2 < 0 || c2 >= cols) continue;
      const over = (r + dr) * cols + c + dc,
        to = r2 * cols + c2;
      if (holes[to] && !peg[to] && peg[over]) out.push({ from: i, over, to });
    }
  }
  return out;
}

/** The classic 33-hole cross, every hole filled but the centre. */
function cross(): PegsPuzzle {
  const holes = Array.from({ length: 49 }, (_, i) => {
    const r = Math.floor(i / 7),
      c = i % 7;
    return (r >= 2 && r <= 4) || (c >= 2 && c <= 4);
  });
  const pegs = holes.map((h, i) => (h && i !== 24 ? i : -1)).filter((i) => i >= 0);
  return { cols: 7, rows: 7, holes, pegs, diag: false, goal: 24 };
}

/** Share of random playouts that clear the board: a cheap "how forgiving is it" measure. */
function luck(rng: Rng, P: PegsPuzzle, tries: number): number {
  let wins = 0;
  for (let t = 0; t < tries; t++) {
    const peg = new Array<boolean>(P.cols * P.rows).fill(false);
    for (const i of P.pegs) peg[i] = true;
    let left = P.pegs.length;
    for (let js = jumps(P, peg); js.length; js = jumps(P, peg)) {
      const j = rng.pick(js);
      peg[j.from] = peg[j.over] = false;
      peg[j.to] = true;
      left--;
    }
    if (left === 1) wins++;
  }
  return wins / tries;
}

/**
 * Random solvable board: start from one peg and "unjump" (a peg at A becomes pegs at B and C, where
 * B is next to A and C beyond it) until the wanted count. Playing those moves forward clears the board;
 * extra empty holes only add options, so the board stays solvable.
 */
export function genPegs(rng: Rng, d: Difficulty): PegsPuzzle {
  if (d === 5) return cross();
  const size = byLevel(d, [5, 5, 6, 7, 7]);
  const want = byLevel(d, [6, 8, 11, 14, 14]);
  const maxLuck = byLevel(d, [0.6, 0.35, 0.2, 0.1, 0.1]);
  const diag = d === 2 || d === 4;
  const dirs = diag ? [...ORTHO, ...DIAG] : ORTHO;
  const N = size * size;
  let best: PegsPuzzle | null = null,
    bestLuck = 2;
  for (let attempt = 0; attempt < 40 && bestLuck > maxLuck; attempt++) {
    const peg = new Array<boolean>(N).fill(false);
    // every cell that ever holds a peg must be a hole
    const used = new Array<boolean>(N).fill(false);
    const lo = Math.floor(size / 2) - 1;
    const first = rng.int(lo, lo + 2) * size + rng.int(lo, lo + 2);
    peg[first] = used[first] = true;
    let count = 1;
    for (let step = 0; step < want * 6 && count < want; step++) {
      const opts: { a: number; b: number; c: number }[] = [];
      for (let a = 0; a < N; a++) {
        if (!peg[a]) continue;
        const r = Math.floor(a / size),
          col = a % size;
        for (const [dr, dc] of dirs) {
          const r2 = r + 2 * dr,
            c2 = col + 2 * dc;
          if (r2 < 0 || r2 >= size || c2 < 0 || c2 >= size) continue;
          const b = (r + dr) * size + col + dc,
            c = r2 * size + c2;
          if (!peg[b] && !peg[c]) opts.push({ a, b, c });
        }
      }
      if (!opts.length) break;
      const m = rng.pick(opts);
      peg[m.a] = false;
      peg[m.b] = peg[m.c] = used[m.b] = used[m.c] = true;
      count++;
    }
    if (count < want) continue;
    // Crop to the bounding box of every cell the solution uses, then cut the unused corners.
    let r0 = size,
      r1 = 0,
      c0 = size,
      c1 = 0;
    for (let i = 0; i < N; i++) {
      if (!used[i]) continue;
      const r = Math.floor(i / size),
        c = i % size;
      r0 = Math.min(r0, r);
      r1 = Math.max(r1, r);
      c0 = Math.min(c0, c);
      c1 = Math.max(c1, c);
    }
    // Keep the board at least 3 wide each way.
    while (r1 - r0 < 2) r1 < size - 1 ? r1++ : r0--;
    while (c1 - c0 < 2) c1 < size - 1 ? c1++ : c0--;
    const cols = c1 - c0 + 1,
      rows = r1 - r0 + 1;
    const map = (i: number) => (Math.floor(i / size) - r0) * cols + (i % size) - c0;
    const holes = new Array<boolean>(cols * rows).fill(true);
    const usedC = new Array<boolean>(cols * rows).fill(false);
    for (let i = 0; i < N; i++) if (used[i]) usedC[map(i)] = true;
    for (const k of [0, cols - 1, (rows - 1) * cols, rows * cols - 1]) if (!usedC[k]) holes[k] = false;
    const P: PegsPuzzle = { cols, rows, holes, pegs: [], diag, goal: -1 };
    for (let i = 0; i < N; i++) if (peg[i]) P.pegs.push(map(i));
    const l = luck(rng, P, 40);
    if (l < bestLuck) {
      best = P;
      bestLuck = l;
    }
  }
  return best ?? cross();
}

/** What the solver knows about a position. */
export type PegVerdict = { status: 'win'; next: Jump | null } | { status: 'dead' } | { status: 'capped' };

/**
 * Peg solver with memory: positions proven solvable keep their next jump, positions proven hopeless
 * are remembered, and a search that runs out of budget proves nothing (it is never cached as dead).
 */
export function pegSolver(P: Pick<PegsPuzzle, 'cols' | 'rows' | 'holes' | 'diag' | 'goal'>) {
  const win = new Map<string, Jump | null>();
  const dead = new Set<string>();
  const N = P.cols * P.rows;
  const key = (p: boolean[]) => {
    let s = '';
    for (let i = 0; i < N; i += 30) {
      let v = 0;
      for (let j = i; j < Math.min(N, i + 30); j++) v = v * 2 + (p[j] ? 1 : 0);
      s += `${v.toString(36)},`;
    }
    return s;
  };
  const won = (p: boolean[]) => {
    let c = 0;
    for (const v of p) if (v) c++;
    return c === 1 && (P.goal < 0 || p[P.goal]);
  };
  return (peg: boolean[], budget: number): PegVerdict => {
    let nodes = 0;
    let capped = false;
    const go = (p: boolean[]): boolean => {
      if (won(p)) return true;
      const k = key(p);
      if (win.has(k)) return true;
      if (dead.has(k)) return false;
      if (++nodes > budget) {
        capped = true;
        return false;
      }
      for (const j of jumps(P, p)) {
        p[j.from] = p[j.over] = false;
        p[j.to] = true;
        const ok = go(p);
        p[j.from] = p[j.over] = true;
        p[j.to] = false;
        if (ok) {
          win.set(k, j);
          return true;
        }
        if (capped) return false;
      }
      dead.add(k);
      return false;
    };
    const p = peg.slice();
    if (go(p)) return { status: 'win', next: won(p) ? null : (win.get(key(p)) ?? null) };
    return capped ? { status: 'capped' } : { status: 'dead' };
  };
}
