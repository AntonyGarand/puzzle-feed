import type { Rng } from '../../core/rng';
import { rank, suit, type Card } from './cards';

/**
 * Ladders rules engine + solver (pure; no DOM).
 *
 * Short deck (ranks `low`..K, four suits), all face up in columns. A ladder is a run going down one rank
 * at a time with the suit changing at every step. The ladder at the top of a column (or any top part of
 * it) moves onto a column whose top card is one rank higher and of another suit. Only a king may start
 * an empty column. Free cells hold one uncovered card each. A column topped by a full ladder K→low is
 * collected; clear the table to win.
 */
export interface LState {
  cols: Card[][]; // top = end
  cells: number[]; // -1 = empty
  done: Card[]; // kings of the collected ladders
  low: number; // lowest rank in the deck
  moves: number;
}

/** A move: card at pile `p` / index `i` (and its cover) to pile `to` ('t#' column, 'c#' cell). */
export interface LMove {
  p: string;
  i: number;
  to: string;
}

/** Can card c sit on card t? One rank lower, any other suit. */
const fitsL = (c: Card, t: Card) => rank(t) === rank(c) + 1 && suit(t) !== suit(c);

export const cloneL = (s: LState): LState => ({
  cols: s.cols.map((c) => c.slice()),
  cells: s.cells.slice(),
  done: s.done.slice(),
  low: s.low,
  moves: s.moves,
});

/** Number of cards in a full ladder. */
export const ladderLen = (low: number) => 14 - low;
export const wonL = (s: LState) => s.done.length === 4;

/** Collect every column topped by a full ladder. Returns the number collected. */
function collectL(s: LState): number {
  const n = ladderLen(s.low);
  let got = 0;
  for (const col of s.cols) {
    if (col.length < n) continue;
    const b = col.length - n;
    if (rank(col[b]) !== 13) continue;
    let ok = true;
    for (let k = b + 1; k < col.length && ok; k++) ok = fitsL(col[k], col[k - 1]);
    if (!ok) continue;
    s.done.push(col[b]);
    col.splice(b);
    got++;
  }
  return got;
}

/** Card at pile p / index i (cells use index 0), or null. */
export function cardAtL(s: LState, p: string, i: number): Card | null {
  const k = Number(p.slice(1));
  if (p[0] === 'c') return i === 0 && s.cells[k] >= 0 ? s.cells[k] : null;
  if (p[0] === 't') {
    const col = s.cols[k];
    return col && i >= 0 && i < col.length ? col[i] : null;
  }
  return null;
}

/** Index where the ladder at the top of a column starts (only it can move). */
function runStartL(col: Card[]): number {
  let k = col.length - 1;
  while (k > 0 && fitsL(col[k], col[k - 1])) k--;
  return Math.max(0, k);
}

/** Can the card at p / i be picked up (it and its cover form a ladder)? */
export const movableL = (s: LState, p: string, i: number) =>
  cardAtL(s, p, i) != null && (p[0] !== 't' || i >= runStartL(s.cols[Number(p.slice(1))]));

/** Validate (dry) or apply a move. */
export function moveL(s: LState, p: string, i: number, to: string, dry = false): boolean {
  if (p === to) return false;
  const c = cardAtL(s, p, i);
  if (c == null || !movableL(s, p, i)) return false;
  const k = Number(to.slice(1));
  if (to[0] === 't') {
    const dst = s.cols[k];
    if (!dst) return false;
    if (dst.length ? !fitsL(c, dst[dst.length - 1]) : rank(c) !== 13) return false;
  } else if (to[0] === 'c') {
    if (!(k >= 0 && k < s.cells.length) || s.cells[k] >= 0) return false;
    if (p[0] !== 't' || i !== s.cols[Number(p.slice(1))].length - 1) return false;
  } else return false;
  if (dry) return true;
  const cards = p[0] === 'c' ? [c] : s.cols[Number(p.slice(1))].splice(i);
  if (p[0] === 'c') s.cells[Number(p.slice(1))] = -1;
  if (to[0] === 't') s.cols[k].push(...cards);
  else s.cells[k] = c;
  s.moves++;
  collectL(s);
  return true;
}

/**
 * Where a tap may send a card, best first: onto a matching column (a clean ladder from a king first, then
 * the longest ladder), a king to an empty column, then a free cell.
 */
