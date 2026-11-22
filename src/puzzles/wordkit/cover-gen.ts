// Generator for the word-cover game: a cols×rows letter grid split exactly into hidden words,
// each laid along a path of touching cells (sideways or diagonal), with no two diagonal links crossing.
import type { Rng } from '../../core/rng';
import { answers } from './lexicon';

export interface CoverSpec {
  cols: number;
  rows: number;
  /** Word length range. */
  lo: number;
  hi: number;
  /** Word count range (clamped to what the lengths allow). */
  kMin: number;
  kMax: number;
  /** Cost of a diagonal step when laying the paths: high = mostly straight words, 0 = diagonals as often as not. */
  diag: number;
}

export interface Cover {
  letters: string[];
  words: string[];
  /** Cell indices of each word, in spelling order. */
  paths: number[][];
}

/** Random word lengths in [lo, hi] adding up to `total`. */
function lengths(rng: Rng, total: number, s: CoverSpec): number[] {
  const kLo = Math.max(s.kMin, Math.ceil(total / s.hi));
  const kHi = Math.max(kLo, Math.min(s.kMax, Math.floor(total / s.lo)));
  const k = rng.int(kLo, kHi);
  const out = new Array<number>(k).fill(s.lo);
  let extra = total - k * s.lo;
  while (extra > 0) {
    const open = out.map((v, i) => (v < s.hi ? i : -1)).filter((i) => i >= 0);
    if (!open.length) break;
    out[rng.pick(open)]++;
    extra--;
  }
  return out;
}

/**
 * A random path visiting every cell once (king moves), where no two diagonal steps cross.
 * Warnsdorff-ordered DFS with noise and a node budget; null when the budget runs out.
 */
function tour(rng: Rng, cols: number, rows: number, diagCost: number): number[] | null {
  const n = cols * rows;
  const seen = new Array<boolean>(n).fill(false);
  // Diagonal steps used, per 2×2 block: bit 1 = "\", bit 2 = "/".
  const diags = new Uint8Array(n);
  const path: number[] = [];
  let budget = 3000;
  const nb = (i: number) => {
    const r = Math.floor(i / cols),
      c = i % cols;
    const out: number[] = [];
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr,
          cc = c + dc;
        if ((dr || dc) && rr >= 0 && rr < rows && cc >= 0 && cc < cols) out.push(rr * cols + cc);
      }
    return out;
  };
  const block = (a: number, b: number) => {
    const ra = Math.floor(a / cols),
      ca = a % cols,
      rb = Math.floor(b / cols),
      cb = b % cols;
    if (ra === rb || ca === cb) return null;
    return { at: Math.min(ra, rb) * cols + Math.min(ca, cb), bit: rb - ra === cb - ca ? 1 : 2 };
  };
  const degree = (j: number) => nb(j).filter((x) => !seen[x]).length;
  const go = (i: number): boolean => {
    if (path.length === n) return true;
    if (--budget < 0) return false;
    const opts = nb(i)
      .filter((j) => {
        if (seen[j]) return false;
        const d = block(i, j);
        return !d || !(diags[d.at] & (3 - d.bit));
      })
      .map((j) => ({ j, w: degree(j) + (block(i, j) ? diagCost : 0) + rng.next() * 1.5 }))
      .sort((a, b) => a.w - b.w);
    for (const { j } of opts) {
      const d = block(i, j);
      seen[j] = true;
      path.push(j);
      if (d) diags[d.at] |= d.bit;
      // Leaving i strands an unvisited neighbour of it with no unvisited neighbour left: unless it's the
      // very last cell and j touches it, that's a dead end.
      const stranded = nb(i).some((x) => !seen[x] && degree(x) === 0 && (path.length < n - 1 || !nb(j).includes(x)));
      if (!stranded && go(j)) return true;
      if (d) diags[d.at] &= ~d.bit;
      path.pop();
      seen[j] = false;
      if (budget < 0) return false;
    }
    return false;
  };
  const start = rng.int(0, n - 1);
  seen[start] = true;
  path.push(start);
  return go(start) ? path : null;
}

/** Back-and-forth path through the rows: always valid, used only if every random attempt fails. */
const serpentine = (cols: number, rows: number) =>
  Array.from({ length: rows }, (_r, r) => Array.from({ length: cols }, (_c, c) => r * cols + (r % 2 ? cols - 1 - c : c))).flat();

export function makeCover(rng: Rng, s: CoverSpec): Cover {
  const n = s.cols * s.rows;
  let full: number[] | null = null;
  for (let attempt = 0; attempt < 30 && !full; attempt++) full = tour(rng, s.cols, s.rows, s.diag);
  full ??= serpentine(s.cols, s.rows);
  const lens = lengths(rng, n, s);
  const paths: number[][] = [];
  let at = 0;
  for (const len of lens) {
    const seg = full.slice(at, at + len);
    paths.push(rng.chance(0.5) ? seg.reverse() : seg);
    at += len;
  }
  const words: string[] = [];
  const letters = new Array<string>(n).fill('');
  for (const p of paths) {
    const pool = answers(p.length);
    let w = rng.pick(pool);
    for (let k = 0; k < 20 && words.includes(w); k++) w = rng.pick(pool);
    words.push(w);
    p.forEach((cell, k) => (letters[cell] = w[k]));
  }
  return { letters, words, paths };
}
