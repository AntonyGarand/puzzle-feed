import type { Rng } from '../../core/rng';
import { deck, rank, suit, type Card } from '../../kits/card/cards';

/** Spider rules engine (pure; no DOM). */
interface SCol {
  d: Card[];
  u: Card[];
}
export interface SState {
  cols: SCol[];
  stock: Card[]; // top = end
  done: number[]; // suits of completed K→A runs
  moves: number;
}

function dealS(cards: Card[], ncols: number, dealt: number): SState {
  const c = cards.slice();
  const cols: SCol[] = Array.from({ length: ncols }, () => ({ d: [], u: [] }));
  for (let i = 0; i < dealt; i++) cols[i % ncols].d.push(c.pop()!);
  for (const col of cols) col.u.push(col.d.pop()!);
  return { cols, stock: c, done: [], moves: 0 };
}

const seqOk = (a: Card, b: Card) => suit(a) === suit(b) && rank(a) === rank(b) + 1;

/** Index (within u) where the movable same-suit run at the top starts. */
export function runStartS(u: Card[]): number {
  let k = u.length - 1;
  while (k > 0 && seqOk(u[k - 1], u[k])) k--;
  return Math.max(0, k);
}

export function pickedS(s: SState, p: string, i: number): Card[] | null {
  if (p[0] !== 't') return null;
  const col = s.cols[Number(p.slice(1))];
  if (!col) return null;
  const k = i - col.d.length;
  if (k < 0 || k >= col.u.length || k < runStartS(col.u)) return null;
  return col.u.slice(k);
}

const fitsS = (col: SCol, c: Card) => (col.u.length ? rank(col.u[col.u.length - 1]) === rank(c) + 1 : !col.d.length);

function settle(s: SState, col: SCol) {
  if (col.u.length >= 13) {
    const tail = col.u.slice(-13);
    if (rank(tail[0]) === 13 && tail.every((c, j) => j === 0 || seqOk(tail[j - 1], c))) {
      col.u.splice(-13);
      s.done.push(suit(tail[0]));
    }
  }
  if (!col.u.length && col.d.length) col.u.push(col.d.pop()!);
}

export function moveS(s: SState, p: string, i: number, to: string, dry = false): boolean {
  if (p === to || to[0] !== 't') return false;
  const cards = pickedS(s, p, i);
  const dst = s.cols[Number(to.slice(1))];
  if (!cards || !dst || !fitsS(dst, cards[0])) return false;
  if (dry) return true;
  const src = s.cols[Number(p.slice(1))];
  src.u.splice(i - src.d.length);
  dst.u.push(...cards);
  settle(s, src);
  settle(s, dst);
  s.moves++;
  return true;
}

const tableCount = (s: SState) => s.cols.reduce((a, c) => a + c.d.length + c.u.length, 0);
/** A row may be dealt when no column is empty (or there aren't enough cards to fill them). */
export const canDealS = (s: SState) =>
  s.stock.length >= s.cols.length && (s.cols.every((c) => c.u.length) || tableCount(s) < s.cols.length);

export function dealRow(s: SState): boolean {
  if (!canDealS(s)) return false;
  for (const col of s.cols) col.u.push(s.stock.pop()!);
  for (const col of s.cols) settle(s, col);
  s.moves++;
  return true;
}

export const wonS = (s: SState) => s.cols.every((c) => !c.u.length && !c.d.length) && !s.stock.length;

/** Tap destination: same-suit match, any match, then an empty column. */
export function bestDestS(s: SState, p: string, i: number): string | null {
  const cards = pickedS(s, p, i);
  if (!cards) return null;
  const from = Number(p.slice(1));
  const n = s.cols.length;
  const order = Array.from({ length: n - 1 }, (_, k) => (from + 1 + k) % n);
  const c = cards[0];
  for (const t of order) {
    const col = s.cols[t];
    if (col.u.length && seqOk(col.u[col.u.length - 1], c)) return 't' + t;
  }
  for (const t of order) {
    const col = s.cols[t];
    if (col.u.length && rank(col.u[col.u.length - 1]) === rank(c) + 1) return 't' + t;
  }
  const src = s.cols[from];
  if (i === 0 && !src.d.length) return null; // whole column to an empty one
  for (const t of order) if (!s.cols[t].u.length && !s.cols[t].d.length) return 't' + t;
  return null;
}

