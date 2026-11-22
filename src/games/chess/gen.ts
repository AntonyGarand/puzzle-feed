import type { Rng } from '../../core/rng';

/**
 * Compact chess engine for generated tactics: no castling, no en passant, promotion to queen only.
 * Board: Int8Array(64), index = row * 8 + col, row 0 = rank 8 (top). White > 0, black < 0.
 * Pieces: 1 pawn, 2 knight, 3 bishop, 4 rook, 5 queen, 6 king. Move = from * 64 + to.
 */
export type Board = Int8Array;
const P = 1,
  N = 2,
  B = 3,
  R = 4,
  Q = 5,
  K = 6;

const KN: number[][] = [];
const KG: number[][] = [];
const RAYS: number[][][] = []; // [sq][dir] -> squares; dirs 0-3 orthogonal, 4-7 diagonal
const DIRS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];
for (let sq = 0; sq < 64; sq++) {
  const r = sq >> 3,
    c = sq & 7;
  KN[sq] = [];
  for (const [dr, dc] of [
    [-2, -1],
    [-2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
    [2, -1],
    [2, 1],
  ]) {
    const rr = r + dr,
      cc = c + dc;
    if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) KN[sq].push(rr * 8 + cc);
  }
  KG[sq] = [];
  RAYS[sq] = [];
  for (const [dr, dc] of DIRS) {
    if (r + dr >= 0 && r + dr < 8 && c + dc >= 0 && c + dc < 8) KG[sq].push((r + dr) * 8 + c + dc);
    const ray: number[] = [];
    for (let rr = r + dr, cc = c + dc; rr >= 0 && rr < 8 && cc >= 0 && cc < 8; rr += dr, cc += dc) ray.push(rr * 8 + cc);
    RAYS[sq].push(ray);
  }
}

export const from = (m: number) => m >> 6;
export const to = (m: number) => m & 63;

/** Is `sq` attacked by the given side? */
function attacked(b: Board, sq: number, byWhite: boolean): boolean {
  const s = byWhite ? 1 : -1;
  const r = sq >> 3,
    c = sq & 7;
  const pr = byWhite ? r + 1 : r - 1; // attacking pawn's row
  if (pr >= 0 && pr < 8) {
    if (c > 0 && b[pr * 8 + c - 1] === s * P) return true;
    if (c < 7 && b[pr * 8 + c + 1] === s * P) return true;
  }
  for (const t of KN[sq]) if (b[t] === s * N) return true;
  for (const t of KG[sq]) if (b[t] === s * K) return true;
  for (let d = 0; d < 8; d++) {
    for (const t of RAYS[sq][d]) {
      const p = b[t];
      if (!p) continue;
      if (p * s > 0) {
        const a = p * s;
        if (a === Q || (d < 4 ? a === R : a === B)) return true;
      }
      break;
    }
  }
  return false;
}

function kingSq(b: Board, white: boolean): number {
  const k = white ? K : -K;
  for (let i = 0; i < 64; i++) if (b[i] === k) return i;
  return -1;
}
const inCheck = (b: Board, white: boolean) => attacked(b, kingSq(b, white), !white);

function pseudo(b: Board, white: boolean): number[] {
  const s = white ? 1 : -1;
  const out: number[] = [];
  for (let sq = 0; sq < 64; sq++) {
    const p = b[sq] * s;
    if (p <= 0) continue;
    if (p === P) {
      const r = sq >> 3,
        c = sq & 7;
      const nr = r - s;
      if (nr < 0 || nr > 7) continue;
      const f = nr * 8 + c;
      if (!b[f]) {
        out.push(sq * 64 + f);
        const start = white ? 6 : 1;
        const f2 = (nr - s) * 8 + c;
        if (r === start && !b[f2]) out.push(sq * 64 + f2);
      }
      if (c > 0 && b[f - 1] * s < 0) out.push(sq * 64 + f - 1);
      if (c < 7 && b[f + 1] * s < 0) out.push(sq * 64 + f + 1);
    } else if (p === N || p === K) {
      for (const t of p === N ? KN[sq] : KG[sq]) if (b[t] * s <= 0) out.push(sq * 64 + t);
    } else {
      const d0 = p === B ? 4 : 0,
        d1 = p === R ? 4 : 8;
      for (let d = d0; d < d1; d++) {
        for (const t of RAYS[sq][d]) {
          if (b[t] * s > 0) break;
          out.push(sq * 64 + t);
          if (b[t]) break;
        }
      }
    }
  }
  return out;
}

