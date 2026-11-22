// Zigzag: cover the grid with lines, one per number. Each line starts on its number, visits that
// many cells and no other number, never goes straight through two cells in a row and never turns
// the same way in two cells in a row. Rule idea inspired by Arvi Teikari's (Hempuli) paper puzzle
// collections; the generator, solver and puzzles here are our own. Not a PuzzleDef module.
import type { Rng } from '../../core/rng';
import { nbrs } from '../../kits/path/grid';

/** Direction of the step a→b: 0 up, 1 right, 2 down, 3 left. */
const dirOf = (a: number, b: number, cols: number) => (b === a - cols ? 0 : b === a + 1 ? 1 : b === a + cols ? 2 : 3);

/**
 * Turn in each inner cell of a path: 0 straight, 1 right, 3 left (2 = U-turn, never valid).
 * `turns[j]` belongs to `path[j + 1]`.
 */
export function turnsOf(path: number[], cols: number): number[] {
  const out: number[] = [];
  for (let j = 1; j + 1 < path.length; j++) out.push((dirOf(path[j], path[j + 1], cols) - dirOf(path[j - 1], path[j], cols) + 4) % 4);
  return out;
}

/**
 * Index (into `path`) of the first cell that breaks the twist rules: the second of two straight
 * cells in a row, or the second of two same-way turns in a row. -1 when fine.
 */
export function twistError(path: number[], cols: number): number {
  const t = turnsOf(path, cols);
  for (let j = 0; j < t.length; j++) {
    if (t[j] === 2 || (j > 0 && t[j] === t[j - 1])) return j + 1;
  }
  return -1;
}

interface Path {
  cells: number[];
  lo: number;
  hi: number;
}

const maskOf = (cells: number[]) => {
  let lo = 0,
    hi = 0;
  for (const i of cells) {
    if (i < 32) lo |= 1 << i;
    else hi |= 1 << (i - 32);
  }
  return { lo: lo >>> 0, hi: hi >>> 0 };
};

/** Every valid line of 2..maxLen cells starting at `s` (oriented from s). */
function linesFrom(s: number, cols: number, rows: number, maxLen: number, out: Path[]) {
  const path = [s];
  const on = new Set([s]);
  const rec = (prevTurn: number) => {
    if (path.length >= 2) out.push({ cells: path.slice(), ...maskOf(path) });
    if (path.length >= maxLen) return;
    const last = path[path.length - 1];
    const prevDir = path.length >= 2 ? dirOf(path[path.length - 2], last, cols) : -1;
    for (const j of nbrs(last, cols, rows)) {
      if (on.has(j)) continue;
      let t = -1;
      if (prevDir >= 0) {
        t = (dirOf(last, j, cols) - prevDir + 4) % 4;
        if (t === 2 || t === prevTurn) continue;
      }
      path.push(j);
      on.add(j);
      rec(t);
      path.pop();
      on.delete(j);
    }
  };
  rec(-1);
}

/** Every valid line for the number at `s`: its length, starting on it, through no other number. */
export function numberLines(cols: number, rows: number, clue: ArrayLike<number>, s: number): number[][] {
  const all: Path[] = [];
  linesFrom(s, cols, rows, clue[s], all);
  return all.filter((p) => p.cells.length === clue[s] && p.cells.every((i, k) => k === 0 || clue[i] <= 0)).map((p) => p.cells);
}

export interface Zigzag {
  cols: number;
  rows: number;
  /** Length shown on each number cell, 0 elsewhere. */
  clue: number[];
  /** The unique solution: one line per number, starting on it. */
  lines: number[][];
}

/**
 * Counts solutions up to 2 (2 also when the node budget runs out). Exact cover of the cells by one
 * line per number.
 */
