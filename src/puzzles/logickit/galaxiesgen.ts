import type { Rng } from '../../core/rng';

/** A dot in doubled coordinates: cell (r, c) has its centre at (2r + 1, 2c + 1). */
export interface Dot {
  y: number;
  x: number;
}
export interface GalaxiesPuzzle {
  n: number;
  dots: Dot[];
  /** Intended galaxy (dot index) of every cell. */
  sol: number[];
  unique: boolean;
}

/** Mirror of cell `i` through dot `d` on an n×n grid, or -1 when it falls off the grid. */
export function mirror(n: number, d: Dot, i: number): number {
  const r = d.y - Math.floor(i / n) - 1,
    c = d.x - (i % n) - 1;
  return r >= 0 && c >= 0 && r < n && c < n ? r * n + c : -1;
}

/** The 1, 2 or 4 cells a dot touches (they always belong to its galaxy). */
export function dotCells(n: number, d: Dot): number[] {
  const rows = d.y % 2 ? [(d.y - 1) / 2] : [d.y / 2 - 1, d.y / 2];
  const cols = d.x % 2 ? [(d.x - 1) / 2] : [d.x / 2 - 1, d.x / 2];
  const out: number[] = [];
  for (const r of rows) for (const c of cols) if (r >= 0 && c >= 0 && r < n && c < n) out.push(r * n + c);
  return out;
}

const nb = (i: number, n: number) => {
  const r = Math.floor(i / n),
    c = i % n;
  const out: number[] = [];
  if (r > 0) out.push(i - n);
  if (c < n - 1) out.push(i + 1);
  if (r < n - 1) out.push(i + n);
  if (c > 0) out.push(i - 1);
  return out;
};

/**
 * Count solutions up to `cap`, by constraint propagation (symmetry and connectivity) plus search
 * within a node budget.
 */
function solveGalaxies(n: number, dots: Dot[], cap = 2, budget = 1500): { count: number; complete: boolean } {
  const N = n * n,
    D = dots.length;
  const mir = new Int16Array(N * D);
  for (let d = 0; d < D; d++) for (let i = 0; i < N; i++) mir[d * N + i] = mirror(n, dots[d], i);
  const seeds = dots.map((d) => dotCells(n, d));
  const start = new Uint8Array(N * D);
  for (let i = 0; i < N; i++) for (let d = 0; d < D; d++) start[i * D + d] = mir[d * N + i] >= 0 ? 1 : 0;
  const fix = (dom: Uint8Array, i: number, d: number) => {
    for (let e = 0; e < D; e++) dom[i * D + e] = e === d ? 1 : 0;
  };
  for (let d = 0; d < D; d++)
    for (const i of seeds[d]) {
      if (!start[i * D + d]) return { count: 0, complete: true };
      fix(start, i, d);
    }
  const queue = new Int16Array(N);
  const seen = new Uint8Array(N);
  const propagate = (dom: Uint8Array): boolean => {
    for (let changed = true; changed;) {
      changed = false;
      for (let i = 0; i < N; i++) {
        let cnt = 0,
          only = -1;
        for (let d = 0; d < D; d++) {
          if (!dom[i * D + d]) continue;
          const m = mir[d * N + i];
          if (m < 0 || !dom[m * D + d]) {
            dom[i * D + d] = 0;
            changed = true;
          } else {
            cnt++;
            only = d;
          }
        }
        if (!cnt) return false;
        if (cnt === 1) {
          // Fixed cell: its mirror is fixed to the same galaxy.
          const m = mir[only * N + i];
          for (let e = 0; e < D; e++)
            if (e !== only && dom[m * D + e]) {
              dom[m * D + e] = 0;
              changed = true;
            }
        }
      }
      // Connectivity: a galaxy only reaches cells through cells that may still be its own.
      for (let d = 0; d < D; d++) {
        seen.fill(0);
        let head = 0,
          tail = 0;
        for (const i of seeds[d]) {
          seen[i] = 1;
          queue[tail++] = i;
        }
        while (head < tail) {
          const i = queue[head++];
          for (const j of nb(i, n))
            if (!seen[j] && dom[j * D + d]) {
              seen[j] = 1;
              queue[tail++] = j;
            }
        }
        for (let i = 0; i < N; i++)
          if (!seen[i] && dom[i * D + d]) {
            dom[i * D + d] = 0;
            changed = true;
          }
      }
    }
    return true;
  };
  let count = 0,
    nodes = 0;
  const rec = (dom: Uint8Array): boolean => {
    if (++nodes > budget) return false;
    if (!propagate(dom)) return true;
    let best = -1,
      bestN = Infinity;
    for (let i = 0; i < N; i++) {
      let cnt = 0;
      for (let d = 0; d < D; d++) cnt += dom[i * D + d];
      if (cnt > 1 && cnt < bestN) {
        bestN = cnt;
        best = i;
      }
    }
    if (best < 0) {
      count++;
      return count < cap;
    }
    for (let d = 0; d < D; d++) {
      if (!dom[best * D + d]) continue;
      const next = dom.slice();
      fix(next, best, d);
      if (!rec(next)) return false;
    }
    return true;
  };
  rec(start);
  return { count, complete: nodes <= budget };
}

