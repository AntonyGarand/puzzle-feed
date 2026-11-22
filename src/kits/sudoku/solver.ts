import type { Rng } from '../../core/rng';
import { popcount } from '../../core/bits';

/** A group of cells whose digits must all differ; optionally they must also add up to `sum`. */
export interface Unit {
  cells: number[];
  sum?: number;
}

export interface Problem {
  /** Total number of cells (grid length). */
  size: number;
  /** Digits are 1..maxDigit (max 9). */
  maxDigit: number;
  units: Unit[];
  /** Ordered pairs [a, b] meaning value[a] < value[b]. */
  lt?: [number, number][];
}

export interface SolveResult {
  count: number;
  /** Search hit the node budget before finishing. */
  aborted: boolean;
  solutions: number[][];
}

// COMBO[(avail * 10 + k) * 46 + s] = digits (bit v-1) that occur in some k-subset of `avail` adding to s.
let COMBO: Uint16Array | null = null;
function combo(): Uint16Array {
  if (COMBO) return COMBO;
  const t = new Uint16Array(512 * 10 * 46);
  for (let m = 0; m < 512; m++) {
    let k = 0,
      s = 0;
    for (let b = 0; b < 9; b++)
      if (m & (1 << b)) {
        k++;
        s += b + 1;
      }
    for (let a = m; a < 512; a = (a + 1) | m) t[(a * 10 + k) * 46 + s] |= m;
  }
  return (COMBO = t);
}

/**
 * Backtracking solver (bitmask candidates, MRV) over distinct/sum units and `<` pairs.
 * `grid`: 0 = empty, >0 = fixed, <0 = inactive. Stops after `limit` solutions or `budget` nodes.
 * With `rng`, digits are tried in random order (use limit 1 to produce a random fill; `grid` is filled in place).
 */
export function solve(p: Problem, grid: number[], limit: number, budget: number, rng?: Rng): SolveResult {
  const C = combo();
  const { size, maxDigit, units } = p;
  const full = (1 << maxDigit) - 1;
  const g = grid;
  const nu = units.length;
  const used = new Int32Array(nu),
    filled = new Int32Array(nu),
    empty = new Int32Array(nu),
    target = new Int32Array(nu);
  const cellUnits: number[][] = Array.from({ length: size }, () => []);
  units.forEach((u, k) => {
    target[k] = u.sum ?? -1;
    for (const c of u.cells) cellUnits[c].push(k);
  });
  const res: SolveResult = { count: 0, aborted: false, solutions: [] };
  // static bounds from < chains
  const lo = new Array(size).fill(1),
    hi = new Array(size).fill(maxDigit);
  const less: number[][] = Array.from({ length: size }, () => []); // cells that must be greater than i
  const more: number[][] = Array.from({ length: size }, () => []); // cells that must be smaller than i
  for (const [a, b] of p.lt ?? []) {
    less[a].push(b);
    more[b].push(a);
  }
  if (p.lt?.length) {
    for (let it = 0, ch = true; ch && it < maxDigit + 1; it++) {
      ch = false;
      for (const [a, b] of p.lt) {
        if (lo[b] < lo[a] + 1) {
          lo[b] = lo[a] + 1;
          ch = true;
        }
        if (hi[a] > hi[b] - 1) {
          hi[a] = hi[b] - 1;
          ch = true;
        }
      }
    }
  }
  const dom = new Int32Array(size);
  for (let i = 0; i < size; i++) {
    let m = 0;
    for (let v = lo[i]; v <= hi[i]; v++) m |= 1 << (v - 1);
    dom[i] = m & full;
  }
  const empties: number[] = [];
  for (let i = 0; i < size; i++) {
    const v = g[i];
    if (v < 0) continue;
    if (v === 0) {
      empties.push(i);
      for (const k of cellUnits[i]) empty[k]++;
    } else {
      for (const k of cellUnits[i]) {
        if (used[k] & (1 << (v - 1))) return res; // contradictory givens
        used[k] |= 1 << (v - 1);
        filled[k] += v;
      }
    }
  }

  const cand = (i: number) => {
    let m = dom[i];
    const cu = cellUnits[i];
    for (let j = 0; j < cu.length; j++) {
      const k = cu[j];
      m &= ~used[k];
      if (target[k] >= 0) {
        const s = target[k] - filled[k];
        if (s < 0 || s > 45) return 0;
        m &= C[((full & ~used[k]) * 10 + empty[k]) * 46 + s];
      }
    }
    if (!m) return 0;
    const ls = less[i];
    for (let j = 0; j < ls.length; j++) {
      const v = g[ls[j]];
      if (v > 0) m &= (1 << (v - 1)) - 1;
    }
    const mr = more[i];
    for (let j = 0; j < mr.length; j++) {
      const v = g[mr[j]];
      if (v > 0) m &= ~((1 << v) - 1);
    }
    return m;
  };

  // units that must contain every digit (rows, columns, boxes…) allow hidden-single deductions
  const fullUnits = units.flatMap((u, k) => (u.cells.length === maxDigit && u.cells.every((c) => g[c] >= 0) ? [k] : []));
  const cm = new Int32Array(size);
  let nodes = 0;
  const digits = Array.from({ length: maxDigit }, (_, i) => i + 1);
  const rec = (): boolean => {
    if (++nodes > budget) {
      res.aborted = true;
      return true;
    }
    let best = -1,
      bestMask = 0,
      bestN = 99;
    for (let e = 0; e < empties.length; e++) {
      const i = empties[e];
      if (g[i]) continue;
      const m = (cm[i] = cand(i));
      const k = popcount(m);
      if (k < bestN) {
        best = i;
        bestMask = m;
        bestN = k;
        if (k <= 1) break;
      }
    }
    if (best === -1) {
      res.count++;
      if (res.solutions.length < limit) res.solutions.push([...g]);
      return res.count >= limit;
    }
    if (bestN === 0) return false;
    if (bestN > 1) {
      for (const k of fullUnits) {
        const cells = units[k].cells;
        let once = 0,
          twice = 0;
        for (const c of cells) {
          if (g[c]) continue;
          const m = cm[c];
          twice |= once & m;
          once |= m;
        }
        const missing = full & ~used[k];
        if (missing & ~once) return false;
        const hs = missing & ~twice;
        if (hs) {
          const b = hs & -hs;
          for (const c of cells)
            if (!g[c] && cm[c] & b) {
              best = c;
              bestMask = b;
              break;
            }
          break;
        }
      }
    }
    const order = rng ? rng.shuffle([...digits]) : digits;
    const cu = cellUnits[best];
    for (const v of order) {
      const b = 1 << (v - 1);
      if (!(bestMask & b)) continue;
      g[best] = v;
      for (const k of cu) {
        used[k] |= b;
        filled[k] += v;
        empty[k]--;
      }
      const stop = rec();
      if (stop && rng && !res.aborted) return true; // keep the random fill in place
      g[best] = 0;
      for (const k of cu) {
        used[k] &= ~b;
        filled[k] -= v;
        empty[k]++;
      }
      if (stop) return true;
    }
    return false;
  };
  rec();
  return res;
}