export function apply(b: Board, m: number): Board {
  const nb = b.slice();
  const f = m >> 6,
    t = m & 63;
  const p = nb[f];
  nb[t] = p;
  nb[f] = 0;
  if ((p === P && t < 8) || (p === -P && t >= 56)) nb[t] = p > 0 ? Q : -Q;
  return nb;
}

export function legal(b: Board, white: boolean): number[] {
  return pseudo(b, white).filter((m) => !inCheck(apply(b, m), white));
}
function hasLegal(b: Board, white: boolean): boolean {
  for (const m of pseudo(b, white)) if (!inCheck(apply(b, m), white)) return true;
  return false;
}
export const isMate = (b: Board, white: boolean) => inCheck(b, white) && !hasLegal(b, white);

/** White mating moves (stops counting at `stop`). */
function matesIn1(b: Board, stop = 99): number[] {
  const out: number[] = [];
  for (const m of pseudo(b, true)) {
    const nb = apply(b, m);
    if (inCheck(nb, true) || !inCheck(nb, false) || hasLegal(nb, false)) continue;
    out.push(m);
    if (out.length >= stop) break;
  }
  return out;
}

/** Black replies ordered king moves first, then captures. */
function replies(b: Board): number[] {
  const ms = legal(b, false);
  const score = (m: number) => (b[from(m)] === -K ? 0 : b[to(m)] ? 1 : 2);
  return ms.sort((x, y) => score(x) - score(y));
}

/** Does white move m force mate next move against every defence? */
export function forcesMate2(b: Board, m: number): boolean {
  const nb = apply(b, m);
  if (inCheck(nb, true)) return false;
  const rs = replies(nb);
  if (!rs.length) return false; // mate in 1 or stalemate
  for (const r of rs) if (!matesIn1(apply(nb, r), 1).length) return false;
  return true;
}

/** Keys that force mate in 2 (stops at `stop`). */
function mate2Keys(b: Board, stop = 2): number[] {
  const out: number[] = [];
  for (const m of legal(b, true)) {
    if (forcesMate2(b, m)) {
      out.push(m);
      if (out.length >= stop) break;
    }
  }
  return out;
}

/** Most stubborn black defence after the key: the one leaving white the fewest mates. */
export function bestDefence(b: Board): number {
  let best = -1,
    bestN = 99;
  for (const r of replies(b)) {
    const n = matesIn1(apply(b, r)).length;
    if (n < bestN) {
      best = r;
      bestN = n;
    }
  }
  return best;
}

// ---------- generation ----------

export interface Puzzle {
  board: number[];
  mateIn: 1 | 2;
  key: number;
}

const LETTER: Record<string, number> = { P, N, B, R, Q };

