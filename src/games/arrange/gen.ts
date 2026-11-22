import type { Rng } from '../../core/rng';
import { byLevel, type Difficulty } from '../../core/types';
import { nbrs } from '../../kits/path/grid';

export type Shape = [number, number][];

interface ArrangePiece {
  /** Cells in solution orientation, normalised to (0,0). */
  shape: Shape;
  /** Solution origin on the board. */
  r: number;
  c: number;
  colour: number;
}

export interface ArrangePuzzle {
  rows: number;
  cols: number;
  rotate: boolean;
  pieces: ArrangePiece[];
}

const normalise = (sh: Shape): Shape => {
  const r0 = Math.min(...sh.map((p) => p[0])),
    c0 = Math.min(...sh.map((p) => p[1]));
  return sh.map(([r, c]) => [r - r0, c - c0] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
};
/** Rotate a shape k quarter turns clockwise. */
export const rotated = (sh: Shape, k: number): Shape => {
  let out = sh;
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) out = normalise(out.map(([r, c]) => [c, -r] as [number, number]));
  return out;
};

export function genArrange(rng: Rng, d: Difficulty): ArrangePuzzle {
  const [rows, cols] = byLevel<[number, number]>(d, [
    [4, 4],
    [5, 5],
    [5, 6],
    [6, 6],
    [7, 7],
  ]);
  const [lo, hi] = byLevel<[number, number]>(d, [
    [3, 5],
    [3, 5],
    [3, 5],
    [3, 6],
    [4, 6],
  ]);
  const rotate = d >= 3;
  const N = rows * cols;
  for (let attempt = 0; attempt < 200; attempt++) {
    const owner = new Int32Array(N).fill(-1);
    const groups: number[][] = [];
    let ok = true;
    for (let u = 0; u < N && ok; u++) {
      if (owner[u] >= 0) continue;
      const id = groups.length;
      const g = [u];
      owner[u] = id;
      const size = rng.int(lo, hi);
      while (g.length < size) {
        const front = [...new Set(g.flatMap((i) => nbrs(i, cols, rows)).filter((j) => owner[j] < 0))];
        if (!front.length) break;
        const j = rng.pick(front);
        owner[j] = id;
        g.push(j);
      }
      if (g.length < 2) {
        // merge a stranded cell into the smallest neighbour that has room
        const opts = nbrs(u, cols, rows)
          .map((j) => owner[j])
          .filter((o) => o >= 0 && o !== id && groups[o].length < 6);
        if (!opts.length) ok = false;
        else {
          const o = opts.sort((a, b) => groups[a].length - groups[b].length)[0];
          groups[o].push(u);
          owner[u] = o;
        }
        continue;
      }
      groups.push(g);
    }
    if (!ok) continue;
    // no piece too small at higher levels; avoid trivial 2x2 squares dominating
    if (groups.some((g) => g.length < 2 || g.length > 6)) continue;
    // colour: greedy, neighbours get different colours
    const colour = new Array<number>(groups.length).fill(-1);
    groups.forEach((g, id) => {
      const near = new Set<number>();
      for (const i of g) for (const j of nbrs(i, cols, rows)) if (owner[j] !== id && colour[owner[j]] >= 0) near.add(colour[owner[j]]);
      const free = rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7]).filter((c) => !near.has(c));
      colour[id] = free.length ? free[0] : rng.int(0, 7);
    });
    const pieces = groups.map((g, id) => {
      const raw: Shape = g.map((i) => [Math.floor(i / cols), i % cols]);
      const r = Math.min(...raw.map((p) => p[0])),
        c = Math.min(...raw.map((p) => p[1]));
      return { shape: normalise(raw), r, c, colour: colour[id] };
    });
    return { rows, cols, rotate, pieces };
  }
  // Fallback: straight bars of 2–3 cells along each row.
  const pieces: ArrangePiece[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols;) {
      const rem = cols - c;
      const w = rem === 4 || rem === 2 ? 2 : 3;
      pieces.push({ shape: Array.from({ length: w }, (_, k) => [0, k] as [number, number]), r, c, colour: pieces.length % 8 });
      c += w;
    }
  return { rows, cols, rotate, pieces };
}