export function destsL(s: LState, p: string, i: number): string[] {
  const c = cardAtL(s, p, i);
  if (c == null || !movableL(s, p, i)) return [];
  const fit: { t: number; v: number }[] = [];
  s.cols.forEach((col, t) => {
    if (!col.length || !moveL(s, p, i, 't' + t, true)) return;
    const rs = runStartL(col);
    fit.push({ t, v: (rs === 0 && rank(col[0]) === 13 ? 100 : 0) + col.length - rs });
  });
  fit.sort((x, y) => y.v - x.v || x.t - y.t);
  const out = fit.map((f) => 't' + f.t);
  if (rank(c) === 13 && !(p[0] === 't' && i === 0)) {
    const e = s.cols.findIndex((col) => !col.length);
    if (e >= 0) out.push('t' + e);
  }
  if (p[0] === 't') {
    const e = s.cells.indexOf(-1);
    if (e >= 0 && moveL(s, p, i, 'c' + e, true)) out.push('c' + e);
  }
  return out;
}

/** Every distinct legal move (symmetric empty columns / cells counted once). */
export function movesL(s: LState): LMove[] {
  const out: LMove[] = [];
  const src: LMove[] = [];
  s.cols.forEach((col, a) => {
    for (let i = runStartL(col); i < col.length; i++) src.push({ p: 't' + a, i, to: '' });
  });
  s.cells.forEach((c, k) => c >= 0 && src.push({ p: 'c' + k, i: 0, to: '' }));
  const empty = s.cols.findIndex((col) => !col.length);
  for (const m of src) {
    const c = cardAtL(s, m.p, m.i)!;
    s.cols.forEach((col, b) => {
      if (col.length && 't' + b !== m.p && fitsL(c, col[col.length - 1])) out.push({ p: m.p, i: m.i, to: 't' + b });
    });
    if (empty >= 0 && rank(c) === 13 && !(m.p[0] === 't' && m.i === 0)) out.push({ p: m.p, i: m.i, to: 't' + empty });
  }
  const cell = s.cells.indexOf(-1);
  if (cell >= 0) s.cols.forEach((col, a) => col.length && out.push({ p: 't' + a, i: col.length - 1, to: 'c' + cell }));
  return out;
}

const keyL = (s: LState) =>
  s.cols
    .map((c) => String.fromCharCode(...c.map((x) => x + 65)))
    .sort()
    .join('|') +
  '/' +
  s.cells
    .filter((c) => c >= 0)
    .sort((a, b) => a - b)
    .join(',');

/** Lower is closer to a win: unsorted joints, cards left, parked cards. */
function scoreL(s: LState): number {
  let left = 0;
  let breaks = 0;
  for (const col of s.cols) {
    left += col.length;
    for (let k = 1; k < col.length; k++) if (!fitsL(col[k], col[k - 1])) breaks++;
    if (col.length && rank(col[0]) !== 13) breaks++;
  }
  for (const c of s.cells) if (c >= 0) left += 4; // a parked card counts as one card plus one break
  return breaks * 3 + left;
}

/** Solver outcome: a winning line (moves from s), no line exists, or the budget ran out. */
export type LVerdict = { v: 'win'; line: LMove[] } | { v: 'dead' } | { v: 'unknown' };

/** Best-first search within `budget` expansions. Move generation is complete, so exhausting it proves a loss. */
export function solveL(s0: LState, budget = 4000): LVerdict {
  type Node = { s: LState; f: number; up: Node | null; m: LMove | null };
  const line = (n: Node) => {
    const out: LMove[] = [];
    for (let x: Node | null = n; x?.m; x = x.up) out.push(x.m);
    return out.reverse();
  };
  const start: Node = { s: cloneL(s0), f: 0, up: null, m: null };
  if (wonL(start.s)) return { v: 'win', line: [] };
  const seen = new Set<string>([keyL(start.s)]);
  const heap: Node[] = [start];
  const push = (n: Node) => {
    heap.push(n);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].f <= heap[i].f) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1;
        const r = l + 1;
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
  for (let n = 0; n < budget && heap.length; n++) {
    const node = pop();
    for (const m of movesL(node.s)) {
      const c = cloneL(node.s);
      moveL(c, m.p, m.i, m.to);
      const kid: Node = { s: c, f: scoreL(c), up: node, m };
      if (wonL(c)) return { v: 'win', line: line(kid) };
      const k = keyL(c);
      if (seen.has(k)) continue;
      seen.add(k);
      push(kid);
    }
  }
  return heap.length ? { v: 'unknown' } : { v: 'dead' };
}

