// Generator and propagation solver for "who lives where" deduction grids.
// Items are `group * n + value`; every group is a permutation of the n houses (positions 0..n-1).
import type { Rng } from '../../core/rng';
import { popcount } from '../../core/bits';

export type ClueType = 'same' | 'diff' | 'at' | 'notAt' | 'adj' | 'before' | 'next' | 'either';

/**
 * One clue. `same`/`diff`: a and b are (not) the same house. `at`/`notAt`: a is (not) in house p.
 * `adj`: b is directly right of a. `before`: a is somewhere left of b. `next`: a and b are neighbours.
 * `either`: exactly one of b and c shares a's house.
 */
export interface Clue {
  t: ClueType;
  a: number;
  b: number;
  c: number;
  p: number;
}

type Rel = (pa: number, pb: number) => boolean;
const REL: Partial<Record<ClueType, Rel>> = {
  same: (a, b) => a === b,
  diff: (a, b) => a !== b,
  adj: (a, b) => b === a + 1,
  before: (a, b) => a < b,
  next: (a, b) => Math.abs(a - b) === 1,
};

/** Does the clue hold for these item positions? */
export function holds(cl: Clue, pos: ArrayLike<number>): boolean {
  if (cl.t === 'at') return pos[cl.a] === cl.p;
  if (cl.t === 'notAt') return pos[cl.a] !== cl.p;
  if (cl.t === 'either') return (pos[cl.a] === pos[cl.b]) !== (pos[cl.a] === pos[cl.c]);
  return REL[cl.t]!(pos[cl.a], pos[cl.b]);
}

/** Items a clue talks about. */
export const clueItems = (cl: Clue) => (cl.t === 'at' || cl.t === 'notAt' ? [cl.a] : cl.t === 'either' ? [cl.a, cl.b, cl.c] : [cl.a, cl.b]);

const SUP = new Map<string, Uint8Array>();
/** support[mask] = positions of the other item compatible with some position in `mask`. */
function support(n: number, t: ClueType, rev: boolean): Uint8Array {
  const key = `${n}${t}${rev ? 1 : 0}`;
  let s = SUP.get(key);
  if (s) return s;
  const rel = REL[t]!;
  s = new Uint8Array(1 << n);
  for (let m = 1; m < 1 << n; m++) {
    let out = 0;
    for (let p = 0; p < n; p++) {
      if (!(m & (1 << p))) continue;
      for (let q = 0; q < n; q++) if (rev ? rel(q, p) : rel(p, q)) out |= 1 << q;
    }
    s[m] = out;
  }
  SUP.set(key, s);
  return s;
}

/**
 * Narrow every item's set of possible houses (bitmask) as far as single clues and "each value once
 * per group" allow. Returns false on a contradiction.
 */
export function propagate(n: number, groups: number, clues: readonly Clue[], dom: Uint8Array): boolean {
  const full = (1 << n) - 1;
  for (let changed = true; changed;) {
    changed = false;
    const set = (i: number, m: number) => {
      if (m === dom[i]) return true;
      dom[i] = m;
      changed = true;
      return m !== 0;
    };
    for (const cl of clues) {
      const { a, b, c } = cl;
      if (cl.t === 'at') {
        if (!set(a, dom[a] & (1 << cl.p))) return false;
      } else if (cl.t === 'notAt') {
        if (!set(a, dom[a] & ~(1 << cl.p) & full)) return false;
      } else if (cl.t === 'either') {
        let ma = 0,
          mb = 0,
          mc = 0;
        for (let pa = 0; pa < n; pa++) {
          if (!(dom[a] & (1 << pa))) continue;
          for (let pb = 0; pb < n; pb++) {
            if (!(dom[b] & (1 << pb))) continue;
            const withB = pa === pb;
            for (let pc = 0; pc < n; pc++) {
              if (!(dom[c] & (1 << pc)) || withB === (pa === pc)) continue;
              ma |= 1 << pa;
              mb |= 1 << pb;
              mc |= 1 << pc;
            }
          }
        }
        if (!set(a, ma) || !set(b, mb) || !set(c, mc)) return false;
      } else {
        if (!set(b, dom[b] & support(n, cl.t, false)[dom[a]])) return false;
        if (!set(a, dom[a] & support(n, cl.t, true)[dom[b]])) return false;
      }
    }
    for (let g = 0; g < groups; g++) {
      const o = g * n;
      for (let v = 0; v < n; v++) {
        const m = dom[o + v];
        if (popcount(m) !== 1) continue;
        for (let w = 0; w < n; w++) if (w !== v && dom[o + w] & m && !set(o + w, dom[o + w] & ~m)) return false;
      }
      for (let p = 0; p < n; p++) {
        let cnt = 0,
          who = -1;
        for (let v = 0; v < n; v++)
          if (dom[o + v] & (1 << p)) {
            cnt++;
            who = v;
          }
        if (cnt === 0) return false;
        if (cnt === 1) set(o + who, 1 << p);
      }
    }
  }
  return true;
}

const isSolved = (dom: Uint8Array) => dom.every((m) => popcount(m) === 1);

