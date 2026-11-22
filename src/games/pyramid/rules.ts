import type { Rng } from '../../core/rng';
import { deck, rank, type Card } from '../../kits/card/cards';

/** Pyramid rules engine + DFS solver (pure; no DOM). */
export interface PState {
  pyr: number[]; // 28 slots, -1 = removed; row r, col k at r*(r+1)/2 + k
  stock: Card[]; // top = end
  waste: Card[]; // top = end
  passes: number; // redeals used
  moves: number;
}

const ROW = (i: number) => Math.floor((Math.sqrt(8 * i + 1) - 1) / 2);
export const idx = (r: number, k: number) => (r * (r + 1)) / 2 + k;

function dealP(cards: Card[]): PState {
  return { pyr: cards.slice(0, 28), stock: cards.slice(28), waste: [], passes: 0, moves: 0 };
}
export function exposed(pyr: number[], i: number): boolean {
  if (pyr[i] < 0) return false;
  const r = ROW(i);
  if (r === 6) return true;
  const k = i - idx(r, 0);
  return pyr[idx(r + 1, k)] < 0 && pyr[idx(r + 1, k + 1)] < 0;
}

/** Card at an available position: 'p#' (exposed pyramid card) or 'w' (waste top). */
export function cardAt(s: PState, p: string): Card | null {
  if (p === 'w') return s.waste.length ? s.waste[s.waste.length - 1] : null;
  if (p[0] === 'p') {
    const i = Number(p.slice(1));
    return exposed(s.pyr, i) ? s.pyr[i] : null;
  }
  return null;
}

const take = (s: PState, p: string) => {
  if (p === 'w') s.waste.pop();
  else s.pyr[Number(p.slice(1))] = -1;
};

/** Remove a king alone, or a pair summing to 13. */
export function removeP(s: PState, a: string, b?: string, dry = false): boolean {
  const ca = cardAt(s, a);
  if (ca == null) return false;
  if (b == null) {
    if (rank(ca) !== 13) return false;
    if (!dry) {
      take(s, a);
      s.moves++;
    }
    return true;
  }
  if (a === b) return false;
  const cb = cardAt(s, b);
  if (cb == null || rank(ca) + rank(cb) !== 13) return false;
  if (!dry) {
    take(s, a);
    take(s, b);
    s.moves++;
  }
  return true;
}

export const canRecycle = (s: PState, maxPasses: number) =>
  !s.stock.length && s.waste.length > 0 && (maxPasses < 0 || s.passes < maxPasses - 1);

export function drawP(s: PState, maxPasses: number): boolean {
  if (s.stock.length) s.waste.push(s.stock.pop()!);
  else if (canRecycle(s, maxPasses)) {
    s.stock = s.waste.reverse();
    s.waste = [];
    s.passes++;
  } else return false;
  s.moves++;
  return true;
}

export const clearedP = (s: PState) => s.pyr.every((c) => c < 0);

/** A pass through the stock is still available after the current one (maxPasses -1 = unlimited). */
const passLeft = (s: PState, maxPasses: number) => maxPasses < 0 || s.passes < maxPasses - 1;

/**
 * Exact loss test: no pyramid card can ever be removed again. Pyramid exposure can't change until a
 * pyramid card goes, so only the open cards matter, against every talon card that can still reach
 * the waste top (talon cards never pair with each other).
 */
export function deadP(s: PState, maxPasses: number): boolean {
  if (clearedP(s)) return false;
  const open: number[] = [];
  for (let i = 0; i < 28; i++) if (exposed(s.pyr, i)) open.push(rank(s.pyr[i]));
  const want = new Set<number>();
  for (let x = 0; x < open.length; x++) {
    if (open[x] === 13) return false;
    want.add(13 - open[x]);
    for (let y = x + 1; y < open.length; y++) if (open[x] + open[y] === 13) return false;
  }
  // Talon cards that can still show on the waste: all of them if another pass is coming; otherwise the
  // stock, the waste top, and whatever lies under kings at the top of the waste.
  const reach = s.stock.slice();
  if (passLeft(s, maxPasses)) reach.push(...s.waste);
  else
    for (let k = s.waste.length - 1; k >= 0; k--) {
      reach.push(s.waste[k]);
      if (rank(s.waste[k]) !== 13) break;
    }
  return !reach.some((c) => want.has(rank(c)));
}

/** Solver outcome: a winning line exists, no line exists, or the node budget ran out first. */
export type Verdict = 'win' | 'dead' | 'unknown';