/** Tile an n×n grid with random symmetric galaxies of about `minSize`..`maxSize` cells. */
function tile(n: number, minSize: number, maxSize: number, rng: Rng): { dots: Dot[]; sol: number[] } {
  const N = n * n;
  const owner = new Array<number>(N).fill(-1);
  const dots: Dot[] = [];
  const regions: number[][] = [];
  const targets: number[] = [];
  /** Start a galaxy on a dot touching free cell `s`, or return false. */
  const seed = (s: number, target: number) => {
    const r = Math.floor(s / n),
      c = s % n;
    const opts: { dot: Dot; cells: number[] }[] = [];
    for (const y of [2 * r, 2 * r + 1, 2 * r + 2])
      for (const x of [2 * c, 2 * c + 1, 2 * c + 2]) {
        if (y < 1 || x < 1 || y > 2 * n - 1 || x > 2 * n - 1) continue;
        const dot = { y, x };
        const cells = dotCells(n, dot);
        if (cells.every((i) => owner[i] < 0)) opts.push({ dot, cells });
      }
    // Mix centre, edge and corner dots; corner dots give away four cells, so they're rarer.
    const roll = rng.next();
    const want = roll < 0.4 ? 1 : roll < 0.8 ? 2 : 4;
    const same = opts.filter((o) => o.cells.length === want);
    const { dot, cells } = rng.pick(same.length ? same : opts);
    for (const i of cells) owner[i] = dots.length;
    dots.push(dot);
    regions.push([...cells]);
    targets.push(target);
  };
  /**
   * Add one symmetric pair of free cells to galaxy `g` (in `own`); false when it can't grow. With
   * `toward`, the pair closest to that cell is taken.
   */
  const grow = (g: number, own = owner, region = regions[g], dot = dots[g], limit = targets[g], toward = -1) => {
    if (region.length + 2 > limit) return false;
    const cand: number[] = [];
    for (const i of region)
      for (const j of nb(i, n)) {
        if (own[j] >= 0 || cand.includes(j)) continue;
        const m = mirror(n, dot, j);
        if (m >= 0 && own[m] < 0) cand.push(j);
      }
    if (!cand.length) return false;
    let j = rng.pick(cand);
    if (toward >= 0) {
      const far = (i: number) => Math.abs(Math.floor(i / n) - Math.floor(toward / n)) + Math.abs((i % n) - (toward % n));
      j = cand.reduce((a, b) => (far(b) < far(a) ? b : a), j);
    }
    const m = mirror(n, dot, j);
    own[j] = own[m] = g;
    region.push(j, m);
    return true;
  };
  // Scatter seeds over the grid, then grow them together so they share the space.
  const free = () => owner.flatMap((g, i) => (g < 0 ? [i] : []));
  const batch = Math.max(2, Math.round(N / ((minSize + maxSize) / 2) / 2));
  for (;;) {
    const from = dots.length;
    for (let k = 0; k < batch; k++) {
      const f = free().filter((i) => nb(i, n).filter((j) => owner[j] < 0).length >= 3);
      if (!f.length) break;
      seed(rng.pick(f), rng.int(minSize, maxSize));
    }
    if (dots.length === from) break;
    for (let active = dots.map((_, g) => g).slice(from); active.length;) active = rng.shuffle(active).filter((g) => grow(g));
  }
  // Fill the gaps from the most hemmed-in cell: try every dot nearby and keep the biggest galaxy
  // that covers it, so few cells end up as lone one-cell galaxies.
  for (let left = free(); left.length; left = free()) {
    let at: number[] = [],
      fewest = 5;
    for (const i of left) {
      const f = nb(i, n).filter((j) => owner[j] < 0).length;
      if (f < fewest) {
        fewest = f;
        at = [i];
      } else if (f === fewest) at.push(i);
    }
    const s0 = rng.pick(at);
    const r = Math.floor(s0 / n),
      c = s0 % n;
    const g = dots.length;
    let best: { own: number[]; region: number[]; dot: Dot } | null = null;
    for (let y = Math.max(1, 2 * r - 3); y <= Math.min(2 * n - 1, 2 * r + 5); y++)
      for (let x = Math.max(1, 2 * c - 3); x <= Math.min(2 * n - 1, 2 * c + 5); x++) {
        const dot = { y, x };
        const cells = dotCells(n, dot);
        const m = mirror(n, dot, s0);
        if (m < 0 || owner[m] >= 0 || !cells.every((i) => owner[i] < 0)) continue;
        const own = [...owner],
          region = [...cells];
        for (const i of cells) own[i] = g;
        while (own[s0] !== g && grow(g, own, region, dot, maxSize, s0));
        if (own[s0] !== g) continue;
        const target = rng.int(minSize, maxSize);
        while (grow(g, own, region, dot, target));
        if (!best || region.length > best.region.length) best = { own, region, dot };
      }
    if (best) {
      owner.splice(0, N, ...best.own);
      dots.push(best.dot);
      regions.push(best.region);
      targets.push(maxSize);
    } else {
      seed(s0, rng.int(minSize, maxSize));
      while (grow(g));
    }
  }
  return { dots, sol: owner };
}

