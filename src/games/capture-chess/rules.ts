/**
 * Capture-only chess, the pure part: rules, solver, generator, saved-game parsing and the reasoning
 * behind `check()` / `hint()`. No DOM and no `ctx`, so all of it can be tested directly.
 *
 * Board: `type[sq]` (0 empty, 1 pawn … 6 king), `used[sq]` captures already made by that piece.
 * Pawns capture one square diagonally upward and never promote. A move is `from * 64 + to`.
 */
import type { Rng } from '../../core/rng';
import { byLevel, type Difficulty } from '../../core/types';

export const PAWN = 1,
  KNIGHT = 2,
  BISHOP = 3,
  ROOK = 4,
  QUEEN = 5,
  KING = 6;
const KN = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
];
const ORTH = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
const DIAG = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];
const ALL = [...ORTH, ...DIAG];

/** A position: piece type and captures already made, per square. Treated as immutable. */
export interface Pos {
  type: Int8Array;
  used: Int8Array;
}
/** A generated puzzle: board size, capture limit, start position and one known winning line. */
export interface Game {
  n: number;
  /** Max captures per piece (0: unlimited). */
  limit: number;
  start: Pos;
  /** A known winning line (from the generator). */
  line: number[];
}

/** Square a move starts from. */
export const mFrom = (m: number) => m >> 6;
/** Square a move captures on. */
export const mTo = (m: number) => m & 63;

/** Squares the piece on `sq` attacks (first piece along each line for sliders). */
function attacks(n: number, type: Int8Array, sq: number): number[] {
  const r = Math.floor(sq / n),
    c = sq % n,
    p = type[sq];
  const inside = (rr: number, cc: number) => rr >= 0 && rr < n && cc >= 0 && cc < n;
  const out: number[] = [];
  if (p === PAWN) {
    for (const dc of [-1, 1]) if (inside(r - 1, c + dc) && type[(r - 1) * n + c + dc]) out.push((r - 1) * n + c + dc);
  } else if (p === KNIGHT || p === KING) {
    for (const [dr, dc] of p === KNIGHT ? KN : ALL)
      if (inside(r + dr, c + dc) && type[(r + dr) * n + c + dc]) out.push((r + dr) * n + c + dc);
  } else if (p) {
    for (const [dr, dc] of p === BISHOP ? DIAG : p === ROOK ? ORTH : ALL) {
      for (let rr = r + dr, cc = c + dc; inside(rr, cc); rr += dr, cc += dc) {
        if (type[rr * n + cc]) {
          out.push(rr * n + cc);
          break;
        }
      }
    }
  }
  return out;
}

/**
 * Every legal capture in `s` (or only those of the piece on `only`), in square order. A piece that
 * has used up its captures (`g.limit`) can't move.
 */
export function moves(g: Game, s: Pos, only = -1): number[] {
  const out: number[] = [];
  for (let sq = 0; sq < g.n * g.n; sq++) {
    if (!s.type[sq] || (only >= 0 && sq !== only) || (g.limit && s.used[sq] >= g.limit)) continue;
    for (const t of attacks(g.n, s.type, sq)) out.push(sq * 64 + t);
  }
  return out;
}

/** The position after capture `m` (not checked for legality; `s` is left untouched). */
export function apply(s: Pos, m: number): Pos {
  const f = mFrom(m),
    t = mTo(m);
  const type = s.type.slice(),
    used = s.used.slice();
  type[t] = type[f];
  used[t] = used[f] + 1;
  type[f] = used[f] = 0;
  return { type, used };
}

/** Pieces on the board. The puzzle is solved when this reaches 1. */
export const count = (s: Pos) => s.type.reduce((a, p) => a + (p ? 1 : 0), 0);

/** The position reached by playing `line` from the start. */
export const replay = (g: Game, line: readonly number[]) => line.reduce(apply, g.start);

/** More than one piece left and no capture possible: a dead end that only Undo gets out of. */
export const noCaptures = (g: Game, s: Pos) => count(s) > 1 && !moves(g, s).length;

/** Do the moves played so far still follow the generator's winning line? */
const onLine = (g: Game, done: readonly number[]) => done.every((m, i) => m === g.line[i]);

