import type { Rng } from '../../core/rng';

// Passage bits: N=1 E=2 S=4 W=8
const DIRS = [
  { bit: 1, dr: -1, dc: 0, opp: 4 },
  { bit: 2, dr: 0, dc: 1, opp: 8 },
  { bit: 4, dr: 1, dc: 0, opp: 1 },
  { bit: 8, dr: 0, dc: -1, opp: 2 },
] as const;

const neighbours = (n: number, i: number) => {
  const r = Math.floor(i / n);
  const c = i % n;
  const out: { j: number; bit: number; opp: number }[] = [];
  for (const d of DIRS) {
    const rr = r + d.dr;
    const cc = c + d.dc;
    if (rr >= 0 && rr < n && cc >= 0 && cc < n) out.push({ j: rr * n + cc, bit: d.bit, opp: d.opp });
  }
  return out;
};
const exits = (open: number[], i: number) => (open[i] & 1) + ((open[i] >> 1) & 1) + ((open[i] >> 2) & 1) + ((open[i] >> 3) & 1);

/**
 * Growing-tree carving. Each step extends the newest active cell with probability `newest`, otherwise a
 * random active cell. newest=1 is a recursive backtracker (long corridors, few junctions); lower values
 * behave like Prim's algorithm (many short side branches, so many more decisions).
 */
function carve(n: number, rng: Rng, newest: number): number[] {
  const open = new Array<number>(n * n).fill(0);
  const seen = new Array<boolean>(n * n).fill(false);
  const active = [0];
  seen[0] = true;
  while (active.length) {
    const k = rng.chance(newest) ? active.length - 1 : rng.int(0, active.length - 1);
    const i = active[k];
    const opts = neighbours(n, i).filter((x) => !seen[x.j]);
    if (!opts.length) {
      active.splice(k, 1);
      continue;
    }
    const x = rng.pick(opts);
    open[i] |= x.bit;
    open[x.j] |= x.opp;
    seen[x.j] = true;
    active.push(x.j);
  }
  return open;
}

/** Steps between two cells through the current passages (Infinity if unconnected). */
function distance(open: number[], n: number, from: number, to: number): number {
  const dist = new Array<number>(n * n).fill(-1);
  dist[from] = 0;
  const q = [from];
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    if (i === to) return dist[i];
    for (const x of neighbours(n, i)) {
      if (open[i] & x.bit && dist[x.j] < 0) {
        dist[x.j] = dist[i] + 1;
        q.push(x.j);
      }
    }
  }
  return Infinity;
}

/**
 * Knock through a fraction of dead ends, creating loops (several routes to compare). A wall is only removed
 * when the cells on either side are far apart, so every loop is a real detour: short loops just make two
 * parallel corridors to the same place (a lone wall stub floating in the middle of an open strip).
 */
function braid(open: number[], n: number, rng: Rng, fraction: number) {
  const minLoop = Math.max(8, n);
  const deadEnds = rng.shuffle(open.map((_, i) => i).filter((i) => i !== 0 && i !== n * n - 1 && exits(open, i) === 1));
  for (const i of deadEnds.slice(0, Math.round(deadEnds.length * fraction))) {
    if (exits(open, i) !== 1) continue;
    const candidates = neighbours(n, i)
      .filter((x) => !(open[i] & x.bit))
      .map((x) => ({ ...x, dist: distance(open, n, i, x.j) }))
      .filter((x) => x.dist >= minLoop);
    if (!candidates.length) continue;
    // Prefer joining another dead end (it removes two dead ends at once), then the longest loop.
    const pick = candidates.sort((a, b) => Number(exits(open, b.j) === 1) - Number(exits(open, a.j) === 1) || b.dist - a.dist)[0];
    open[i] |= pick.bit;
    open[pick.j] |= pick.opp;
  }
}

/** Shortest path from cell 0 to the opposite corner. */
function solve(open: number[], n: number): number[] {
  const goal = n * n - 1;
  const prev = new Array<number>(n * n).fill(-1);
  prev[0] = 0;
  const q = [0];
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    if (i === goal) break;
    for (const x of neighbours(n, i)) {
      if (open[i] & x.bit && prev[x.j] < 0) {
        prev[x.j] = i;
        q.push(x.j);
      }
    }
  }
  const path = [goal];
  while (path[path.length - 1] !== 0) path.push(prev[path[path.length - 1]]);
  return path.reverse();
}

/**
 * How interesting the route is: every cell on the solution path where you could go another way counts as
 * a decision. Mazes without a decision in the first few steps feel like a corridor, so they score badly.
 */
function score(open: number[], n: number): number {
  const path = solve(open, n);
  let decisions = 0;
  let firstDecision = -1;
  path.forEach((i, k) => {
    const choices = exits(open, i) - (k === 0 ? 0 : 1);
    if (k < path.length - 1 && choices >= 2) {
      decisions++;
      if (firstDecision < 0) firstDecision = k;
    }
  });
  const earlyPenalty = firstDecision < 0 || firstDecision > 3 ? n : 0;
  return decisions * 2 + path.length * 0.25 - earlyPenalty;
}

export interface MazeTuning {
  size: number;
  /** Growing-tree "newest" probability: lower = more branching. */
  newest: number;
  /** Fraction of dead ends opened into loops. */
  braid: number;
  /** Candidates generated; the most interesting one wins. */
  tries: number;
}

/** Generate a maze (passage bitmask per cell), start top-left, goal bottom-right. */
export function genMaze(rng: Rng, t: MazeTuning): number[] {
  let best: number[] = [];
  let bestScore = -Infinity;
  for (let k = 0; k < t.tries; k++) {
    const open = carve(t.size, rng, t.newest);
    if (t.braid > 0) braid(open, t.size, rng, t.braid);
    const s = score(open, t.size);
    if (s > bestScore) {
      bestScore = s;
      best = open;
    }
  }
  return best;
}

/** For tests: decision points along the solution and the solution length. */
export function mazeStats(open: number[], n: number) {
  const path = solve(open, n);
  const decisions = path.filter((i, k) => k < path.length - 1 && exits(open, i) - (k === 0 ? 0 : 1) >= 2).length;
  const deadEnds = open.filter((_, i) => exits(open, i) === 1).length;
  return { pathLength: path.length, decisions, deadEnds };
}