/** Any legal (non-pointless) move or deal left? */
export function hasMoveS(s: SState): boolean {
  if (canDealS(s)) return true;
  for (let a = 0; a < s.cols.length; a++) {
    const col = s.cols[a];
    for (let k = runStartS(col.u); k < col.u.length; k++) if (bestDestS(s, 't' + a, col.d.length + k)) return true;
  }
  return false;
}

const keyS = (s: SState) =>
  s.cols
    .map((c) => c.d.length + ':' + c.u.join('.'))
    .sort()
    .join('/');
const cloneS = (s: SState): SState => ({
  cols: s.cols.map((c) => ({ d: c.d.slice(), u: c.u.slice() })),
  stock: s.stock.slice(),
  done: s.done.slice(),
  moves: s.moves,
});

/**
 * Is real progress still possible? A deal is left, or some chain of moves flips a card or completes a
 * run. Without either, no sequence of moves can win. Exact unless the node cap is hit ("yes").
 */
export function progressS(s0: SState, cap = 400): boolean {
  if (wonS(s0) || s0.stock.length) return true;
  const seen = new Set<string>([keyS(s0)]);
  const stack = [s0];
  for (let nodes = 0; stack.length; nodes++) {
    if (nodes > cap) return true;
    const s = stack.pop()!;
    const moves: [number, number, number][] = [];
    for (let a = 0; a < s.cols.length; a++) {
      const { d, u } = s.cols[a];
      for (let k = runStartS(u); k < u.length; k++) {
        for (let b = 0; b < s.cols.length; b++) {
          const v = s.cols[b].u;
          if (b === a || !fitsS(s.cols[b], u[k])) continue;
          if (k === 0 && d.length) return true; // turns a card
          if (v.length && seqOk(v[v.length - 1], u[k]) && rank(u[u.length - 1]) === 1 && v.length - runStartS(v) + u.length - k >= 13)
            return true; // completes a run
          moves.push([a, k, b]);
        }
      }
    }
    for (const [a, k, b] of moves) {
      // Copy only the face-up cards of the two columns the move touches (nothing gets turned or
      // completed here, or we'd have stopped above).
      const cols = s.cols.slice();
      cols[a] = { d: cols[a].d, u: cols[a].u.slice() };
      cols[b] = { d: cols[b].d, u: cols[b].u.slice() };
      const n: SState = { cols, stock: s.stock, done: s.done, moves: s.moves };
      moveS(n, 't' + a, cols[a].d.length + k, 't' + b);
      const key = keyS(n);
      if (seen.has(key)) continue;
      seen.add(key);
      stack.push(n);
    }
  }
  return false;
}

/**
 * Shortest series of moves (breadth first, so following it one move at a time never loops) that ends
 * by turning a card over or completing a run: the moves progressS explores. Each move is
 * [from column, card index, to column]. Null when there is none within `cap` positions.
 */
