// Pearls: a loop through cell centres that obeys black (turn, straight on both sides) and white
// (straight, turn next to it) pearls. The cells of an n×n board are the dots of the slither geometry.
import type { Rng } from '../../core/rng';
import { boundary, geometry, isSingleLoop, region, type Geo } from './slither';

/** 0 none, 1 black, 2 white. */
export type Pearl = 0 | 1 | 2;

export interface Board {
  n: number;
  g: Geo;
  /** Edge from cell v in direction d (0 up, 1 right, 2 down, 3 left), or -1 off the board: `ed[v * 4 + d]`. */
  ed: Int32Array;
}

export interface PearlsPuzzle extends Board {
  pearl: Pearl[];
  /** Edges of the generated loop. */
  sol: boolean[];
  unique: boolean;
}

/** Cell one step from v in direction d (caller checks the edge exists). */
const stepOf = (n: number, v: number, d: number) => v + [-n, 1, n, -1][d];

function makeBoard(n: number): Board {
  const g = geometry(n - 1, n - 1);
  const H = n * (n - 1);
  const ed = new Int32Array(n * n * 4).fill(-1);
  for (let v = 0; v < n * n; v++) {
    const r = Math.floor(v / n),
      c = v % n;
    if (r > 0) ed[v * 4] = H + (r - 1) * n + c;
    if (c < n - 1) ed[v * 4 + 1] = r * (n - 1) + c;
    if (r < n - 1) ed[v * 4 + 2] = H + r * n + c;
    if (c > 0) ed[v * 4 + 3] = r * (n - 1) + c - 1;
  }
  return { n, g, ed };
}

interface Option {
  on: number[];
  off: number[];
}

/** Every local way a pearl can be satisfied: edges that must be lines and edges that must stay empty. */
export function pearlOptions(b: Board, v: number, kind: Pearl): Option[] {
  const { n, ed } = b;
  const E = (u: number, d: number) => ed[u * 4 + d];
  const out: Option[] = [];
  const push = (on: number[], off: number[]) => {
    if (on.every((e) => e >= 0)) out.push({ on, off: off.filter((e) => e >= 0) });
  };
  if (kind === 1) {
    for (const dv of [0, 2])
      for (const dh of [1, 3]) {
        if (E(v, dv) < 0 || E(v, dh) < 0) continue;
        const a = stepOf(n, v, dv),
          c = stepOf(n, v, dh);
        push([E(v, dv), E(a, dv), E(v, dh), E(c, dh)], [E(v, 2 - dv), E(v, 4 - dh), E(a, 1), E(a, 3), E(c, 0), E(c, 2)]);
      }
  } else if (kind === 2) {
    for (const [d1, d2] of [
      [1, 3],
      [0, 2],
    ]) {
      if (E(v, d1) < 0 || E(v, d2) < 0) continue;
      const side = [E(v, (d1 + 1) % 4), E(v, (d1 + 3) % 4)];
      // Straight here, and the neighbour on one side turns (its straight continuation stays empty).
      for (const d of [d1, d2]) push([E(v, d1), E(v, d2)], [...side, E(stepOf(n, v, d), d)]);
    }
  }
  return out;
}

/** Whether pearl at v is satisfied by the given lines (0/1 edge states). */
export function pearlOk(b: Board, v: number, kind: Pearl, on: (e: number) => boolean): boolean {
  return pearlOptions(b, v, kind).some((o) => o.on.every(on) && o.off.every((e) => !on(e)));
}

/** True when the lines form one loop that satisfies every pearl. */
export function isSolved(b: Board, pearl: Pearl[], on: (e: number) => boolean): boolean {
  return isSingleLoop(b.g, on) && pearl.every((k, v) => !k || pearlOk(b, v, k, on));
}

