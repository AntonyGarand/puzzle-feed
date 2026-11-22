import type { Rng } from '../../core/rng';

export interface Rect {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}
export interface TilesPuzzle {
  n: number;
  /** Clue value per cell (0 = none). */
  clue: number[];
  /** Intended rectangles (one per clue). */
  rects: Rect[];
  unique: boolean;
}

export const rectCells = (q: Rect, n: number) => {
  const out: number[] = [];
  for (let r = q.r0; r <= q.r1; r++) for (let c = q.c0; c <= q.c1; c++) out.push(r * n + c);
  return out;
};

/** Count solutions up to `cap` within a node budget (exact cover over clue rectangles). */
function solveTiles(n: number, clue: number[], cap: number, budget = 40000): { count: number; complete: boolean } {
  const clues = clue.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  const isClue = clue.map((v) => v > 0);
  // Candidate rectangles per clue, as cell lists.
  const cands = clues.map((p) => {
    const a = clue[p],
      pr = Math.floor(p / n),
      pc = p % n;
    const out: number[][] = [];
    for (let hgt = 1; hgt <= a; hgt++) {
      if (a % hgt) continue;
      const w = a / hgt;
      if (hgt > n || w > n) continue;
      for (let r0 = Math.max(0, pr - hgt + 1); r0 <= Math.min(pr, n - hgt); r0++)
        for (let c0 = Math.max(0, pc - w + 1); c0 <= Math.min(pc, n - w); c0++) {
          const cells = rectCells({ r0, c0, r1: r0 + hgt - 1, c1: c0 + w - 1 }, n);
          if (cells.every((i) => i === p || !isClue[i])) out.push(cells);
        }
    }
    return out;
  });
  const used = new Uint8Array(n * n);
  const done = new Array<boolean>(clues.length).fill(false);
  let count = 0,
    nodes = 0;
  const fits = (cells: number[]) => cells.every((i) => !used[i]);
  const rec = (left: number): boolean => {
    if (++nodes > budget) return false;
    if (left === 0) {
      count++;
      return count < cap;
    }
    let best = -1,
      bestN = Infinity;
    for (let k = 0; k < clues.length; k++) {
      if (done[k]) continue;
      let m = 0;
      for (const cs of cands[k]) if (fits(cs)) m++;
      if (m === 0) return true;
      if (m < bestN) {
        bestN = m;
        best = k;
      }
    }
    done[best] = true;
    for (const cs of cands[best]) {
      if (!fits(cs)) continue;
      for (const i of cs) used[i] = 1;
      const go = rec(left - 1);
      for (const i of cs) used[i] = 0;
      if (!go) {
        done[best] = false;
        return false;
      }
    }
    done[best] = false;
    return true;
  };
  rec(clues.length);
  return { count, complete: nodes <= budget };
}

export function genTiles(n: number, maxArea: number, rng: Rng): TilesPuzzle {
  let best: TilesPuzzle | null = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const owner = new Array<number>(n * n).fill(-1);
    const rects: Rect[] = [];
    for (let i = 0; i < n * n; i++) {
      if (owner[i] >= 0) continue;
      const r0 = Math.floor(i / n),
        c0 = i % n;
      const opts: Rect[] = [],
        all: Rect[] = [];
      let maxW = 0;
      while (c0 + maxW < n && owner[i + maxW] < 0) maxW++;
      for (let w = 1; w <= maxW; w++)
        for (let hgt = 1; r0 + hgt <= n; hgt++) {
          if (w * hgt > maxArea) break;
          let free = true;
          for (let c = c0; c < c0 + w && free; c++) free = owner[(r0 + hgt - 1) * n + c] < 0;
          if (!free) break;
          if (w * hgt < 2) continue;
          const q = { r0, c0, r1: r0 + hgt - 1, c1: c0 + w - 1 };
          all.push(q);
          if (!(w * hgt === 2 && rng.chance(0.5))) opts.push(q);
        }
      const q = opts.length ? rng.pick(opts) : all.length ? rng.pick(all) : { r0, c0, r1: r0, c1: c0 };
      for (const k of rectCells(q, n)) owner[k] = rects.length;
      rects.push(q);
    }
    const clue = new Array<number>(n * n).fill(0);
    for (const q of rects) {
      const cells = rectCells(q, n);
      clue[rng.pick(cells)] = cells.length;
    }
    const { count, complete } = solveTiles(n, clue, 2);
    const p = { n, clue, rects, unique: complete && count === 1 };
    if (p.unique) return p;
    best ??= p;
  }
  return best!;
}
