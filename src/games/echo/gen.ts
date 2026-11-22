import type { Rng } from '../../core/rng';

/**
 * Echo rooms: a start, an exit, coloured plates and doors. A level is played in `runs` runs; every
 * earlier run is replayed in sync by an echo, which stays on its last square once its recording ends.
 * A door is open at a turn when anyone stands on a plate of its colour, or someone stands in it.
 * Doors only react to echoes when you step in (you can't stand on the plate and in the door), so an
 * echo never gets blocked on replay: later runs only add actors, which only opens more doors.
 */

/** Actions: up, right, down, left, wait. */
export const ACTS = 'urdlw';
const DR = [-1, 0, 1, 0],
  DC = [0, 1, 0, -1];

export interface Room {
  w: number;
  h: number;
  /** 1 = walkable (doors, plates, start and exit included) */
  floor: Uint8Array;
  /** colour index of the door on each cell, -1 if none */
  door: Int8Array;
  /** colour index of the plate on each cell, -1 if none */
  plate: Int8Array;
  start: number;
  exit: number;
  /** number of runs (the last one must reach the exit) */
  runs: number;
  /** turns per run */
  T: number;
  /** a working recording per run; the last one reaches the exit */
  sol: string[];
}

/** Neighbour of `i` for action `a` (wait stays put); -1 off the grid. */
export function nbr(w: number, h: number, i: number, a: number): number {
  if (a === 4) return i;
  const r = Math.floor(i / w) + DR[a],
    c = (i % w) + DC[a];
  return r < 0 || c < 0 || r >= h || c >= w ? -1 : r * w + c;
}

/** Position at turn `t`; echoes stay on their last square once their recording ends. */
export const at = (tr: readonly number[], t: number) => tr[Math.min(t, tr.length - 1)];

/** Can someone step into `to` when the echoes stand on `others` after the step? */
export function enterable(room: Room, to: number, others: readonly number[]): boolean {
  if (to < 0 || !room.floor[to]) return false;
  const c = room.door[to];
  if (c < 0) return true;
  for (const o of others) if (o === to || (o >= 0 && room.plate[o] === c)) return true;
  return false;
}

/** Is a door open at a moment when actors stand on `who`? (shown on the board) */
export function isOpen(room: Room, d: number, who: readonly number[]) {
  return who.some((o) => o === d || room.plate[o] === room.door[d]);
}

/** Squares visited while replaying `rec` with the `prior` echoes; null if a step is illegal. */
export function track(room: Room, rec: string, prior: readonly number[][]): number[] | null {
  const tr = [room.start];
  for (let t = 0; t < rec.length; t++) {
    const a = ACTS.indexOf(rec[t]);
    if (a < 0) return null;
    const nx = nbr(room.w, room.h, tr[t], a);
    if (
      a !== 4 &&
      !enterable(
        room,
        nx,
        prior.map((p) => at(p, t + 1)),
      )
    )
      return null;
    tr.push(nx);
  }
  return tr;
}

export const trimWaits = (rec: string) => rec.replace(/w+$/, '');

/**
 * Earliest way for one actor to walk from `from` (at turn `t0`) to `to` by turn `T`, with the
 * `fixed` echoes replaying (they open doors). Returns the actions, or null.
 */
export function walk(room: Room, fixed: readonly number[][], from: number, t0: number, to: number, T: number): string | null {
  if (from === to) return '';
  const N = room.w * room.h;
  const span = T - t0;
  if (span <= 0) return null;
  const par = new Int32Array((span + 1) * N).fill(-1);
  const code = new Uint8Array((span + 1) * N);
  par[from] = from;
  let q = [from];
  for (let k = 0; k < span && q.length; k++) {
    const others = fixed.map((f) => at(f, t0 + k + 1));
    const nq: number[] = [];
    // waits first, so a path stands still rather than stepping back and forth
    for (const a of [4, 0, 1, 2, 3])
      for (const i of q) {
        const j = nbr(room.w, room.h, i, a);
        if (a !== 4 && !enterable(room, j, others)) continue;
        const s = (k + 1) * N + j;
        if (par[s] !== -1) continue;
        par[s] = k * N + i;
        code[s] = a;
        if (j === to) {
          let out = '';
          for (let x = s; x >= N; x = par[x]) out = ACTS[code[x]] + out;
          return out;
        }
        nq.push(j);
      }
    q = nq;
  }
  return null;
}

