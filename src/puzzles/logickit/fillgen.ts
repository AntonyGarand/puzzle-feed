// Region-fill ("write sizes into the grid") generator and logic solver.
// A grid of numbers is valid when every orthogonally connected group of equal numbers has as many
// cells as its number. Same-size regions can't touch, since touching equal numbers form one group.
import type { Rng } from '../../core/rng';
import { nb4 } from './kit';

export interface FillPuzzle {
  /** Solution: region size per cell. */
  sol: number[];
  /** Given numbers (0 = empty). */
  clue: number[];
}

interface Geo {
  n: number;
  /** Largest region size (numbers go 1..max). */
  max: number;
  nb: number[][];
}

const geo = (n: number, max: number): Geo => ({ n, max, nb: Array.from({ length: n * n }, (_, i) => nb4(i, n, n)) });

const bit = (v: number) => 1 << v;
const popcount = (m: number) => {
  let k = 0;
  for (; m; m &= m - 1) k++;
  return k;
};
const lowest = (m: number) => 31 - Math.clz32(m & -m);

export interface Regions {
  /** Region id per cell (-1 = empty). */
  id: Int16Array;
  /** Cells of each region. */
  cells: number[][];
  /** Number written in each region. */
  val: number[];
}

/** Connected groups of equal non-zero numbers. */
export function regions(n: number, vals: ArrayLike<number>): Regions {
  const id = new Int16Array(n * n).fill(-1);
  const cells: number[][] = [];
  const val: number[] = [];
  for (let s = 0; s < n * n; s++) {
    if (!vals[s] || id[s] >= 0) continue;
    const k = cells.length;
    const v = vals[s];
    const list = [s];
    id[s] = k;
    for (let q = 0; q < list.length; q++) {
      const i = list[q],
        r = Math.floor(i / n),
        c = i % n;
      const next = [r > 0 ? i - n : -1, c < n - 1 ? i + 1 : -1, r < n - 1 ? i + n : -1, c > 0 ? i - 1 : -1];
      for (const j of next)
        if (j >= 0 && id[j] < 0 && vals[j] === v) {
          id[j] = k;
          list.push(j);
        }
    }
    cells.push(list);
    val.push(v);
  }
  return { id, cells, val };
}

// Scratch marks for reach(), reused across calls (stamped, so no clearing or allocation).
const mark = new Int32Array(256);
const markR = new Int32Array(256);
const queue = new Int16Array(256);
let stamp = 0;

/**
 * Bounded flood for value `v` from `start` cells (already counted as `have`): walks through empty
 * cells that may hold `v` and through other groups of `v` (adding their whole size). Stops once the
 * total reaches `v`. Returns the total and the empty cells it walked through.
 */
function reach(
  g: Geo,
  vals: ArrayLike<number>,
  cand: ArrayLike<number>,
  rg: Regions,
  v: number,
  start: number[],
  have: number,
  skip = -1,
): { total: number; via: number[] } {
  const st = ++stamp;
  let qn = 0;
  for (const i of start) {
    mark[i] = st;
    if (vals[i]) markR[rg.id[i]] = st;
    queue[qn++] = i;
  }
  let total = have;
  const via: number[] = [];
  const b = bit(v);
  for (let q = 0; q < qn && total < v; q++) {
    for (const j of g.nb[queue[q]]) {
      if (mark[j] === st || j === skip) continue;
      const x = vals[j];
      if (x === 0) {
        if (!(cand[j] & b)) continue;
        mark[j] = st;
        total++;
        via.push(j);
        queue[qn++] = j;
      } else if (x === v) {
        const r = rg.id[j];
        if (markR[r] === st) continue;
        markR[r] = st;
        total += rg.cells[r].length;
        for (const k of rg.cells[r]) {
          mark[k] = st;
          queue[qn++] = k;
        }
      }
      if (total >= v) break;
    }
  }
  return { total, via };
}

/**
 * Candidate numbers for every empty cell (bitmask over 1..max), using only what the board shows:
 * a number is ruled out when it would join a neighbouring group past its size (`join`), or when it
 * can't gather enough cells around this one (`room`).
 */
