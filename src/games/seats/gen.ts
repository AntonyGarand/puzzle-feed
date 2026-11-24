// Seats' generator: a venue, people who come and go over a few stages, and just enough wishes for each stage
// to have one seating.
import type { Rng } from '../../core/rng';
import { count, type Person, type Puzzle, seating, type Stage, stageOf, startOf, type Trait, type Wish, wishState } from './rules';
import { type Kind, KINDS, venueFor } from './venues';

/** Per level: the share of seats taken at the start, then [leave, arrive] for each later stage, and traits. */
interface Plan {
  share: number;
  later: [leave: number, arrive: number][];
  traits: number;
  max: number;
}
const PLANS: Plan[] = [
  { share: 0.5, later: [], traits: 0, max: 3 },
  { share: 0.55, later: [], traits: 0.4, max: 3 },
  { share: 0.45, later: [[2, 3]], traits: 0.5, max: 3 },
  { share: 0.45, later: [[3, 4]], traits: 0.5, max: 3 },
  {
    share: 0.4,
    later: [
      [3, 4],
      [3, 4],
    ],
    traits: 0.5,
    max: 3,
  },
];

const TRAITS: Record<Kind, Trait[]> = {
  bus: ['smell', 'loud', 'kid', 'food'],
  cinema: ['loud', 'kid', 'food', 'hat'],
  diner: ['smell', 'loud', 'kid', 'food'],
};

/** How much the generator likes a wish type: neighbours and relations make the better puzzles. */
const TASTE: Record<Wish['t'], number> = {
  next: 3,
  left: 3,
  behind: 3,
  across: 3,
  quiet: 14,
  nosmell: 14,
  nokid: 14,
  see: 14,
  apart: 2,
  alone: 3,
  table: 2,
  window: 2,
  aisle: 2,
  front: 2,
  back: 2,
  center: 2,
  kitchen: 2,
  adult: 0,
};

const same = (a: Wish, b: Wish) => a.t === b.t && ('o' in a ? 'o' in b && a.o === b.o : 'n' in a ? 'n' in b && a.n === b.n : true);
/** Kids always want a grown-up beside them: that wish is part of being a kid, not a clue. */
const isClue = (w: Wish) => w.t !== 'adult';

/** Wishes about neighbours' traits: planted on purpose and kept, so every venue's smells, noise and kids matter. */
const FLAVOR: ReadonlySet<Wish['t']> = new Set<Wish['t']>(['quiet', 'nosmell', 'nokid', 'see']);

/** Whether wish `w` (true for `p` in the seating `pos`) would break on some other seat free at this stage. */
function rulesOut(z: Puzzle, st: Stage, pos: number[], p: number, w: Wish): boolean {
  const start = startOf(z, st);
  const taken = new Set(start.filter((s) => s >= 0));
  return z.v.seats.some((_, u) => {
    if (u === pos[p] || taken.has(u) || st.dirty[u]) return false;
    const moved = pos.map((s, q) => (q === p ? u : s === u ? -1 : s));
    return wishState(z, st, moved, seating(z, moved), p, w, true) === 'bad';
  });
}

/** Every wish true for newcomer `p` in the full seating `pos` that could matter at this stage. */
function truths(rng: Rng, z: Puzzle, st: Stage, pos: number[], at: number[], p: number): Wish[] {
  const S = z.v.seats;
  const s = pos[p];
  const seat = S[s];
  const out: Wish[] = seat.tags.map((t) => ({ t }));
  if (seat.table) out.push({ t: 'table', n: seat.table });
  const here = z.people.flatMap((x, q) => (st.here[q] ? [x] : []));
  const has = (t: Trait) => here.some((x) => x.trait === t);
  const cand: Wish[] = [{ t: 'alone' }];
  if (has('loud')) cand.push({ t: 'quiet' });
  if (has('kid')) cand.push({ t: 'nokid' });
  if (has('smell') || has('food') || st.dirty.some(Boolean)) cand.push({ t: 'nosmell' });
  if (has('hat') && seat.front >= 0) cand.push({ t: 'see' });
  for (const u of seat.side) if (at[u] >= 0) cand.push({ t: 'next', o: at[u] }, { t: 'left', o: at[u] });
  if (seat.across >= 0 && at[seat.across] >= 0) cand.push({ t: 'across', o: at[seat.across] });
  if (seat.front >= 0 && at[seat.front] >= 0) cand.push({ t: 'behind', o: at[seat.front] });
  const others = z.people.flatMap((_, q) => (st.here[q] && q !== p ? [q] : []));
  for (const q of rng.shuffle(others).slice(0, 4)) cand.push({ t: 'apart', o: q });
  for (const w of cand) if (wishState(z, st, pos, at, p, w, true) === 'ok') out.push(w);
  return out.filter((w) => !('o' in w) || w.o !== p);
}

/** Seat the newcomers of stage `st` at random (keeping everyone's wishes), and give them traits. */
function arrive(rng: Rng, z: Puzzle, st: Stage, plan: Plan): boolean {
  const start = startOf(z, st);
  const r = count(z, st, start, 1, 4000, rng);
  if (!r.count) return false;
  const pos = r.sols[0];
  for (const p of st.fresh) z.sol[p] = pos[p];
  const at = seating(z, pos);
  const pool = TRAITS[z.v.kind];
  for (const p of rng.shuffle(st.fresh.slice())) {
    if (!rng.chance(plan.traits)) continue;
    const person = z.people[p];
    person.trait = rng.pick(pool);
    if (person.trait === 'kid') person.wish.push({ t: 'adult' });
    const fine = z.people.every((x, q) => !st.here[q] || x.wish.every((w) => wishState(z, st, pos, at, q, w, true) !== 'bad'));
    if (!fine) {
      person.trait = null;
      person.wish = person.wish.filter(isClue);
    }
  }
  return true;
}

