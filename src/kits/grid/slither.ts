// Slitherlink: edge geometry, a loop generator (boundary of a hole-free polyomino) and a solution counter.
import type { Rng } from '../../core/rng';

export interface Geo {
  w: number;
  h: number;
  /** Edge count: horizontal edges first ((h+1)·w), then vertical (h·(w+1)). */
  E: number;
  /** Endpoints (vertex ids r·(w+1)+c) of each edge. */
  ea: number[];
  eb: number[];
  /** Edges at each vertex. */
  ve: number[][];
  /** The 4 edges around each cell (top, right, bottom, left). */
  ce: number[][];
  /** The 1 or 2 cells beside each edge. */
  ec: number[][];
}

export function geometry(w: number, h: number): Geo {
  const H = (h + 1) * w;
  const E = H + h * (w + 1);
  const ea: number[] = [],
    eb: number[] = [];
  const V = (h + 1) * (w + 1);
  const ve: number[][] = Array.from({ length: V }, () => []);
  for (let r = 0; r <= h; r++)
    for (let c = 0; c < w; c++) {
      ea.push(r * (w + 1) + c);
      eb.push(r * (w + 1) + c + 1);
    }
  for (let r = 0; r < h; r++)
    for (let c = 0; c <= w; c++) {
      ea.push(r * (w + 1) + c);
      eb.push((r + 1) * (w + 1) + c);
    }
  for (let e = 0; e < E; e++) {
    ve[ea[e]].push(e);
    ve[eb[e]].push(e);
  }
  const ce: number[][] = [];
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) ce.push([r * w + c, H + r * (w + 1) + c + 1, (r + 1) * w + c, H + r * (w + 1) + c]);
  const ec: number[][] = Array.from({ length: E }, () => []);
  ce.forEach((es, c) => es.forEach((e) => ec[e].push(c)));
  return { w, h, E, ea, eb, ve, ce, ec };
}

/** True when the "on" edges form exactly one closed loop. */
export function isSingleLoop(g: Geo, on: (e: number) => boolean): boolean {
  let total = 0,
    start = -1;
  for (let e = 0; e < g.E; e++)
    if (on(e)) {
      total++;
      start = e;
    }
  if (!total) return false;
  for (const es of g.ve) {
    const d = es.filter(on).length;
    if (d !== 0 && d !== 2) return false;
  }
  // Walk the loop from `start` and check it covers every on edge.
  let len = 0,
    e = start,
    v = g.eb[start];
  do {
    len++;
    const next = g.ve[v].find((f) => f !== e && on(f))!;
    v = g.ea[next] === v ? g.eb[next] : g.ea[next];
    e = next;
  } while (e !== start && len <= total);
  return len === total;
}

