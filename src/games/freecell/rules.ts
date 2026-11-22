import type { Rng } from '../../core/rng';
import type { Difficulty } from '../../core/types';
import { deck, isRed, rank, suit, type Card } from '../../kits/card/cards';

/** FreeCell rules engine + a small best-first solver (pure; no DOM). */
export interface FState {
  cells: number[]; // -1 = empty
  found: number[]; // top rank per suit
  cas: Card[][]; // 8 cascades, top = end
  moves: number;
}

function dealF(cards: Card[], cells: number): FState {
  const cas: Card[][] = Array.from({ length: 8 }, () => []);
  cards.forEach((c, i) => cas[i % 8].push(c));
  return { cells: new Array(cells).fill(-1), found: [0, 0, 0, 0], cas, moves: 0 };
}

const cloneF = (s: FState): FState => ({
  cells: s.cells.slice(),
  found: s.found.slice(),
  cas: s.cas.map((c) => c.slice()),
  moves: s.moves,
});
const fitsOnF = (c: Card, top: Card) => rank(top) === rank(c) + 1 && isRed(top) !== isRed(c);
const fitsFoundF = (s: FState, c: Card) => s.found[suit(c)] === rank(c) - 1;
export const wonF = (s: FState) => s.found.every((f) => f === 13);
const freeCells = (s: FState) => s.cells.reduce((a, c) => a + (c < 0 ? 1 : 0), 0);
const emptyCols = (s: FState) => s.cas.reduce((a, c) => a + (c.length ? 0 : 1), 0);

/** Largest run that may move at once (supermove). */
const maxRun = (s: FState, toEmpty: boolean) => (freeCells(s) + 1) * 2 ** Math.max(0, emptyCols(s) - (toEmpty ? 1 : 0));

/** Index where the ordered run at the top of a cascade starts. */
function runStart(col: Card[]): number {
  let k = col.length - 1;
  while (k > 0 && fitsOnF(col[k], col[k - 1])) k--;
  return Math.max(0, k);
}

export function pickedF(s: FState, p: string, i: number): Card[] | null {
  if (p[0] === 'c') {
    const c = s.cells[Number(p.slice(1))];
    return c != null && c >= 0 ? [c] : null;
  }
  if (p[0] === 't') {
    const col = s.cas[Number(p.slice(1))];
    if (!col || i < 0 || i >= col.length || i < runStart(col)) return null;
    return col.slice(i);
  }
  return null;
}

/** Validate / apply a move. `to` is 'f' (any foundation), 'c' (any free cell), 'c#' or 't#'. */
export function moveF(s: FState, p: string, i: number, to: string, dry = false): boolean {
  if (p === to) return false;
  const cards = pickedF(s, p, i);
  if (!cards) return false;
  const c = cards[0];
  let cell = -1;
  if (to[0] === 'f') {
    if (cards.length !== 1 || !fitsFoundF(s, c)) return false;
  } else if (to[0] === 'c') {
    if (cards.length !== 1) return false;
    cell = to.length > 1 ? Number(to.slice(1)) : s.cells.indexOf(-1);
    if (cell < 0 || s.cells[cell] !== -1) {
      cell = s.cells.indexOf(-1);
      if (cell < 0) return false;
    }
  } else if (to[0] === 't') {
    const dst = s.cas[Number(to.slice(1))];
    if (!dst) return false;
    if (dst.length) {
      if (!fitsOnF(c, dst[dst.length - 1]) || cards.length > maxRun(s, false)) return false;
    } else if (cards.length > maxRun(s, true)) return false;
  } else return false;
  if (dry) return true;
  if (p[0] === 'c') s.cells[Number(p.slice(1))] = -1;
  else s.cas[Number(p.slice(1))].splice(i);
  if (to[0] === 'f') s.found[suit(c)]++;
  else if (to[0] === 'c') s.cells[cell] = c;
  else s.cas[Number(to.slice(1))].push(...cards);
  s.moves++;
  return true;
}

/** Safe automatic foundation plays (nothing could ever need these cards). Returns count moved. */
export function autoF(s: FState): number {
  let n = 0;
  const safe = (c: Card) => {
    const r = rank(c);
    if (!fitsFoundF(s, c)) return false;
    if (r <= 2) return true;
    const red = isRed(c);
    return [0, 1, 2, 3].every((su) => (su === 1 || su === 2) === red || s.found[su] >= r - 1);
  };
  for (let moved = true; moved;) {
    moved = false;
    for (let k = 0; k < s.cells.length; k++) {
      if (s.cells[k] >= 0 && safe(s.cells[k])) {
        s.found[suit(s.cells[k])]++;
        s.cells[k] = -1;
        moved = true;
        n++;
      }
    }
    for (const col of s.cas) {
      if (col.length && safe(col[col.length - 1])) {
        s.found[suit(col.pop()!)]++;
        moved = true;
        n++;
      }
    }
  }
  return n;
}

