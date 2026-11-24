// Seats' pure rules: people, traits and wishes, stages (people leave, others arrive), the wish checks and a
// solution counter. No DOM and no ctx, so tests can call everything directly.
import type { Rng } from '../../core/rng';
import { isTag, type Tag, type Venue } from './venues';

/** Something visible about a person that their neighbours may mind. */
export type Trait = 'smell' | 'loud' | 'kid' | 'food' | 'hat';

/**
 * A wish about where to sit; `o` is the other person it names, `n` a table number.
 * - place: a seat tag, or `table`
 * - people: `next` (right beside), `left` (right beside, on their left as drawn), `apart` (not beside), `across` (facing, at a table), `behind` (right behind)
 * - neighbours: `alone` (no one beside), `quiet` (no loud neighbour), `nosmell` (no smell beside: people who
 *   smell or eat, leftovers), `nokid` (no kid beside), `adult` (a grown-up beside: every kid has it), `see`
 *   (no big hat right in front)
 */
export type Wish =
  | { t: Tag | 'alone' | 'quiet' | 'nosmell' | 'nokid' | 'adult' | 'see' }
  | { t: 'table'; n: number }
  | { t: 'next' | 'left' | 'apart' | 'across' | 'behind'; o: number };

export interface Person {
  trait: Trait | null;
  wish: Wish[];
  /** The stage they arrive at, and the one they're gone by (`stages` when they stay to the end). */
  arrive: number;
  leave: number;
}

/**
 * A puzzle: a venue, everyone who comes and goes, and `sol[p]`, the seat each person takes in the (unique)
 * solution. Stage after stage, the newcomers must be seated while everyone already there stays put. `given`
 * people are seated from the moment they arrive.
 */
export interface Puzzle {
  v: Venue;
  people: Person[];
  sol: number[];
  given: number[];
  stages: number;
}

/** Names: a letter each, in order of arrival. */
export const letter = (p: number) => String.fromCharCode(65 + p);

const ODOR: ReadonlySet<Trait | null> = new Set<Trait | null>(['smell', 'food']);

/** Who is there at stage `k`, which seats hold leftovers, and who must be seated now. */
export interface Stage {
  k: number;
  here: boolean[];
  /** Leftovers: no one sits there, and it smells. */
  dirty: boolean[];
  /** People to seat at this stage (the others present stay put). */
  fresh: number[];
  /** For each person, the people whose wishes name them. */
  refs: number[][];
}

export function stageOf(z: Puzzle, k: number): Stage {
  const here = z.people.map((p) => p.arrive <= k && k < p.leave);
  const dirty = z.v.seats.map(() => false);
  z.people.forEach((p, i) => {
    if (p.trait === 'food' && p.leave <= k) dirty[z.sol[i]] = true;
  });
  const refs: number[][] = z.people.map(() => []);
  z.people.forEach((p, q) => {
    if (!here[q]) return;
    for (const w of p.wish) if ('o' in w && here[w.o]) refs[w.o].push(q);
  });
  const fresh = z.people.flatMap((p, i) => (p.arrive === k ? [i] : []));
  return { k, here, dirty, fresh, refs };
}

/** Seats at the start of stage `k`: everyone who arrived before (and stays) in their seat, givens too. */
export function startOf(z: Puzzle, st: Stage): number[] {
  return z.people.map((p, i) => (st.here[i] && (p.arrive < st.k || z.given.includes(i)) ? z.sol[i] : -1));
}

/** Who sits on each seat (-1 for no one). */
export function seating(z: Puzzle, pos: readonly number[]): number[] {
  const at = z.v.seats.map(() => -1);
  pos.forEach((s, p) => s >= 0 && (at[s] = p));
  return at;
}

/**
 * A wish's state for person `p` with seats `pos` and `at` (seat → person): `bad` when it's broken or can no
 * longer come true, `ok` when it holds for good, `open` otherwise. A wish naming someone who left holds.
 * `final`: everyone is seated, so a wish still waiting for a neighbour is broken.
 */