/** Counts loops matching the pearls, up to `limit` (`limit` when the node budget runs out). */
function count(b: Board, pearl: Pearl[], limit: number, budget: number, sols?: Int8Array[]) {
  const { g } = b;
  const { E, ea, eb, ve } = g;
  const V = ve.length;
  const pv = pearl.map((k, v) => (k ? v : -1)).filter((v) => v >= 0);
  const opts = pv.map((v) => pearlOptions(b, v, pearl[v]));
  const ep: number[][] = Array.from({ length: E }, () => []);
  opts.forEach((os, i) => {
    const es = new Set(os.flatMap((o) => [...o.on, ...o.off]));
    for (const e of es) ep[e].push(i);
  });
  let found = 0,
    nodes = 0;
  const other = (e: number, v: number) => (ea[e] === v ? eb[e] : ea[e]);

  // Work queue of cells (id) and pearls (V + index) whose edges changed.
  const inQ = new Uint8Array(V + pv.length);
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
    for (const i of ep[e]) push(V + i);
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
        const os = opts[x - V];
        let first: Option | null = null;
        let onAll: number[] | null = null,
          offAll: number[] | null = null;
        for (const o of os) {
          if (o.on.some((e) => st[e] === 0) || o.off.some((e) => st[e] === 1)) continue;
          if (!first) {
            first = o;
            onAll = o.on.filter((e) => st[e] === -1);
            offAll = o.off.filter((e) => st[e] === -1);
          } else {
            onAll = onAll!.filter((e) => o.on.includes(e));
            offAll = offAll!.filter((e) => o.off.includes(e));
          }
        }
        if (!first) return false;
        for (const e of onAll!) if (st[e] === -1) set(e, 1);
        for (const e of offAll!) if (st[e] === -1) set(e, 0);
      }
    }
    return true;
  };

  /** The chain of lines through `e0`: its two end cells, its length, and whether it is closed. */
  const chain = (e0: number, seen: Uint8Array) => {
    let len = 1;
    seen[e0] = 1;
    const run = (v: number): number => {
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
        len++;
        prev = next;
        v = other(next, v);
      }
    };
    const end = run(eb[e0]);
    if (end < 0) return { a: -1, b: -1, len, closed: true };
    return { a: run(ea[e0]), b: end, len, closed: false };
  };

  const deg = (v: number) => {
    let k = 0;
    for (const f of ve[v]) if (st[f] === 1) k++;
    return k;
  };

  /** Loop rules: a closed loop must hold every line and every pearl; never close one early. */
  const loopRules = (): boolean | 'changed' | 'closed' => {
    let total = 0;
    for (let e = 0; e < E; e++) if (st[e] === 1) total++;
    if (!total) return true;
    const loose = pv.some((v) => deg(v) === 0);
    const seen = new Uint8Array(E);
    let changed = false;
    for (let e = 0; e < E; e++) {
      if (st[e] !== 1 || seen[e]) continue;
      const ch = chain(e, seen);
      if (ch.closed) {
        if (ch.len !== total || loose) return false;
        for (let f = 0; f < E; f++) if (st[f] === -1) st[f] = 0;
        return pv.every((v) => pearlOk(b, v, pearl[v], (f) => st[f] === 1)) ? 'closed' : false;
      }
      if (ch.len === total && !loose) break;
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
      for (let i = 0; i < pv.length; i++) push(V + i);
    }
    const r = propagate();
    if (!r) return;
    if (r === 'closed') {
      found++;
      sols?.push(st.slice());
      return;
    }
    // Prefer extending a chain end; then an open edge at a pearl; then any unknown edge.
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
    for (let i = 0; i < pv.length && pick < 0; i++) for (const f of ve[pv[i]]) if (pick < 0 && st[f] === -1) pick = f;
    for (let f = 0; f < E && pick < 0; f++) if (st[f] === -1) pick = f;
    if (pick < 0) return;
    const here = st;
    rec(here, pick, 1);
    rec(here, pick, 0);
  };
  rec(new Int8Array(E).fill(-1), -1, 0);
  return { count: found, nodes };
}