export interface Found {
  /** recording of the free echo (forced prefix included); '' when there's none */
  echo: string;
  /** the player's moves to the exit */
  me: string;
}

/**
 * Breadth-first search over turns for the earliest way out, with the `fixed` echoes replaying and,
 * when `free`, one more echo whose moves are searched too. That echo's run comes before the
 * player's, so only the fixed echoes open doors for it. `forced` pins its first moves.
 */
export function search(room: Room, fixed: readonly number[][], T: number, free: boolean, forced = ''): Found | null {
  const { w, h, floor } = room;
  const cells: number[] = [];
  const id = new Int16Array(w * h).fill(-1);
  floor.forEach((f, i) => {
    if (f) {
      id[i] = cells.length;
      cells.push(i);
    }
  });
  const N = cells.length,
    layer = (free ? N : 1) * N;
  const par = new Int32Array((T + 1) * layer).fill(-1);
  const code = new Uint8Array((T + 1) * layer);
  const s0 = (free ? id[room.start] * N : 0) + id[room.start];
  par[s0] = s0;
  let q = [s0];
  for (let t = 0; t < T && q.length; t++) {
    const others = fixed.map((f) => at(f, t + 1));
    const nq: number[] = [];
    for (const s of q) {
      const rem = s - t * layer;
      const ei = Math.floor(rem / N),
        p = cells[rem % N];
      for (let ea = free ? 0 : 4; ea < 5; ea++) {
        let e = -1;
        let both = others;
        if (free) {
          if (t < forced.length && ACTS[ea] !== forced[t]) continue;
          e = nbr(w, h, cells[ei], ea);
          if (ea !== 4 && !enterable(room, e, others)) continue;
          both = [...others, e];
        }
        for (let pa = 0; pa < 5; pa++) {
          const np = nbr(w, h, p, pa);
          if (pa !== 4 && !enterable(room, np, both)) continue;
          const ns = (t + 1) * layer + (free ? id[e] * N : 0) + id[np];
          if (par[ns] !== -1) continue;
          par[ns] = s;
          code[ns] = ea * 5 + pa;
          if (np === room.exit) {
            let echo = '',
              me = '';
            for (let x = ns, k = t + 1; k > 0; x = par[x], k--) {
              echo = ACTS[Math.floor(code[x] / 5)] + echo;
              me = ACTS[code[x] % 5] + me;
            }
            return { echo: free ? echo : '', me };
          }
          nq.push(ns);
        }
      }
    }
    q = nq;
  }
  return null;
}

/**
 * Rewrites a searched echo recording the way a person would play it: walk straight to each plate the
 * player needs, wait there for the right turn, and stop recording after the last one.
 */
function tidy(room: Room, fixed: readonly number[][], eTrack: number[], meTrack: number[]): string | null {
  let pos = room.start,
    time = 0,
    rec = '';
  for (let t = 1; t < meTrack.length; t++) {
    const c = meTrack[t];
    if (room.door[c] < 0 || meTrack[t - 1] === c) continue;
    if (
      enterable(
        room,
        c,
        fixed.map((f) => at(f, t)),
      )
    )
      continue;
    const cell = at(eTrack, t);
    const p = walk(room, fixed, pos, time, cell, t);
    if (p == null) return null;
    rec += p + 'w'.repeat(t - time - p.length);
    pos = cell;
    time = t;
  }
  return rec;
}

export interface GenOpts {
  w: number;
  h: number;
  doors: number;
  runs: 2 | 3;
  /** spare turns on top of the fastest solution */
  slack: number;
  /** extra openings that add loops to the maze */
  loops: number;
  /** wanted range for the fastest solution, in turns */
  minT: number;
  maxT: number;
}

