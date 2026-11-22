import type { Rng } from '../../core/rng';

interface Island {
  r: number;
  c: number;
  need: number;
}
export interface Edge {
  a: number;
  b: number;
  horiz: boolean;
  /** Grid cells strictly between the two islands. */
  cells: number[];
}
export interface BridgesPuzzle {
  n: number;
  islands: Island[];
  edges: Edge[];
  /** Edges that cross each edge. */
  cross: number[][];
  /** Incident edges per island. */
  inc: number[][];
  /** Intended bridge count per edge. */
  sol: number[];
  unique: boolean;
}

const DIRS = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
] as const;

/** Potential edges between islands that see each other in a straight line. */
function buildEdges(n: number, islands: { r: number; c: number }[]) {
  const at = new Map(islands.map((s, k) => [s.r * n + s.c, k]));
  const edges: Edge[] = [];
  islands.forEach((s, a) => {
    for (const [dr, dc] of [
      [0, 1],
      [1, 0],
    ] as const) {
      const cells: number[] = [];
      let r = s.r + dr,
        c = s.c + dc;
      while (r < n && c < n && !at.has(r * n + c)) {
        cells.push(r * n + c);
        r += dr;
        c += dc;
      }
      if (r < n && c < n && cells.length) edges.push({ a, b: at.get(r * n + c)!, horiz: dr === 0, cells });
    }
  });
  const cross = edges.map(() => [] as number[]);
  edges.forEach((e, i) => {
    if (!e.horiz) return;
    const set = new Set(e.cells);
    edges.forEach((f, j) => {
      if (!f.horiz && f.cells.some((x) => set.has(x))) {
        cross[i].push(j);
        cross[j].push(i);
      }
    });
  });
  const inc = islands.map(() => [] as number[]);
  edges.forEach((e, k) => {
    inc[e.a].push(k);
    inc[e.b].push(k);
  });
  return { edges, cross, inc };
}

export function connected(count: number, edges: Edge[], val: ArrayLike<number>): boolean {
  if (count <= 1) return true;
  const adj = Array.from({ length: count }, () => [] as number[]);
  edges.forEach((e, k) => {
    if (val[k] > 0) {
      adj[e.a].push(e.b);
      adj[e.b].push(e.a);
    }
  });
  const seen = new Uint8Array(count);
  const stack = [0];
  seen[0] = 1;
  let m = 1;
  while (stack.length)
    for (const j of adj[stack.pop()!])
      if (!seen[j]) {
        seen[j] = 1;
        m++;
        stack.push(j);
      }
  return m === count;
}

/** Count solutions up to `cap` with propagation + branching, within a node budget. */
function solveBridges(
  p: Pick<BridgesPuzzle, 'islands' | 'edges' | 'cross' | 'inc'>,
  cap: number,
  budget = 6000,
): { count: number; complete: boolean } {
  const { islands, edges, cross, inc } = p;
  const E = edges.length;
  let count = 0,
    nodes = 0;
  const propagate = (lo: Int8Array, hi: Int8Array): boolean => {
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < islands.length; i++) {
        let sLo = 0,
          sHi = 0;
        for (const e of inc[i]) {
          sLo += lo[e];
          sHi += hi[e];
        }
        const need = islands[i].need;
        if (sLo > need || sHi < need) return false;
        for (const e of inc[i]) {
          const nl = Math.max(lo[e], need - (sHi - hi[e]));
          const nh = Math.min(hi[e], need - (sLo - lo[e]));
          if (nl > nh) return false;
          if (nl !== lo[e] || nh !== hi[e]) {
            sLo += nl - lo[e];
            sHi += nh - hi[e];
            lo[e] = nl;
            hi[e] = nh;
            changed = true;
          }
        }
      }
      for (let e = 0; e < E; e++) {
        if (lo[e] === 0) continue;
        for (const f of cross[e]) {
          if (lo[f] > 0) return false;
          if (hi[f] > 0) {
            hi[f] = 0;
            changed = true;
          }
        }
      }
    }
    // Every island must still be reachable through possible bridges.
    return connected(islands.length, edges, hi);
  };
  const rec = (lo: Int8Array, hi: Int8Array): boolean => {
    if (++nodes > budget) return false;
    if (!propagate(lo, hi)) return true;
    let pick = -1;
    for (let e = 0; e < E; e++)
      if (lo[e] !== hi[e]) {
        pick = e;
        break;
      }
    if (pick < 0) {
      if (connected(islands.length, edges, lo)) count++;
      return count < cap;
    }
    for (let v = hi[pick]; v >= lo[pick]; v--) {
      const l2 = lo.slice(),
        h2 = hi.slice();
      l2[pick] = h2[pick] = v;
      if (!rec(l2, h2)) return false;
    }
    return true;
  };
  rec(new Int8Array(E), new Int8Array(E).fill(2));
  return { count, complete: nodes <= budget };
}

/** How well the islands use the board: grid edges touched (0-4), then how many 3x3 zones are occupied. */
function spread(n: number, isl: { r: number; c: number }[]) {
  const rs = isl.map((s) => s.r),
    cs = isl.map((s) => s.c);
  const edges =
    Number(Math.min(...rs) === 0) + Number(Math.max(...rs) === n - 1) + Number(Math.min(...cs) === 0) + Number(Math.max(...cs) === n - 1);
  const zone = (v: number) => Math.min(2, Math.floor((v * 3) / n));
  const zones = new Set(isl.map((s) => zone(s.r) * 3 + zone(s.c))).size;
  return edges * 10 + zones;
}