/** Apply a line of moves to a copy; true if it wins (tests). */
export function playLineL(s0: LState, line: LMove[]): boolean {
  const s = cloneL(s0);
  for (const m of line) if (!moveL(s, m.p, m.i, m.to)) return false;
  return wonL(s);
}

// ---------- generator ----------

/** Fresh shuffled deal of ranks low..K, round-robin into `ncols` columns. */
function dealL(rng: Rng, low: number, ncols: number, cells: number): LState {
  const cards: Card[] = [];
  for (let su = 0; su < 4; su++) for (let r = low; r <= 13; r++) cards.push(su * 13 + r - 1);
  rng.shuffle(cards);
  const cols: Card[][] = Array.from({ length: ncols }, () => []);
  cards.forEach((c, i) => cols[i % ncols].push(c));
  return { cols, cells: new Array<number>(cells).fill(-1), done: [], low, moves: 0 };
}

/** Moves the solver's line needs before it is won; trivial deals are skipped. */
const minLine = (low: number) => 16 - low;

/** Deal settings for one difficulty level. */
export interface LConfig {
  low: number; // lowest rank (deck = low..K in four suits)
  cols: number;
  cells: number;
  /** Skip deals the solver wins within this many expansions (too easy for the level); 0 = keep all. */
  skipEasy: number;
}

/** Settings per difficulty (Easy … Master): harder levels skip deals the solver finds at once. */
export const LADDER_LEVELS: readonly [LConfig, LConfig, LConfig, LConfig, LConfig] = [
  { low: 9, cols: 6, cells: 2, skipEasy: 0 },
  { low: 8, cols: 6, cells: 1, skipEasy: 0 },
  { low: 7, cols: 6, cells: 1, skipEasy: 0 },
  { low: 6, cols: 7, cells: 1, skipEasy: 80 },
  { low: 6, cols: 7, cells: 0, skipEasy: 80 },
];

/**
 * Deal the solver has won. Random deals first; if none is proven within the budget, scramble a solved
 * table backwards (every backward step undoes a legal forward move), which is winnable by construction.
 */
export function genL(rng: Rng, cfg: LConfig, budget = 3000, spend = 24000): LState {
  const { low, cols, cells, skipEasy } = cfg;
  let fallback: LState | null = null;
  for (let spent = 0; spent < spend; spent += budget) {
    const s = dealL(rng, low, cols, cells);
    collectL(s);
    if (wonL(s)) continue;
    const r = solveL(s, budget);
    if (r.v !== 'win' || r.line.length < minLine(low)) continue;
    if (!skipEasy || solveL(s, skipEasy).v !== 'win') return s;
    fallback ??= s;
  }
  if (fallback) return fallback;
  for (let k = 0; ; k++) {
    const s = scrambleL(rng, low, cols, cells);
    if (k >= 4 || solveL(s, budget).v === 'win') return s;
  }
}

/** Build a deal by undoing forward moves from four finished ladders. */
function scrambleL(rng: Rng, low: number, ncols: number, cells: number): LState {
  const cols: Card[][] = Array.from({ length: ncols }, () => []);
  for (let su = 0; su < 4; su++) for (let r = 13; r >= low; r--) cols[su].push(((su + r) % 4) * 13 + r - 1);
  const s: LState = { cols, cells: new Array<number>(cells).fill(-1), done: [], low, moves: 0 };
  for (let step = 0; step < ladderLen(low) * 8; step++) {
    const opts: { a: number; i: number; b: number }[] = [];
    s.cols.forEach((col, a) => {
      for (let i = 0; i < col.length; i++) {
        // Undo "c + cover onto its parent": lift it off its parent onto any other column (even an empty one).
        // Undo "king + cover to an empty column": put a bottom king run back on another column's top.
        if (i < runStartL(col)) continue;
        const back = i > 0 ? fitsL(col[i], col[i - 1]) : rank(col[0]) === 13;
        if (!back) continue;
        s.cols.forEach((dst, b) => b !== a && (i > 0 || dst.length) && opts.push({ a, i, b }));
      }
    });
    if (!opts.length) break;
    const { a, i, b } = rng.pick(opts);
    s.cols[b].push(...s.cols[a].splice(i));
  }
  return s;
}