/** Tap destination: foundation, matching cascade, free cell, empty cascade. */
export function bestDestF(s: FState, p: string, i: number): string | null {
  const cards = pickedF(s, p, i);
  if (!cards) return null;
  if (cards.length === 1 && fitsFoundF(s, cards[0])) return 'f';
  const from = p[0] === 't' ? Number(p.slice(1)) : -1;
  for (let k = 0; k < 8; k++) {
    const t = from >= 0 ? (from + 1 + k) % 8 : k;
    if (t === from || !s.cas[t].length) continue;
    if (moveF(s, p, i, 't' + t, true)) return 't' + t;
  }
  if (cards.length === 1 && p[0] === 't' && s.cells.includes(-1)) return 'c';
  if (from >= 0 && i === 0) return null; // whole cascade to an empty one: pointless
  for (let t = 0; t < 8; t++) if (t !== from && !s.cas[t].length && moveF(s, p, i, 't' + t, true)) return 't' + t;
  return null;
}

// ---------- solver ----------

function hashF(s: FState): number {
  // order-independent over cascades and cells
  let h = 0;
  for (const col of s.cas) {
    let x = 2166136261;
    for (const c of col) x = Math.imul(x ^ (c + 1), 16777619);
    x = Math.imul(x ^ (x >>> 13), 0x5bd1e995);
    h = (h + (x ^ (x >>> 15))) | 0;
  }
  let cs = 0;
  for (const c of s.cells) if (c >= 0) cs = (cs + Math.imul(c + 7, 0x9e3779b1)) | 0;
  return (h ^ Math.imul(cs, 31) ^ ((s.found[0] | (s.found[1] << 4) | (s.found[2] << 8) | (s.found[3] << 12)) * 2654435761)) | 0;
}

function scoreF(s: FState): number {
  const home = s.found[0] + s.found[1] + s.found[2] + s.found[3];
  let blocked = 0;
  for (const col of s.cas) {
    let min = 99;
    for (const c of col) {
      const r = rank(c);
      if (r > min) blocked++;
      else min = r;
    }
  }
  return (52 - home) * 3 + blocked * 2 + (s.cells.length - freeCells(s)) - emptyCols(s) * 2;
}

/** A move: card(s) at pile `p` / index `i` to `to` ('f', 'c', 'c#' or 't#'), as the game's go() takes it. */
export interface FMove {
  p: string;
  i: number;
  to: string;
}

/** Successor states (safe cards already sent home). `full` adds every run length to an empty cascade (needed to prove a loss). */
function childrenF(s: FState, full: boolean): { s: FState; m: FMove }[] {
  const out: { s: FState; m: FMove }[] = [];
  const push = (p: string, i: number, to: string) => {
    const n = cloneF(s);
    moveF(n, p, i, to);
    autoF(n);
    out.push({ s: n, m: { p, i, to } });
  };
  const nc = s.cells.length;
  // foundation plays
  for (let k = 0; k < nc; k++) if (s.cells[k] >= 0 && fitsFoundF(s, s.cells[k])) push('c' + k, 0, 'f');
  for (let a = 0; a < 8; a++) {
    const col = s.cas[a];
    if (col.length && fitsFoundF(s, col[col.length - 1])) push('t' + a, col.length - 1, 'f');
  }
  // cell to cascade
  for (let k = 0; k < nc; k++) {
    const c = s.cells[k];
    if (c < 0) continue;
    let emptyDone = false;
    for (let b = 0; b < 8; b++) {
      const dst = s.cas[b];
      if (dst.length ? fitsOnF(c, dst[dst.length - 1]) : !emptyDone) {
        if (!dst.length) emptyDone = true;
        push('c' + k, 0, 't' + b);
      }
    }
  }
  // cascade runs to cascades
  const lim = maxRun(s, false);
  const limE = maxRun(s, true);
  for (let a = 0; a < 8; a++) {
    const col = s.cas[a];
    if (!col.length) continue;
    const rs = runStart(col);
    let emptyDone = false;
    for (let b = 0; b < 8; b++) {
      if (b === a) continue;
      const dst = s.cas[b];
      if (dst.length) {
        const t = dst[dst.length - 1];
        const need = rank(t) - 1;
        // find the card in the run that fits on t
        for (let i = Math.max(rs, col.length - lim); i < col.length; i++) {
          if (rank(col[i]) === need && isRed(col[i]) !== isRed(t)) {
            push('t' + a, i, 't' + b);
            break;
          }
        }
      } else if (!emptyDone) {
        emptyDone = true;
        const i = Math.max(rs, col.length - limE);
        if (i > 0) push('t' + a, i, 't' + b);
        for (let j = i + 1; j < col.length; j++) {
          if (!full && j !== col.length - 1) continue;
          push('t' + a, j, 't' + b);
        }
      }
    }
    // to a free cell
    if (s.cells.includes(-1)) push('t' + a, col.length - 1, 'c');
  }
  return out;
}