/**
 * Can `s` still be cleared down to one piece? Memoised DFS; null if the node budget runs out.
 * Pass the same `memo` across calls to reuse proven results (a position never changes meaning).
 */
export function solver(g: Game, budget: number, memo = new Map<string, boolean>()) {
  let left = budget;
  const key = (s: Pos) => String.fromCharCode(...s.type.map((p, i) => p * 4 + s.used[i] + 48));
  const wins = (s: Pos): boolean | null => {
    const c = count(s);
    if (c === 1) return true;
    // Each capture removes one piece: the army needs at least c - 1 captures left in total.
    if (g.limit && s.type.reduce((a, p, i) => a + (p ? g.limit - s.used[i] : 0), 0) < c - 1) return false;
    const k = key(s);
    const m = memo.get(k);
    if (m != null) return m;
    if (--left < 0) return null;
    let unknown = false;
    for (const mv of moves(g, s)) {
      const w = wins(apply(s, mv));
      if (w) {
        memo.set(k, true);
        return true;
      }
      if (w == null) unknown = true;
    }
    if (unknown) return null;
    memo.set(k, false);
    return false;
  };
  return wins;
}

// ---------- generation: build backwards from one piece ----------

interface Level {
  n: number;
  pieces: number;
  pawns: boolean;
  limit: number;
  /** Target share of random playouts that clear the board (lower = harder). */
  target: number;
}
const LEVELS: Record<Difficulty, Level> = {
  1: { n: 4, pieces: 4, pawns: false, limit: 0, target: 0.4 },
  2: { n: 5, pieces: 6, pawns: true, limit: 0, target: 0.2 },
  3: { n: 5, pieces: 7, pawns: true, limit: 2, target: 0.1 },
  4: { n: 6, pieces: 9, pawns: true, limit: 2, target: 0.04 },
  5: { n: 6, pieces: 12, pawns: true, limit: 2, target: 0 },
};
const WEIGHTS: [number, number][] = [
  [PAWN, 3],
  [KNIGHT, 3],
  [BISHOP, 3],
  [ROOK, 3],
  [QUEEN, 1],
  [KING, 2],
];

function pickType(rng: Rng, pawns: boolean, row: number): number {
  const ws = WEIGHTS.filter(([p]) => p !== PAWN || (pawns && row > 0));
  let x = rng.next() * ws.reduce((a, [, w]) => a + w, 0);
  for (const [p, w] of ws) if ((x -= w) < 0) return p;
  return ROOK;
}

/** Empty squares the piece now on `t` could have captured from. */
function origins(n: number, type: Int8Array, t: number): number[] {
  const r = Math.floor(t / n),
    c = t % n,
    p = type[t];
  const inside = (rr: number, cc: number) => rr >= 0 && rr < n && cc >= 0 && cc < n;
  const out: number[] = [];
  if (p === PAWN) {
    for (const dc of [-1, 1]) if (inside(r + 1, c + dc) && !type[(r + 1) * n + c + dc]) out.push((r + 1) * n + c + dc);
  } else if (p === KNIGHT || p === KING) {
    for (const [dr, dc] of p === KNIGHT ? KN : ALL)
      if (inside(r + dr, c + dc) && !type[(r + dr) * n + c + dc]) out.push((r + dr) * n + c + dc);
  } else {
    for (const [dr, dc] of p === BISHOP ? DIAG : p === ROOK ? ORTH : ALL) {
      for (let rr = r + dr, cc = c + dc; inside(rr, cc) && !type[rr * n + cc]; rr += dr, cc += dc) out.push(rr * n + cc);
    }
  }
  return out;
}

/** One random solvable position (with its winning line), or null if the backwards build got stuck. */
function build(rng: Rng, lv: Level): Game | null {
  const { n } = lv;
  const type = new Int8Array(n * n);
  const future = new Int8Array(n * n); // captures each piece still makes in the winning line
  const last = rng.int(0, n * n - 1);
  type[last] = pickType(rng, lv.pawns, Math.floor(last / n));
  const line: number[] = [];
  for (let k = 1; k < lv.pieces; k++) {
    const opts: [number, number][] = [];
    for (let t = 0; t < n * n; t++) {
      if (!type[t] || (lv.limit && future[t] >= lv.limit)) continue;
      for (const f of origins(n, type, t)) opts.push([f, t]);
    }
    if (!opts.length) return null;
    const [f, t] = rng.pick(opts);
    type[f] = type[t];
    future[f] = future[t] + 1;
    type[t] = pickType(rng, lv.pawns, Math.floor(t / n));
    future[t] = 0;
    line.unshift(f * 64 + t);
  }
  return { n, limit: lv.limit, start: { type, used: new Int8Array(n * n) }, line };
}

