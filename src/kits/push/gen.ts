import type { Rng } from '../../core/rng';
import { type Board, caught, frozen, nbr, type Rules, type St, stateKey, step } from './engine';

export interface Level extends Board {
  /** crate start cells */
  boxes: number[];
  /** pushes allowed per crate (-1 = unlimited) */
  counts: number[];
  player: number;
  /** moves and pushes in the shortest solution found by the generator */
  moves: number;
  pushes: number;
}

export interface GenOpts {
  w: number;
  h: number;
  boxes: number;
  /** obstacle density */
  wallP: number;
  /** wanted pushes in the shortest solution (the best room found is kept otherwise) */
  minPush: number;
  /** BFS states per attempt, and in total (deterministic budgets keep resume identical) */
  nodes: number;
  work: number;
  /** counted crates: spare pushes per crate */
  slack?: number;
  /** crates and player start in the first N columns (advancing wall) */
  startCols?: number;
  /** prefer solutions where a crate crosses a board edge */
  wantWrap?: boolean;
}

function makeFloor(rng: Rng, w: number, h: number, wallP: number, wrap: boolean) {
  const nb = nbr(w, h, wrap);
  const floor = Array.from({ length: w * h }, () => !rng.chance(wallP));
  const comp = new Int32Array(w * h).fill(-1);
  let best = -1,
    bestSize = 0;
  for (let i = 0, id = 0; i < w * h; i++) {
    if (!floor[i] || comp[i] >= 0) continue;
    const q = [i];
    comp[i] = id;
    for (let k = 0; k < q.length; k++)
      for (let d = 0; d < 4; d++) {
        const y = nb(q[k], d);
        if (y >= 0 && floor[y] && comp[y] < 0) {
          comp[y] = id;
          q.push(y);
        }
      }
    if (q.length > bestSize) {
      bestSize = q.length;
      best = id;
    }
    id++;
  }
  return floor.map((f, i) => f && comp[i] === best);
}

const setKey = (b: number[]) => [...b].sort((x, y) => x - y).reduce((k, x) => k * 64 + x, 0);

interface Found {
  targets: number[];
  moves: number;
  pushes: number;
  /** pushes each crate takes on the way (crates keep their index) */
  per: number[];
  score: number;
  wraps: number;
}

/**
 * Breadth-first over every state reachable from the start (up to `cap`), then rank the crate layouts
 * by how much work they take to reach; the best becomes the targets. The shortest solution is known
 * exactly, so every level is solvable by construction. Returns the candidates and the states used.
 */
function explore(B: Board, R: Rules, start: St, cap: number, o: GenOpts): { found: Found[]; used: number } {
  const nb = nbr(B.w, B.h, R.wrap);
  const nB = start.b.length;
  const states: St[] = [start];
  const pushes = new Uint16Array(cap + 4);
  const wraps = new Uint8Array(cap + 4);
  const per = new Uint8Array((cap + 4) * nB);
  const seen = new Set<number>([stateKey(start)]);
  const first = new Map<number, number>();
  const startSet = new Set(start.b);
  for (let k = 0; k < states.length && states.length < cap; k++) {
    for (let d = 0; d < 4; d++) {
      const m = step(B, R, nb, states[k], d);
      if (!m || caught(B, R, m.st)) continue;
      if (m.box >= 0 && frozen(B, nb, m.to)) continue; // crates wedged in corners make dull targets
      const key = stateKey(m.st);
      if (seen.has(key)) continue;
      seen.add(key);
      const n = states.length;
      states.push(m.st);
      pushes[n] = pushes[k] + (m.box >= 0 ? 1 : 0);
      wraps[n] = Math.min(250, wraps[k] + (m.wrapped ? 1 : 0));
      for (let j = 0; j < nB; j++) per[n * nB + j] = Math.min(250, per[k * nB + j] + (j === m.box ? 1 : 0));
      if (m.box < 0) continue;
      const sk = setKey(m.st.b);
      if (!first.has(sk)) first.set(sk, n);
    }
  }
  const found: Found[] = [];
  for (const n of first.values()) {
    const b = states[n].b;
    if (b.some((x) => startSet.has(x))) continue; // every crate must leave its start
    const moves = states[n].t;
    let score = pushes[n] + 0.1 * moves;
    if (o.wantWrap) score += 3 * Math.min(wraps[n], 2);
    if (R.every) score += 0.25 * moves;
    const pc = Array.from(per.subarray(n * nB, n * nB + nB));
    found.push({ targets: [...b].sort((x, y) => x - y), moves, pushes: pushes[n], per: pc, score, wraps: wraps[n] });
  }
  found.sort((a, b) => b.score - a.score);
  return { found, used: states.length };
}

export function generate(rng: Rng, R: Rules, o: GenOpts): Level {
  const { w, h } = o;
  let work = o.work;
  let best: Level | null = null;
  let bestScore = -Infinity;
  const good = (f: Found) => f.pushes >= o.minPush && (!o.wantWrap || f.wraps > 0);
  for (let attempt = 0; attempt < 60 && work > 0; attempt++) {
    const floor = makeFloor(rng, w, h, o.wallP * (0.8 + rng.next() * 0.4), R.wrap);
    const B: Board = { w, h, floor, targets: [] };
    const nb = nbr(w, h, R.wrap);
    const cells = floor.map((f, i) => (f ? i : -1)).filter((i) => i >= 0);
    if (cells.length < o.boxes * 3 + 6) continue;
    // With a wall, everything starts in the first columns; crates not in column 0.
    const startOk = (i: number) => !o.startCols || i % w < o.startCols;
    const spots = rng.shuffle(cells.filter((i) => startOk(i) && !frozen(B, nb, i)));
    const boxes = spots.filter((i) => !o.startCols || i % w > 0).slice(0, o.boxes);
    const player = spots.find((i) => !boxes.includes(i)) ?? -1;
    if (boxes.length < o.boxes || player < 0) continue;
    const start: St = { p: player, b: boxes, c: boxes.map(() => -1), t: 0 };
    const { found, used } = explore(B, R, start, Math.min(o.nodes, work), o);
    work -= used;
    for (const f of found) {
      let counts = boxes.map(() => -1);
      if (R.counted) {
        counts = f.per.map((n) => n + (o.slack ?? 0));
        if (counts.some((n) => n > 12)) continue;
      }
      const score = f.score + (good(f) ? 1000 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = { w, h, floor, targets: f.targets, boxes, counts, player, moves: f.moves, pushes: f.pushes };
      }
      break;
    }
    if (best && bestScore >= 1000) break;
  }
  if (best) return best;
  // Fallback (practically unreachable): one crate in an open room, pushed right until it stops.
  const floor = new Array<boolean>(w * h).fill(true);
  const B: Board = { w, h, floor, targets: [] };
  const start: St = { p: w + 1, b: [w + 2], c: [R.counted ? 1 : -1], t: 0 };
  const m = step(B, R, nbr(w, h, R.wrap), start, 1)!;
  return { w, h, floor, targets: [m.to], boxes: start.b, counts: start.c, player: start.p, moves: 1, pushes: 1 };
}