export function candidates(n: number, max: number, vals: ArrayLike<number>, rg = regions(n, vals)) {
  const g = geo(n, max);
  const all = ((1 << (max + 1)) - 1) & ~1;
  const cand = new Uint16Array(n * n);
  const join = new Uint16Array(n * n);
  const room = new Uint16Array(n * n);
  for (let x = 0; x < n * n; x++) {
    if (vals[x]) continue;
    let m = all;
    const sum = new Map<number, number>();
    const seen = new Set<number>();
    for (const y of g.nb[x]) {
      if (!vals[y] || seen.has(rg.id[y])) continue;
      seen.add(rg.id[y]);
      sum.set(vals[y], (sum.get(vals[y]) ?? 0) + rg.cells[rg.id[y]].length);
    }
    for (const [w, s] of sum) if (w <= max && s + 1 > w) m &= ~bit(w);
    join[x] = all & ~m;
    cand[x] = m;
  }
  for (let x = 0; x < n * n; x++) {
    if (vals[x]) continue;
    for (let v = 2; v <= max; v++) {
      if (!(cand[x] & bit(v))) continue;
      if (reach(g, vals, cand, rg, v, [x], 1).total < v) room[x] |= bit(v);
    }
  }
  for (let x = 0; x < n * n; x++) cand[x] &= ~room[x];
  return { cand, join, room };
}

/** Room left for an unfinished group: the cells it could still grow into (bounded by its size). */
export function groupReach(n: number, max: number, vals: ArrayLike<number>, cand: ArrayLike<number>, rg: Regions, r: number, skip = -1) {
  return reach(geo(n, max), vals, cand, rg, rg.val[r], rg.cells[r], rg.cells[r].length, skip);
}

/** Empty neighbours of a group that may take its number. */
export function exits(n: number, vals: ArrayLike<number>, cand: ArrayLike<number>, rg: Regions, r: number): number[] {
  const out = new Set<number>();
  const v = rg.val[r];
  for (const i of rg.cells[r]) for (const j of nb4(i, n, n)) if (!vals[j] && cand[j] & bit(v)) out.add(j);
  return [...out];
}

/**
 * Logic propagation on (vals, cand) in place. Returns false on a contradiction.
 * Rules: group too big; join (neighbouring groups would overflow); room (not enough space);
 * single candidate; a group with one exit; a group's bottleneck cell.
 */
function propagate(g: Geo, vals: Int8Array, cand: Uint16Array, deep: boolean, work: { n: number }): boolean {
  const N = g.n * g.n;
  for (;;) {
    if (--work.n < 0) return false;
    const rg = regions(g.n, vals);
    for (let r = 0; r < rg.cells.length; r++) if (rg.cells[r].length > rg.val[r]) return false;
    let changed = false;
    // join + single candidates
    for (let x = 0; x < N; x++) {
      if (vals[x]) continue;
      let m = cand[x];
      const seen: number[] = [];
      for (const y of g.nb[x]) {
        const r = rg.id[y];
        if (r < 0 || seen.includes(r)) continue;
        seen.push(r);
        const w = rg.val[r];
        let s = 1;
        for (const r2 of seen) if (rg.val[r2] === w) s += rg.cells[r2].length;
        if (s > w) m &= ~bit(w);
      }
      if (!m) return false;
      cand[x] = m;
    }
    for (let x = 0; x < N; x++) {
      if (vals[x] || popcount(cand[x]) !== 1) continue;
      vals[x] = lowest(cand[x]);
      changed = true;
    }
    if (changed) continue;
    // unfinished groups: dead ends, single exits
    for (let r = 0; r < rg.cells.length; r++) {
      const v = rg.val[r];
      if (rg.cells[r].length === v) continue;
      const ex = exits(g.n, vals, cand, rg, r);
      if (!ex.length) return false;
      if (reach(g, vals, cand, rg, v, rg.cells[r], rg.cells[r].length).total < v) return false;
      if (ex.length === 1) {
        vals[ex[0]] = v; // regions are now stale: rebuild them before going on
        changed = true;
        break;
      }
    }
    if (changed) continue;
    // room for each candidate
    for (let x = 0; x < N; x++) {
      if (vals[x]) continue;
      let m = cand[x];
      for (let v = 2; v <= g.max; v++) {
        if (!(m & bit(v))) continue;
        if (reach(g, vals, cand, rg, v, [x], 1).total < v) m &= ~bit(v);
      }
      if (!m) return false;
      if (m !== cand[x]) {
        cand[x] = m;
        changed = true;
      }
    }
    if (changed) continue;
    if (!deep) return true;
    // bottlenecks: a cell every growth of a group must pass through
    for (let r = 0; r < rg.cells.length && !changed; r++) {
      const v = rg.val[r];
      if (rg.cells[r].length === v) continue;
      const { via } = reach(g, vals, cand, rg, v, rg.cells[r], rg.cells[r].length);
      for (const y of via) {
        if (reach(g, vals, cand, rg, v, rg.cells[r], rg.cells[r].length, y).total < v) {
          vals[y] = v;
          changed = true;
          break;
        }
      }
    }
    if (!changed) return true;
  }
}

