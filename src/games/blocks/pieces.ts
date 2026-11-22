import type { Rng } from '../../core/rng';

export interface Piece {
  /** cells as [row, col] from the top-left of the bounding box */
  cells: [number, number][];
  w: number;
  h: number;
  /** family index (also the colour index) */
  fam: number;
  /** size tier: 1 tiny … 5 huge (drives which levels use it) */
  tier: number;
}

const norm = (cs: [number, number][]): [number, number][] => {
  const r0 = Math.min(...cs.map((c) => c[0])),
    c0 = Math.min(...cs.map((c) => c[1]));
  return cs.map(([r, c]) => [r - r0, c - c0] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
};
const rot = (cs: [number, number][]) => norm(cs.map(([r, c]) => [c, -r] as [number, number]));
const flip = (cs: [number, number][]) => norm(cs.map(([r, c]) => [r, -c] as [number, number]));
const parse = (art: string): [number, number][] =>
  norm(
    art
      .split('/')
      .flatMap((row, r) =>
        [...row].map((ch, c) => (ch === '#' ? ([r, c] as [number, number]) : null)).filter((x): x is [number, number] => !!x),
      ),
  );

/** Families: art, tier, whether mirror images count as separate pieces. */
const FAMILIES: [string, number, boolean][] = [
  ['#', 1, false],
  ['##', 1, false],
  ['###', 2, false],
  ['##/#.', 2, false],
  ['##/##', 2, false],
  ['####', 3, false],
  ['###/.#.', 3, false],
  ['###/#..', 3, true],
  ['##./.##', 4, true],
  ['#####', 4, false],
  ['###/#../#..', 4, false],
  ['###/###/###', 5, false],
  ['##/##/#.', 5, true],
  ['###/###', 5, false],
];

/** Every orientation of every family, deduplicated. */
export const PIECES: Piece[] = (() => {
  const out: Piece[] = [];
  FAMILIES.forEach(([art, tier, mirror], fam) => {
    const seen = new Set<string>();
    let cs = parse(art);
    for (let m = 0; m < (mirror ? 2 : 1); m++) {
      for (let k = 0; k < 4; k++) {
        const key = JSON.stringify(cs);
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ cells: cs, w: Math.max(...cs.map((c) => c[1])) + 1, h: Math.max(...cs.map((c) => c[0])) + 1, fam, tier });
        }
        cs = rot(cs);
      }
      cs = flip(cs);
    }
  });
  return out;
})();

/** Draw one piece index; `maxTier` limits the size, `bigBias` raises the weight of large ones. */
export function drawPiece(rng: Rng, maxTier: number, bigBias: number): number {
  // weight per family, spread across its orientations
  const famCount = new Map<number, number>();
  PIECES.forEach((p) => famCount.set(p.fam, (famCount.get(p.fam) ?? 0) + 1));
  // 1×1 and 2×1 pieces are never dealt (too easy); they stay in PIECES so saved trays keep their indices.
  const weights = PIECES.map((p) => (p.tier > maxTier || p.cells.length < 3 ? 0 : (1 + bigBias * (p.tier - 1)) / famCount.get(p.fam)!));
  let t = rng.next() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) {
    t -= weights[i];
    if (t <= 0 && weights[i] > 0) return i;
  }
  return weights.findLastIndex((w) => w > 0);
}

export function fits(board: number[], n: number, p: Piece, r: number, c: number) {
  if (r < 0 || c < 0 || r + p.h > n || c + p.w > n) return false;
  return p.cells.every(([dr, dc]) => !board[(r + dr) * n + c + dc]);
}

export function fitsAnywhere(board: number[], n: number, p: Piece) {
  for (let r = 0; r + p.h <= n; r++) for (let c = 0; c + p.w <= n; c++) if (fits(board, n, p, r, c)) return true;
  return false;
}

/** Full rows and columns of a board. */
export function fullLines(board: number[], n: number) {
  const rows: number[] = [],
    cols: number[] = [];
  for (let k = 0; k < n; k++) {
    let rf = true,
      cf = true;
    for (let j = 0; j < n; j++) {
      if (!board[k * n + j]) rf = false;
      if (!board[j * n + k]) cf = false;
    }
    if (rf) rows.push(k);
    if (cf) cols.push(k);
  }
  return { rows, cols };
}
