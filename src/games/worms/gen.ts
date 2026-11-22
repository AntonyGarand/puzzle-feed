import type { Rng } from '../../core/rng';
import { stepper } from '../../kits/move/pushgen';

/**
 * Worms: chains of cells on a top-down grid. A move pushes one end (the head) a step onto a free floor
 * cell and the rest follows. Either end can lead, so every move can be undone by moving the other end
 * back: the generator scrambles a solved layout with random moves, then measures it with a solver.
 */
export interface WormRoom {
  w: number;
  h: number;
  /** true = floor */
  floor: boolean[];
  /** Goal cells of each worm (as many as its length). */
  goals: number[][];
  /** Starting cells of each worm, head first. */
  start: number[][];
  /** Fewest moves to solve (exact, from the solver). */
  optimal: number;
}

/** One move: worm `k` leads with its first cell (`tail` false) or its last cell (`tail` true) in direction `dir`. */
export interface WormMove {
  k: number;
  tail: boolean;
  dir: number;
}

const BASE = 4096;

/** Code of a chain read in this order: first cell + 2 bits per link (< 4096 for ≤ 4 cells on ≤ 64 cells). */
function chainCode(seq: number[], w: number, rev: boolean) {
  const last = seq.length - 1;
  let code = 0,
    mul = 64;
  for (let j = 1; j <= last; j++) {
    const d = rev ? seq[last - j] - seq[last - j + 1] : seq[j] - seq[j - 1];
    code += mul * (d === -w ? 0 : d === 1 ? 1 : d === w ? 2 : 3);
    mul *= 4;
  }
  return code + (rev ? seq[last] : seq[0]);
}
/** Same code whichever end is read first. */
function canon(seq: number[], w: number) {
  const a = chainCode(seq, w, false),
    b = chainCode(seq, w, true);
  return a < b ? a : b;
}

/** One number per layout (up to 4 worms: 48 bits, exact in a double). */
function encode(worms: number[][], w: number) {
  let key = 0,
    mul = 1;
  for (const seq of worms) {
    key += canon(seq, w) * mul;
    mul *= BASE;
  }
  return key;
}

/** Apply a move to a copy; null when blocked. `occ` must mark every worm cell. */
export function applyMove(worms: number[][], m: WormMove, floor: boolean[], nb: (i: number, d: number) => number, occ: Uint8Array) {
  const seq = worms[m.k];
  const end = m.tail ? seq[seq.length - 1] : seq[0];
  const to = nb(end, m.dir);
  if (to < 0 || !floor[to] || occ[to]) return null;
  const out = worms.slice();
  out[m.k] = m.tail ? [...seq.slice(1), to] : [to, ...seq.slice(0, -1)];
  return out;
}

export function occupancy(worms: number[][], n: number) {
  const occ = new Uint8Array(n);
  for (const seq of worms) for (const c of seq) occ[c] = 1;
  return occ;
}

export const isHome = (seq: number[], goal: Set<number>) => seq.every((c) => goal.has(c));

/** Every way to lay a chain over exactly these cells (both reading directions). */
function chainsOver(cells: number[], w: number) {
  const set = new Set(cells);
  const out: number[][] = [];
  const walk = (path: number[]) => {
    if (path.length === cells.length) {
      out.push(path.slice());
      return;
    }
    const last = path[path.length - 1];
    for (const o of [-w, 1, w, -1]) {
      const y = last + o;
      if (!set.has(y) || path.includes(y)) continue;
      if ((o === 1 || o === -1) && Math.floor(y / w) !== Math.floor(last / w)) continue; // no wrapping
      path.push(y);
      walk(path);
      path.pop();
    }
  };
  for (const c of cells) walk([c]);
  return out;
}

/**
 * Fewest moves for each worm alone (walls only, other worms ignored), per chain layout: an admissible
 * and consistent estimate for the solver, since a move shifts one worm by one step.
 */
export function loneTables(w: number, h: number, floor: boolean[], goals: number[][]) {
  const nb = stepper(w, h);
  const occ = new Uint8Array(w * h);
  return goals.map((g) => {
    const dist = new Int16Array(BASE).fill(-1);
    let layer = chainsOver(g, w);
    for (const c of layer) dist[canon(c, w)] = 0;
    for (let d = 1; layer.length; d++) {
      const next: number[][] = [];
      for (const seq of layer) {
        for (const c of seq) occ[c] = 1;
        for (let t = 0; t < 2; t++)
          for (let dir = 0; dir < 4; dir++) {
            const nx = applyMove([seq], { k: 0, tail: t === 1, dir }, floor, nb, occ);
            if (!nx) continue;
            const code = canon(nx[0], w);
            if (dist[code] >= 0) continue;
            dist[code] = d;
            next.push(nx[0]);
          }
        for (const c of seq) occ[c] = 0;
      }
      layer = next;
    }
    return dist;
  });
}