/** Random tree maze over the cells (no 2×2 open blocks), plus a few loops. */
function carve(rng: Rng, w: number, h: number, loops: number): Uint8Array {
  const f = new Uint8Array(w * h);
  const opens = (j: number) => [0, 1, 2, 3].filter((a) => f[nbr(w, h, j, a)] === 1 && nbr(w, h, j, a) >= 0).length;
  const square = (i: number) => {
    const r = Math.floor(i / w),
      c = i % w;
    for (const [r0, c0] of [
      [r - 1, c - 1],
      [r - 1, c],
      [r, c - 1],
      [r, c],
    ]) {
      if (r0 < 0 || c0 < 0 || r0 + 1 >= h || c0 + 1 >= w) continue;
      const q = [r0 * w + c0, r0 * w + c0 + 1, (r0 + 1) * w + c0, (r0 + 1) * w + c0 + 1];
      if (q.every((j) => j === i || f[j])) return true;
    }
    return false;
  };
  const s = rng.int(0, w * h - 1);
  f[s] = 1;
  const act = [s];
  while (act.length) {
    const k = rng.chance(0.6) ? act.length - 1 : rng.int(0, act.length - 1);
    const i = act[k];
    const opts = [0, 1, 2, 3].map((a) => nbr(w, h, i, a)).filter((j) => j >= 0 && !f[j] && opens(j) === 1 && !square(j));
    if (!opts.length) {
      act.splice(k, 1);
      continue;
    }
    const j = rng.pick(opts);
    f[j] = 1;
    act.push(j);
  }
  const holes = rng.shuffle([...f.keys()].filter((i) => !f[i] && opens(i) >= 2));
  for (let k = 0, n = 0; k < holes.length && n < loops; k++)
    if (opens(holes[k]) >= 2 && !square(holes[k])) {
      f[holes[k]] = 1;
      n++;
    }
  return f;
}

/** BFS distances over the floor, treating `block` cells as walls. */
function dists(w: number, h: number, floor: Uint8Array, from: number, block?: (i: number) => boolean): Int16Array {
  const d = new Int16Array(w * h).fill(-1);
  d[from] = 0;
  const q = [from];
  for (let k = 0; k < q.length; k++)
    for (let a = 0; a < 4; a++) {
      const j = nbr(w, h, q[k], a);
      if (j < 0 || !floor[j] || d[j] >= 0 || block?.(j)) continue;
      d[j] = d[q[k]] + 1;
      q.push(j);
    }
  return d;
}

/** One random room with its solution, or null if this layout doesn't work. */
function attempt(rng: Rng, o: GenOpts): Room | null {
  const { w, h } = o;
  const floor = carve(rng, w, h, o.loops);
  const deg = (i: number) => [0, 1, 2, 3].filter((a) => floor[nbr(w, h, i, a)] === 1 && nbr(w, h, i, a) >= 0).length;
  const cells = [...floor.keys()].filter((i) => floor[i]);
  const ends = cells.filter((i) => deg(i) === 1);
  const start = rng.pick(ends.length ? ends : cells);
  const d0 = dists(w, h, floor, start);
  let exit = start;
  for (const i of cells) if (d0[i] > d0[exit] || (d0[i] === d0[exit] && rng.chance(0.5))) exit = i;
  const L = d0[exit];
  if (L < 5) return null;
  // the shortest path, start → exit
  const path = [exit];
  while (path[0] !== start) {
    const i = path[0];
    path.unshift([0, 1, 2, 3].map((a) => nbr(w, h, i, a)).find((j) => j >= 0 && floor[j] && d0[j] === d0[i] - 1)!);
  }
  const corridor = (k: number) => k > 1 && k < L && deg(path[k]) === 2;
  // door positions along the path (a pair of adjacent doors needs two echoes at once)
  const ks: number[] = [];
  if (o.runs === 3) {
    const pairs = rng.shuffle([...Array(L).keys()].filter((k) => k >= Math.ceil(L * 0.5) && corridor(k) && corridor(k + 1)));
    if (!pairs.length) return null;
    ks.push(pairs[0], pairs[0] + 1);
  }
  const singles = rng.shuffle([...Array(L).keys()].filter((k) => k >= Math.ceil(L * (o.runs === 3 ? 0.25 : 0.4)) && corridor(k)));
  for (const k of singles) {
    if (ks.length >= o.doors) break;
    if (ks.every((x) => Math.abs(x - k) >= 3)) ks.push(k);
  }
  if (ks.length < o.doors) return null;
  ks.sort((a, b) => a - b);
  const door = new Int8Array(w * h).fill(-1);
  ks.forEach((k, c) => (door[path[k]] = c));
  const reach = dists(w, h, floor, start, (i) => door[i] >= 0);
  // every door on its own must cut the exit off
  if (ks.some((k) => dists(w, h, floor, start, (i) => i === path[k])[exit] >= 0)) return null;
  // plates: in the part you can reach alone, away from the path and far from their door
  const plate = new Int8Array(w * h).fill(-1);
  const onPath = new Set(path);
  const nearDoor = (i: number) => [0, 1, 2, 3].some((a) => door[nbr(w, h, i, a)] >= 0 && nbr(w, h, i, a) >= 0);
  for (let c = 0; c < o.doors; c++) {
    const dd = dists(w, h, floor, path[ks[c]]);
    const ok = (i: number, strict: boolean) => reach[i] > 0 && plate[i] < 0 && !nearDoor(i) && (!strict || !onPath.has(i)) && i !== exit;
    let cand = cells.filter((i) => ok(i, true));
    if (!cand.length) cand = cells.filter((i) => ok(i, false));
    if (!cand.length) return null;
    cand.sort((a, b) => dd[b] - dd[a]);
    plate[rng.pick(cand.slice(0, Math.max(1, Math.ceil(cand.length / 3))))] = c;
  }
  const room: Room = { w, h, floor, door, plate, start, exit, runs: o.runs, T: o.maxT, sol: [] };
  return solve(room, o.slack) ? room : null;
}