export function wishState(
  z: Puzzle,
  st: Stage,
  pos: readonly number[],
  at: readonly number[],
  p: number,
  w: Wish,
  final = false,
): 'ok' | 'bad' | 'open' {
  const S = z.v.seats;
  const s = pos[p];
  const free = (u: number) => u >= 0 && at[u] < 0 && !st.dirty[u];
  const trait = (u: number) => (u >= 0 && at[u] >= 0 ? z.people[at[u]].trait : null);
  const settle = final ? 'ok' : 'open';
  if ('o' in w) {
    if (!st.here[w.o]) return 'ok';
    const t = pos[w.o];
    switch (w.t) {
      case 'apart':
        return s >= 0 && t >= 0 && S[s].side.includes(t) ? 'bad' : settle;
      case 'left': {
        // The seat to the right of p's (as drawn) is the other person's.
        const right = (u: number) => S[u].side.find((x) => S[x].col > S[u].col) ?? -1;
        const left = (u: number) => S[u].side.find((x) => S[x].col < S[u].col) ?? -1;
        if (s >= 0 && t >= 0) return right(s) === t ? 'ok' : 'bad';
        if (s >= 0) return free(right(s)) ? 'open' : 'bad';
        if (t >= 0) return free(left(t)) ? 'open' : 'bad';
        return 'open';
      }
      case 'next': {
        if (s >= 0 && t >= 0) return S[s].side.includes(t) ? 'ok' : 'bad';
        const u = s >= 0 ? s : t;
        return u < 0 ? 'open' : S[u].side.some(free) ? 'open' : 'bad';
      }
      case 'across': {
        if (s >= 0 && S[s].across < 0) return 'bad';
        if (s >= 0 && t >= 0) return S[s].across === t ? 'ok' : 'bad';
        const u = s >= 0 ? s : t;
        return u < 0 ? 'open' : free(S[u].across) ? 'open' : 'bad';
      }
      case 'behind': {
        if (s >= 0 && S[s].front < 0) return 'bad';
        if (s >= 0 && t >= 0) return S[s].front === t ? 'ok' : 'bad';
        if (s >= 0) return free(S[s].front) ? 'open' : 'bad';
        if (t >= 0) return free(S[t].back) ? 'open' : 'bad';
        return 'open';
      }
    }
  }
  if (s < 0) return 'open';
  const seat = S[s];
  switch (w.t) {
    case 'table':
      return seat.table === w.n ? 'ok' : 'bad';
    case 'alone':
      return seat.side.some((u) => at[u] >= 0) ? 'bad' : settle;
    case 'quiet':
      return seat.near.some((u) => trait(u) === 'loud') ? 'bad' : settle;
    case 'nokid':
      return seat.near.some((u) => trait(u) === 'kid') ? 'bad' : settle;
    case 'nosmell':
      return seat.near.some((u) => st.dirty[u] || ODOR.has(trait(u))) ? 'bad' : settle;
    case 'see':
      return trait(seat.front) === 'hat' ? 'bad' : settle;
    case 'adult':
      if (seat.near.some((u) => at[u] >= 0 && z.people[at[u]].trait !== 'kid')) return 'ok';
      return !final && seat.near.some(free) ? 'open' : 'bad';
    default:
      return seat.tags.includes(w.t) ? 'ok' : 'bad';
  }
}

/** The wishes of `p` broken right now. */
export function broken(z: Puzzle, st: Stage, pos: readonly number[], p: number): Wish[] {
  const at = seating(z, pos);
  const final = st.here.every((h, q) => !h || pos[q] >= 0);
  return z.people[p].wish.filter((w) => wishState(z, st, pos, at, p, w, final) === 'bad');
}

/** Everyone present seated, off the leftovers, with every wish holding. */
export function solved(z: Puzzle, st: Stage, pos: readonly number[]): boolean {
  if (st.here.some((h, p) => h && pos[p] < 0)) return false;
  if (pos.some((s, p) => st.here[p] && st.dirty[s])) return false;
  const at = seating(z, pos);
  return z.people.every((x, p) => !st.here[p] || x.wish.every((w) => wishState(z, st, pos, at, p, w, true) !== 'bad'));
}

/** People whose wishes may change when someone sits on seat `s`, besides that person and those naming them. */
function around(z: Puzzle, at: readonly number[], s: number): number[] {
  const seat = z.v.seats[s];
  const out: number[] = [];
  for (const u of [...seat.near, seat.front, seat.back]) if (u >= 0 && at[u] >= 0) out.push(at[u]);
  return out;
}

/** No wish of `q` is broken. */
const happy = (z: Puzzle, st: Stage, pos: readonly number[], at: readonly number[], q: number) =>
  !st.here[q] || z.people[q].wish.every((w) => wishState(z, st, pos, at, q, w) !== 'bad');

/** Nobody around seat `s`, nor anyone naming them, has a broken wish. */
function aroundOk(z: Puzzle, st: Stage, pos: readonly number[], at: readonly number[], s: number): boolean {
  const seat = z.v.seats[s];
  const check = (u: number) =>
    u < 0 || at[u] < 0 || (happy(z, st, pos, at, at[u]) && st.refs[at[u]].every((r) => happy(z, st, pos, at, r)));
  return seat.near.every(check) && check(seat.front) && check(seat.back);
}