/** Pearls the loop allows at each cell: black where it turns between two straights, white where it runs straight next to a turn. */
function candidates(b: Board, sol: boolean[]): Pearl[] {
  const { n, ed } = b;
  const on = (u: number, d: number) => ed[u * 4 + d] >= 0 && sol[ed[u * 4 + d]];
  return Array.from({ length: n * n }, (_, v): Pearl => {
    const ds = [0, 1, 2, 3].filter((d) => on(v, d));
    if (ds.length !== 2) return 0;
    const straight = ds[1] - ds[0] === 2;
    const nb = ds.map((d) => on(stepOf(n, v, d), d)); // does the neighbour that way go straight?
    if (!straight) return nb[0] && nb[1] ? 1 : 0;
    return nb[0] && nb[1] ? 0 : 2;
  });
}

/**
 * `keep`: share of candidate pearls that must stay (0 = as few as uniqueness allows).
 * `blackBias` (0–1): how strongly black pearls are tried for removal before white ones, leaving whiter boards.
 */
export function genPearls(n: number, keep: number, blackBias: number, rng: Rng): PearlsPuzzle {
  const b = makeBoard(n);
  const { g } = b;
  const w = n - 1;
  let budget = 60000; // total solver nodes (deterministic, unlike a clock)
  let last: PearlsPuzzle | null = null;
  for (let attempt = 0; attempt < 10 && budget > 0; attempt++) {
    // The loop is the outline of a random region of the (n-1)² squares between cell centres.
    const inR = region(w, w, rng.int(55, 75) / 100, rng, 0.3);
    let sol = boundary(g, inR);
    if (!sol) continue;
    let pearl = candidates(b, sol);
    // With every possible pearl placed, reshape the loop where another loop also fits, until it's the only one.
    for (let fix = 0; fix < 40 && budget > 0; fix++) {
      const sols: Int8Array[] = [];
      const r = count(b, pearl, 2, 3000, sols);
      budget -= r.nodes;
      last = { ...b, pearl, sol, unique: r.count === 1 };
      if (last.unique) break;
      const cur = sol;
      const alt = sols.find((t) => t.some((v, e) => (v === 1) !== cur[e]));
      if (!alt) break;
      const diff = rng.shuffle(cur.map((on, e) => (on !== (alt[e] === 1) ? e : -1)).filter((e) => e >= 0));
      let moved = false;
      for (const e of diff.slice(0, 4)) {
        for (const c of rng.shuffle(g.ec[e].slice())) {
          inR[c] = !inR[c];
          const next = boundary(g, inR);
          if (next) {
            sol = next;
            moved = true;
            break;
          }
          inR[c] = !inR[c];
        }
        if (moved) break;
      }
      if (!moved) break;
      pearl = candidates(b, sol);
    }
    if (!last?.unique) continue;
    const ids = pearl.map((k, v) => (k ? v : -1)).filter((v) => v >= 0);
    const key = new Map(ids.map((v) => [v, rng.next() + (pearl[v] === 1 ? blackBias : 0)]));
    const order = ids.sort((x, y) => key.get(y)! - key.get(x)!);
    const maxRemove = Math.floor(ids.length * (1 - keep));
    let removed = 0;
    for (const v of order) {
      if (removed >= maxRemove || budget <= 0) break;
      const k = pearl[v];
      pearl[v] = 0;
      const r = count(b, pearl, 2, 2500);
      budget -= r.nodes;
      if (r.count === 1) removed++;
      else pearl[v] = k;
    }
    return last;
  }
  return last ?? { ...b, pearl: new Array<Pearl>(n * n).fill(0), sol: new Array<boolean>(g.E).fill(false), unique: false };
}

// ---- Human-style deductions for the guide. Edge states: 0 empty, 1 line, 2 ✕. ----

export type Kind = 'bwall' | 'bpair' | 'bline' | 'bblock' | 'w3' | 'wwall' | 'wblock' | 'wturn' | 'dot2' | 'dot1' | 'dot0' | 'close';

export interface Move {
  kind: Kind;
  /** Edges that become lines / get a ✕. */
  on: number[];
  off: number[];
  /** Cells that justify it (pearls or dots). */
  why: number[];
  /** Direction the line runs (black pearls, 'wturn'), or axis for white pearls (0 vertical, 1 horizontal). */
  d: number;
}