/** Share of random playouts that clear the board. */
function easiness(rng: Rng, g: Game, tries: number): number {
  let ok = 0;
  for (let k = 0; k < tries; k++) {
    let s = g.start;
    for (let ms = moves(g, s); ms.length; ms = moves(g, s)) s = apply(s, rng.pick(ms));
    if (count(s) === 1) ok++;
  }
  return ok / tries;
}

/**
 * A puzzle for difficulty `d`: positions are built backwards from a single piece (so they are
 * always solvable), and the one whose random-playout success rate is closest to the level's
 * target wins. Same `rng` state, same puzzle.
 */
export function generate(rng: Rng, d: Difficulty): Game {
  const lv = LEVELS[d];
  let best: Game | null = null,
    bestScore = Infinity;
  for (let a = 0, found = 0; a < 200 && found < byLevel(d, [10, 14, 16, 20, 30]); a++) {
    const g = build(rng, lv);
    if (!g || !moves(g, g.start).length) continue;
    found++;
    const e = easiness(rng, g, 80);
    // Never trivial: at least one first move must be a mistake on small boards.
    const score = Math.abs(e - lv.target) + (e > 0.9 ? 1 : 0);
    if (score < bestScore) {
      best = g;
      bestScore = score;
    }
  }
  if (best) return best;
  // Fallback (4×4): rook a1 takes knight a3, which takes bishop b1, which takes king d3.
  const type = new Int8Array(16);
  type[12] = ROOK; // a1
  type[4] = KNIGHT; // a3
  type[13] = BISHOP; // b1
  type[7] = KING; // d3
  return { n: 4, limit: 0, start: { type, used: new Int8Array(16) }, line: [12 * 64 + 4, 4 * 64 + 13, 13 * 64 + 7] };
}

// ---------- saved games ----------

/** The longest legal prefix of a saved line of captures (never a finished board). */
export function legalLine(g: Game, v: unknown): number[] {
  const out: number[] = [];
  if (!Array.isArray(v)) return out;
  let s = g.start;
  for (const m of v) {
    if (typeof m !== 'number' || !moves(g, s).includes(m) || count(s) <= 2) break;
    s = apply(s, m);
    out.push(m);
  }
  return out;
}

/** A saved game, checked: moves played, lines taken back by Restart (oldest first), selected square or -1. */
interface Saved {
  moves: number[];
  restarts: number[][];
  sel: number;
}

/**
 * Parse `ctx.saved` (`{ moves, sel, restarts }`) defensively: illegal tails are dropped, at most
 * 20 restarts are kept, and the selection must be a piece in the resumed position.
 */
export function parseSaved(g: Game, saved: unknown): Saved {
  const out: Saved = { moves: [], restarts: [], sel: -1 };
  if (!saved || typeof saved !== 'object') return out;
  const sv = saved as { moves?: unknown; sel?: unknown; restarts?: unknown };
  out.moves = legalLine(g, sv.moves);
  if (Array.isArray(sv.restarts))
    for (const r of sv.restarts.slice(-20)) {
      const line = legalLine(g, r);
      if (line.length) out.restarts.push(line);
    }
  const cur = replay(g, out.moves);
  const sel = sv.sel;
  if (typeof sel === 'number' && Number.isInteger(sel) && sel >= 0 && sel < g.n * g.n && cur.type[sel]) out.sel = sel;
  return out;
}

// ---------- guide ----------

/** The capture that turned a winnable board into a lost one, as found by `findMistake()`. */
interface Mistake {
  /** Position just before the mistake. */
  before: Pos;
  move: number;
  /** How many Undos take it back. */
  back: number;
  /** After the mistake no capture was possible at all (rather than a longer dead end). */
  noCapture: boolean;
}

