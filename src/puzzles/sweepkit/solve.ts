// Deduction engine for minesweeper variants where each clue counts an arbitrary set of cells
// (shape-mines, mow). Rules are the ones a person uses: a full clue, an empty clue, two
// overlapping clues, and the mine total.
import type { Rng } from '../../core/rng';

/** An open clue: the still-unknown cells it counts and how many mines remain among them. */
export interface Con {
  at: number;
  cells: number[];
  m: number;
}

/** A deduction: `cells` are all mines (`mine`) or all safe, because of clue `a` (and `b`). */
export interface Deduction {
  mine: boolean;
  cells: number[];
  a: Con;
  /** Second clue of a pair deduction; `shared` are the cells both clues count. */
  b?: Con;
  shared?: number[];
  /** Pair bound: at least `lo` / at most `hi` of `a`'s mines lie in `shared`. */
  lo?: number;
  hi?: number;
}

/** A clue that needs all its unknown cells (`mine`) or none of them (safe). */
export function single(cons: Con[], mine: boolean, ok: (d: Deduction) => boolean = () => true): Deduction | null {
  for (const a of cons) {
    if (mine ? a.m !== a.cells.length : a.m !== 0) continue;
    const d = { mine, cells: a.cells, a };
    if (ok(d)) return d;
  }
  return null;
}

/**
 * Two overlapping clues: `a` puts between `lo` and `hi` mines into the shared cells, which can
 * settle `b`'s other cells (all safe, or all mines).
 */
export function pair(cons: Con[], ok: (d: Deduction) => boolean = () => true): Deduction | null {
  const by = new Map<number, Con[]>();
  for (const c of cons)
    for (const x of c.cells) {
      const l = by.get(x);
      if (l) l.push(c);
      else by.set(x, [c]);
    }
  const sets = new Map(cons.map((c) => [c, new Set(c.cells)]));
  for (const a of cons) {
    const seen = new Set<Con>([a]);
    const sa = sets.get(a)!;
    for (const x of a.cells)
      for (const b of by.get(x)!) {
        if (seen.has(b)) continue;
        seen.add(b);
        const sb = sets.get(b)!;
        const shared = a.cells.filter((y) => sb.has(y));
        const rest = b.cells.filter((y) => !sa.has(y));
        if (!rest.length) continue;
        const lo = Math.max(0, a.m - (a.cells.length - shared.length));
        const hi = Math.min(shared.length, a.m);
        let d: Deduction | null = null;
        if (lo > 0 && lo >= b.m) d = { mine: false, cells: rest, a, b, shared, lo, hi };
        else if (hi < b.m && b.m - hi === rest.length) d = { mine: true, cells: rest, a, b, shared, lo, hi };
        if (d && ok(d)) return d;
      }
  }
  return null;
}

export interface Field {
  /** Cells each clue counts. */
  nbs: number[][];
  mine: boolean[];
  /** Clue value of every cell (mines in `nbs[i]`). */
  count: number[];
}

/** Clue value of every cell. */
const counts = (mine: boolean[], nbs: number[][]) => nbs.map((nb) => nb.filter((j) => mine[j]).length);

/**
 * Can every safe cell be opened by deduction, starting from `first`? `canOpen` limits which known
 * safe cells may be opened right now (e.g. only next to the lawn); a 0 marks all its cells safe.
 */
function solvable(f: Field, first: number, canOpen: (i: number, open: boolean[]) => boolean = () => true): boolean {
  const { nbs, mine, count } = f;
  const N = mine.length;
  const total = mine.filter(Boolean).length;
  const open = new Array<boolean>(N).fill(false);
  const flag = new Array<boolean>(N).fill(false);
  const safe = new Array<boolean>(N).fill(false);
  safe[first] = true;
  let opened = 0,
    flags = 0;
  for (let round = 0; round < 4 * N; round++) {
    for (let changed = true; changed;) {
      changed = false;
      for (let i = 0; i < N; i++) {
        if (!safe[i] || open[i] || !canOpen(i, open)) continue;
        if (mine[i]) return false; // never: deductions are sound
        open[i] = true;
        opened++;
        changed = true;
        if (count[i] === 0) for (const j of nbs[i]) safe[j] = true;
      }
    }
    if (opened === N - total) return true;
    const cons: Con[] = [];
    for (let i = 0; i < N; i++) {
      if (!open[i] || !count[i]) continue;
      const cells = nbs[i].filter((j) => !open[j] && !flag[j] && !safe[j]);
      if (cells.length) cons.push({ at: i, cells, m: count[i] - nbs[i].filter((j) => flag[j]).length });
    }
    const d = single(cons, true) ?? single(cons, false) ?? pair(cons);
    if (d) {
      for (const j of d.cells)
        if (d.mine && !flag[j]) {
          flag[j] = true;
          flags++;
        } else if (!d.mine) safe[j] = true;
      continue;
    }
    const unk: number[] = [];
    for (let i = 0; i < N; i++) if (!open[i] && !flag[i] && !safe[i]) unk.push(i);
    if (!unk.length) return false;
    if (flags === total) unk.forEach((j) => (safe[j] = true));
    else if (total - flags === unk.length) {
      unk.forEach((j) => (flag[j] = true));
      flags = total;
    } else return false;
  }
  return false;
}

/**
 * Mines placed outside `keep`, always clearable from `first` by deduction: if no layout of `n`
 * mines works within the attempt budget, try one mine fewer.
 */
export function genField(
  nbs: number[][],
  n: number,
  first: number,
  keep: Set<number>,
  rng: Rng,
  canOpen?: (i: number, open: boolean[]) => boolean,
  attempts = 40,
  budget = 400,
): Field {
  const N = nbs.length;
  const pool = Array.from({ length: N }, (_, i) => i).filter((i) => !keep.has(i));
  let tries = 0;
  for (let k = Math.min(n, pool.length); k > 0; k--) {
    // Past the budget, only glance at each smaller count (sparser boards solve almost always).
    for (let a = 0; a < (tries < budget ? attempts : 3); a++, tries++) {
      const mine = new Array<boolean>(N).fill(false);
      for (const i of rng.shuffle([...pool]).slice(0, k)) mine[i] = true;
      const f = { nbs, mine, count: counts(mine, nbs) };
      if (solvable(f, first, canOpen)) return f;
    }
  }
  const mine = new Array<boolean>(N).fill(false);
  return { nbs, mine, count: counts(mine, nbs) };
}