const opp = (d: number) => (d + 2) % 4;

/** Why a black pearl at v can't run towards d, or null if it can. */
function blackBlock(b: Board, pearl: Pearl[], t: ArrayLike<number>, v: number, d: number): Kind | null {
  const { n, ed } = b;
  const e1 = ed[v * 4 + d];
  if (e1 < 0) return 'bwall';
  const u = stepOf(n, v, d);
  const e2 = ed[u * 4 + d];
  if (e2 < 0) return 'bwall';
  if (pearl[u] === 1) return 'bpair';
  const back = ed[v * 4 + opp(d)];
  if (back >= 0 && t[back] === 1) return 'bline';
  if (t[e1] === 2 || t[e2] === 2) return 'bblock';
  for (const p of [(d + 1) % 4, (d + 3) % 4]) if (ed[u * 4 + p] >= 0 && t[ed[u * 4 + p]] === 1) return 'bblock';
  return null;
}

/** Why a white pearl at v can't run along axis a (0 vertical, 1 horizontal), or null if it can. */
function whiteBlock(b: Board, t: ArrayLike<number>, v: number, a: number): Kind | null {
  const { n, ed } = b;
  const [d1, d2] = a ? [1, 3] : [0, 2];
  const e1 = ed[v * 4 + d1],
    e2 = ed[v * 4 + d2];
  if (e1 < 0 || e2 < 0) return 'wwall';
  if (t[e1] === 2 || t[e2] === 2) return 'wblock';
  for (const p of a ? [0, 2] : [1, 3]) if (ed[v * 4 + p] >= 0 && t[ed[v * 4 + p]] === 1) return 'wblock';
  // Both neighbours along the axis already run straight on: no turn next to the pearl.
  const s1 = ed[stepOf(n, v, d1) * 4 + d1],
    s2 = ed[stepOf(n, v, d2) * 4 + d2];
  if (s1 >= 0 && s2 >= 0 && t[s1] === 1 && t[s2] === 1) return 'wblock';
  return null;
}

