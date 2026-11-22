// Light Up (Akari) generator and solution counter.
import type { Rng } from '../../core/rng';

/** Orthogonal neighbours of `i` on an n×n grid. */
export function nb4(i: number, n: number): number[] {
  const r = Math.floor(i / n),
    c = i % n;
  const out: number[] = [];
  if (r > 0) out.push(i - n);
  if (c < n - 1) out.push(i + 1);
  if (r < n - 1) out.push(i + n);
  if (c > 0) out.push(i - 1);
  return out;
}

export interface LightUp {
  n: number;
  black: boolean[];
  /** Clue on a black cell (bulbs touching it), -1 when unnumbered. */
  num: number[];
  /** A bulb layout satisfying every rule (the only one when `unique`). */
  sol: boolean[];
  unique: boolean;
}

/** Cells each white cell sees along its row and column (itself included), cut off by black cells. */
export function sightLines(n: number, black: boolean[]): number[][] {
  const seen: number[][] = Array.from({ length: n * n }, () => []);
  for (let i = 0; i < n * n; i++) {
    if (black[i]) continue;
    const r = Math.floor(i / n),
      c = i % n;
    const out = seen[i];
    out.push(i);
    for (const [dr, dc] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ]) {
      let rr = r + dr,
        cc = c + dc;
      while (rr >= 0 && rr < n && cc >= 0 && cc < n && !black[rr * n + cc]) {
        out.push(rr * n + cc);
        rr += dr;
        cc += dc;
      }
    }
  }
  return seen;
}

interface Solve {
  count: number;
  sols: Int8Array[];
  nodes: number;
}

/** Counts bulb layouts up to `limit`; `count` is `limit` (treated as "not unique") when the node budget runs out. */
function solve(n: number, black: boolean[], num: number[], limit: number, budget: number): Solve {
  const N = n * n;
  const sight = sightLines(n, black);
  const whites: number[] = [];
  const clues: { k: number; nb: number[] }[] = [];
  for (let i = 0; i < N; i++) {
    if (!black[i]) whites.push(i);
    else if (num[i] >= 0)
      clues.push({
        k: num[i],
        nb: nb4(i, n).filter((j) => !black[j]),
      });
  }
  const res: Solve = { count: 0, sols: [], nodes: 0 };

  const propagate = (st: Int8Array): boolean => {
    let changed = true;
    while (changed) {
      changed = false;
      for (const i of whites) {
        if (st[i] !== 1) continue;
        for (const j of sight[i]) {
          if (j === i) continue;
          if (st[j] === 1) return false;
          if (st[j] === -1) {
            st[j] = 0;
            changed = true;
          }
        }
      }
      for (const { k, nb } of clues) {
        let on = 0,
          unk = 0;
        for (const j of nb) {
          if (st[j] === 1) on++;
          else if (st[j] === -1) unk++;
        }
        if (on > k || on + unk < k) return false;
        if (unk && (on === k || on + unk === k)) {
          const v = on === k ? 0 : 1;
          for (const j of nb) if (st[j] === -1) st[j] = v;
          changed = true;
        }
      }
      if (changed) continue;
      for (const i of whites) {
        let lit = false,
          cand = -1,
          nc = 0;
        for (const j of sight[i]) {
          if (st[j] === 1) {
            lit = true;
            break;
          }
          if (st[j] === -1) {
            nc++;
            cand = j;
          }
        }
        if (lit) continue;
        if (!nc) return false;
        if (nc === 1) {
          st[cand] = 1;
          changed = true;
          break;
        }
      }
    }
    return true;
  };

  const rec = (st: Int8Array) => {
    if (res.count >= limit) return;
    if (++res.nodes > budget) {
      res.count = limit;
      return;
    }
    if (!propagate(st)) return;
    // Branch on a candidate of the unlit cell with the fewest ways to be lit.
    let best = -1,
      bestN = 1e9;
    for (const i of whites) {
      let lit = false,
        nc = 0,
        first = -1;
      for (const j of sight[i]) {
        if (st[j] === 1) {
          lit = true;
          break;
        }
        if (st[j] === -1) {
          nc++;
          if (first < 0) first = j;
        }
      }
      if (!lit && nc < bestN) {
        bestN = nc;
        best = first;
      }
    }
    if (best < 0) {
      // Everything lit: unknown cells can't exist (a bulb clears its sight lines), clues were checked.
      res.count++;
      res.sols.push(st.slice());
      return;
    }
    const a = st.slice();
    a[best] = 1;
    rec(a);
    const b = st.slice();
    b[best] = 0;
    rec(b);
  };
  const st = new Int8Array(N).fill(-1);
  for (let i = 0; i < N; i++) if (black[i]) st[i] = 0;
  rec(st);
  return res;
}