export function progressPlanS(s0: SState, cap = 800): [number, number, number][] | null {
  type Node = { s: SState; up: Node | null; m: [number, number, number] | null };
  const lineOf = (n: Node, last: [number, number, number]) => {
    const out = [last];
    for (let x: Node | null = n; x?.m; x = x.up) out.push(x.m);
    return out.reverse();
  };
  const seen = new Set<string>([keyS(s0)]);
  const queue: Node[] = [{ s: s0, up: null, m: null }];
  for (let q = 0; q < queue.length && q < cap; q++) {
    const node = queue[q];
    const s = node.s;
    for (let a = 0; a < s.cols.length; a++) {
      const { d, u } = s.cols[a];
      for (let k = runStartS(u); k < u.length; k++) {
        for (let b = 0; b < s.cols.length; b++) {
          const v = s.cols[b].u;
          if (b === a || !fitsS(s.cols[b], u[k])) continue;
          const m: [number, number, number] = [a, d.length + k, b];
          if (k === 0 && d.length) return lineOf(node, m); // turns a card
          if (v.length && seqOk(v[v.length - 1], u[k]) && rank(u[u.length - 1]) === 1 && v.length - runStartS(v) + u.length - k >= 13)
            return lineOf(node, m); // completes a run
          if (k === 0 && !v.length) continue; // whole column to an empty one: no change
          // Copy only the face-up cards of the two columns the move touches (nothing turns over or
          // gets completed here, or we'd have stopped above).
          const cols = s.cols.slice();
          cols[a] = { d: cols[a].d, u: cols[a].u.slice() };
          cols[b] = { d: cols[b].d, u: cols[b].u.slice() };
          const n: SState = { cols, stock: s.stock, done: s.done, moves: s.moves };
          moveS(n, 't' + a, d.length + k, 't' + b);
          const key = keyS(n);
          if (seen.has(key)) continue;
          seen.add(key);
          queue.push({ s: n, up: node, m });
        }
      }
    }
  }
  return null;
}

/** Moves as [from column, card index, to column]; null deals a row. */
type WinLine = ([number, number, number] | null)[];
interface Built {
  s: SState;
  line: WinLine | null;
}

/** Plays a line on (a copy of) a state; true if every step is legal and the game ends won. */
export function playLineS(s0: SState, line: WinLine): boolean {
  const s = cloneS(s0);
  for (const m of line) if (!(m ? moveS(s, 't' + m[0], m[1], 't' + m[2]) : dealRow(s))) return false;
  return wonS(s);
}

/**
 * Builds a deal by playing it: a greedy player plays from a deal of blank cards, and each card gets
 * its identity only when it is turned face up, from what's left of the deck. With probability `help`
 * the card is one that fits (same suit, next rank), otherwise any. A finished game is a winning line,
 * replayed on the real deal to be sure. Null if the player gets stuck.
 */
