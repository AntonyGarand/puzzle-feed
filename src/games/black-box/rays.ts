import { Rng } from '../../core/rng';

/** Ray results: an exit port (≥ 0), absorbed by a ball, or reflected back out of its entry. */
export const HIT = -1;
export const REFL = -2;
/** The ray reached a cell that isn't decided yet (enumeration only). */
const UNK = -3;

/** What a ray met on its way, for explanations: balls that stopped or turned it, cells it crossed. */
export interface Trail {
  acts: number[];
  pass: number[];
}

/**
 * Fire a ray from border `port` (0…n−1 top, n…2n−1 right, 2n…3n−1 bottom, 3n…4n−1 left, each side
 * read left→right or top→bottom) into an n×n box. `at(r, c)` is 1 for a ball, 0 for empty, −1 unknown.
 */
export function trace(n: number, port: number, at: (r: number, c: number) => number, trail?: Trail): number {
  const side = Math.floor(port / n),
    pos = port % n;
  let r = side === 0 ? -1 : side === 2 ? n : pos;
  let c = side === 1 ? n : side === 3 ? -1 : pos;
  let dr = side === 0 ? 1 : side === 2 ? -1 : 0;
  let dc = side === 3 ? 1 : side === 1 ? -1 : 0;
  const cell = (rr: number, cc: number) => (rr < 0 || cc < 0 || rr >= n || cc >= n ? 0 : at(rr, cc));
  for (let step = 0; step < 8 * n * n; step++) {
    const ar = r + dr,
      ac = c + dc;
    const ahead = cell(ar, ac);
    if (ahead < 0) return UNK;
    if (ahead) {
      trail?.acts.push(ar * n + ac);
      return HIT;
    }
    // Diagonals ahead: (dc, dr) is perpendicular to the direction of travel.
    const a = cell(ar + dc, ac + dr),
      b = cell(ar - dc, ac - dr);
    if (a < 0 || b < 0) return UNK;
    if (a || b) {
      if (trail) {
        if (a) trail.acts.push((ar + dc) * n + ac + dr);
        if (b) trail.acts.push((ar - dc) * n + ac - dr);
      }
      if (r < 0 || c < 0 || r >= n || c >= n) return REFL; // a ball beside the entry: turned back at the edge
      if (a && b) {
        dr = -dr;
        dc = -dc;
      } else {
        const s = a ? -1 : 1; // turn away from the ball
        [dr, dc] = [s * dc, s * dr];
      }
      continue;
    }
    r = ar;
    c = ac;
    if (r < 0 || c < 0 || r >= n || c >= n) {
      const out = r < 0 ? c : c >= n ? n + r : r >= n ? 2 * n + c : 3 * n + r;
      return out === port ? REFL : out;
    }
    trail?.pass.push(r * n + c);
  }
  return REFL; // unreachable: rays always leave or stop
}

/** Results of every port for a set of balls. */
export function allResults(n: number, balls: Iterable<number>): number[] {
  const g = new Uint8Array(n * n);
  for (const b of balls) g[b] = 1;
  const at = (r: number, c: number) => g[r * n + c];
  return Array.from({ length: 4 * n }, (_, p) => trace(n, p, at));
}

/** The ball cells that change some ray's result. */
export function invisible(n: number, balls: number[]): number[] {
  const all = allResults(n, balls).join();
  return balls.filter(
    (b) =>
      allResults(
        n,
        balls.filter((x) => x !== b),
      ).join() === all,
  );
}

/**
 * Layouts of `count` balls that agree with every shot, found by a depth-first search over the cells
 * (outer ring first) that checks each ray as soon as the cells it depends on are decided. Stops after `cap`
 * layouts or `budget` nodes; `complete` tells whether the list is every layout. The search order is
 * shuffled by `seed`, so a capped list is a spread-out sample rather than the first rows only.
 */
export function layouts(n: number, count: number, shots: { port: number; res: number }[], seed: number, cap = 2500, budget = 120_000) {
  const N = n * n;
  const st = new Int8Array(N).fill(-1);
  let placed = 0,
    nodes = 0,
    aborted = false;
  const out: number[][] = [];
  const at = (r: number, c: number) => {
    const v = st[r * n + c];
    return v < 0 && placed === count ? 0 : v;
  };
  const rng = new Rng(seed);
  // Outer ring first, so rays from every side get decided early.
  const ring = (i: number) => Math.min(Math.floor(i / n), i % n, n - 1 - Math.floor(i / n), n - 1 - (i % n));
  const order = [...Array(N).keys()].sort((a, b) => ring(a) - ring(b) || a - b);
  const pBall = count / N;
  const balls: number[] = [];
  const rec = (i: number, pending: number[]) => {
    if (++nodes > budget || out.length >= cap) {
      aborted = true;
      return;
    }
    const still: number[] = [];
    for (const j of pending) {
      const r = trace(n, shots[j].port, at);
      if (r === UNK) still.push(j);
      else if (r !== shots[j].res) return;
    }
    if (placed === count) {
      out.push(balls.toSorted((a, b) => a - b));
      return;
    }
    if (count - placed > N - i) return;
    const cell = order[i];
    for (const v of rng.chance(pBall) ? [1, 0] : [0, 1]) {
      st[cell] = v;
      if (v) {
        placed++;
        balls.push(cell);
      }
      rec(i + 1, still);
      if (v) {
        placed--;
        balls.pop();
      }
      st[cell] = -1;
      if (aborted) return;
    }
  };
  rec(
    0,
    shots.map((_, j) => j),
  );
  if (aborted) {
    // Too many to list (or too tangled to find by search): add layouts from a random walk.
    const seen = new Set(out.map((l) => l.join()));
    for (const l of wander(n, count, shots, rng, cap)) {
      const key = l.join();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(l);
      }
    }
  }
  return { list: out, complete: !aborted };
}

/**
 * Random walk over ball layouts: move one ball at a time, preferring moves that break fewer rays,
 * and collect the layouts that fit every shot.
 */
function wander(n: number, count: number, shots: { port: number; res: number }[], rng: Rng, want: number, steps = 120_000) {
  const N = n * n;
  const g = new Uint8Array(N);
  const at = (r: number, c: number) => g[r * n + c];
  const cost = () => {
    let k = 0;
    for (const s of shots) if (trace(n, s.port, at) !== s.res) k++;
    return k;
  };
  const balls = rng.shuffle([...Array(N).keys()]).slice(0, count);
  for (const b of balls) g[b] = 1;
  let cur = cost();
  const found = new Map<string, number[]>();
  let fresh = 0; // last step that found a new layout
  for (let t = 0; t < steps && found.size < want && !(found.size && t - fresh > 10_000); t++) {
    const j = rng.int(0, count - 1);
    const from = balls[j];
    const to = rng.int(0, N - 1);
    if (g[to]) continue;
    g[from] = 0;
    g[to] = 1;
    const next = cost();
    if (next <= cur || rng.chance(Math.exp((cur - next) / 0.4))) {
      balls[j] = to;
      cur = next;
      if (!cur) {
        const l = balls.toSorted((a, b) => a - b);
        const key = l.join();
        if (!found.has(key)) {
          found.set(key, l);
          fresh = t;
        }
      }
    } else {
      g[to] = 0;
      g[from] = 1;
    }
  }
  return found.values();
}