/** Finds a tidy solution, sets the turn limit, and checks fewer runs can't do it. */
function solve(room: Room, slack: number): boolean {
  const cap = room.T;
  const plates = [...room.plate.keys()].filter((i) => room.plate[i] >= 0);
  // every echo but the last free one holds a plate from the start (3 runs: the first echo)
  const firsts: { recs: string[]; fixed: number[][] }[] = room.runs === 2 ? [{ recs: [], fixed: [] }] : [];
  if (room.runs === 3)
    for (const x of plates) {
      const p = walk(room, [], room.start, 0, x, cap);
      const tr = p == null ? null : track(room, p, []);
      if (tr) firsts.push({ recs: [p!], fixed: [tr] });
    }
  let best: { recs: string[]; fixed: number[][]; f: Found } | null = null;
  for (const { recs, fixed } of firsts) {
    const f = search(room, fixed, cap, true);
    if (f && (!best || f.me.length < best.f.me.length)) best = { recs, fixed, f };
  }
  if (!best) return false;
  const { recs, fixed, f } = best;
  const tStar = f.me.length;
  room.T = tStar + slack;
  const eTrack = track(room, f.echo, fixed)!;
  const meTrack = track(room, f.me, [...fixed, eTrack])!;
  let rec = trimWaits(f.echo);
  const neat = tidy(room, fixed, eTrack, meTrack);
  const nt = neat == null ? null : track(room, neat, fixed);
  if (nt && walk(room, [...fixed, nt], room.start, 0, room.exit, room.T)?.length === tStar) rec = trimWaits(neat!);
  const tracks = [...fixed, track(room, rec, fixed)!];
  const me = walk(room, tracks, room.start, 0, room.exit, room.T);
  if (me == null) return false;
  room.sol = [...recs, rec, me];
  // one run alone can't get out, and (with 3 runs) neither can two
  if (walk(room, [], room.start, 0, room.exit, room.T) != null) return false;
  if (room.runs === 3 && search(room, [], room.T, true)) return false;
  return true;
}

/** A small hand-made room, used only if every random layout fails. */
function fallback(o: GenOpts): Room {
  // S start, P plate, D door, E exit
  const art = ['S...P', '.####', '.DE##'];
  const w = 5,
    h = 3;
  const floor = new Uint8Array(w * h),
    door = new Int8Array(w * h).fill(-1),
    plate = new Int8Array(w * h).fill(-1);
  let start = 0,
    exit = 0;
  art.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      const i = r * w + c;
      floor[i] = ch === '#' ? 0 : 1;
      if (ch === 'S') start = i;
      if (ch === 'E') exit = i;
      if (ch === 'P') plate[i] = 0;
      if (ch === 'D') door[i] = 0;
    }),
  );
  const room: Room = { w, h, floor, door, plate, start, exit, runs: 2, T: 30, sol: [] };
  solve(room, o.slack);
  return room;
}

/** A verified room for the given options (deterministic for a given rng state). */
export function generate(rng: Rng, o: GenOpts): Room {
  let backup: Room | null = null;
  for (let k = 0; k < 60; k++) {
    const r = attempt(rng, o);
    if (!r) continue;
    const t = r.sol[r.sol.length - 1].length;
    if (t >= o.minT && t <= o.maxT) return r;
    backup ??= r;
  }
  return backup ?? fallback(o);
}