/**
 * DFS: can the pyramid be cleared from this state (any point of a game) with `maxPasses` passes
 * through the stock in all (-1 = unlimited)?
 */
export function solveP(s0: PState, maxPasses: number, budget = 20000): Verdict {
  return searchP(s0, maxPasses, budget).v;
}

/**
 * One step of a winning line: remove a pyramid king (`p` = slot), the waste king (`w`), a pyramid
 * pair (`pp`), the waste top with a pyramid card (`wp`), draw (`d`) or turn the waste over (`r`).
 */
export type PAct =
  | { k: 'p'; a: number }
  | { k: 'w' }
  | { k: 'pp'; a: number; b: number }
  | { k: 'wp'; a: number }
  | { k: 'd' }
  | { k: 'r' };

/** Like solveP, with the winning line when there is one. */
export function searchP(s0: PState, maxPasses: number, budget = 20000): { v: Verdict; line: PAct[] } {
  const talon = [...s0.waste, ...s0.stock.slice().reverse()]; // draw order
  const T = talon.length;
  const unlimited = maxPasses < 0;
  const seen = new Set<string>();
  let pm = 0; // removed pyramid bits
  let tm = 0; // removed talon bits
  let nodes = 0;
  let out = false;
  const path: PAct[] = [];
  const pyr = s0.pyr.slice();
  const tal = new Array<boolean>(T).fill(false); // removed
  const exp = (i: number) => exposed(pyr, i);

  // talon[0, ptr) has been drawn (the waste), talon[ptr, T) is still in the stock.
  const rec = (ptr: number, pass: number, left: number): boolean => {
    if (left === 0) return true;
    if (++nodes > budget) {
      out = true;
      return false;
    }
    // With unlimited passes, the pass count doesn't change what's possible.
    const key = pm * 16777216 + tm + ':' + (unlimited ? ptr : ptr * 8 + pass);
    if (seen.has(key)) return false;
    seen.add(key);
    // waste top
    let w = ptr - 1;
    while (w >= 0 && tal[w]) w--;
    const av: number[] = [];
    for (let i = 0; i < 28; i++) if (exp(i)) av.push(i);
    // kings
    for (const i of av) {
      if (rank(pyr[i]) === 13) {
        const c = pyr[i];
        pyr[i] = -1;
        pm += 2 ** i;
        path.push({ k: 'p', a: i });
        const ok = rec(ptr, pass, left - 1);
        if (!ok) path.pop();
        pyr[i] = c;
        pm -= 2 ** i;
        return ok; // removing a king is always safe
      }
    }
    if (w >= 0 && rank(talon[w]) === 13) {
      tal[w] = true;
      tm += 2 ** w;
      path.push({ k: 'w' });
      const ok = rec(ptr, pass, left);
      if (!ok) path.pop();
      tal[w] = false;
      tm -= 2 ** w;
      return ok;
    }
    // pyramid pairs
    for (let x = 0; x < av.length; x++) {
      for (let y = x + 1; y < av.length; y++) {
        const a = av[x],
          b = av[y];
        if (rank(pyr[a]) + rank(pyr[b]) !== 13) continue;
        const ca = pyr[a],
          cb = pyr[b];
        pyr[a] = -1;
        pyr[b] = -1;
        pm += 2 ** a + 2 ** b;
        path.push({ k: 'pp', a, b });
        const ok = rec(ptr, pass, left - 2);
        if (!ok) path.pop();
        pyr[a] = ca;
        pyr[b] = cb;
        pm -= 2 ** a + 2 ** b;
        if (ok) return true;
      }
    }
    // waste + pyramid
    if (w >= 0) {
      for (const a of av) {
        if (rank(pyr[a]) + rank(talon[w]) !== 13) continue;
        const ca = pyr[a];
        pyr[a] = -1;
        tal[w] = true;
        pm += 2 ** a;
        tm += 2 ** w;
        path.push({ k: 'wp', a });
        const ok = rec(ptr, pass, left - 1);
        if (!ok) path.pop();
        pyr[a] = ca;
        tal[w] = false;
        pm -= 2 ** a;
        tm -= 2 ** w;
        if (ok) return true;
      }
    }
    // draw, or start a new pass
    const step = (act: PAct, p: number, n: number) => {
      path.push(act);
      const ok = rec(p, n, left);
      if (!ok) path.pop();
      return ok;
    };
    // (a talon card already removed isn't in the stock any more: passing it isn't a draw)
    if (ptr < T) return tal[ptr] ? rec(ptr + 1, pass, left) : step({ k: 'd' }, ptr + 1, pass);
    if ((unlimited || pass < maxPasses - 1) && tal.some((r) => !r)) return step({ k: 'r' }, 0, pass + 1);
    return false;
  };
  const ok = rec(s0.waste.length, s0.passes, pyr.filter((c) => c >= 0).length);
  return { v: ok ? 'win' : out ? 'unknown' : 'dead', line: ok ? path : [] };
}