function buildS(rng: Rng, suits: number[], copies: number, ncols: number, dealt: number, help: number): Built | null {
  const total = suits.length * copies * 13;
  const pool = deck(rng, suits, copies); // cards not handed out yet
  const val = new Array<number>(total).fill(-1); // deal position → card
  const s = dealS(
    Array.from({ length: total }, (_, p) => -(p + 1)), // blank -(p + 1) for deal position p
    ncols,
    dealt,
  );
  const take = (want: Card[]) => {
    const ok = rng.chance(help) ? pool.filter((c) => want.includes(c)) : [];
    const c = ok.length ? rng.pick(ok) : rng.pick(pool);
    pool.splice(pool.indexOf(c), 1);
    return c;
  };
  const below = (c: Card) => (rank(c) > 1 ? [c - 1] : []); // same suit, one lower
  /** Name the blank just turned up at the top of column x: something that joins a neighbour. */
  const reveal = (x: number) => {
    const col = s.cols[x];
    const want: Card[] = [];
    s.cols.forEach((o, y) => {
      if (y === x || !o.u.length) return;
      const top = o.u[o.u.length - 1];
      if (top >= 0) want.push(...below(top));
      const r0 = o.u[runStartS(o.u)];
      if (r0 >= 0 && rank(r0) < 13) want.push(r0 + 1);
    });
    const c = take(want);
    val[-col.u[0] - 1] = c;
    col.u[0] = c;
  };
  const flips = () => s.cols.forEach((col, x) => col.u.length === 1 && col.u[0] < 0 && reveal(x));
  flips();
  const line: WinLine = [];
  const go = (a: number, k: number, b: number) => {
    line.push([a, s.cols[a].d.length + k, b]);
    moveS(s, 't' + a, s.cols[a].d.length + k, 't' + b);
    flips();
  };
  const seen = new Set<string>();
  const keyOf = (t: SState) => t.stock.length + '#' + t.done.length + '#' + keyS(t);
  for (let step = 0; !wonS(s); step++) {
    if (step > 1000) return null;
    seen.add(keyOf(s));
    // Score change of each move (turned cards, same-suit and plain links, empty columns, completed
    // runs), worked out without playing it.
    const cands: [number, number, number, number][] = [];
    for (let a = 0; a < ncols; a++) {
      const { d, u } = s.cols[a];
      for (let k = runStartS(u); k < u.length; k++) {
        const c = u[k];
        let lose: number;
        if (k) lose = seqOk(u[k - 1], c) ? 10 : rank(u[k - 1]) === rank(c) + 1 ? 3 : 0;
        else lose = d.length ? -40 : -15; // turns a card / empties the column
        for (let b = 0; b < ncols; b++) {
          const v = s.cols[b].u;
          if (b === a || !fitsS(s.cols[b], c)) continue;
          if (!v.length) {
            if (k || d.length) cands.push([-15 - lose + rng.next(), a, k, b]); // (whole column to an empty one is pointless)
            continue;
          }
          let gain = suit(v[v.length - 1]) === suit(c) ? 10 : 3;
          if (gain === 10 && rank(u[u.length - 1]) === 1 && v.length - runStartS(v) + u.length - k >= 13) gain += 880;
          cands.push([gain - lose + rng.next(), a, k, b]); // rng: random tie-break
        }
      }
    }
    // Best move to a position not seen yet: before the stock runs out, only improving ones; after
    // that, the best of what's left (the endgame needs some shuffling).
    cands.sort((x, y) => y[0] - x[0]);
    const pick = cands.find(([delta, a, k, b]) => {
      if (s.stock.length && delta <= 0) return false;
      const n = cloneS(s);
      moveS(n, 't' + a, n.cols[a].d.length + k, 't' + b);
      return !seen.has(keyOf(n));
    });
    if (pick) {
      go(pick[1], pick[2], pick[3]);
      continue;
    }
    if (!s.stock.length) return null;
    // Fill empty columns with top cards from columns that keep something face up, then deal right away
    // (scoring moves first would just empty them again).
    while (!canDealS(s)) {
      const to = s.cols.findIndex((c) => !c.u.length);
      const from = s.cols.map((c, a) => (c.u.length > 1 ? a : -1)).filter((a) => a >= 0);
      if (!from.length) return null;
      const a = rng.pick(from);
      go(a, s.cols[a].u.length - 1, to);
    }
    line.push(null);
    for (const col of s.cols) {
      const top = col.u[col.u.length - 1];
      const c = take(top != null ? below(top) : []);
      val[-s.stock.pop()! - 1] = c;
      col.u.push(c);
    }
    for (const col of s.cols) settle(s, col);
    flips();
  }
  // Replay the line on the real deal, to be sure.
  const real = dealS(val, ncols, dealt);
  return playLineS(real, line) ? { s: real, line } : null;
}

/**
 * A deal that is certainly winnable, with its winning line (see buildS). `help` sets how kind the
 * deal is (0 to 1); it grows after each failed attempt.
 */
export function genS(rng: Rng, suits: number[], copies: number, ncols: number, dealt: number, help: number): Built {
  for (let t = 0; t < 200; t++) {
    const b = buildS(rng, suits, copies, ncols, dealt, Math.min(1, help + t * 0.05));
    if (b) return b;
  }
  return { s: dealS(deck(rng, suits, copies), ncols, dealt), line: null }; // never reached in practice (see test/cards.test.ts)
}