function place(rng: Rng, white: string[], black: string[]): Board | null {
  const b = new Int8Array(64);
  const free = (sq: number) => !b[sq];
  // black king: mostly on an edge
  let bk: number;
  if (rng.chance(0.75)) {
    const e = rng.int(0, 3),
      k = rng.int(0, 7);
    bk = e === 0 ? k : e === 1 ? 56 + k : e === 2 ? k * 8 : k * 8 + 7;
  } else bk = rng.int(0, 63);
  b[bk] = -K;
  let wk = -1;
  for (let t = 0; t < 20; t++) {
    const near = rng.chance(0.5);
    const cand = near ? Math.min(63, Math.max(0, bk + rng.int(-2, 2) * 8 + rng.int(-2, 2))) : rng.int(0, 63);
    const dr = Math.abs((cand >> 3) - (bk >> 3)),
      dc = Math.abs((cand & 7) - (bk & 7));
    if (free(cand) && Math.max(dr, dc) >= 2) {
      wk = cand;
      break;
    }
  }
  if (wk < 0) return null;
  b[wk] = K;
  const put = (letter: string, s: number) => {
    for (let t = 0; t < 20; t++) {
      const sq = letter === 'P' ? rng.int(8, 55) : rng.int(0, 63);
      if (free(sq)) {
        b[sq] = s * LETTER[letter];
        return true;
      }
    }
    return false;
  };
  for (const l of white) if (!put(l, 1)) return null;
  for (const l of black) if (!put(l, -1)) return null;
  if (inCheck(b, false) || inCheck(b, true)) return null;
  return b;
}

const W1 = [['Q'], ['R', 'R'], ['Q', 'B'], ['R', 'N'], ['R', 'B'], ['Q', 'N']];
const W2 = [
  ['Q', 'R'],
  ['R', 'B', 'N'],
  ['Q', 'N', 'P'],
  ['R', 'R', 'B'],
  ['Q', 'B', 'P'],
  ['R', 'N', 'N'],
];
const B1 = [[], ['P'], ['P', 'P']];
const B2 = [
  ['P', 'P'],
  ['P', 'N'],
  ['P', 'B'],
  ['P', 'P', 'R'],
  ['N', 'P', 'P'],
  ['B', 'P', 'P'],
];
const B3 = [
  ['P', 'P', 'N'],
  ['P', 'P', 'B'],
  ['R', 'P', 'P'],
  ['P', 'P', 'P', 'N'],
  ['Q', 'P', 'P'],
  ['R', 'B', 'P'],
];

function mate1(rng: Rng, white: string[][], black: string[][], cap: number): Puzzle | null {
  for (let t = 0; t < cap; t++) {
    const b = place(rng, rng.pick(white), rng.pick(black));
    if (!b) continue;
    const ms = matesIn1(b, 2);
    if (ms.length === 1) return { board: [...b], mateIn: 1, key: ms[0] };
  }
  return null;
}

function mate2(rng: Rng, white: string[][], black: string[][], cap: number): Puzzle | null {
  for (let t = 0; t < cap; t++) {
    const b = place(rng, rng.pick(white), rng.pick(black));
    if (!b) continue;
    // quick filters: black king boxed in, no mate in 1
    const bk = kingSq(b, false);
    let room = 0;
    for (const s of KG[bk]) if (b[s] >= 0 && !attacked(b, s, true)) room++;
    if (room > 3) continue;
    if (matesIn1(b, 1).length) continue;
    const keys = mate2Keys(b, 2);
    if (keys.length === 1) return { board: [...b], mateIn: 2, key: keys[0] };
  }
  return null;
}

const FALLBACK: Puzzle = (() => {
  // White Kf6, Ra1; black Kh8, Ph7: Ra8# is the only mate.
  const b = new Int8Array(64);
  b[7] = -K; // h8
  b[21] = K; // f6
  b[56] = R; // a1
  b[15] = -P; // h7
  return { board: [...b], mateIn: 1, key: 56 * 64 + 0 };
})();

export function generate(rng: Rng, level: number): Puzzle {
  let p: Puzzle | null;
  if (level === 1) p = mate1(rng, W1, B1, 400);
  else if (level === 2) p = mate1(rng, W2, B2, 400);
  else if (level === 3) p = mate2(rng, W1, B1, 300);
  else if (level === 4) p = mate2(rng, [...W1, ...W2], B2, 400);
  else p = mate2(rng, W2, B3, 400);
  return p ?? mate1(rng, W2, B2, 400) ?? FALLBACK;
}