/** Counts loops matching the clues, up to `limit` (`limit` when the node budget runs out). */
function count(g: Geo, clue: number[], limit: number, budget: number) {
  const { E, ea, eb, ve, ce, ec } = g;
  const V = ve.length;
  const cells = clue.map((k, i) => (k >= 0 ? i : -1)).filter((i) => i >= 0);
  let found = 0,
    nodes = 0;
  const other = (e: number, v: number) => (ea[e] === v ? eb[e] : ea[e]);

  // Work queue of vertices (id) and clue cells (V + id) whose edges changed.
  const inQ = new Uint8Array(V + ce.length);
  const q: number[] = [];
  const push = (x: number) => {
    if (!inQ[x]) {
      inQ[x] = 1;
      q.push(x);
    }
  };
  const clearQ = () => {
    for (const x of q) inQ[x] = 0;
    q.length = 0;
  };
  let st = new Int8Array(E);
  const set = (e: number, v: number) => {
    st[e] = v;
    push(ea[e]);
    push(eb[e]);
    for (const c of ec[e]) if (clue[c] >= 0) push(V + c);
  };

  const runQueue = (): boolean => {
    while (q.length) {
      const x = q.pop()!;
      inQ[x] = 0;
      if (x < V) {
        const es = ve[x];
        let on = 0,
          nu = 0;
        for (const f of es) {
          if (st[f] === 1) on++;
          else if (st[f] === -1) nu++;
        }
        if (on > 2 || (on === 1 && !nu)) return false;
        if (!nu) continue;
        if (on === 2 || (on === 0 && nu === 1)) {
          for (const f of es) if (st[f] === -1) set(f, 0);
        } else if (on === 1 && nu === 1) {
          for (const f of es) if (st[f] === -1) set(f, 1);
        }
      } else {
        const c = x - V;
        const k = clue[c];
        let on = 0,
          nu = 0;
        for (const f of ce[c]) {
          if (st[f] === 1) on++;
          else if (st[f] === -1) nu++;
        }
        if (on > k || on + nu < k) return false;
        if (nu && (on === k || on + nu === k)) {
          const v = on === k ? 0 : 1;
          for (const f of ce[c]) if (st[f] === -1) set(f, v);
        }
      }
    }
    return true;
  };

  /** The chain of on edges through `e0`: its two end vertices, its edges, and whether it is closed. */
  const chain = (e0: number, seen: Uint8Array) => {
    let n = 1;
    seen[e0] = 1;
    const run = (start: number): number => {
      let v = start;
      let prev = e0;
      for (;;) {
        let next = -1;
        for (const f of ve[v])
          if (f !== prev && st[f] === 1) {
            next = f;
            break;
          }
        if (next < 0) return v;
        if (next === e0) return -1;
        seen[next] = 1;
        n++;
        prev = next;
        v = other(next, v);
      }
    };
    const b = run(eb[e0]);
    if (b < 0) return { a: -1, b: -1, n, closed: true };
    return { a: run(ea[e0]), b, n, closed: false };
  };

  /** Loop rules: no closed sub-loop, and never close a chain while other lines exist. */
  const loopRules = (): boolean | 'changed' | 'closed' => {
    let total = 0;
    for (let e = 0; e < E; e++) if (st[e] === 1) total++;
    if (!total) return true;
    const seen = new Uint8Array(E);
    let changed = false;
    for (let e = 0; e < E; e++) {
      if (st[e] !== 1 || seen[e]) continue;
      const ch = chain(e, seen);
      if (ch.closed) {
        // A closed loop must be the whole answer.
        if (ch.n !== total) return false;
        for (let f = 0; f < E; f++) if (st[f] === -1) st[f] = 0;
        for (const c of cells) {
          let on = 0;
          for (const f of ce[c]) if (st[f] === 1) on++;
          if (on !== clue[c]) return false;
        }
        return 'closed';
      }
      if (ch.n === total) break;
      for (const f of ve[ch.a])
        if (st[f] === -1 && other(f, ch.a) === ch.b) {
          set(f, 0);
          changed = true;
        }
    }
    return changed ? 'changed' : true;
  };

  const propagate = (): boolean | 'closed' => {
    for (;;) {
      if (!runQueue()) {
        clearQ();
        return false;
      }
      const r = loopRules();
      if (r === 'changed') continue;
      clearQ();
      return r;
    }
  };

  const rec = (s0: Int8Array, e: number, v: number) => {
    if (found >= limit) return;
    if (++nodes > budget) {
      found = limit;
      return;
    }
    st = s0.slice();
    if (e >= 0) set(e, v);
    else {
      for (let x = 0; x < V; x++) push(x);
      for (const c of cells) push(V + c);
    }
    const r = propagate();
    if (!r) return;
    if (r === 'closed') {
      found++;
      return;
    }
    // Prefer extending a chain end; otherwise an edge of the tightest clue; otherwise any unknown.
    let pick = -1;
    for (let x = 0; x < V && pick < 0; x++) {
      let on = 0,
        u = -1;
      for (const f of ve[x]) {
        if (st[f] === 1) on++;
        else if (st[f] === -1 && u < 0) u = f;
      }
      if (on === 1 && u >= 0) pick = u;
    }
    if (pick < 0) {
      let bestU = 9;
      for (const c of cells) {
        let u = -1,
          nu = 0;
        for (const f of ce[c])
          if (st[f] === -1) {
            nu++;
            u = f;
          }
        if (nu && nu < bestU) {
          bestU = nu;
          pick = u;
        }
      }
    }
    for (let f = 0; f < E && pick < 0; f++) if (st[f] === -1) pick = f;
    if (pick < 0) return; // no lines at all: not a loop
    const here = st;
    rec(here, pick, 1);
    rec(here, pick, 0);
  };
  rec(new Int8Array(E).fill(-1), -1, 0);
  return { count: found, nodes };
}

/**
 * Random hole-free region whose boundary is one simple loop. `thin` < 1 only sometimes accepts a cell
 * touching the region on more than one side, for a branchier region with a longer, wigglier boundary.
 */