/**
 * For `check()`: if the current line can no longer be won, the first capture that lost it.
 * Null when the line is still winnable, still follows the known winning line, or the solver runs
 * out of budget (unknown is not proof).
 */
export function findMistake(g: Game, done: readonly number[], memo: Map<string, boolean>): Mistake | null {
  if (!done.length || onLine(g, done)) return null;
  const wins = solver(g, 30000, memo);
  if (wins(replay(g, done)) !== false) return null;
  let s = g.start;
  let k = 0;
  for (; k < done.length - 1; k++) {
    const nx = apply(s, done[k]);
    if (wins(nx) === false) break;
    s = nx;
  }
  const move = done[k];
  return { before: s, move, back: done.length - k, noCapture: !moves(g, apply(s, move)).length };
}

/** Reasons the guide can give for a capture, in order of preference. */
type HintKind = 'start' | 'last' | 'only' | 'dead' | 'reach' | 'limit' | 'plan' | 'plain';

/** What `hint()` should say, as computed from the position alone; `index.ts` turns it into text. */
type HintPlan =
  /** No capture is possible: take back the last move. */
  | { type: 'stuck' }
  /** Captures exist but all of them are proven to lose: take back the last move. */
  | { type: 'lost' }
  | {
      type: 'capture';
      /** The capture to suggest. */
      move: number;
      /** Every legal capture now. */
      all: number[];
      /** Captures proven to lose. */
      bad: number[];
      /** A losing capture after which nothing can capture at all (for the 'dead' reason). */
      dead: number | null;
      /** Reasons that apply to `move`, best first (always ends with 'plain'). */
      kinds: HintKind[];
    };

/**
 * For `hint()`: the next capture to make from `cur` (after `done`), and the reasons that justify
 * it. On the generator's line its next move is known to win and is preferred, so the guide follows
 * a stable plan; elsewhere the solver picks the first capture proven to keep a win, or one it
 * couldn't rule out. Null when there is nothing to suggest (no capture and nothing to undo).
 */
export function planHint(g: Game, cur: Pos, done: readonly number[], memo: Map<string, boolean>): HintPlan | null {
  const all = moves(g, cur);
  if (!all.length) return done.length ? { type: 'stuck' } : null;
  const line = onLine(g, done);
  // On the generator's line its next move is known to win: the solver only sizes up the others,
  // within a small budget. Off the line, stop at the first capture proven to keep a win.
  const wins = solver(g, line ? 4000 : 30000, memo);
  const verdict: (boolean | null)[] = [];
  for (const m of all) {
    if (line && m === g.line[done.length]) verdict.push(true);
    else if (!line && verdict.includes(true)) verdict.push(null);
    else verdict.push(wins(apply(cur, m)));
  }
  let good = all.filter((_, i) => verdict[i]);
  if (!good.length && line) good = [g.line[done.length]];
  // Out of budget isn't proof of a dead end: try a capture the solver couldn't rule out.
  if (!good.length) good = all.filter((_, i) => verdict[i] == null).slice(0, 1);
  if (!good.length) return { type: 'lost' };
  const bad = all.filter((_, i) => verdict[i] === false);
  // Prefer the generator's line when it's still open, so the guide follows a stable plan.
  const move = line && good.includes(g.line[done.length]) ? g.line[done.length] : good[0];
  const f = mFrom(move),
    t = mTo(move);
  const kinds: HintKind[] = [];
  if (!done.length) kinds.push('start');
  if (count(cur) === 2) kinds.push('last');
  if (all.length === 1) kinds.push('only');
  const dead = bad.find((m) => !moves(g, apply(cur, m)).length) ?? null;
  if (dead != null) kinds.push('dead');
  // A piece that only this one can still reach must be taken now (or used before it's stranded).
  if (all.filter((m) => mTo(m) === t).length === 1 && all.length > 1) kinds.push('reach');
  if (g.limit && cur.used[f] === g.limit - 1) kinds.push('limit');
  if (bad.length) kinds.push('plan');
  kinds.push('plain');
  return { type: 'capture', move, all, bad, dead, kinds };
}
