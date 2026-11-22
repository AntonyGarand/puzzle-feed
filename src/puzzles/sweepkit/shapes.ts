// Clue shapes for shape-mines: the offsets a cell counts, relative to itself.
import { L } from '../../core/i18n';

export interface Shape {
  offs: readonly (readonly [number, number])[];
  /** Small glyph shown in the tile corner and the legend. */
  glyph: string;
  name(): string;
}

const ring: Shape = {
  offs: [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ],
  glyph: '○',
  name: () => L('ring', 'anneau'),
};
const cross: Shape = {
  offs: [
    [-2, 0],
    [-1, 0],
    [1, 0],
    [2, 0],
    [0, -2],
    [0, -1],
    [0, 1],
    [0, 2],
  ],
  glyph: '+',
  name: () => L('cross', 'croix'),
};
const diag: Shape = {
  offs: [
    [-2, -2],
    [-1, -1],
    [1, 1],
    [2, 2],
    [-2, 2],
    [-1, 1],
    [1, -1],
    [2, -2],
  ],
  glyph: '×',
  name: () => L('diagonal', 'diagonale'),
};
const knight: Shape = {
  offs: [
    [-2, -1],
    [-2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
    [2, -1],
    [2, 1],
  ],
  glyph: '♘',
  name: () => L('knight', 'cavalier'),
};

/** Index = shape id (also the CSS class `s<id>`). */
export const SHAPES: readonly Shape[] = [ring, cross, diag, knight];

/** Cells counted by a clue of shape `s` at cell `i`. */
export function footprint(s: Shape, i: number, cols: number, rows: number): number[] {
  const r = Math.floor(i / cols),
    c = i % cols;
  const out: number[] = [];
  for (const [dr, dc] of s.offs) {
    const rr = r + dr,
      cc = c + dc;
    if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) out.push(rr * cols + cc);
  }
  return out;
}

/**
 * Split the board into `n` convex patches (nearest of `n` random seeds) and give each patch a
 * shape from `use`, every shape at least once. Returns the shape id of every cell.
 */
export function patches(cols: number, rows: number, n: number, use: number[], next: () => number): number[] {
  const seeds: [number, number][] = [];
  for (let tries = 0; seeds.length < n && tries < 400; tries++) {
    const p: [number, number] = [next() * rows, next() * cols];
    const minD = Math.min(rows, cols) / (n > 3 ? 3.2 : 2.4);
    if (seeds.every(([r, c]) => Math.hypot(r - p[0], c - p[1]) >= minD) || tries > 300) seeds.push(p);
  }
  const kinds = seeds.map((_, k) => use[k % use.length]);
  // Shuffle the patch→shape mapping so the shapes land in different places each time.
  for (let k = kinds.length - 1; k > 0; k--) {
    const j = Math.floor(next() * (k + 1));
    [kinds[k], kinds[j]] = [kinds[j], kinds[k]];
  }
  return Array.from({ length: cols * rows }, (_, i) => {
    const r = Math.floor(i / cols) + 0.5,
      c = (i % cols) + 0.5;
    let best = 0;
    for (let k = 1; k < seeds.length; k++)
      if (Math.hypot(r - seeds[k][0], c - seeds[k][1]) < Math.hypot(r - seeds[best][0], c - seeds[best][1])) best = k;
    return kinds[best];
  });
}
