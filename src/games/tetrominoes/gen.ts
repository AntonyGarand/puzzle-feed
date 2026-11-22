// Tetromino tiling: cut the grid into tetrominoes; two pieces of the same basic shape (I, L, O, S, T;
// mirror images count as the same shape) never share an edge; a clue shows the exact shape and
// orientation of the piece covering its cell. Rule idea inspired by Arvi Teikari's (Hempuli) paper
// puzzle collections; the generator, solver and puzzles here are our own.
import type { Rng } from '../../core/rng';

/** Basic shapes, in display order. */
export const KINDS = ['I', 'L', 'O', 'S', 'T'] as const;

export interface Tetro {
  /** Index into KINDS. */
  kind: number;
  /** Cells as [row, col], sorted in reading order, the first at [0, 0]. */
  cells: [number, number][];
}

const BASE: [number, [number, number][]][] = [
  [
    0,
    [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
    ],
  ],
  [
    1,
    [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
    ],
  ],
  [
    2,
    [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ],
  ],
  [
    3,
    [
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
    ],
  ],
  [
    4,
    [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 1],
    ],
  ],
];

const norm = (cs: [number, number][]): [number, number][] => {
  const s = [...cs].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const [r0, c0] = s[0];
  return s.map(([r, c]) => [r - r0, c - c0]);
};

/** The 19 fixed tetrominoes (every rotation and mirror image). */
export const TETROS: Tetro[] = (() => {
  const out: Tetro[] = [];
  const seen = new Set<string>();
  for (const [kind, base] of BASE) {
    let cs = base;
    for (let m = 0; m < 2; m++) {
      for (let rot = 0; rot < 4; rot++) {
        cs = cs.map(([r, c]) => [c, -r]);
        const n = norm(cs);
        const key = JSON.stringify(n);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ kind, cells: n });
      }
      cs = cs.map(([r, c]) => [r, -c]);
    }
  }
  return out;
})();

/** Cells of tetromino `o` placed with its first cell at `anchor`, or null when it leaves the grid. */
function placeAt(o: number, anchor: number, cols: number, rows: number): number[] | null {
  const r0 = Math.floor(anchor / cols),
    c0 = anchor % cols;
  const out: number[] = [];
  for (const [dr, dc] of TETROS[o].cells) {
    const r = r0 + dr,
      c = c0 + dc;
    if (r < 0 || c < 0 || r >= rows || c >= cols) return null;
    out.push(r * cols + c);
  }
  return out;
}

/** Fixed tetromino id of a set of 4 connected cells, or -1. */
export function shapeOf(cells: number[], cols: number): number {
  if (cells.length !== 4) return -1;
  const key = JSON.stringify(norm(cells.map((i) => [Math.floor(i / cols), i % cols] as [number, number])));
  return TETROS.findIndex((t) => JSON.stringify(t.cells) === key);
}

function nb4(i: number, cols: number, rows: number): number[] {
  const r = Math.floor(i / cols),
    c = i % cols;
  const out: number[] = [];
  if (r > 0) out.push(i - cols);
  if (c < cols - 1) out.push(i + 1);
  if (r < rows - 1) out.push(i + cols);
  if (c > 0) out.push(i - 1);
  return out;
}

/** Every placement (cell list + tetromino id) that covers cell `i`. */
export function placementsCovering(i: number, cols: number, rows: number): { o: number; cells: number[] }[] {
  const out: { o: number; cells: number[] }[] = [];
  const r = Math.floor(i / cols),
    c = i % cols;
  TETROS.forEach((t, o) => {
    for (const [dr, dc] of t.cells) {
      const ar = r - dr,
        ac = c - dc;
      if (ar < 0 || ac < 0 || ar >= rows || ac >= cols) continue;
      const cells = placeAt(o, ar * cols + ac, cols, rows);
      if (cells) out.push({ o, cells });
    }
  });
  return out;
}

/**
 * Mutable board state shared by the generator, the solver and the guide: `owner[i]` is the piece
 * index covering cell i (-1 free), `kind[p]` the basic shape of piece p.
 */
export class TetroBoard {
  owner: Int16Array;
  kind: number[] = [];
  /** Orthogonal neighbours of every cell. */
  readonly nbs: number[][];
  /** Every placement whose first cell (reading order) is the given cell. */
  readonly anchored: { o: number; cells: number[] }[][];
  private seen: Int32Array;
  private stamp = 0;
  constructor(
    readonly cols: number,
    readonly rows: number,
  ) {
    const N = cols * rows;
    this.owner = new Int16Array(N).fill(-1);
    this.seen = new Int32Array(N);
    this.nbs = Array.from({ length: N }, (_, i) => nb4(i, cols, rows));
    this.anchored = Array.from({ length: N }, (_, a) =>
      TETROS.flatMap((_t, o) => {
        const cells = placeAt(o, a, cols, rows);
        return cells ? [{ o, cells }] : [];
      }),
    );
  }
  /** Can `cells` (tetromino `o`) go down: free, ≤1 clue that matches, no same shape alongside. */
  fits(cells: number[], o: number, clue: ArrayLike<number> | null): boolean {
    let clues = 0;
    for (const i of cells) {
      if (this.owner[i] >= 0) return false;
      if (clue && clue[i] >= 0) {
        if (clue[i] !== o || ++clues > 1) return false;
      }
    }
    const k = TETROS[o].kind;
    for (const i of cells)
      for (const j of this.nbs[i]) {
        const p = this.owner[j];
        if (p >= 0 && this.kind[p] === k) return false;
      }
    return true;
  }
  put(cells: number[], o: number): number {
    const p = this.kind.length;
    this.kind.push(TETROS[o].kind);
    for (const i of cells) this.owner[i] = p;
    return p;
  }
  /** Remove the last piece placed. */
  pop(cells: number[]) {
    this.kind.pop();
    for (const i of cells) this.owner[i] = -1;
  }
  /** Every free area touching `near` (all areas when omitted) has a multiple of 4 cells. */
  areasOk(near?: number[]): boolean {
    const N = this.cols * this.rows;
    const seen = this.seen;
    const mark = ++this.stamp;
    const stack: number[] = [];
    const starts: number[] = [];
    if (near) {
      for (const i of near) for (const j of this.nbs[i]) starts.push(j);
    } else for (let s = 0; s < N; s++) starts.push(s);
    for (const s of starts) {
      if (seen[s] === mark || this.owner[s] >= 0) continue;
      seen[s] = mark;
      stack.push(s);
      let size = 0;
      while (stack.length) {
        const i = stack.pop()!;
        size++;
        for (const j of this.nbs[i])
          if (seen[j] !== mark && this.owner[j] < 0) {
            seen[j] = mark;
            stack.push(j);
          }
      }
      if (size % 4) return false;
    }
    return true;
  }
}