/** Unique within budget? (Aborted searches count as not unique.) */
export function isUnique(p: Problem, puzzle: number[], budget: number): boolean {
  const r = solve(p, [...puzzle], 2, budget);
  return r.count === 1 && !r.aborted;
}

/**
 * Reveal solution digits as givens until the puzzle provably has one solution.
 * Prefers cells where two found solutions disagree. Mutates `puzzle`.
 */
export function revealUntilUnique(p: Problem, puzzle: number[], solution: number[], budget: number, rng: Rng): void {
  for (let guard = 0; guard < p.size; guard++) {
    const r = solve(p, [...puzzle], 2, budget);
    if (r.count === 1 && !r.aborted) return;
    const open = [...puzzle.keys()].filter((i) => puzzle[i] === 0);
    if (!open.length) return;
    let pool = open;
    if (r.solutions.length === 2) {
      const [a, b] = r.solutions;
      const diff = open.filter((i) => a[i] !== b[i]);
      if (diff.length) pool = diff;
    }
    const c = rng.pick(pool);
    puzzle[c] = solution[c];
  }
}

/** Remove up to `holes` givens (random order) while keeping a provably unique solution. */
export function digHoles(p: Problem, puzzle: number[], holes: number, budget: number, rng: Rng): void {
  let removed = puzzle.filter((v) => v === 0).length;
  const order = rng.shuffle([...puzzle.keys()].filter((i) => puzzle[i] > 0));
  for (const i of order) {
    if (removed >= holes) break;
    const keep = puzzle[i];
    puzzle[i] = 0;
    if (isUnique(p, puzzle, budget)) removed++;
    else puzzle[i] = keep;
  }
}

/** Every cell index on the board that breaks a rule given current `vals` (0 = empty, <0 inactive). */
export function conflicts(p: Problem, vals: number[]): Set<number> {
  const bad = new Set<number>();
  for (const u of p.units) {
    const seen = new Map<number, number>();
    let s = 0,
      open = 0;
    for (const c of u.cells) {
      const v = vals[c];
      if (v <= 0) {
        open++;
        continue;
      }
      s += v;
      const o = seen.get(v);
      if (o != null) {
        bad.add(o);
        bad.add(c);
      } else seen.set(v, c);
    }
    if (u.sum != null && ((open === 0 && s !== u.sum) || (open > 0 && s + open > u.sum))) {
      for (const c of u.cells) if (vals[c] > 0) bad.add(c);
    }
  }
  for (const [a, b] of p.lt ?? []) {
    if (vals[a] > 0 && vals[b] > 0 && vals[a] >= vals[b]) {
      bad.add(a);
      bad.add(b);
    }
  }
  return bad;
}

/** Classic row/column units for an n×n grid. */
export function lineUnits(n: number): Unit[] {
  const out: Unit[] = [];
  for (let r = 0; r < n; r++) out.push({ cells: Array.from({ length: n }, (_, c) => r * n + c) });
  for (let c = 0; c < n; c++) out.push({ cells: Array.from({ length: n }, (_, r) => r * n + c) });
  return out;
}
