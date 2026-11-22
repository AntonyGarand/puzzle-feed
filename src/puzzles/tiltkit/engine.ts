import type { Rng } from '../../core/rng';

/**
 * Tilt engine: a walled grid with coloured marbles, matching holes and grey blocks.
 * Tilting slides every movable piece that way until something stops it. A marble that rolls onto an
 * open hole of its own colour drops in and plugs it (the hole becomes plain floor); open holes of any
 * other colour stop everything in front of them, like a wall.
 */

/** Piece kinds: 0..2 marble colours, BLOCK = grey sliding block. */
export const BLOCK = 3;

export interface Layout {
  w: number;
  h: number;
  /** 1 = fixed wall. */
  wall: Uint8Array;
  /** Hole colour per cell, -1 = none. */
  hole: Int8Array;
  /** Index into `holes` per cell, -1 = none. */
  holeIdx: Int8Array;
  /** Hole cells, in index order (bit k of `filled` = holes[k] is plugged). */
  holes: number[];
}

export interface State {
  /** Cell per piece, -1 = sunk. */
  pos: number[];
  /** Bitmask of plugged holes. */
  filled: number;
}

export interface TiltResult extends State {
  moved: boolean;
  /** Piece index → hole cell it dropped into during this tilt. */
  drops: Map<number, number>;
}

const DR = [-1, 0, 1, 0];
const DC = [0, 1, 0, -1];

function makeLayout(w: number, h: number, wall: Uint8Array, hole: Int8Array): Layout {
  const holeIdx = new Int8Array(w * h).fill(-1);
  const holes: number[] = [];
  hole.forEach((c, i) => {
    if (c >= 0) {
      holeIdx[i] = holes.length;
      holes.push(i);
    }
  });
  return { w, h, wall, hole, holeIdx, holes };
}

/** Tilt the board toward `dir` (0 up, 1 right, 2 down, 3 left). Pure. */
export function tilt(lay: Layout, kinds: readonly number[], st: State, dir: number): TiltResult {
  const { w, h } = lay;
  const pos = st.pos.slice();
  let filled = st.filled;
  const occ = new Int8Array(w * h).fill(-1);
  const order: number[] = [];
  pos.forEach((p, i) => {
    if (p >= 0) {
      occ[p] = i;
      order.push(i);
    }
  });
  // Pieces nearest the edge we tilt toward settle first.
  const lead = (p: number) => {
    const r = Math.floor(p / w),
      c = p % w;
    return dir === 0 ? r : dir === 2 ? -r : dir === 3 ? c : -c;
  };
  order.sort((a, b) => lead(pos[a]) - lead(pos[b]));
  const drops = new Map<number, number>();
  for (const i of order) {
    let p = pos[i];
    occ[p] = -1;
    for (;;) {
      const r = Math.floor(p / w) + DR[dir],
        c = (p % w) + DC[dir];
      if (r < 0 || r >= h || c < 0 || c >= w) break;
      const q = r * w + c;
      if (lay.wall[q] || occ[q] >= 0) break;
      const hi = lay.holeIdx[q];
      if (hi >= 0 && !((filled >> hi) & 1)) {
        if (kinds[i] === lay.hole[q]) {
          filled |= 1 << hi;
          drops.set(i, q);
          p = -1;
        }
        break;
      }
      p = q;
    }
    pos[i] = p;
    if (p >= 0) occ[p] = i;
  }
  const moved = filled !== st.filled || pos.some((p, i) => p !== st.pos[i]);
  return { pos, filled, moved, drops };
}

/** Canonical key: pieces of the same kind are interchangeable. */
function stateKey(kinds: readonly number[], st: State): string {
  const groups: number[][] = [[], [], [], []];
  st.pos.forEach((p, i) => groups[kinds[i]].push(p + 1));
  let s = String.fromCharCode(st.filled);
  for (const g of groups) {
    g.sort((a, b) => a - b);
    s += String.fromCharCode(...g) + '|';
  }
  return s;
}

export const fullMask = (lay: Layout) => (1 << lay.holes.length) - 1;

/**
 * Shortest number of tilts to sink every marble, and the first tilt of one such route.
 * Infinite distance if it can't be done; null if the search hits `cap` states first.
 */
export function solve(lay: Layout, kinds: readonly number[], st: State, cap = 60000): { dist: number; first: number } | null {
  const full = fullMask(lay);
  if (st.filled === full) return { dist: 0, first: -1 };
  const seen = new Set<string>([stateKey(kinds, st)]);
  let frontier: { st: State; first: number }[] = [{ st, first: -1 }];
  for (let depth = 1; frontier.length; depth++) {
    const next: typeof frontier = [];
    for (const node of frontier) {
      for (let d = 0; d < 4; d++) {
        const r = tilt(lay, kinds, node.st, d);
        if (!r.moved) continue;
        const first = node.first < 0 ? d : node.first;
        if (r.filled === full) return { dist: depth, first };
        const k = stateKey(kinds, r);
        if (seen.has(k)) continue;
        if (seen.size >= cap) return null;
        seen.add(k);
        next.push({ st: { pos: r.pos, filled: r.filled }, first });
      }
    }
    frontier = next;
  }
  // Every reachable state explored: no way to sink them all.
  return { dist: Infinity, first: -1 };
}