/** Sum of lone distances (Infinity if some worm can't reach its goal even alone). */
export const estimate = (tables: Int16Array[], worms: number[][], w: number) =>
  worms.reduce((a, seq, k) => a + (tables[k][canon(seq, w)] < 0 ? Infinity : tables[k][canon(seq, w)]), 0);

/**
 * Shortest solution from `worms` (A* on the lone-distance estimate), or null when not found within
 * `cap` expanded layouts. Moves refer to the chains in the order given (first cell = head).
 */
export function solveWorms(
  w: number,
  h: number,
  floor: boolean[],
  goals: number[][],
  worms: number[][],
  cap = 60000,
  tables = loneTables(w, h, floor, goals),
  work: { left: number } = { left: Infinity },
): WormMove[] | null {
  const n = w * h;
  const nbt = new Int16Array(n * 4);
  const step = stepper(w, h);
  for (let i = 0; i < n; i++) for (let d = 0; d < 4; d++) nbt[i * 4 + d] = step(i, d);
  const h0 = estimate(tables, worms, w);
  if (h0 === 0) return [];
  if (!Number.isFinite(h0)) return null;
  interface Node {
    ws: number[][];
    /** per-worm chain codes */
    codes: number[];
    key: number;
    est: number;
    g: number;
    from: Node | null;
    m: WormMove | null;
  }
  const codes0 = worms.map((sq) => canon(sq, w));
  const key0 = encode(worms, w);
  const mul = worms.map((_, k) => BASE ** k);
  const best = new Map<number, number>([[key0, 0]]);
  const buckets: Node[][] = [];
  buckets[h0] = [{ ws: worms, codes: codes0, key: key0, est: h0, g: 0, from: null, m: null }];
  const occ = new Uint8Array(n);
  let expanded = 0;
  for (let f = h0; f < buckets.length; f++) {
    const bucket = buckets[f];
    if (!bucket) continue;
    // Most recent first within a bucket: it tends to reach the goal sooner among ties.
    while (bucket.length) {
      const node = bucket.pop()!;
      if (best.get(node.key)! < node.g) continue; // reached more cheaply since
      if (++expanded > cap || --work.left < 0) return null;
      const { ws } = node;
      for (const sq of ws) for (const c of sq) occ[c] = 1;
      const g = node.g + 1;
      for (let k = 0; k < ws.length; k++) {
        const sq = ws[k];
        const last = sq.length - 1;
        for (let t = 0; t < 2; t++) {
          const end = t ? sq[last] : sq[0];
          for (let dir = 0; dir < 4; dir++) {
            const to = nbt[end * 4 + dir];
            if (to < 0 || !floor[to] || occ[to]) continue;
            const nsq = t ? [...sq.slice(1), to] : [to, ...sq.slice(0, last)];
            // only worm k changed: update its code and its share of the estimate
            const code = canon(nsq, w);
            const key = node.key + (code - node.codes[k]) * mul[k];
            const old = best.get(key);
            if (old != null && old <= g) continue;
            best.set(key, g);
            const est = node.est - tables[k][node.codes[k]] + tables[k][code];
            const codes = node.codes.slice();
            codes[k] = code;
            const nws = ws.slice();
            nws[k] = nsq;
            const child: Node = { ws: nws, codes, key, est, g, from: node, m: { k, tail: t === 1, dir } };
            if (est === 0) {
              for (const s of ws) for (const c of s) occ[c] = 0;
              const path: WormMove[] = [];
              for (let x: Node | null = child; x?.m; x = x.from) path.unshift(x.m);
              return path;
            }
            (buckets[g + est] ??= []).push(child);
          }
        }
      }
      for (const s of ws) for (const c of s) occ[c] = 0;
    }
  }
  return null;
}

