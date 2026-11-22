import type { Rng } from '../../core/rng';
import { dist, makeFloor, stepper } from './pushgen';

/**
 * Tether: two tokens joined by a tape of cells. The chain is stored as a path `[A, tape…, B]`.
 * A token either steps onto a free neighbour (laying one more tape cell behind it) or steps back onto
 * the tape cell next to it (reeling one in). The tape holds at most `max` cells.
 */
export interface Tether {
  w: number;
  h: number;
  /** true = floor */
  floor: boolean[];
  /** Start chain: A, tape cells, B. */
  path: number[];
  /** Goal cells for A and B. */
  goals: [number, number];
  /** Most tape cells allowed between the tokens. */
  max: number;
  /** Fewest moves (verified by BFS). */
  moves: number;
}

/** One move: token `t` (0 = A, 1 = B) steps onto cell `to`. */
export interface TMove {
  t: 0 | 1;
  to: number;
}

/** Legal moves of a chain (each token: extend onto a free neighbour, or retract onto its tape neighbour). */
export function legalMoves(w: number, h: number, floor: boolean[], path: number[], max: number): TMove[] {
  const nb = stepper(w, h);
  const out: TMove[] = [];
  const tape = path.length - 2;
  for (const t of [0, 1] as const) {
    const end = t ? path[path.length - 1] : path[0];
    if (tape > 0) out.push({ t, to: t ? path[path.length - 2] : path[1] });
    if (tape >= max) continue;
    for (let d = 0; d < 4; d++) {
      const y = nb(end, d);
      if (y >= 0 && floor[y] && !path.includes(y)) out.push({ t, to: y });
    }
  }
  return out;
}

/** Apply a move (assumed legal); returns the new chain. */
export function applyMove(path: number[], m: TMove): number[] {
  const n = path.length;
  if (m.t === 0) return n > 2 && path[1] === m.to ? path.slice(1) : [m.to, ...path];
  return n > 2 && path[n - 2] === m.to ? path.slice(0, -1) : [...path, m.to];
}

/**
 * Packed-state search engine. A state key is `A + N * (steps + 16 * dirs)`, where `dirs` holds the
 * direction of each chain edge (2 bits each, from A towards B) and `steps` the number of edges.
 */
function engine(w: number, h: number, floor: boolean[], max: number) {
  const N = w * h;
  const nb = stepper(w, h);
  const delta = [-w, 1, w, -1];
  const dirOf = (a: number, b: number) => (b === a - w ? 0 : b === a + 1 ? 1 : b === a + w ? 2 : 3);
  const pow4 = [1];
  for (let i = 1; i <= max + 2; i++) pow4.push(pow4[i - 1] * 4);
  const cells = new Int32Array(max + 2);
  const stamp = new Int32Array(N);
  let tick = 0;
  const encode = (p: readonly number[]) => {
    let dirs = 0;
    for (let i = 0; i < p.length - 1; i++) dirs += dirOf(p[i], p[i + 1]) * pow4[i];
    return p[0] + N * (p.length - 1 + 16 * dirs);
  };
  const decode = (key: number): number[] => {
    const a = key % N;
    const rest = (key - a) / N;
    const steps = rest % 16;
    let dirs = (rest - steps) / 16;
    const p = [a];
    for (let i = 0; i < steps; i++) {
      const d = dirs % 4;
      dirs = (dirs - d) / 4;
      p.push(p[i] + delta[d]);
    }
    return p;
  };
  /** Calls `cb(nextKey, token, to)` for every legal move from `key`. */
  const expand = (key: number, cb: (k: number, t: 0 | 1, to: number) => void) => {
    const a = key % N;
    const rest = (key - a) / N;
    const steps = rest % 16;
    const dirs = (rest - steps) / 16;
    tick++;
    let x = a,
      dd = dirs;
    cells[0] = a;
    stamp[a] = tick;
    for (let i = 0; i < steps; i++) {
      const d = dd % 4;
      dd = (dd - d) / 4;
      x += delta[d];
      cells[i + 1] = x;
      stamp[x] = tick;
    }
    const b = x;
    if (steps > 1) {
      // A reels in onto cells[1]; B reels in onto cells[steps - 1].
      const d0 = dirs % 4;
      cb(cells[1] + N * (steps - 1 + 16 * ((dirs - d0) / 4)), 0, cells[1]);
      cb(a + N * (steps - 1 + 16 * (dirs % pow4[steps - 1])), 1, cells[steps - 1]);
    }
    if (steps - 1 >= max) return;
    for (let d = 0; d < 4; d++) {
      const y = nb(a, d);
      if (y >= 0 && floor[y] && stamp[y] !== tick) cb(y + N * (steps + 1 + 16 * (dirOf(y, a) + 4 * dirs)), 0, y);
      const z = nb(b, d);
      if (z >= 0 && floor[z] && stamp[z] !== tick) cb(a + N * (steps + 1 + 16 * (dirs + d * pow4[steps])), 1, z);
    }
  };
  const ends = (key: number): [number, number] => {
    const p = decode(key);
    return [p[0], p[p.length - 1]];
  };
  return { N, encode, decode, expand, ends };
}

/**
 * Fewest-moves solution from `path` (BFS within a node budget): the list of moves, [] when already
 * solved, or null when unsolvable or out of budget.
 */