/** Solver outcome: a winning line exists, no line exists, or the budget ran out first. */
type Verdict = 'win' | 'dead' | 'unknown';

/** Solver result with the winning line (moves from the given state; safe cards go home after each). */
type FResult = { v: 'win'; line: FMove[] } | { v: 'dead' } | { v: 'unknown' };

/**
 * Best-first search within `budget` expansions. 'dead' only when every reachable state was seen,
 * which needs `full` move generation.
 */
export function solveF(s0: FState, budget = 3000, full = false): Verdict {
  return searchF(s0, budget, full).v;
}

/** Like solveF, with the winning line. */
export function searchF(s0: FState, budget = 3000, full = false): FResult {
  type Node = { s: FState; f: number; up: Node | null; m: FMove | null };
  const line = (n: Node) => {
    const out: FMove[] = [];
    for (let x: Node | null = n; x?.m; x = x.up) out.push(x.m);
    return out.reverse();
  };
  const start = cloneF(s0);
  autoF(start);
  if (wonF(start)) return { v: 'win', line: [] };
  const seen = new Set<number>([hashF(start)]);
  // binary heap on score
  const heap: Node[] = [];
  const pushH = (n: Node) => {
    heap.push(n);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].f <= heap[i].f) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const popH = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1,
          r = l + 1;
        let m = i;
        if (l < heap.length && heap[l].f < heap[m].f) m = l;
        if (r < heap.length && heap[r].f < heap[m].f) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  pushH({ s: start, f: scoreF(start), up: null, m: null });
  for (let n = 0; n < budget && heap.length; n++) {
    const node = popH();
    for (const { s: c, m } of childrenF(node.s, full)) {
      const kid: Node = { s: c, f: 0, up: node, m };
      if (wonF(c)) return { v: 'win', line: line(kid) };
      const h = hashF(c);
      if (seen.has(h)) continue;
      seen.add(h);
      kid.f = scoreF(c);
      pushH(kid);
    }
  }
  return heap.length || !full ? { v: 'unknown' } : { v: 'dead' };
}

// ---------- generator ----------

/** Lift low cards toward the exposed end of their cascades (easier deals). */
function easeDeal(s: FState, rng: Rng, maxRank: number, depth: number) {
  for (const col of s.cas) {
    for (let i = 0; i < col.length; i++) {
      const r = rank(col[i]);
      if (r > maxRank) continue;
      const fromTop = col.length - 1 - i;
      if (fromTop < depth) continue;
      // swap with a non-low card near the top
      const j = col.length - 1 - rng.int(0, depth - 1);
      if (rank(col[j]) <= maxRank) continue;
      [col[i], col[j]] = [col[j], col[i]];
    }
  }
}

/**
 * Deal for a difficulty level that the solver proved winnable: the first deal gets a full search (as
 * before), later ones a quick look. Each quick look proves at least half of 3-cell deals, so running
 * out (about 1 in 10^7 on Master, never seen on other levels) is practically impossible.
 */
export function genF(d: Difficulty, rng: Rng): FState {
  const cells = d === 5 ? 3 : 4;
  for (let t = 0, spent = 0; ; t++) {
    const s = dealF(deck(rng), cells);
    if (d === 1) easeDeal(s, rng, 2, 2);
    else if (d === 2) easeDeal(s, rng, 1, 3);
    const budget = t ? 1000 : 4000;
    spent += budget;
    if (solveF(s, budget) === 'win' || spent >= 25000) return s;
  }
}
