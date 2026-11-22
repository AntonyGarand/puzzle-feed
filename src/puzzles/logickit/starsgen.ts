import type { Rng } from '../../core/rng';
import { nb4 } from './kit';

export interface StarsPuzzle {
  n: number;
  /** Region id per cell (0..n-1). */
  region: number[];
  /** Star column per row in the intended solution. */
  sol: number[];
  unique: boolean;
}

/** Random star placement: a permutation where consecutive rows differ by ≥ 2 columns. */
function placeStars(n: number, rng: Rng): number[] {
  const cols: number[] = [];
  const rec = (r: number): boolean => {
    if (r === n) return true;
    for (const c of rng.shuffle(Array.from({ length: n }, (_, i) => i))) {
      if (cols.includes(c)) continue;
      if (r > 0 && Math.abs(cols[r - 1] - c) < 2) continue;
      cols[r] = c;
      if (rec(r + 1)) return true;
    }
    cols.length = r;
    return false;
  };
  rec(0);
  return cols;
}

/**
 * Solutions (up to `cap`) of a region layout, within a node budget. `allow` limits the cells a star
 * may take (e.g. to respect a player's stars and ✕ marks).
 */
export function solveStars(
  n: number,
  region: number[],
  cap: number,
  budget = 200000,
  allow?: (i: number) => boolean,
): { sols: number[][]; complete: boolean } {
  const sols: number[][] = [];
  const cols: number[] = [];
  let nodes = 0;
  let usedC = 0,
    usedR = 0;
  const rec = (r: number): boolean => {
    if (++nodes > budget) return false;
    if (r === n) {
      sols.push([...cols]);
      return sols.length < cap;
    }
    for (let c = 0; c < n; c++) {
      const g = region[r * n + c];
      if (usedC & (1 << c) || usedR & (1 << g) || (allow && !allow(r * n + c))) continue;
      if (r > 0 && Math.abs(cols[r - 1] - c) < 2) continue;
      cols[r] = c;
      usedC |= 1 << c;
      usedR |= 1 << g;
      const go = rec(r + 1);
      usedC &= ~(1 << c);
      usedR &= ~(1 << g);
      if (!go) return false;
    }
    return true;
  };
  rec(0);
  return { sols, complete: nodes <= budget };
}

function connectedWithout(region: number[], n: number, g: number, skip: number): boolean {
  const cells = region.map((x, i) => (x === g && i !== skip ? i : -1)).filter((i) => i >= 0);
  if (!cells.length) return false;
  const seen = new Set([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    const i = stack.pop()!;
    for (const j of nb4(i, n, n))
      if (j !== skip && region[j] === g && !seen.has(j)) {
        seen.add(j);
        stack.push(j);
      }
  }
  return seen.size === cells.length;
}

export function genStars(n: number, rng: Rng): StarsPuzzle {
  let best: StarsPuzzle | null = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const sol = placeStars(n, rng);
    const region = new Array<number>(n * n).fill(-1);
    sol.forEach((c, r) => (region[r * n + c] = r));
    // Grow regions from the stars.
    let left = n * n - n;
    while (left > 0) {
      const front: [number, number][] = [];
      region.forEach((g, i) => {
        if (g >= 0) return;
        for (const j of nb4(i, n, n)) if (region[j] >= 0) front.push([i, region[j]]);
      });
      const [i, g] = rng.pick(front);
      region[i] = g;
      left--;
    }
    // Repair: break alternative solutions by moving one of their star cells into another region.
    const key = sol.join(',');
    let unique = false;
    for (let step = 0; step < 120; step++) {
      const { sols, complete } = solveStars(n, region, 2);
      if (complete && sols.length === 1) {
        unique = true;
        break;
      }
      const alt = sols.find((s) => s.join(',') !== key);
      if (!alt) break;
      const rows = rng.shuffle(alt.map((_, r) => r).filter((r) => alt[r] !== sol[r]));
      let moved = false;
      for (const r of rows) {
        const i = r * n + alt[r];
        const g = region[i];
        const others = rng.shuffle([
          ...new Set(
            nb4(i, n, n)
              .map((j) => region[j])
              .filter((h) => h !== g),
          ),
        ]);
        if (!others.length || !connectedWithout(region, n, g, i)) continue;
        region[i] = others[0];
        moved = true;
        break;
      }
      if (!moved) break;
    }
    const p = { n, region, sol, unique };
    if (unique) return p;
    best ??= p;
  }
  return best!;
}
