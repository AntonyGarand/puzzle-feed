import type { Rng } from '../../core/rng';
import { lineUnits, solve } from '../sudokukit/solver';
import { popcount } from '../../core/bits';

/** A constraint listing every allowed value tuple (flat, `cells.length` values each) for some cells. */
export interface Table {
  cells: number[];
  tuples: Uint8Array;
}

interface LatinResult {
  count: number;
  /** Search hit the node budget before finishing. */
  aborted: boolean;
  solutions: number[][];
  nodes: number;
}

/** Random n×n Latin square (values 1..n), drawn from `rng`. */
export function randomLatin(n: number, rng: Rng): number[] {
  const g = new Array(n * n).fill(0);
  solve({ size: n * n, maxDigit: n, units: lineUnits(n) }, g, 1, 200000, rng);
  return g;
}

/**
 * Latin-square solver with table constraints (skyscraper lines, arithmetic cages…).
 * Propagates singles, hidden singles and table supports, then branches on the smallest domain.
 * `givens`: 0 = empty, 1..n fixed. Stops after `limit` solutions or `budget` nodes.
 */
function solveLatin(n: number, givens: number[], tables: Table[], limit: number, budget: number): LatinResult {
  const size = n * n;
  const full = (1 << n) - 1;
  const res: LatinResult = { count: 0, aborted: false, solutions: [], nodes: 0 };
  const dom = new Int32Array(size);
  for (let i = 0; i < size; i++) dom[i] = givens[i] > 0 ? 1 << (givens[i] - 1) : full;
  const lines: number[][] = [];
  for (let r = 0; r < n; r++) lines.push(Array.from({ length: n }, (_, c) => r * n + c));
  for (let c = 0; c < n; c++) lines.push(Array.from({ length: n }, (_, r) => r * n + c));

  const propagate = (d: Int32Array, alive: Int32Array[]): boolean => {
    for (let changed = true; changed;) {
      changed = false;
      // naked singles
      for (let i = 0; i < size; i++) {
        const m = d[i];
        if (m & (m - 1)) continue;
        const r = (i / n) | 0,
          c = i % n;
        for (let k = 0; k < n; k++) {
          const a = r * n + k,
            b = k * n + c;
          if (a !== i && d[a] & m) {
            if (!(d[a] &= ~m)) return false;
            changed = true;
          }
          if (b !== i && d[b] & m) {
            if (!(d[b] &= ~m)) return false;
            changed = true;
          }
        }
      }
      // hidden singles
      for (const line of lines) {
        let once = 0,
          twice = 0;
        for (const c of line) {
          twice |= once & d[c];
          once |= d[c];
        }
        if (once !== full) return false;
        const hs = full & ~twice;
        if (!hs) continue;
        for (const c of line) {
          const b = d[c] & hs;
          if (b && d[c] !== b) {
            if (b & (b - 1)) return false; // two values only fit here
            d[c] = b;
            changed = true;
          }
        }
      }
      // table supports
      for (let t = 0; t < tables.length; t++) {
        const { cells, tuples } = tables[t];
        const k = cells.length;
        const al = alive[t];
        const keep = new Int32Array(al.length);
        let nk = 0;
        const sup = new Int32Array(k);
        for (let a = 0; a < al.length; a++) {
          const o = al[a] * k;
          let ok = true;
          for (let j = 0; j < k; j++)
            if (!(d[cells[j]] & (1 << (tuples[o + j] - 1)))) {
              ok = false;
              break;
            }
          if (!ok) continue;
          keep[nk++] = al[a];
          for (let j = 0; j < k; j++) sup[j] |= 1 << (tuples[o + j] - 1);
        }
        if (!nk) return false;
        if (nk < al.length) alive[t] = keep.slice(0, nk);
        for (let j = 0; j < k; j++) {
          const c = cells[j];
          const m = d[c] & sup[j];
          if (m !== d[c]) {
            if (!m) return false;
            d[c] = m;
            changed = true;
          }
        }
      }
    }
    return true;
  };

  const rec = (d: Int32Array, alive: Int32Array[]): boolean => {
    if (++res.nodes > budget) {
      res.aborted = true;
      return true;
    }
    if (!propagate(d, alive)) return false;
    let best = -1,
      bestN = 99;
    for (let i = 0; i < size; i++) {
      const k = popcount(d[i]);
      if (k > 1 && k < bestN) {
        best = i;
        bestN = k;
        if (k === 2) break;
      }
    }
    if (best < 0) {
      res.count++;
      if (res.solutions.length < limit) res.solutions.push(Array.from(d, (m) => 31 - Math.clz32(m) + 1));
      return res.count >= limit;
    }
    for (let v = 0; v < n; v++) {
      const b = 1 << v;
      if (!(d[best] & b)) continue;
      const d2 = d.slice();
      d2[best] = b;
      if (rec(d2, alive.slice())) return true;
    }
    return false;
  };
  const alive0 = tables.map((t) => Int32Array.from({ length: t.tuples.length / t.cells.length }, (_, i) => i));
  rec(dom, alive0);
  return res;
}

/** Unique within budget? (Aborted searches count as not unique.) */
export function latinUnique(n: number, givens: number[], tables: Table[], budget: number): boolean {
  const r = solveLatin(n, givens, tables, 2, budget);
  return r.count === 1 && !r.aborted;
}

/**
 * Reveal solution digits as givens until the puzzle provably has one solution.
 * Prefers cells where two found solutions disagree. Mutates `givens`.
 */
export function revealLatin(n: number, givens: number[], tables: Table[], sol: number[], budget: number, rng: Rng): void {
  for (let guard = 0; guard < n * n; guard++) {
    const r = solveLatin(n, givens, tables, 2, budget);
    if (r.count === 1 && !r.aborted) return;
    const open = [...givens.keys()].filter((i) => !givens[i]);
    if (!open.length) return;
    let pool = open;
    if (r.solutions.length === 2) {
      const [a, b] = r.solutions;
      const diff = open.filter((i) => a[i] !== b[i]);
      if (diff.length) pool = diff;
    }
    const c = rng.pick(pool);
    givens[c] = sol[c];
  }
}

/** Latin-square conflicts: indices of filled cells sharing a value with a row/column peer. */
export function latinConflicts(n: number, vals: number[]): Set<number> {
  const bad = new Set<number>();
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      const i = a * n + b;
      if (!vals[i]) continue;
      for (let k = b + 1; k < n; k++) {
        const j = a * n + k;
        if (vals[j] === vals[i]) bad.add(i).add(j);
      }
      for (let k = a + 1; k < n; k++) {
        const j = k * n + b;
        if (vals[j] === vals[i]) bad.add(i).add(j);
      }
    }
  }
  return bad;
}