/** Give the newcomers of stage `st` wishes until their seating is the only one. */
function clue(rng: Rng, z: Puzzle, st: Stage, plan: Plan, lastTry: boolean): boolean {
  const pos = z.people.map((_, p) => (st.here[p] ? z.sol[p] : -1));
  const at = seating(z, pos);
  const pool = st.fresh.flatMap((p) => truths(rng, z, st, pos, at, p).map((w) => [p, w] as [number, Wish]));
  const clues = (p: number) => z.people[p].wish.filter(isClue).length;
  /** Wishes change who names whom, so the stage is rebuilt for every count. */
  const solve = (budget = 8000) => count(z, stageOf(z, st.k), startOf(z, st), 2, budget);
  let seated = 0;
  // Plant a smell, noise, kid or hat wish that rules out at least one other seat.
  for (const p of st.fresh) {
    if (!rng.chance(plan.traits)) continue;
    const own = pool.filter(([q, w]) => q === p && FLAVOR.has(w.t) && rulesOut(z, st, pos, p, w));
    if (own.length) z.people[p].wish.push(rng.pick(own)[1]);
  }
  // While adding wishes, a search that runs long just means more wishes are needed.
  let res = solve(2500);
  for (let k = 0; k < 6 * st.fresh.length && (res.count !== 1 || res.out); k++) {
    const alt = res.sols.find((x) => x.some((s, p) => s !== z.sol[p]));
    const altAt = alt && seating(z, alt);
    const fresh = pool.filter(([p, w]) => clues(p) < plan.max && !z.people[p].wish.some((v) => same(v, w)));
    const cut = alt && altAt ? fresh.filter(([p, w]) => wishState(z, st, alt, altAt, p, w, true) === 'bad') : fresh;
    if (!cut.length) {
      // No wish left tells the seatings apart: seat (once a stage) someone who sits elsewhere in the other one.
      const p = alt ? st.fresh.find((q) => alt[q] !== z.sol[q] && !z.given.includes(q)) : undefined;
      if (p == null || (seated++ && !lastTry)) return false;
      z.given.push(p);
    } else {
      const weight = ([p, w]: [number, Wish]) => TASTE[w.t] * (plan.max - clues(p));
      const total = cut.reduce((a, c) => a + weight(c), 0);
      let x = rng.next() * total;
      const [p, w] = cut.find((c) => (x -= weight(c)) < 0) ?? cut[cut.length - 1];
      z.people[p].wish.push(w);
    }
    res = solve(2500);
  }
  if (res.out) res = solve();
  if (res.count !== 1 || res.out) {
    if (!lastTry) return false;
    // Out of luck (never seen): everyone new this stage is seated from the start.
    for (const p of st.fresh) if (!z.given.includes(p)) z.given.push(p);
    return true;
  }
  // Drop the wishes this stage doesn't need.
  for (const p of rng.shuffle(st.fresh.slice()))
    for (const w of rng.shuffle(z.people[p].wish.filter((v) => isClue(v) && !FLAVOR.has(v.t)))) {
      const keep = z.people[p].wish;
      z.people[p].wish = keep.filter((v) => v !== w);
      const r = solve();
      if (r.count !== 1 || r.out) z.people[p].wish = keep;
    }
  return true;
}

/** One try at a whole puzzle; null when a stage can't be built. */
function attempt(rng: Rng, kind: Kind, d: number, plan: Plan, lastTry: boolean): Puzzle | null {
  const v = venueFor(kind, d);
  const z: Puzzle = { v, people: [], sol: [], given: [], stages: 1 + plan.later.length };
  const add = (k: number, m: number) => {
    for (let i = 0; i < m; i++) {
      z.people.push({ trait: null, wish: [], arrive: k, leave: z.stages } satisfies Person);
      z.sol.push(-1);
    }
  };
  add(0, Math.round(v.seats.length * plan.share));
  for (let k = 0; k < z.stages; k++) {
    if (k > 0) {
      const [out, inn] = plan.later[k - 1];
      const here = z.people.flatMap((x, p) => (x.leave > k ? [p] : []));
      for (const p of rng.shuffle(here).slice(0, out)) z.people[p].leave = k;
      const st0 = stageOf(z, k);
      const free = v.seats.filter((_, s) => !st0.dirty[s] && !z.sol.some((at, p) => st0.here[p] && at === s)).length;
      add(k, Math.max(1, Math.min(inn, free - 2)));
    }
    const st = stageOf(z, k);
    if (!arrive(rng, z, st, plan)) return null;
    if (!clue(rng, z, st, plan, lastTry)) return null;
  }
  return z;
}

/** A new puzzle for level `d`: a random venue, with a unique seating at every stage. */
export function generate(rng: Rng, d: number): Puzzle {
  const kind = rng.pick(KINDS);
  const plan = PLANS[Math.min(5, Math.max(1, d)) - 1];
  for (let i = 0; ; i++) {
    const z = attempt(rng, kind, d, plan, i >= 8);
    if (z) return z;
  }
}