/** Every simple deduction available from state `t` (moves that change nothing are left out). */
export function deductions(b: Board, pearl: Pearl[], t: ArrayLike<number>): Move[] {
  const { n, ed, g } = b;
  const { ve, ea, eb, E } = g;
  const out: Move[] = [];
  const E4 = (u: number, d: number) => ed[u * 4 + d];
  const add = (kind: Kind, on: number[], off: number[], why: number[], d: number) => {
    const on2 = [...new Set(on.filter((e) => e >= 0 && t[e] === 0))];
    const off2 = [...new Set(off.filter((e) => e >= 0 && t[e] === 0))];
    if (on2.length || off2.length) out.push({ kind, on: on2, off: off2, why, d });
  };
  const N = n * n;
  for (let v = 0; v < N; v++) {
    if (pearl[v] === 1) {
      for (const axis of [
        [0, 2],
        [1, 3],
      ]) {
        const [ka, kb] = axis.map((d) => blackBlock(b, pearl, t, v, d));
        if (!!ka === !!kb) continue;
        const d = ka ? axis[1] : axis[0];
        const u = stepOf(n, v, d);
        add((ka ?? kb)!, [E4(v, d), E4(u, d)], [E4(v, opp(d)), E4(u, (d + 1) % 4), E4(u, (d + 3) % 4)], [v], d);
      }
    } else if (pearl[v] === 2) {
      const r = Math.floor(v / n),
        c = v % n;
      // Three whites in a row can't all run along it: they all go across.
      for (const [step, ok, a] of [
        [1, c + 2 < n, 0],
        [n, r + 2 < n, 1],
      ] as const)
        if (ok && pearl[v + step] === 2 && pearl[v + 2 * step] === 2) {
          const trio = [v, v + step, v + 2 * step];
          const [d1, d2] = a ? [1, 3] : [0, 2];
          const [p1, p2] = a ? [0, 2] : [1, 3];
          add(
            'w3',
            trio.flatMap((x) => [E4(x, d1), E4(x, d2)]),
            trio.flatMap((x) => [E4(x, p1), E4(x, p2)]),
            trio,
            a,
          );
        }
      const [kv, kh] = [0, 1].map((a) => whiteBlock(b, t, v, a));
      if (!!kv !== !!kh) {
        const a = kv ? 1 : 0;
        const [d1, d2] = a ? [1, 3] : [0, 2];
        const [p1, p2] = a ? [0, 2] : [1, 3];
        add((kv ?? kh)!, [E4(v, d1), E4(v, d2)], [E4(v, p1), E4(v, p2)], [v], a);
      }
      // Running straight through: if one neighbour goes on straight, the other must turn.
      for (const [d1, d2] of [
        [0, 2],
        [1, 3],
        [2, 0],
        [3, 1],
      ]) {
        if (E4(v, d1) < 0 || E4(v, d2) < 0 || t[E4(v, d1)] !== 1 || t[E4(v, d2)] !== 1) continue;
        const s1 = E4(stepOf(n, v, d1), d1),
          s2 = E4(stepOf(n, v, d2), d2);
        if (s1 >= 0 && t[s1] === 1 && s2 >= 0) add('wturn', [], [s2], [v, stepOf(n, v, d1)], d2);
      }
    }
  }
  // What each dot allows.
  const dead: number[] = [];
  for (let v = 0; v < N; v++) {
    const es = ve[v];
    const lines = es.filter((e) => t[e] === 1).length;
    const open = es.filter((e) => t[e] === 0);
    if (!open.length || lines > 2) continue;
    if (lines === 2) add('dot2', [], open, [v], 0);
    else if (lines === 1 && open.length === 1) add('dot1', open, [], [v], 0);
    else if (lines === 0 && open.length === 1 && !pearl[v]) dead.push(v);
  }
  if (dead.length)
    add(
      'dot0',
      [],
      dead.flatMap((v) => ve[v].filter((e) => t[e] === 0)),
      dead,
      0,
    );
  // Never close a loop early: it would leave out other lines or pearls.
  const seen = new Uint8Array(E);
  let total = 0;
  for (let e = 0; e < E; e++) if (t[e] === 1) total++;
  const deg = (v: number) => ve[v].filter((e) => t[e] === 1).length;
  for (let e0 = 0; e0 < E; e0++) {
    if (t[e0] !== 1 || seen[e0]) continue;
    const cells = new Set<number>([ea[e0], eb[e0]]);
    const ends: number[] = [];
    let len = 1;
    seen[e0] = 1;
    for (const start of [ea[e0], eb[e0]]) {
      let v = start,
        prev = e0;
      for (;;) {
        const next = ve[v].find((f) => f !== prev && t[f] === 1 && !seen[f]);
        if (next == null) break;
        seen[next] = 1;
        len++;
        prev = next;
        v = ea[next] === v ? eb[next] : ea[next];
        cells.add(v);
      }
      if (deg(v) === 1) ends.push(v);
    }
    if (ends.length !== 2) continue;
    const gap = ve[ends[0]].find((f) => (ea[f] === ends[1] || eb[f] === ends[1]) && t[f] === 0);
    if (gap == null) continue;
    const outside = pearl.some((k, v) => k && !cells.has(v));
    if (len < total || outside) add('close', [], [gap], ends, 0);
  }
  return out;
}

/** A cell where state `t` breaks the rules (overfull dot, dead end, impossible pearl), or -1. */
export function broken(b: Board, pearl: Pearl[], t: ArrayLike<number>): number {
  const { ve } = b.g;
  for (let v = 0; v < ve.length; v++) {
    const lines = ve[v].filter((e) => t[e] === 1).length;
    const open = ve[v].filter((e) => t[e] === 0).length;
    if (lines > 2 || (lines === 1 && !open)) return v;
    if (pearl[v] && !pearlOptions(b, v, pearl[v]).some((o) => o.on.every((e) => t[e] !== 2) && o.off.every((e) => t[e] !== 1))) return v;
  }
  return -1;
}