export function solveTether(
  w: number,
  h: number,
  floor: boolean[],
  max: number,
  path: number[],
  goals: [number, number],
  cap = 400000,
): TMove[] | null {
  const e = engine(w, h, floor, max);
  if (path[0] === goals[0] && path[path.length - 1] === goals[1]) return [];
  const keys = [e.encode(path)];
  const parent = [-1];
  const how: number[] = [0];
  const seen = new Set<number>(keys);
  let found = -1;
  for (let k = 0; k < keys.length; k++) {
    if (keys.length > cap) return null;
    const [ka, kb] = e.ends(keys[k]);
    e.expand(keys[k], (nk, t, to) => {
      if (found >= 0 || seen.has(nk)) return;
      seen.add(nk);
      keys.push(nk);
      parent.push(k);
      how.push(t * e.N + to);
      if ((t ? ka : to) === goals[0] && (t ? to : kb) === goals[1]) found = keys.length - 1;
    });
    if (found >= 0) break;
  }
  if (found < 0) return null;
  const out: TMove[] = [];
  for (let i = found; i > 0; i = parent[i]) out.unshift({ t: how[i] >= e.N ? 1 : 0, to: how[i] % e.N });
  return out;
}

/** Random self-avoiding chain of `edges` steps from `a`, or null. */
function randomChain(w: number, h: number, floor: boolean[], rng: Rng, a: number, edges: number): number[] | null {
  const nb = stepper(w, h);
  const p = [a];
  for (let i = 0; i < edges; i++) {
    const opts = [0, 1, 2, 3].map((d) => nb(p[i], d)).filter((y) => y >= 0 && floor[y] && !p.includes(y));
    if (!opts.length) return null;
    p.push(rng.pick(opts));
  }
  return p;
}

export interface TetherTuning {
  w: number;
  h: number;
  /** Most tape cells. */
  max: number;
  /** Fewest moves wanted (and a soft ceiling, so puzzles don't turn into long walks). */
  minMoves: number;
  maxMoves: number;
  /** Extra moves beyond walking each token straight to its goal (detours, turning the pair around). */
  minExtra: number;
  /** Search states per level and in total (deterministic, so a resume regenerates the same level). */
  cap: number;
  budget: number;
  /** Lowest wall density (each room adds up to 0.14 more). */
  walls?: number;
}

/**
 * Random room + start chain, then a full BFS of the reachable states: each (A, B) pair gets its fewest
 * moves. The goals are the pair that needs the most extra moves beyond walking both tokens straight
 * there, within the move window. Keeps the best room over several attempts.
 */
export function genTether(rng: Rng, t: TetherTuning): Tether {
  const { w, h, max } = t;
  const N = w * h;
  let work = t.budget;
  let best: Tether | null = null;
  let bestScore = -Infinity;
  for (let attempt = 0; attempt < 400 && work > 0; attempt++) {
    const floor = makeFloor(w, h, rng, (t.walls ?? 0.24) + rng.next() * 0.14);
    const cells = floor.map((f, i) => (f ? i : -1)).filter((i) => i >= 0);
    if (cells.length < N * 0.5) continue;
    const path = randomChain(w, h, floor, rng, rng.pick(cells), 1 + rng.int(0, Math.min(2, max)));
    if (!path) continue;
    const e = engine(w, h, floor, max);
    const depth = new Int16Array(N * N).fill(-1);
    const seen = new Set<number>();
    let frontier = [e.encode(path)];
    seen.add(frontier[0]);
    depth[path[0] * N + path[path.length - 1]] = 0;
    for (let dpt = 1; frontier.length && dpt <= t.maxMoves && seen.size < t.cap; dpt++) {
      const next: number[] = [];
      for (const key of frontier) {
        const [ka, kb] = e.ends(key);
        e.expand(key, (nk, tok, to) => {
          if (seen.has(nk)) return;
          seen.add(nk);
          next.push(nk);
          // the moved token is at `to`; the other one hasn't moved
          const pi = tok ? ka * N + to : to * N + kb;
          if (depth[pi] < 0) depth[pi] = dpt;
        });
      }
      frontier = next;
    }
    work -= seen.size;
    const dA = dist(w, h, floor, path[0]);
    const dB = dist(w, h, floor, path[path.length - 1]);
    let pick = -1,
      pickScore = -Infinity;
    for (let pi = 0; pi < N * N; pi++) {
      const dd = depth[pi];
      if (dd < t.minMoves) continue;
      const a = Math.floor(pi / N),
        b = pi % N;
      // goals away from the start chain, so it's not always "swap the two tokens"
      if (path.includes(a) || path.includes(b)) continue;
      const extra = dd - dA[a] - dB[b];
      // favour extra moves; mild preference for longer solutions; break ties at random
      const score = extra * 3 + dd + rng.next();
      if (score > pickScore) {
        pickScore = score;
        pick = pi;
      }
    }
    if (pick < 0) continue;
    const ga = Math.floor(pick / N),
      gb = pick % N;
    const moves = depth[pick];
    const extra = moves - dA[ga] - dB[gb];
    const score = Math.min(extra, t.minExtra) * 100 + pickScore;
    if (score > bestScore) {
      bestScore = score;
      best = { w, h, floor, path, goals: [ga, gb], max, moves };
    }
    if (extra >= t.minExtra) break;
  }
  if (best) return best;
  // Fallback (practically unreachable): open room, swap the tokens' places.
  const floor = new Array<boolean>(N).fill(true);
  return { w, h, floor, path: [0, 1], goals: [1, 0], max, moves: -1 };
}