export function region(w: number, h: number, frac: number, rng: Rng, thin = 1): boolean[] {
  const N = w * h;
  const inR = new Array<boolean>(N).fill(false);
  const at = (r: number, c: number) => r >= 0 && r < h && c >= 0 && c < w && inR[r * w + c];
  const pinchFree = (i: number) => {
    const r = Math.floor(i / w),
      c = i % w;
    for (const [vr, vc] of [
      [r, c],
      [r, c + 1],
      [r + 1, c],
      [r + 1, c + 1],
    ]) {
      const a = at(vr - 1, vc - 1),
        b = at(vr - 1, vc),
        cc = at(vr, vc - 1),
        d = at(vr, vc);
      if (a === d && b === cc && a !== b) return false;
    }
    return true;
  };
  const holeFree = () => {
    const seen = new Uint8Array(N);
    const q: number[] = [];
    for (let i = 0; i < N; i++) {
      const r = Math.floor(i / w),
        c = i % w;
      if (!inR[i] && (r === 0 || c === 0 || r === h - 1 || c === w - 1)) {
        seen[i] = 1;
        q.push(i);
      }
    }
    while (q.length) {
      const i = q.pop()!;
      const r = Math.floor(i / w),
        c = i % w;
      for (const j of [r > 0 ? i - w : -1, r < h - 1 ? i + w : -1, c > 0 ? i - 1 : -1, c < w - 1 ? i + 1 : -1])
        if (j >= 0 && !inR[j] && !seen[j]) {
          seen[j] = 1;
          q.push(j);
        }
    }
    for (let i = 0; i < N; i++) if (!inR[i] && !seen[i]) return false;
    return true;
  };
  inR[rng.int(0, N - 1)] = true;
  let size = 1;
  const target = Math.round(N * frac);
  for (let tries = 0; size < target && tries < N * 30; tries++) {
    const i = rng.int(0, N - 1);
    if (inR[i]) continue;
    const r = Math.floor(i / w),
      c = i % w;
    const touch = Number(at(r - 1, c)) + Number(at(r + 1, c)) + Number(at(r, c - 1)) + Number(at(r, c + 1));
    if (!touch) continue;
    if (thin < 1 && touch > 1 && !rng.chance(thin)) continue;
    inR[i] = true;
    if (pinchFree(i) && holeFree()) size++;
    else inR[i] = false;
  }
  return inR;
}

/** Edges on the boundary of a set of cells, or null when they aren't one simple loop. */
export function boundary(g: Geo, inR: boolean[]): boolean[] | null {
  const { w, h } = g;
  const cellIn = (r: number, c: number) => r >= 0 && r < h && c >= 0 && c < w && inR[r * w + c];
  const sol = new Array<boolean>(g.E).fill(false);
  const H = (h + 1) * w;
  for (let e = 0; e < g.E; e++) {
    if (e < H) {
      const r = Math.floor(e / w),
        c = e % w;
      sol[e] = cellIn(r - 1, c) !== cellIn(r, c);
    } else {
      const k = e - H;
      const r = Math.floor(k / (w + 1)),
        c = k % (w + 1);
      sol[e] = cellIn(r, c - 1) !== cellIn(r, c);
    }
  }
  return isSingleLoop(g, (e) => sol[e]) ? sol : null;
}

export interface Loop {
  g: Geo;
  clue: number[];
  /** Edges of the generated loop. */
  sol: boolean[];
  unique: boolean;
}

/** `keep`: share of clues that must stay (0 = as few as uniqueness allows). */
export function genLoop(w: number, h: number, keep: number, rng: Rng): Loop {
  const g = geometry(w, h);
  const N = w * h;
  let budget = 60000; // total solver nodes (deterministic, unlike a clock)
  let last: Loop | null = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    const sol = boundary(g, region(w, h, rng.int(45, 60) / 100, rng));
    if (!sol) continue;
    const clue = g.ce.map((es) => es.filter((e) => sol[e]).length);
    const full = count(g, clue, 2, 6000);
    budget -= full.nodes;
    last = { g, clue, sol, unique: full.count === 1 };
    if (!last.unique) continue;
    const order = rng.shuffle(Array.from({ length: N }, (_, i) => i));
    const maxRemove = Math.floor(N * (1 - keep));
    let removed = 0;
    for (const i of order) {
      if (removed >= maxRemove || budget <= 0) break;
      const v = clue[i];
      clue[i] = -1;
      const r = count(g, clue, 2, 2500);
      budget -= r.nodes;
      if (r.count === 1) removed++;
      else clue[i] = v;
    }
    return last;
  }
  return last!;
}