function countZigzag(cols: number, rows: number, clue: ArrayLike<number>, budget: number): number {
  const N = cols * rows;
  const starts: number[] = [];
  for (let i = 0; i < N; i++) if (clue[i] > 0) starts.push(i);
  const cands = starts.map((s) => numberLines(cols, rows, clue, s).map((cells) => ({ cells, ...maskOf(cells) })));
  const full = maskOf([...Array(N).keys()]);
  const done = new Array<boolean>(starts.length).fill(false);
  let count = 0,
    nodes = 0;
  const rec = (lo: number, hi: number, left: number): boolean => {
    if (++nodes > budget) {
      count = 2;
      return true;
    }
    if (left === 0) {
      if (lo === full.lo && hi === full.hi) return ++count >= 2;
      return false;
    }
    let best = -1,
      bestN = Infinity;
    let ulo = lo,
      uhi = hi;
    for (let k = 0; k < starts.length; k++) {
      if (done[k]) continue;
      let m = 0;
      for (const p of cands[k])
        if (!(p.lo & lo) && !(p.hi & hi)) {
          m++;
          ulo |= p.lo;
          uhi |= p.hi;
        }
      if (m === 0) return false;
      if (m < bestN) {
        bestN = m;
        best = k;
      }
    }
    if (ulo >>> 0 !== full.lo || uhi >>> 0 !== full.hi) return false;
    done[best] = true;
    for (const p of cands[best]) {
      if (p.lo & lo || p.hi & hi) continue;
      if (rec((lo | p.lo) >>> 0, (hi | p.hi) >>> 0, left - 1)) {
        done[best] = false;
        return true;
      }
    }
    done[best] = false;
    return false;
  };
  rec(0, 0, starts.length);
  return count;
}

/** A random cover of the grid by valid lines (longer ones favoured), or null. */
function randomCover(cols: number, rows: number, maxLen: number, rng: Rng, budget: number): number[][] | null {
  const N = cols * rows;
  const all: Path[] = [];
  for (let s = 0; s < N; s++) linesFrom(s, cols, rows, maxLen, all);
  const byCell: Path[][] = Array.from({ length: N }, () => []);
  for (const p of all) if (p.cells[0] < p.cells[p.cells.length - 1]) for (const i of p.cells) byCell[i].push(p);
  const used = new Uint8Array(N);
  const out: number[][] = [];
  let nodes = 0;
  const stranded = (cells: number[]) => {
    for (const i of cells) for (const j of nbrs(i, cols, rows)) if (!used[j] && nbrs(j, cols, rows).every((x) => used[x])) return true;
    return false;
  };
  const rec = (): boolean => {
    const a = used.indexOf(0);
    if (a < 0) return true;
    if (++nodes > budget) return false;
    const opts = byCell[a]
      .filter((p) => p.cells.every((i) => !used[i]))
      .map((p) => ({ p, w: p.cells.length + rng.next() * 4 }))
      .sort((x, y) => y.w - x.w);
    for (const { p } of opts.slice(0, 12)) {
      for (const i of p.cells) used[i] = 1;
      out.push(p.cells);
      if (!stranded(p.cells) && rec()) return true;
      out.pop();
      for (const i of p.cells) used[i] = 0;
      if (nodes > budget) return false;
    }
    return false;
  };
  return rec() ? out : null;
}

/**
 * Builds a puzzle with a unique solution: a random cover by lines of 2..maxLen cells, each line
 * numbered on a random end. Covers whose numbers allow another solution are retried.
 */
export function genZigzag(cols: number, rows: number, maxLen: number, rng: Rng, budget = 4000): Zigzag {
  const N = cols * rows;
  let fallback: Zigzag | null = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const cover = randomCover(cols, rows, maxLen, rng, 3000);
    if (!cover) continue;
    for (let tries = 0; tries < 3; tries++) {
      const lines = cover.map((p) => (rng.chance(0.5) ? p.slice() : [...p].reverse()));
      const clue = new Array<number>(N).fill(0);
      for (const p of lines) clue[p[0]] = p.length;
      if (countZigzag(cols, rows, clue, budget) === 1) return { cols, rows, clue, lines };
    }
  }
  // Practically unreachable: dominoes along each row, each numbered 2... with a full search budget.
  for (let attempt = 0; !fallback; attempt++) {
    const cover = randomCover(cols, rows, 2 + (attempt % 2), rng, 1e5);
    if (!cover) continue;
    const clue = new Array<number>(N).fill(0);
    for (const p of cover) clue[p[0]] = p.length;
    if (attempt > 20 || countZigzag(cols, rows, clue, 1e5) === 1) fallback = { cols, rows, clue, lines: cover };
  }
  return fallback;
}