/** A random valid tiling (tetromino id per piece, cells per piece), or null if the budget ran out. */
function randomTiling(cols: number, rows: number, rng: Rng, budget: number): { o: number; cells: number[] }[] | null {
  const b = new TetroBoard(cols, rows);
  const pieces: { o: number; cells: number[] }[] = [];
  let nodes = 0;
  const rec = (): boolean => {
    const a = b.owner.indexOf(-1);
    if (a < 0) return true;
    if (++nodes > budget) return false;
    for (const { o, cells } of rng.shuffle(b.anchored[a].slice())) {
      if (!b.fits(cells, o, null)) continue;
      b.put(cells, o);
      pieces.push({ o, cells });
      if (b.areasOk(cells) && rec()) return true;
      pieces.pop();
      b.pop(cells);
      if (nodes > budget) return false;
    }
    return false;
  };
  return rec() ? pieces : null;
}

/**
 * Counts tilings that match the clues (tetromino id per cell, -1 none), up to `cap`. `count` is
 * `cap` when the node budget runs out, so callers treat an exhausted search as "not unique".
 */
function countTilings(cols: number, rows: number, clue: ArrayLike<number>, cap: number, budget: number): number {
  const b = new TetroBoard(cols, rows);
  const N = cols * rows;
  const clueCells: number[] = [];
  for (let i = 0; i < N; i++) if (clue[i] >= 0) clueCells.push(i);
  // The four placements of each clue's own shape that cover it.
  const clueOpts = clueCells.map((c) => placementsCovering(c, cols, rows).filter((p) => p.o === clue[c]));
  let count = 0,
    nodes = 0;
  const cluesOk = () => {
    for (let k = 0; k < clueCells.length; k++) {
      if (b.owner[clueCells[k]] >= 0) continue;
      if (!clueOpts[k].some((p) => b.fits(p.cells, p.o, clue))) return false;
    }
    return true;
  };
  const rec = (): boolean => {
    if (++nodes > budget) {
      count = cap;
      return true;
    }
    const a = b.owner.indexOf(-1);
    if (a < 0) return ++count >= cap;
    for (const { o, cells } of b.anchored[a]) {
      if (!b.fits(cells, o, clue)) continue;
      b.put(cells, o);
      const ok = b.areasOk(cells) && cluesOk();
      if (ok && rec()) {
        b.pop(cells);
        return true;
      }
      b.pop(cells);
    }
    return false;
  };
  rec();
  return count;
}

export interface TetroPuzzle {
  cols: number;
  rows: number;
  /** Tetromino id shown on each cell, -1 when blank. */
  clue: number[];
  /** The unique solution, one entry per piece. */
  pieces: { o: number; cells: number[] }[];
}

/**
 * Builds a puzzle with a unique tiling: one clue per piece first, then clues are removed in random
 * order while the solution stays unique. `extra` keeps that many removable clues on easier levels.
 */
export function genTetro(cols: number, rows: number, extra: number, rng: Rng, budget = 6000): TetroPuzzle {
  const N = cols * rows;
  let best: TetroPuzzle | null = null;
  for (let attempt = 0; attempt < 30 && !best; attempt++) {
    const pieces = randomTiling(cols, rows, rng, 4000);
    if (!pieces) continue;
    for (let tries = 0; tries < 3 && !best; tries++) {
      const clue = new Array<number>(N).fill(-1);
      for (const p of pieces) clue[rng.pick(p.cells)] = p.o;
      if (countTilings(cols, rows, clue, 2, budget * 2) === 1) best = { cols, rows, clue, pieces };
    }
  }
  if (!best) {
    // Practically unreachable (no unique clue set in 30 tilings): one clue per piece, unverified.
    let pieces: { o: number; cells: number[] }[] | null = null;
    while (!pieces) pieces = randomTiling(cols, rows, rng, 1e6);
    const clue = new Array<number>(N).fill(-1);
    for (const p of pieces) clue[p.cells[0]] = p.o;
    return { cols, rows, clue, pieces };
  }
  const { clue } = best;
  const removed: number[] = [];
  for (const i of rng.shuffle(clue.flatMap((v, j) => (v >= 0 ? [j] : [])))) {
    const v = clue[i];
    clue[i] = -1;
    if (countTilings(cols, rows, clue, 2, budget) === 1) removed.push(i);
    else clue[i] = v;
  }
  // Put back a few clues on easier levels (any subset keeps the solution unique).
  const owner = new Array<number>(N).fill(-1);
  best.pieces.forEach((p, k) => p.cells.forEach((i) => (owner[i] = k)));
  for (const i of removed.slice(0, extra)) clue[i] = best.pieces[owner[i]].o;
  return best;
}