const clueOf = (n: number, bulbs: boolean[], i: number) => nb4(i, n).filter((j) => bulbs[j]).length;

/** Greedy bulbs: light every white cell, keeping the existing bulbs. */
function lightAll(n: number, black: boolean[], bulbs: boolean[], rng: Rng) {
  const sight = sightLines(n, black);
  const order = rng.shuffle(Array.from({ length: n * n }, (_, i) => i));
  for (const i of order) {
    if (black[i]) continue;
    if (!sight[i].some((j) => bulbs[j])) bulbs[i] = true;
  }
}

/**
 * Light Up on an n×n grid. `keep` is the share of clue numbers that must stay (1 = all, 0 = remove
 * as many as uniqueness allows).
 */
export function genLightUp(n: number, density: number, keep: number, rng: Rng): LightUp {
  const N = n * n;
  let budget = 60000; // total solver nodes, deterministic
  let last: LightUp | null = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    const black = new Array<boolean>(N).fill(false);
    // Point-symmetric black cells, like classic grids.
    const want = Math.round(N * density);
    let placed = 0;
    for (let tries = 0; placed < want && tries < N * 4; tries++) {
      const i = rng.int(0, N - 1);
      if (black[i]) continue;
      black[i] = black[N - 1 - i] = true;
      placed += i === N - 1 - i ? 1 : 2;
    }
    const bulbs = new Array<boolean>(N).fill(false);
    lightAll(n, black, bulbs, rng);
    let num = black.map((b, i) => (b ? clueOf(n, bulbs, i) : -1));
    let unique = false;
    for (let fix = 0; fix < 12 && budget > 0; fix++) {
      const r = solve(n, black, num, 2, 4000);
      budget -= r.nodes;
      if (r.count === 1) {
        unique = true;
        break;
      }
      if (r.sols.length < 2) break; // out of budget or no solution (can't happen): new layout
      // Block a bulb of the other solution with a numbered black cell, then re-light.
      const other = r.sols.find((s2) => s2.some((v, i) => (v === 1) !== bulbs[i]))!;
      const diff = [];
      for (let i = 0; i < N; i++) if (other[i] === 1 && !bulbs[i]) diff.push(i);
      if (!diff.length) break;
      black[rng.pick(diff)] = true;
      lightAll(n, black, bulbs, rng);
      num = black.map((b, i) => (b ? clueOf(n, bulbs, i) : -1));
    }
    last = { n, black, num, sol: bulbs, unique };
    if (!unique) continue;
    // Remove clue numbers while the solution stays unique.
    const numbered = rng.shuffle(num.map((v, i) => (v >= 0 ? i : -1)).filter((i) => i >= 0));
    const maxRemove = Math.floor(numbered.length * (1 - keep));
    let removed = 0;
    for (const i of numbered) {
      if (removed >= maxRemove || budget <= 0) break;
      const v = num[i];
      num[i] = -1;
      const r = solve(n, black, num, 2, 2500);
      budget -= r.nodes;
      if (r.count === 1) removed++;
      else num[i] = v;
    }
    return last;
  }
  return last!;
}