/**
 * Several random tilings; keep the unique one with the fewest tiny (1–2 cell) galaxies and given
 * cells, which make a board dull. Falls back to a non-unique tiling (play is validated by the rules anyway).
 */
export function genGalaxies(n: number, minSize: number, maxSize: number, rng: Rng, attempts = 40): GalaxiesPuzzle {
  let best: GalaxiesPuzzle | null = null,
    bestScore = Infinity,
    spare: GalaxiesPuzzle | null = null;
  for (let a = 0; a < attempts * 3 && (!best || a < attempts); a++) {
    const { dots, sol } = tile(n, minSize, maxSize, rng);
    const size = new Array<number>(dots.length).fill(0);
    for (const g of sol) size[g]++;
    // Fewer, bigger galaxies with fewer cells given away by the dots make a better board.
    const givens = dots.reduce((t, d) => t + dotCells(n, d).length, 0);
    const score = dots.length + 2 * size.filter((k) => k <= 2).length + 4 * size.filter((k) => k === 1).length + givens / 2;
    // A board where the dots already cover every cell would start solved.
    if (score >= bestScore || dots.every((d, g) => dotCells(n, d).length === size[g])) continue;
    const { count, complete } = solveGalaxies(n, dots, 2);
    const p = { n, dots, sol, unique: complete && count === 1 };
    if (!p.unique) {
      spare ??= p;
      continue;
    }
    best = p;
    bestScore = score;
  }
  return best ?? spare ?? { n, ...tile(n, minSize, maxSize, rng), unique: false };
}
