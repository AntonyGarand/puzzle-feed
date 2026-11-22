import type { Rng } from '../../core/rng';
import { nb8 } from '../../kits/logic/kit';

/** Neighbouring mine counts. */
export function mineCounts(mine: boolean[], cols: number, rows: number): number[] {
  return mine.map((_, i) => nb8(i, cols, rows).filter((j) => mine[j]).length);
}

/** Open `i` and flood through zero cells; returns the newly opened cells. */
export function flood(i: number, open: boolean[], mine: boolean[], count: number[], cols: number, rows: number): number[] {
  const out: number[] = [];
  const stack = [i];
  while (stack.length) {
    const k = stack.pop()!;
    if (open[k] || mine[k]) continue;
    open[k] = true;
    out.push(k);
    if (count[k] === 0) for (const j of nb8(k, cols, rows)) if (!open[j]) stack.push(j);
  }
  return out;
}

/** Can the board be cleared from `first` by pure deduction (single-cell + subset rules + mine total)? */
export function solvableByLogic(mine: boolean[], cols: number, rows: number, first: number): boolean {
  const N = cols * rows;
  const count = mineCounts(mine, cols, rows);
  const open = new Array<boolean>(N).fill(false);
  const flag = new Array<boolean>(N).fill(false);
  const total = mine.filter(Boolean).length;
  flood(first, open, mine, count, cols, rows);
  const safeTotal = N - total;
  const nbs = Array.from({ length: N }, (_, i) => nb8(i, cols, rows));
  for (let round = 0; round < 400; round++) {
    let opened = open.filter(Boolean).length;
    if (opened === safeTotal) return true;
    let progress = false;
    const reveal = (k: number) => {
      if (!open[k] && !mine[k]) {
        flood(k, open, mine, count, cols, rows);
        progress = true;
      }
    };
    // Constraints from open numbered cells.
    const cons: { cells: number[]; m: number }[] = [];
    for (let i = 0; i < N; i++) {
      if (!open[i] || count[i] === 0) continue;
      const unk = nbs[i].filter((j) => !open[j] && !flag[j]);
      if (!unk.length) continue;
      const m = count[i] - nbs[i].filter((j) => flag[j]).length;
      if (m === 0) {
        unk.forEach(reveal);
        continue;
      }
      if (m === unk.length) {
        unk.forEach((j) => (flag[j] = true));
        progress = true;
        continue;
      }
      cons.push({ cells: unk, m });
    }
    if (progress) continue;
    // Subset rule.
    outer: for (const a of cons)
      for (const b of cons) {
        if (a === b || a.cells.length >= b.cells.length) continue;
        if (!a.cells.every((x) => b.cells.includes(x))) continue;
        const rest = b.cells.filter((x) => !a.cells.includes(x));
        const m = b.m - a.m;
        if (m === 0) {
          rest.forEach(reveal);
        } else if (m === rest.length) {
          rest.forEach((j) => (flag[j] = true));
          progress = true;
        }
        if (progress) break outer;
      }
    if (progress) continue;
    // Global count.
    const unknown = [] as number[];
    for (let i = 0; i < N; i++) if (!open[i] && !flag[i]) unknown.push(i);
    const left = total - flag.filter(Boolean).length;
    if (left === 0) {
      unknown.forEach(reveal);
    } else if (left === unknown.length) {
      unknown.forEach((j) => (flag[j] = true));
      progress = true;
    }
    opened = open.filter(Boolean).length;
    if (opened === safeTotal) return true;
    if (!progress) return false;
  }
  return false;
}

/**
 * Mines placed away from `first` (and its neighbours), always solvable without guessing: if no
 * layout of `count` mines works after `attempts` tries, try again with one mine fewer.
 */
export function genMines(cols: number, rows: number, count: number, first: number, rng: Rng, attempts = 300): boolean[] {
  const N = cols * rows;
  const keep = new Set([first, ...nb8(first, cols, rows)]);
  const pool = Array.from({ length: N }, (_, i) => i).filter((i) => !keep.has(i));
  for (let n = Math.min(count, pool.length); n >= 0; n--) {
    for (let a = 0; a < attempts; a++) {
      const mine = new Array<boolean>(N).fill(false);
      for (const i of rng.shuffle([...pool]).slice(0, n)) mine[i] = true;
      if (solvableByLogic(mine, cols, rows, first)) return mine;
    }
  }
  return new Array<boolean>(N).fill(false);
}
