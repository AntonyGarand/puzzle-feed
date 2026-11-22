// Dominosa: a full double-n set laid on an (n+1)×(n+2) grid, regenerated until the tiling is unique.
import type { Rng } from '../../core/rng';

export interface Dominosa {
  n: number;
  cols: number;
  rows: number;
  /** Pip value of each cell. */
  val: number[];
  /** Partner cell of each cell in the generated tiling. */
  mate: number[];
  unique: boolean;
  /** Solver branching nodes: a rough difficulty measure. */
  nodes: number;
}

/** Index of the pair {a, b} (a, b in 0..n) in the sorted list of the full set. */
export const pairIndex = (a: number, b: number, n: number) => {
  const lo = Math.min(a, b),
    hi = Math.max(a, b);
  return lo * (n + 1) - (lo * (lo - 1)) / 2 + (hi - lo);
};

/** Pairs of the full double-n set, in `pairIndex` order. */
export const fullSet = (n: number) => {
  const out: [number, number][] = [];
  for (let a = 0; a <= n; a++) for (let b = a; b <= n; b++) out.push([a, b]);
  return out;
};

/** Random domino tiling of a cols×rows board (`mate[i]` = partner). */
function tiling(cols: number, rows: number, rng: Rng): number[] {
  const N = cols * rows;
  const mate = new Array<number>(N).fill(-1);
  const rec = (from: number): boolean => {
    let i = from;
    while (i < N && mate[i] >= 0) i++;
    if (i >= N) return true;
    const opts: number[] = [];
    if (i % cols < cols - 1 && mate[i + 1] < 0) opts.push(i + 1);
    if (i + cols < N) opts.push(i + cols);
    for (const j of rng.shuffle(opts)) {
      mate[i] = j;
      mate[j] = i;
      if (rec(i + 1)) return true;
      mate[i] = mate[j] = -1;
    }
    return false;
  };
  rec(0);
  return mate;
}

/** Counts tilings that use every pair once, up to `limit` (`limit` when the node budget runs out). */
function count(n: number, cols: number, rows: number, val: number[], limit: number, budget: number) {
  const N = cols * rows;
  const P = ((n + 1) * (n + 2)) / 2;
  // Every adjacent cell pair (edge) and its value pair.
  const ea: number[] = [],
    eb: number[] = [],
    ep: number[] = [];
  const cellEdges: number[][] = Array.from({ length: N }, () => []);
  const pairEdges: number[][] = Array.from({ length: P }, () => []);
  for (let i = 0; i < N; i++) {
    for (const j of [i % cols < cols - 1 ? i + 1 : -1, i + cols < N ? i + cols : -1]) {
      if (j < 0) continue;
      const e = ea.length;
      ea.push(i);
      eb.push(j);
      ep.push(pairIndex(val[i], val[j], n));
      cellEdges[i].push(e);
      cellEdges[j].push(e);
      pairEdges[ep[e]].push(e);
    }
  }
  const E = ea.length;
  let found = 0,
    nodes = 0;
  // Edge state: -1 unknown, 0 excluded, 1 placed.
  const place = (st: Int8Array, e: number): boolean => {
    if (st[e] === 1) return true;
    if (st[e] === 0) return false;
    st[e] = 1;
    for (const f of cellEdges[ea[e]]) if (f !== e && st[f] === -1) st[f] = 0;
    for (const f of cellEdges[eb[e]]) if (f !== e && st[f] === -1) st[f] = 0;
    for (const f of pairEdges[ep[e]]) if (f !== e && st[f] === -1) st[f] = 0;
    return true;
  };
  const propagate = (st: Int8Array): boolean => {
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < N; i++) {
        let on = 0,
          unk = -1,
          nu = 0;
        for (const f of cellEdges[i]) {
          if (st[f] === 1) on++;
          else if (st[f] === -1) {
            nu++;
            unk = f;
          }
        }
        if (on > 1) return false;
        if (!on && !nu) return false;
        if (!on && nu === 1) {
          if (!place(st, unk)) return false;
          changed = true;
        }
      }
      for (let p = 0; p < P; p++) {
        let on = 0,
          unk = -1,
          nu = 0;
        for (const f of pairEdges[p]) {
          if (st[f] === 1) on++;
          else if (st[f] === -1) {
            nu++;
            unk = f;
          }
        }
        if (on > 1) return false;
        if (!on && !nu) return false;
        if (!on && nu === 1) {
          if (!place(st, unk)) return false;
          changed = true;
        }
      }
    }
    return true;
  };
  const rec = (st: Int8Array) => {
    if (found >= limit) return;
    if (++nodes > budget) {
      found = limit;
      return;
    }
    if (!propagate(st)) return;
    // Branch on the pair with the fewest remaining spots.
    let best = -1,
      bestN = 1e9;
    for (let p = 0; p < P; p++) {
      let on = 0,
        nu = 0;
      for (const f of pairEdges[p]) {
        if (st[f] === 1) on++;
        else if (st[f] === -1) nu++;
      }
      if (!on && nu < bestN) {
        bestN = nu;
        best = p;
      }
    }
    if (best < 0) {
      found++;
      return;
    }
    for (const f of pairEdges[best]) {
      if (st[f] !== -1) continue;
      const a = st.slice();
      place(a, f);
      rec(a);
      if (found >= limit) return;
    }
  };
  rec(new Int8Array(E).fill(-1));
  return { count: found, nodes };
}

/** Best of `tries` unique layouts: the easiest (`hard` false) or the hardest by solver nodes. */
export function genDominosa(n: number, tries: number, hard: boolean, rng: Rng): Dominosa {
  const cols = n + 2,
    rows = n + 1;
  const N = cols * rows;
  const set = fullSet(n);
  let best: Dominosa | null = null;
  let fallback: Dominosa | null = null;
  let budget = 400000;
  let got = 0;
  for (let attempt = 0; attempt < 400 && budget > 0 && got < tries; attempt++) {
    const mate = tiling(cols, rows, rng);
    const dom = rng.shuffle(set.slice());
    const val = new Array<number>(N).fill(0);
    let k = 0;
    for (let i = 0; i < N; i++) {
      if (mate[i] < i) continue;
      const [a, b] = dom[k++];
      const flip = rng.chance(0.5);
      val[i] = flip ? b : a;
      val[mate[i]] = flip ? a : b;
    }
    const r = count(n, cols, rows, val, 2, 5000);
    budget -= r.nodes;
    const cand: Dominosa = { n, cols, rows, val, mate, unique: r.count === 1, nodes: r.nodes };
    fallback ??= cand;
    if (!cand.unique) continue;
    got++;
    if (!best || (hard ? cand.nodes > best.nodes : cand.nodes < best.nodes)) best = cand;
  }
  return best ?? fallback!;
}