/** True when the rules alone fill the whole grid from these givens (so the answer is unique). */
function solvable(g: Geo, clue: number[], deep: boolean, work: { n: number }): boolean {
  const all = ((1 << (g.max + 1)) - 1) & ~1;
  const vals = Int8Array.from(clue);
  const cand = new Uint16Array(g.n * g.n).map((_, i) => (clue[i] ? 0 : all));
  return propagate(g, vals, cand, deep, work) && vals.every((v) => v > 0);
}

/** Fallback layout (never needed in practice): full rows of n between rows cut into 2s and 1s. */
function stripes(n: number): number[] {
  const cut: number[] = [];
  for (let t = n % 3 === 1 ? 1 : 2; cut.length < n; t = 3 - t) for (let k = 0; k < t && cut.length < n; k++) cut.push(t);
  return Array.from({ length: n * n }, (_, i) => (Math.floor(i / n) % 2 ? cut[i % n] : n));
}

/** Random partition into groups of 1..max cells, with no two equal-size groups touching. */
function partition(n: number, max: number, rng: Rng): number[] | null {
  const N = n * n;
  const owner = new Array<number>(N).fill(-1);
  let groups: number[][] = [];
  const weight = (s: number) => (s === 1 ? 0.35 : s === 2 ? 0.8 : 1);
  const sizes = Array.from({ length: max }, (_, k) => k + 1);
  const total = sizes.reduce((a, s) => a + weight(s), 0);
  const pickSize = () => {
    let x = rng.next() * total;
    for (const s of sizes) if ((x -= weight(s)) < 0) return s;
    return max;
  };
  for (const s of rng.shuffle([...Array(N).keys()])) {
    if (owner[s] >= 0) continue;
    const k = groups.length;
    const cells = [s];
    owner[s] = k;
    const target = pickSize();
    // Grow to the target size, then keep growing while it touches a finished group of its size.
    const clash = () =>
      cells.some((i) => nb4(i, n, n).some((j) => owner[j] >= 0 && owner[j] !== k && groups[owner[j]].length === cells.length));
    while (cells.length < max && (cells.length < target || clash())) {
      const front: number[] = [];
      for (const i of cells) for (const j of nb4(i, n, n)) if (owner[j] < 0 && !front.includes(j)) front.push(j);
      if (!front.length) break;
      const j = rng.pick(front);
      owner[j] = k;
      cells.push(j);
    }
    groups.push(cells);
  }
  // Merge touching groups of equal size until none are left.
  for (let guard = 0; guard < N; guard++) {
    let merged = false;
    for (let a = 0; a < groups.length && !merged; a++)
      for (const i of groups[a]) {
        const b = nb4(i, n, n)
          .map((j) => owner[j])
          .find((o) => o !== a && groups[o].length === groups[a].length);
        if (b === undefined) continue;
        for (const j of groups[b]) owner[j] = a;
        groups[a] = groups[a].concat(groups[b]);
        groups[b] = [];
        merged = true;
        break;
      }
    if (!merged) break;
    // compact ids
    const keep = groups.filter((x) => x.length);
    keep.forEach((cs, k) => cs.forEach((i) => (owner[i] = k)));
    groups = keep;
  }
  if (groups.some((cs) => cs.length > max)) return null;
  const sol = new Array<number>(N);
  for (const cs of groups) for (const i of cs) sol[i] = cs.length;
  return sol;
}

export interface FillOpts {
  n: number;
  max: number;
  /** Stop removing givens at this many. */
  minGivens: number;
  /** Allow the harder bottleneck rule (a cell every growth of a group must use). */
  deep: boolean;
}

/** Build a puzzle: random partition, then drop givens while the solver keeps the answer unique. */
export function genFill(o: FillOpts, rng: Rng): FillPuzzle {
  const g = geo(o.n, o.max);
  let sol: number[] | null = null;
  for (let a = 0; a < 200 && !sol; a++) sol = partition(o.n, o.max, rng);
  sol ??= stripes(o.n);
  const clue = [...sol];
  const work = { n: 2500 * o.n }; // propagation passes for the whole generation
  let givens = clue.length;
  for (const i of rng.shuffle([...clue.keys()])) {
    if (givens <= o.minGivens || work.n <= 0) break;
    clue[i] = 0;
    if (solvable(g, clue, o.deep, work)) givens--;
    else clue[i] = sol[i];
  }
  return { sol, clue };
}