/** Random self-avoiding chain of `len` free floor cells, or null. */
function layChain(rng: Rng, w: number, h: number, floor: boolean[], occ: Uint8Array, len: number) {
  const nb = stepper(w, h);
  const free = floor.map((f, i) => (f && !occ[i] ? i : -1)).filter((i) => i >= 0);
  if (!free.length) return null;
  // Goals huddle together (touching earlier ones), so the order the worms settle in matters.
  const touching = (i: number) => [0, 1, 2, 3].some((d) => occ[nb(i, d)] === 1);
  const near = free.filter(touching);
  for (let tries = 0; tries < 30; tries++) {
    const seq = [rng.pick(near.length && tries < 20 ? near : free)];
    while (seq.length < len) {
      const last = seq[seq.length - 1];
      const opts = [0, 1, 2, 3].map((d) => nb(last, d)).filter((y) => y >= 0 && floor[y] && !occ[y] && !seq.includes(y));
      if (!opts.length) break;
      const hug = opts.filter(touching);
      seq.push(rng.pick(hug.length && rng.next() < 0.7 ? hug : opts));
    }
    if (seq.length === len) return seq;
  }
  return null;
}

function connected(floor: boolean[], w: number, h: number) {
  const nb = stepper(w, h);
  const first = floor.indexOf(true);
  const seen = new Uint8Array(w * h);
  seen[first] = 1;
  const q = [first];
  for (let k = 0; k < q.length; k++)
    for (let d = 0; d < 4; d++) {
      const y = nb(q[k], d);
      if (y >= 0 && floor[y] && !seen[y]) {
        seen[y] = 1;
        q.push(y);
      }
    }
  return q.length === floor.filter(Boolean).length;
}

export interface WormSpec {
  w: number;
  h: number;
  lens: number[];
  walls: number;
  /** Accept a start needing at least this many moves… */
  min: number;
  /** …at most this many… */
  max: number;
  /** …and at least this many more than the worms would need alone (they get in each other's way). */
  extra: number;
  /** Solver budget (expanded layouts) per candidate. */
  cap: number;
  /** Total solver work (expanded layouts) for all candidates; past it, the best one so far is kept. */
  work: number;
}

export function generateWorms(rng: Rng, spec: WormSpec): WormRoom {
  const { w, h, lens, walls, min, max, extra, cap } = spec;
  const nb = stepper(w, h);
  const work = { left: spec.work };
  let best: WormRoom | null = null;
  let bestScore = -1;
  for (let attempt = 0; attempt < 150 || !best; attempt++) {
    const late = work.left <= 0;
    if (best && late) break;
    const floor = new Array<boolean>(w * h).fill(true);
    for (let k = 0, guard = 0; k < walls && guard < 200; guard++) {
      const i = rng.int(0, w * h - 1);
      if (!floor[i]) continue;
      floor[i] = false;
      if (connected(floor, w, h)) k++;
      else floor[i] = true;
    }
    const occ0 = new Uint8Array(w * h);
    const goals: number[][] = [];
    for (const len of lens) {
      const seq = layChain(rng, w, h, floor, occ0, len);
      if (!seq) break;
      for (const c of seq) occ0[c] = 1;
      goals.push(seq);
    }
    if (goals.length < lens.length) continue;
    // Scramble with random legal moves (short when running late, so the fallback is quick to solve).
    let ws = goals.map((g) => g.slice());
    let lastK = -1;
    for (let step = 0, steps = late ? 8 : 40 + 15 * lens.length; step < steps; step++) {
      const occ = occupancy(ws, w * h);
      const opts: WormMove[] = [];
      for (let k = 0; k < ws.length; k++)
        for (let t = 0; t < 2; t++)
          for (let dir = 0; dir < 4; dir++) {
            const m = { k, tail: t === 1, dir };
            if (applyMove(ws, m, floor, nb, occ)) opts.push(m);
          }
      if (!opts.length) break;
      // Favour switching worms so they all wander and tangle.
      const other = opts.filter((m) => m.k !== lastK);
      const m = rng.pick(other.length && rng.next() < 0.6 ? other : opts);
      ws = applyMove(ws, m, floor, nb, occ)!;
      lastK = m.k;
    }
    const gsets = goals.map((g) => new Set(g));
    if (!late && ws.some((s, k) => isHome(s, gsets[k]))) continue;
    const tables = loneTables(w, h, floor, goals);
    const sol = solveWorms(w, h, floor, goals, ws, cap, tables, late ? { left: cap } : work);
    if (!sol?.length || (sol.length > max && !late)) continue;
    const over = sol.length - estimate(tables, ws, w);
    const score = Math.min(sol.length, min) + 2 * Math.min(over, extra);
    if (score <= bestScore) continue;
    bestScore = score;
    best = { w, h, floor, goals, start: ws, optimal: sol.length };
    if (sol.length >= min && over >= extra) break;
  }
  return best;
}
