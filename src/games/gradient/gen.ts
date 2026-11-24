import type { Rng } from '../../core/rng';
import { byLevel, type Difficulty } from '../../core/types';

/** A gradient board: `colors[i]` is the CSS colour that belongs at position i (row-major). */
export interface Gradient {
  cols: number;
  rows: number;
  colors: string[];
  /** Pinned positions: their tile never moves. */
  pinned: boolean[];
  /** The scrambled start: `start[i]` is the tile (its home position) shown at position i. */
  start: number[];
}

type Lab = [number, number, number];

/** OKLab to gamma-encoded sRGB channels (0..1, unclamped). */
function toRgb([L, a, b]: Lab): Lab {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin.map((x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.abs(x) ** (1 / 2.4) * Math.sign(x) - 0.055)) as Lab;
}

const inGamut = (c: Lab) => c.every((x) => x >= -0.0005 && x <= 1.0005);

/** Bring an OKLab colour into sRGB by lowering its chroma (keeps lightness and hue). */
function fit(c: Lab): Lab {
  if (inGamut(toRgb(c))) return c;
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 20; k++) {
    const mid = (lo + hi) / 2;
    if (inGamut(toRgb([c[0], c[1] * mid, c[2] * mid]))) lo = mid;
    else hi = mid;
  }
  return [c[0], c[1] * lo, c[2] * lo];
}

const css = (c: Lab) => {
  const [r, g, b] = toRgb(c).map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255));
  return `rgb(${r} ${g} ${b})`;
};

const dist = (p: Lab, q: Lab) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const lerp = (p: Lab, q: Lab, t: number): Lab => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
const polar = (L: number, C: number, deg: number): Lab => [L, C * Math.cos((deg * Math.PI) / 180), C * Math.sin((deg * Math.PI) / 180)];

/** Which tiles are pinned at each level: the whole rim, every other rim tile, a few rim tiles, or only the corners. */
function pins(cols: number, rows: number, kind: 'rim' | 'alternate' | 'sparse' | 'corners'): boolean[] {
  return Array.from({ length: cols * rows }, (_, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const rim = r === 0 || c === 0 || r === rows - 1 || c === cols - 1;
    const corner = (r === 0 || r === rows - 1) && (c === 0 || c === cols - 1);
    if (corner || kind === 'rim') return rim;
    if (kind === 'alternate') return rim && (r + c) % 2 === 0;
    if (kind === 'sparse') return rim && (r === 0 || r === rows - 1 ? c % 3 === 0 : r % 3 === 0);
    return false;
  });
}

/** The smallest colour step between two side-by-side tiles. */
function minStep(lab: Lab[], cols: number): number {
  let min = Infinity;
  lab.forEach((p, i) => {
    if (i % cols < cols - 1) min = Math.min(min, dist(p, lab[i + 1]));
    if (i + cols < lab.length) min = Math.min(min, dist(p, lab[i + cols]));
  });
  return min;
}

export function generate(rng: Rng, d: Difficulty): Gradient {
  const [cols, rows] = byLevel(d, [
    [5, 5],
    [5, 6],
    [6, 6],
    [6, 7],
    [7, 8],
  ] as const);
  const kind = byLevel(d, ['rim', 'alternate', 'sparse', 'corners', 'corners'] as const);
  const spread = byLevel(d, [80, 70, 60, 52, 45]);
  const [hiL, loL] = byLevel(d, [
    [0.9, 0.45],
    [0.88, 0.5],
    [0.86, 0.52],
    [0.84, 0.55],
    [0.82, 0.58],
  ] as const);
  const need = byLevel(d, [0.03, 0.026, 0.022, 0.02, 0.017]);
  let lab: Lab[] = [];
  for (let attempt = 0; attempt < 30; attempt++) {
    const h = rng.int(0, 359);
    const turn = rng.chance(0.5) ? 1 : -1;
    const C = 0.11 + rng.next() * 0.05;
    const mid = (hiL + loL) / 2;
    const tilt = (rng.next() - 0.5) * 0.12;
    // Hues walk round the corners (top-left, top-right, bottom-right, bottom-left); light and dark sit on one diagonal.
    const at = (k: number, L: number) => fit(polar(L, C, h + turn * k * spread));
    let corners = [at(0, hiL), at(1, mid + tilt), at(3, mid - tilt), at(2, loL)];
    if (rng.chance(0.5)) corners = [corners[1], corners[0], corners[3], corners[2]];
    const [tl, tr, bl, br] = corners;
    const chroma = (c: Lab) => Math.hypot(c[1], c[2]);
    lab = Array.from({ length: cols * rows }, (_, i) => {
      const u = (i % cols) / (cols - 1);
      const v = Math.floor(i / cols) / (rows - 1);
      const c = lerp(lerp(tl, tr, u), lerp(bl, br, u), v);
      // Blending across hues greys the middle out: give it back the corners' chroma.
      const want = (1 - v) * ((1 - u) * chroma(tl) + u * chroma(tr)) + v * ((1 - u) * chroma(bl) + u * chroma(br));
      const k = Math.min(2.5, want / Math.max(chroma(c), 1e-6));
      return fit([c[0], c[1] * k, c[2] * k]);
    });
    if (minStep(lab, cols) >= need) break;
  }
  const pinned = pins(cols, rows, kind);
  const free = pinned.flatMap((p, i) => (p ? [] : [i]));
  const order = rng.shuffle([...free]);
  // No free tile starts at home, so every one of them needs a move.
  for (let pass = 0; pass < 100 && order.some((t, k) => t === free[k]); pass++)
    order.forEach((t, k) => {
      if (t !== free[k]) return;
      const j = (k + 1 + rng.int(0, order.length - 2)) % order.length;
      [order[k], order[j]] = [order[j], order[k]];
    });
  const start = pinned.map((_, i) => i);
  free.forEach((pos, k) => (start[pos] = order[k]));
  return { cols, rows, colors: lab.map(css), pinned, start };
}

/** A position's tile is home. */
export const home = (tiles: readonly number[], i: number) => tiles[i] === i;

export const isSolved = (tiles: readonly number[]) => tiles.every((t, i) => t === i);

/** A saved arrangement is valid when it's a permutation that keeps the pinned tiles home. */
export function validTiles(v: unknown, g: Gradient): v is number[] {
  if (!Array.isArray(v) || v.length !== g.start.length) return false;
  const seen = new Set<number>();
  for (let i = 0; i < v.length; i++) {
    const t: unknown = v[i];
    if (typeof t !== 'number' || !Number.isInteger(t) || t < 0 || t >= v.length || seen.has(t)) return false;
    if (g.pinned[i] && t !== i) return false;
    seen.add(t);
  }
  return true;
}