/** Whether `p` could ever sit on seat `s`, by their place wishes alone. */
function placeable(z: Puzzle, p: number, s: number): boolean {
  const seat = z.v.seats[s];
  return z.people[p].wish.every((w) => {
    if (w.t === 'table') return seat.table === w.n;
    if (w.t === 'behind') return seat.front >= 0;
    if (w.t === 'across') return seat.across >= 0;
    return !isTag(w.t) || seat.tags.includes(w.t);
  });
}

/** Whether `p` may sit on free seat `s` now: no wish of anyone it touches breaks. */
function fits(z: Puzzle, st: Stage, pos: number[], at: number[], p: number, s: number): boolean {
  if (at[s] >= 0 || st.dirty[s]) return false;
  pos[p] = s;
  at[s] = p;
  const ok = happy(z, st, pos, at, p) && st.refs[p].every((q) => happy(z, st, pos, at, q)) && aroundOk(z, st, pos, at, s);
  pos[p] = -1;
  at[s] = -1;
  return ok;
}

export interface Count {
  /** Solutions found (stops at the limit). */
  count: number;
  sols: number[][];
  /** The node budget ran out before the search finished. */
  out: boolean;
}

/**
 * Counts the ways to finish stage `st` from `start`, up to `limit`, within `budget` search nodes. With `rng`,
 * seats are tried in random order, those with more people around first (to find a random, sociable seating).
 */
export function count(z: Puzzle, st: Stage, start: readonly number[], limit = 2, budget = 40_000, rng?: Rng): Count {
  const n = z.v.seats.length;
  const pos = start.slice();
  const at = seating(z, pos);
  const res: Count = { count: 0, sols: [], out: false };
  const todo = st.fresh.filter((p) => pos[p] < 0);
  /** Seats each person's place wishes allow, worked out once. */
  const allowed = new Map(todo.map((p) => [p, [...Array(n).keys()].filter((s) => !st.dirty[s] && placeable(z, p, s))]));
  let nodes = 0;
  const rec = (): void => {
    if (++nodes > budget) {
      res.out = true;
      return;
    }
    // The person still standing with the fewest seats left.
    let best = -1;
    let bestSeats: number[] = [];
    for (const p of todo) {
      if (pos[p] >= 0) continue;
      const seats: number[] = [];
      for (const s of allowed.get(p)!) if (at[s] < 0 && fits(z, st, pos, at, p, s)) seats.push(s);
      if (!seats.length) return;
      if (best < 0 || seats.length < bestSeats.length) {
        best = p;
        bestSeats = seats;
        if (seats.length === 1) break;
      }
    }
    if (best < 0) {
      if (solved(z, st, pos)) {
        res.count++;
        res.sols.push(pos.slice());
      }
      return;
    }
    if (rng) {
      const key = new Map(bestSeats.map((s) => [s, rng.next() - 0.4 * around(z, at, s).length]));
      bestSeats.sort((a, b) => key.get(a)! - key.get(b)!);
    }
    for (const s of bestSeats) {
      pos[best] = s;
      at[s] = best;
      rec();
      pos[best] = -1;
      at[s] = -1;
      if (res.count >= limit || res.out) return;
    }
  };
  rec();
  return res;
}

/** The free seats `p` could take now, keeping a seat open for everyone else still standing. */
export function seatsFor(z: Puzzle, st: Stage, start: readonly number[], p: number): number[] {
  const n = z.v.seats.length;
  const pos = start.slice();
  const at = seating(z, pos);
  const out: number[] = [];
  for (let s = 0; s < n; s++) {
    if (!fits(z, st, pos, at, p, s)) continue;
    pos[p] = s;
    at[s] = p;
    const ok = st.fresh.every((q) => pos[q] >= 0 || [...Array(n).keys()].some((u) => fits(z, st, pos, at, q, u)));
    pos[p] = -1;
    at[s] = -1;
    if (ok) out.push(s);
  }
  return out;
}

/** The saved stage and seats if they make sense for this puzzle. */
export function restore(z: Puzzle, saved: unknown): { k: number; pos: number[] } | null {
  const sv = saved as { k?: unknown; pos?: unknown } | null | undefined;
  const k = sv?.k ?? 0;
  const pos = sv?.pos;
  if (typeof k !== 'number' || !Number.isInteger(k) || k < 0 || k >= z.stages) return null;
  if (!Array.isArray(pos) || pos.length !== z.people.length) return null;
  const st = stageOf(z, k);
  const start = startOf(z, st);
  const seen = new Set<number>();
  for (let p = 0; p < pos.length; p++) {
    const s: unknown = pos[p];
    if (typeof s !== 'number' || !Number.isInteger(s) || s < -1 || s >= z.v.seats.length) return null;
    if (start[p] >= 0 ? s !== start[p] : s >= 0 && (!st.here[p] || st.dirty[s])) return null;
    if (s >= 0) {
      if (seen.has(s)) return null;
      seen.add(s);
    }
  }
  return { k, pos: pos as number[] };
}