/**
 * Every state reachable from `start`, with its distance to a solved board (-1 = dead end).
 * Null if more than `cap` states are reachable.
 */
function explore(lay: Layout, kinds: readonly number[], start: State, cap: number) {
  const full = fullMask(lay);
  const states: State[] = [start];
  const ids = new Map<string, number>([[stateKey(kinds, start), 0]]);
  const preds: number[][] = [[]];
  for (let k = 0; k < states.length; k++) {
    for (let d = 0; d < 4; d++) {
      const r = tilt(lay, kinds, states[k], d);
      if (!r.moved) continue;
      const key = stateKey(kinds, r);
      let id = ids.get(key);
      if (id == null) {
        if (states.length >= cap) return null;
        id = states.length;
        ids.set(key, id);
        states.push({ pos: r.pos, filled: r.filled });
        preds.push([]);
      }
      preds[id].push(k);
    }
  }
  const dist = new Int32Array(states.length).fill(-1);
  const q: number[] = [];
  states.forEach((s, i) => {
    if (s.filled === full) {
      dist[i] = 0;
      q.push(i);
    }
  });
  for (let k = 0; k < q.length; k++)
    for (const p of preds[q[k]])
      if (dist[p] < 0) {
        dist[p] = dist[q[k]] + 1;
        q.push(p);
      }
  return { states, dist };
}

export interface GenOpts {
  size: number;
  colours: number;
  marbles: number;
  blocks: number;
  walls: number;
  /** Accepted optimal solution lengths, inclusive. */
  lo: number;
  hi: number;
  /** Layout attempts and total explored-state budget. */
  tries: number;
  budget: number;
}

const EXPLORE_CAP = 4000;
const SOLVE_CAP = 8000;

export interface Puzzle {
  lay: Layout;
  kinds: number[];
  start: State;
  opt: number;
}

/** One random layout: walls, holes and pieces on distinct free cells. */
function randomLayout(rng: Rng, o: GenOpts) {
  const n = o.size * o.size;
  const cells = rng.shuffle(Array.from({ length: n }, (_, i) => i));
  const wall = new Uint8Array(n);
  const hole = new Int8Array(n).fill(-1);
  let k = 0;
  for (let i = 0; i < o.walls; i++) wall[cells[k++]] = 1;
  // Marble colours round-robin, so every colour is used.
  const kinds: number[] = [];
  for (let i = 0; i < o.marbles; i++) kinds.push(i % o.colours);
  for (const c of kinds) hole[cells[k++]] = c;
  for (let i = 0; i < o.blocks; i++) kinds.push(BLOCK);
  const pos = kinds.map(() => cells[k++]);
  return { lay: makeLayout(o.size, o.size, wall, hole), kinds, start: { pos, filled: 0 } };
}

/**
 * Random layouts; from all states reachable by tilting a random start, keep the untouched one (no marble
 * sunk yet) whose optimal solution is longest within [lo, hi]. Falls back to the best shorter one found.
 */
export function generate(rng: Rng, o: GenOpts): Puzzle {
  let best: Puzzle | null = null;
  let spent = 0;
  for (let t = 0; t < o.tries && spent < o.budget; t++) {
    const { lay, kinds, start } = randomLayout(rng, o);
    let cand: Puzzle | null = null;
    const ex = explore(lay, kinds, start, EXPLORE_CAP);
    if (ex) {
      spent += ex.states.length;
      let pick = -1;
      let ties = 0;
      ex.states.forEach((s, i) => {
        const dd = ex.dist[i];
        if (s.filled !== 0 || dd < 1 || dd > o.hi) return;
        const cur = pick < 0 ? -1 : ex.dist[pick];
        if (dd > cur) {
          pick = i;
          ties = 1;
        } else if (dd === cur && rng.int(0, ties++) === 0) pick = i;
      });
      if (pick >= 0) cand = { lay, kinds, start: ex.states[pick], opt: ex.dist[pick] };
    } else {
      // Too many reachable states to map them all: just solve the random start itself.
      spent += EXPLORE_CAP;
      const sol = solve(lay, kinds, start, SOLVE_CAP);
      spent += SOLVE_CAP / 2;
      if (sol && sol.dist >= 1 && sol.dist <= o.hi) cand = { lay, kinds, start, opt: sol.dist };
    }
    if (!cand) continue;
    if (cand.opt >= o.lo) return cand;
    if (!best || cand.opt > best.opt) best = cand;
  }
  if (best) return best;
  // Nothing in range: a smaller board-full (one marble fewer, no blocks), then a hand-made one.
  return o.marbles > o.colours ? generate(rng, { ...o, marbles: o.marbles - 1, blocks: 0, lo: 2, budget: o.budget / 4 }) : fallback();
}

/** Hand-made 4×4 board (two tilts), only if every random layout failed. */
function fallback(): Puzzle {
  const w = 4;
  const wall = new Uint8Array(16);
  const hole = new Int8Array(16).fill(-1);
  wall[5] = 1;
  hole[3] = 0;
  return { lay: makeLayout(w, w, wall, hole), kinds: [0], start: { pos: [12], filled: 0 }, opt: 2 };
}