/**
 * Builds a deal around a random winning line: plays removals on still-blank positions and hands each
 * one cards from the deck as it goes (a king, or two cards adding to 13). Unused talon slots get the
 * leftovers; extra options never break the known line. Null if the random line dead-ends.
 */
function buildP(rng: Rng, maxPasses: number): PState | null {
  const byRank: Card[][] = Array.from({ length: 14 }, () => []);
  for (const c of deck(rng)) byRank[rank(c)].push(c);
  const pyr = new Array<number>(28).fill(0); // 0 = still there (blank), -1 = removed
  const val = new Array<number>(52).fill(-1); // 0..27 pyramid, 28 + t = talon slot t (draw order)
  const tal = new Array<boolean>(24).fill(false); // removed
  let ptr = 0;
  let pass = 0;
  let left = 28;
  const give = (pos: number, r: number) => (val[pos] = byRank[r].pop()!);
  for (let step = 0; left > 0; step++) {
    if (step > 400) return null;
    let w = ptr - 1;
    while (w >= 0 && tal[w]) w--;
    const open: number[] = [];
    for (let i = 0; i < 28; i++) if (exposed(pyr, i)) open.push(i);
    const kinds: number[] = []; // r and 13 - r both still in the deck
    for (let r = 1; r <= 6; r++) if (byRank[r].length && byRank[13 - r].length) kinds.push(r);
    const pair = (a: number, b: number) => {
      const r = rng.pick(kinds);
      const swap = rng.chance(0.5);
      give(a, swap ? r : 13 - r);
      give(b, swap ? 13 - r : r);
    };
    const acts: { wt: number; go: () => number }[] = []; // go() returns the pyramid cards removed
    if (byRank[13].length)
      for (const i of open)
        acts.push({
          wt: 0.25,
          go: () => {
            give(i, 13);
            pyr[i] = -1;
            return 1;
          },
        });
    if (kinds.length) {
      for (let x = 0; x < open.length; x++)
        for (let y = x + 1; y < open.length; y++)
          acts.push({
            wt: 1,
            go: () => {
              pair(open[x], open[y]);
              pyr[open[x]] = pyr[open[y]] = -1;
              return 2;
            },
          });
      if (w >= 0)
        for (const i of open)
          acts.push({
            wt: 2.5,
            go: () => {
              pair(i, 28 + w);
              pyr[i] = -1;
              tal[w] = true;
              return 1;
            },
          });
    }
    if (ptr < 24 || ((maxPasses < 0 || pass < maxPasses - 1) && tal.some((r) => !r)))
      acts.push({
        wt: 1.5 * Math.max(1, acts.length / 4),
        go: () => {
          if (ptr < 24) ptr++;
          else {
            ptr = 0;
            pass++;
          }
          return 0;
        },
      });
    if (!acts.length) return null;
    let x = rng.next() * acts.reduce((a, b) => a + b.wt, 0);
    left -= (acts.find((a) => (x -= a.wt) < 0) ?? acts[acts.length - 1]).go();
  }
  const rest = rng.shuffle(byRank.flat());
  for (let p = 0; p < 52; p++) if (val[p] < 0) val[p] = rest.pop()!;
  return dealP([...val.slice(0, 28), ...val.slice(28).reverse()]);
}

/**
 * A deal that can certainly be won with `maxPasses`: the first of `tries` random deals the solver
 * proves (keeps the natural feel), else one built around a random winning line.
 */
export function genP(rng: Rng, maxPasses: number, tries: number, budget: number): PState {
  for (let t = 0; t < tries; t++) {
    const s = dealP(deck(rng));
    if (solveP(s, maxPasses, budget) === 'win') return s;
  }
  for (let t = 0; t < 500; t++) {
    const s = buildP(rng, maxPasses);
    if (s) return s;
  }
  return dealP(deck(rng)); // never reached in practice (see test/cards.test.ts)
}
