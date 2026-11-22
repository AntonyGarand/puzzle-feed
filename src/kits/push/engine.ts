/**
 * Shared rules for the gimmick crate-pushing games (ice, counted crates, wrap-around, advancing wall).
 * One step function drives the game, the generator and the guide's solver, so they always agree.
 */

/** Which gimmicks are on. */
export interface Rules {
  /** Board edges connect (torus) for the player and crates. */
  wrap: boolean;
  /** Pushed crates slide until they hit a wall or another crate. */
  ice: boolean;
  /** Each crate has a number of pushes left; at 0 it can't move. */
  counted: boolean;
  /** A wall crushes one more column (from the left) every `every` moves; 0 = no wall. */
  every: number;
  /** Extra columns of run-up before the wall reaches column 0. */
  lead: number;
}

export interface Board {
  w: number;
  h: number;
  /** true = floor */
  floor: boolean[];
  targets: number[];
}

/** Game state. Crates keep their identity (index) so counts follow them. */
export interface St {
  /** player cell */
  p: number;
  /** crate cells */
  b: number[];
  /** pushes left per crate (-1 = unlimited) */
  c: number[];
  /** moves made (drives the wall) */
  t: number;
}

export interface Moved {
  st: St;
  /** index of the pushed crate, or -1 for a plain step */
  box: number;
  /** crate cell before / after the push */
  from: number;
  to: number;
  /** squares the crate travelled */
  dist: number;
  /** the crate crossed a board edge */
  wrapped: boolean;
}

/** Neighbour of cell i in direction d (0 up, 1 right, 2 down, 3 left); -1 off the board unless it wraps. */
export const nbr = (w: number, h: number, wrap: boolean) => (i: number, d: number) => {
  const r = Math.floor(i / w),
    c = i % w;
  if (d === 0) return r > 0 ? i - w : wrap ? i + w * (h - 1) : -1;
  if (d === 2) return r < h - 1 ? i + w : wrap ? c : -1;
  if (d === 1) return c < w - 1 ? i + 1 : wrap ? i - c : -1;
  return c > 0 ? i - 1 : wrap ? i + w - 1 : -1;
};

/** Leaving cell i in direction d crosses a board edge. */
const crosses = (w: number, h: number, i: number, d: number) => {
  const r = Math.floor(i / w),
    c = i % w;
  return d === 0 ? r === 0 : d === 2 ? r === h - 1 : d === 1 ? c === w - 1 : c === 0;
};

/** First column the wall hasn't reached yet at time t. */
export const front = (R: Rules, t: number) => (R.every ? Math.max(0, Math.floor(t / R.every) - R.lead) : 0);

/** The wall has reached the player or a crate. */
export const caught = (B: Board, R: Rules, s: St) => {
  if (!R.every) return false;
  const lim = front(R, s.t);
  return s.p % B.w < lim || s.b.some((x) => x % B.w < lim);
};

export const isGoal = (tset: Set<number>, s: St) => s.b.every((x) => tset.has(x));

/** One step of the player in direction d, pushing a crate if there is one; null when blocked. */
export function step(B: Board, R: Rules, nb: (i: number, d: number) => number, s: St, d: number): Moved | null {
  const lim = front(R, s.t);
  const open = (i: number) => i >= 0 && B.floor[i] && i % B.w >= lim;
  const nx = nb(s.p, d);
  if (!open(nx)) return null;
  const bi = s.b.indexOf(nx);
  if (bi < 0) return { st: { p: nx, b: s.b, c: s.c, t: s.t + 1 }, box: -1, from: -1, to: -1, dist: 0, wrapped: false };
  if (s.c[bi] === 0) return null;
  let cur = nx,
    dist = 0,
    wrapped = false;
  for (let guard = 0; guard < B.w * B.h; guard++) {
    const y = nb(cur, d);
    // y === nx: a crate sliding all the way around a wrapped row meets the player
    if (!open(y) || y === nx || s.b.includes(y)) break;
    if (crosses(B.w, B.h, cur, d)) wrapped = true;
    cur = y;
    dist++;
    if (!R.ice) break;
  }
  if (!dist) return null;
  const b = s.b.slice();
  b[bi] = cur;
  let c = s.c;
  if (c[bi] > 0) {
    c = c.slice();
    c[bi]--;
  }
  return { st: { p: nx, b, c, t: s.t + 1 }, box: bi, from: nx, to: cur, dist, wrapped };
}

/**
 * Canonical number for a state: crates sorted (with their counts), the player, no time (for a given
 * layout, reaching it sooner is never worse: the wall only gets closer). Cells < 64, counts < 15.
 */
export function stateKey(s: St) {
  const n = s.b.length;
  // insertion sort of the crate codes into a scratch array (hot path of every search)
  for (let k = 0; k < n; k++) {
    const x = s.b[k] * 16 + (s.c[k] < 0 ? 15 : s.c[k]);
    let j = k;
    while (j > 0 && scratch[j - 1] > x) {
      scratch[j] = scratch[j - 1];
      j--;
    }
    scratch[j] = x;
  }
  let key = s.p;
  for (let k = 0; k < n; k++) key = key * 1024 + scratch[k];
  return key;
}
const scratch = [0, 0, 0, 0, 0, 0];

/** Fewest-moves solution (list of directions) from s, or null if none within `cap` states. */
/**
 * Fewest-moves solution from `s`, or null. `info.capped` tells a search that gave up (too many
 * states) from a proof that no solution exists.
 */
export function solve(B: Board, R: Rules, s: St, cap = 60000, info?: { capped: boolean }): number[] | null {
  if (info) info.capped = false;
  const nb = nbr(B.w, B.h, R.wrap);
  const tset = new Set(B.targets);
  if (isGoal(tset, s)) return [];
  const states: St[] = [s];
  const parent: number[] = [-1];
  const dirs: number[] = [-1];
  const seen = new Set<number>([stateKey(s)]);
  for (let k = 0; k < states.length; k++) {
    for (let d = 0; d < 4; d++) {
      const m = step(B, R, nb, states[k], d);
      if (!m || caught(B, R, m.st)) continue;
      if (m.box >= 0 && !tset.has(m.to) && (m.st.c[m.box] === 0 || frozen(B, nb, m.to))) continue;
      const key = stateKey(m.st);
      if (seen.has(key)) continue;
      seen.add(key);
      states.push(m.st);
      parent.push(k);
      dirs.push(d);
      if (isGoal(tset, m.st)) {
        const out: number[] = [];
        for (let x = states.length - 1; x > 0; x = parent[x]) out.unshift(dirs[x]);
        return out;
      }
      if (states.length > cap) {
        if (info) info.capped = true;
        return null;
      }
    }
  }
  return null;
}

/** A crate on cell i can never move again: blocked by walls on both axes (a corner). */
export function frozen(B: Board, nb: (i: number, d: number) => number, i: number) {
  const wall = (j: number) => j < 0 || !B.floor[j];
  return (wall(nb(i, 0)) || wall(nb(i, 2))) && (wall(nb(i, 1)) || wall(nb(i, 3)));
}