export interface DeductPuzzle {
  /** Position of every item in the solution. */
  pos: number[];
  clues: Clue[];
}

export interface DeductOpts {
  n: number;
  groups: number;
  /** Relative weight of each clue type while adding clues. */
  weights: Partial<Record<ClueType, number>>;
  /** Pruning tries to drop these types first (so the others stay in the final set). */
  dropFirst: ClueType[];
  rng: Rng;
}

const clueKey = (cl: Clue) => `${cl.t}:${cl.a}:${cl.b}:${cl.c}:${cl.p}`;

/**
 * A random solution plus a minimal-ish clue set that pure propagation solves (hence a unique solution
 * reachable without guessing).
 */
export function generateDeduct(o: DeductOpts): DeductPuzzle {
  const { n, groups, rng } = o;
  const size = n * groups;
  const pos: number[] = [];
  for (let g = 0; g < groups; g++) pos.push(...rng.shuffle(Array.from({ length: n }, (_, i) => i)));
  const who: number[][] = Array.from({ length: n }, () => []); // who[p] = items in house p
  pos.forEach((p, i) => who[p].push(i));
  const groupOf = (i: number) => Math.floor(i / n);
  const types = (Object.keys(o.weights) as ClueType[]).filter((t) => (o.weights[t] ?? 0) > 0);
  const totalW = types.reduce((s, t) => s + o.weights[t]!, 0);
  const pickType = (): ClueType => {
    let r = rng.next() * totalW;
    for (const t of types) if ((r -= o.weights[t]!) < 0) return t;
    return types[types.length - 1];
  };
  const item = () => rng.int(0, size - 1);
  const other = (a: number, ok: (b: number) => boolean) => {
    const opts = Array.from({ length: size }, (_, i) => i).filter((b) => b !== a && ok(b));
    return opts.length ? rng.pick(opts) : -1;
  };

  const candidate = (t: ClueType): Clue | null => {
    const a = item();
    const pa = pos[a];
    const cl: Clue = { t, a, b: -1, c: -1, p: -1 };
    switch (t) {
      case 'same':
        cl.b = other(a, (b) => pos[b] === pa && groupOf(b) !== groupOf(a));
        break;
      case 'diff':
        cl.b = other(a, (b) => pos[b] !== pa && groupOf(b) !== groupOf(a));
        break;
      case 'at':
        cl.p = pa;
        break;
      case 'notAt':
        cl.p = rng.pick(Array.from({ length: n }, (_, p) => p).filter((p) => p !== pa));
        break;
      case 'adj':
        cl.b = other(a, (b) => pos[b] === pa + 1);
        break;
      case 'before':
        cl.b = other(a, (b) => pos[b] > pa);
        break;
      case 'next':
        cl.b = other(a, (b) => Math.abs(pos[b] - pa) === 1);
        break;
      case 'either': {
        const ga = groupOf(a);
        const yes = other(a, (b) => pos[b] === pa && groupOf(b) !== ga);
        const no = other(a, (b) => pos[b] !== pa && groupOf(b) !== ga && b !== yes);
        if (yes < 0 || no < 0) return null;
        [cl.b, cl.c] = rng.chance(0.5) ? [yes, no] : [no, yes];
        break;
      }
    }
    return cl.b === -1 && t !== 'at' && t !== 'notAt' ? null : cl;
  };

  const fresh = () => new Uint8Array(size).fill((1 << n) - 1);
  const total = (d: Uint8Array) => d.reduce((s, m) => s + popcount(m), 0);
  const clues: Clue[] = [];
  const seen = new Set<string>();
  let dom = fresh();
  for (let tries = 0; tries < 600 && !isSolved(dom); tries++) {
    const cl = candidate(pickType());
    if (!cl || seen.has(clueKey(cl))) continue;
    const next = dom.slice();
    propagate(n, groups, [...clues, cl], next);
    if (total(next) >= total(dom)) continue;
    seen.add(clueKey(cl));
    clues.push(cl);
    dom = next;
  }
  // Fallback: pin whatever is still open.
  for (let i = 0; i < size && !isSolved(dom); i++) {
    if (popcount(dom[i]) === 1) continue;
    clues.push({ t: 'at', a: i, b: -1, c: -1, p: pos[i] });
    propagate(n, groups, clues, dom);
  }

  // Prune clues the others make redundant.
  const solves = (cs: Clue[]) => {
    const d = fresh();
    return propagate(n, groups, cs, d) && isSolved(d);
  };
  const rank = (t: ClueType) => {
    const k = o.dropFirst.indexOf(t);
    return k < 0 ? o.dropFirst.length : k;
  };
  const order = rng.shuffle(clues.map((_, i) => i)).sort((x, y) => rank(clues[x].t) - rank(clues[y].t));
  const keep = clues.map(() => true);
  for (const i of order) {
    keep[i] = false;
    if (!solves(clues.filter((_, j) => keep[j]))) keep[i] = true;
  }
  return { pos, clues: rng.shuffle(clues.filter((_, j) => keep[j])) };
}