export function genBridges(n: number, target: number, rng: Rng): BridgesPuzzle {
  let best: BridgesPuzzle | null = null;
  let bestScore = -1;
  for (let attempt = 0; attempt < 40; attempt++) {
    const isl: { r: number; c: number }[] = [];
    const at = new Int16Array(n * n).fill(-1);
    const used = new Uint8Array(n * n); // cells covered by a bridge
    const links = new Map<string, number>();
    const free = (r: number, c: number) => r >= 0 && c >= 0 && r < n && c < n && at[r * n + c] < 0 && !used[r * n + c];
    const add = (r: number, c: number) => {
      at[r * n + c] = isl.length;
      isl.push({ r, c });
    };
    const link = (a: number, b: number, cells: number[]) => {
      cells.forEach((x) => (used[x] = 1));
      links.set(`${Math.min(a, b)},${Math.max(a, b)}`, rng.chance(0.35) ? 2 : 1);
    };
    // Start on the border so the puzzle reaches the edges of the grid.
    const side = rng.int(0, 3),
      along = rng.int(0, n - 1);
    add(side === 0 ? 0 : side === 1 ? n - 1 : along, side === 2 ? 0 : side === 3 ? n - 1 : along);
    /** A random straight extension from an existing island, or null if it doesn't fit. */
    const propose = () => {
      const a = rng.int(0, isl.length - 1);
      const [dr, dc] = rng.pick(DIRS);
      const len = rng.int(2, Math.max(2, n - 2));
      const { r, c } = isl[a];
      const cells: number[] = [];
      for (let k = 1; k < len; k++) {
        if (!free(r + dr * k, c + dc * k)) return null;
        cells.push((r + dr * k) * n + c + dc * k);
      }
      const tr = r + dr * len,
        tc = c + dc * len;
      if (!free(tr, tc)) return null;
      // Keep islands from sitting right next to each other.
      if (
        DIRS.some(([er, ec]) => {
          const rr = tr + er,
            cc = tc + ec;
          return rr >= 0 && cc >= 0 && rr < n && cc < n && at[rr * n + cc] >= 0;
        })
      )
        return null;
      return { a, tr, tc, cells };
    };
    // Of a few candidates, grow toward open space and grid edges nobody has reached yet.
    const value = (tr: number, tc: number) => {
      let near = Infinity;
      for (const s of isl) near = Math.min(near, Math.abs(s.r - tr) + Math.abs(s.c - tc));
      const reach = (v: number, k: 'r' | 'c') =>
        (v === 0 && !isl.some((s) => s[k] === 0) ? 3 : 0) + (v === n - 1 && !isl.some((s) => s[k] === n - 1) ? 3 : 0);
      return Math.min(near, 4) + reach(tr, 'r') + reach(tc, 'c') + rng.next();
    };
    for (let tries = 0; tries < target * 40 && isl.length < target; tries++) {
      let pick: ReturnType<typeof propose> = null;
      let pickValue = -1;
      for (let k = 0; k < 6; k++) {
        const cand = propose();
        if (!cand) continue;
        const v = value(cand.tr, cand.tc);
        if (v > pickValue) {
          pick = cand;
          pickValue = v;
        }
      }
      if (!pick) continue;
      add(pick.tr, pick.tc);
      link(pick.a, isl.length - 1, pick.cells);
    }
    if (isl.length < Math.min(target, 4) && attempt < 24) continue;
    // A few extra bridges to make loops.
    for (let a = 0; a < isl.length; a++) {
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
      ] as const) {
        if (!rng.chance(0.4)) continue;
        const cells: number[] = [];
        let r = isl[a].r + dr,
          c = isl[a].c + dc;
        while (r < n && c < n && at[r * n + c] < 0) {
          cells.push(r * n + c);
          r += dr;
          c += dc;
        }
        if (r >= n || c >= n || !cells.length) continue;
        const b = at[r * n + c];
        if (links.has(`${Math.min(a, b)},${Math.max(a, b)}`) || cells.some((x) => used[x])) continue;
        link(a, b, cells);
      }
    }
    const { edges, cross, inc } = buildEdges(n, isl);
    const sol = edges.map((e) => links.get(`${Math.min(e.a, e.b)},${Math.max(e.a, e.b)}`) ?? 0);
    const islands = isl.map((s, k) => ({ ...s, need: inc[k].reduce((t, e) => t + sol[e], 0) }));
    const p: BridgesPuzzle = { n, islands, edges, cross, inc, sol, unique: false };
    const { count, complete } = solveBridges(p, 2);
    p.unique = complete && count === 1;
    // Prefer unique puzzles, then the ones that spread over the whole grid.
    const score = (p.unique ? 1000 : 0) + spread(n, isl) + (isl.length >= target ? 5 : 0);
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
    if (p.unique && score >= 1000 + 40 + Math.min(9, Math.ceil(target / 2)) + 5) break;
  }
  return best!;
}
