import type { Rng } from '../../core/rng';
import { byLevel, type Difficulty } from '../../core/types';
import { baseSeed, subRng } from '../../kits/move/kit';

/**
 * Swap (match-3), turn-based: swap two neighbouring gems to line up 3 or more of a kind. Lines clear,
 * the gems above fall, new gems drop in, and new lines clear in a cascade. Reach the target score
 * within the move budget.
 *
 * Refills are random but reproducible: refill or reshuffle number `k` draws from `subRng(base, k)`, so a
 * saved `(grid, k)` resumes exactly.
 */

export interface Level {
  /** Board side (cells). */
  n: number;
  colours: number;
  moves: number;
  target: number;
}

/** Bigger boards, more colours (fewer lucky cascades) and a target that takes better moves. */
export const levelFor = (d: Difficulty): Level =>
  byLevel(d, [
    { n: 6, colours: 5, moves: 10, target: 750 },
    { n: 7, colours: 5, moves: 12, target: 1700 },
    { n: 7, colours: 6, moves: 15, target: 1200 },
    { n: 8, colours: 6, moves: 18, target: 2100 },
    { n: 8, colours: 7, moves: 20, target: 1450 },
  ]);

/** Points for one line of 3, 4, or 5 and more (times the cascade step: 1, 2, 3…). */
export const lineScore = (len: number) => (len >= 5 ? 100 : len === 4 ? 60 : 30);

export interface State extends Level {
  /** Row-major colour per cell. */
  grid: number[];
  score: number;
  /** Seed of the refills, and how many refills/reshuffles have been drawn so far. */
  base: number;
  k: number;
}

/** Every horizontal or vertical run of 3+ equal gems (cells), ignoring empty (-1) cells. */
export function findLines(grid: readonly number[], n: number): number[][] {
  const out: number[][] = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n;) {
      const v = grid[r * n + c];
      let e = c + 1;
      while (e < n && grid[r * n + e] === v) e++;
      if (v >= 0 && e - c >= 3) out.push(Array.from({ length: e - c }, (_, k) => r * n + c + k));
      c = e;
    }
  for (let c = 0; c < n; c++)
    for (let r = 0; r < n;) {
      const v = grid[r * n + c];
      let e = r + 1;
      while (e < n && grid[e * n + c] === v) e++;
      if (v >= 0 && e - r >= 3) out.push(Array.from({ length: e - r }, (_, k) => (r + k) * n + c));
      r = e;
    }
  return out;
}

export const hasLine = (grid: readonly number[], n: number) => findLines(grid, n).length > 0;

export const adjacent = (n: number, a: number, b: number) =>
  a >= 0 &&
  b >= 0 &&
  a < n * n &&
  b < n * n &&
  ((Math.abs(a - b) === 1 && Math.floor(a / n) === Math.floor(b / n)) || Math.abs(a - b) === n);

function swapCells(grid: number[], a: number, b: number) {
  [grid[a], grid[b]] = [grid[b], grid[a]];
}

/** Every swap that makes a line, as [a, b] pairs (b to the right of or below a). */
export function validMoves(grid: readonly number[], n: number): [number, number][] {
  const g = [...grid];
  const out: [number, number][] = [];
  for (let i = 0; i < n * n; i++)
    for (const j of [i % n < n - 1 ? i + 1 : -1, i + n < n * n ? i + n : -1]) {
      if (j < 0 || g[i] === g[j]) continue;
      swapCells(g, i, j);
      if (hasLine(g, n)) out.push([i, j]);
      swapCells(g, i, j);
    }
  return out;
}

export const hasMove = (grid: readonly number[], n: number) => validMoves(grid, n).length > 0;

/** A colour for cell i that doesn't complete a line with the two gems left of it or above it. */
function safeColour(grid: number[], n: number, i: number, colours: number, rng: Rng): number {
  const bad = new Set<number>();
  if (i % n >= 2 && grid[i - 1] === grid[i - 2]) bad.add(grid[i - 1]);
  if (i >= 2 * n && grid[i - n] === grid[i - 2 * n]) bad.add(grid[i - n]);
  return rng.pick([...Array(colours).keys()].filter((k) => !bad.has(k)));
}

/** Fill a board with no line already made and at least one valid swap. */
function deal(n: number, colours: number, rng: Rng): number[] {
  for (;;) {
    const grid: number[] = [];
    for (let i = 0; i < n * n; i++) grid.push(safeColour(grid, n, i, colours, rng));
    if (hasMove(grid, n)) return grid;
  }
}

export function createLevel(d: Difficulty, rng: Rng): State {
  const lv = levelFor(d);
  const grid = deal(lv.n, lv.colours, rng);
  return { ...lv, grid, score: 0, base: baseSeed(rng), k: 0 };
}

/** One cascade step of a move: the lines cleared and the points they scored. */
interface Step {
  lines: number[][];
  chain: number;
  points: number;
}

/** What a move did, for the display: its steps, and where every gem on the board came from. */
export interface MoveResult {
  steps: Step[];
  /** Per cell: the cell its gem started the move in, or -1 for a new gem (dropped in). */
  from: number[];
  /** New gems per column (how far above the board they start). */
  dropped: number[];
  reshuffled: boolean;
  outcome: Outcome;
}

type Outcome = '' | 'win' | 'lose';

/** Clear the lines, let gems fall and refill from the top. `from` follows each gem. */
function collapse(s: State, from: number[], dropped: number[]) {
  const { n, grid } = s;
  const rng = subRng(s.base, s.k++);
  for (let c = 0; c < n; c++) {
    let w = n - 1;
    for (let r = n - 1; r >= 0; r--) {
      const i = r * n + c;
      if (grid[i] < 0) continue;
      grid[w * n + c] = grid[i];
      from[w * n + c] = from[i];
      w--;
    }
    dropped[c] += w + 1;
    for (let r = w; r >= 0; r--) {
      grid[r * n + c] = rng.int(0, s.colours - 1);
      from[r * n + c] = -1;
    }
  }
}

/** Shuffle the gems in place until no line is made and a swap exists (when the board is stuck). */
export function reshuffle(s: State) {
  const rng = subRng(s.base, s.k++);
  for (let tries = 0; tries < 200; tries++) {
    rng.shuffle(s.grid);
    if (!hasLine(s.grid, s.n) && hasMove(s.grid, s.n)) return;
  }
  s.grid = deal(s.n, s.colours, rng);
}

/** Score a set of lines at a cascade step. */
const stepPoints = (lines: number[][], chain: number) => lines.reduce((a, l) => a + lineScore(l.length), 0) * chain;

/**
 * Play a move: swap two neighbouring gems, then clear, fall and refill until the board settles. Null
 * (and nothing changes) when the swap is refused: not neighbours, out of moves, or no line made.
 */
export function play(s: State, a: number, b: number): MoveResult | null {
  if (s.moves <= 0 || s.score >= s.target || !adjacent(s.n, a, b) || s.grid[a] === s.grid[b]) return null;
  swapCells(s.grid, a, b);
  if (!hasLine(s.grid, s.n)) {
    swapCells(s.grid, a, b);
    return null;
  }
  s.moves--;
  const from = s.grid.map((_, i) => i);
  [from[a], from[b]] = [b, a];
  const dropped = Array<number>(s.n).fill(0);
  const steps: Step[] = [];
  for (let lines = findLines(s.grid, s.n); lines.length; lines = findLines(s.grid, s.n)) {
    const chain = steps.length + 1;
    const points = stepPoints(lines, chain);
    s.score += points;
    steps.push({ lines, chain, points });
    for (const l of lines) for (const i of l) s.grid[i] = -1;
    collapse(s, from, dropped);
  }
  let reshuffled = false;
  let outcome: Outcome = '';
  if (s.score >= s.target) outcome = 'win';
  else if (s.moves <= 0) outcome = 'lose';
  else if (!hasMove(s.grid, s.n)) {
    reshuffle(s);
    reshuffled = true;
  }
  return { steps, from, dropped, reshuffled, outcome };
}

/** What a swap is sure to do, judged only from the gems on the board (refills are unknown). */
export interface Preview {
  a: number;
  b: number;
  /** Lines the swap itself makes. */
  lines: number[][];
  /** Lines made by gems already on the board falling into place (sure cascades). */
  falls: number[][];
  points: number;
}

/** Simulate a swap with unknown refills: clear, let the known gems fall, repeat while lines form. */
export function preview(s: Pick<State, 'grid' | 'n'>, a: number, b: number): Preview | null {
  const { n } = s;
  const g = [...s.grid];
  swapCells(g, a, b);
  const lines = findLines(g, n);
  if (!lines.length) return null;
  let points = stepPoints(lines, 1);
  const falls: number[][] = [];
  let cur = lines;
  for (let chain = 2; cur.length; chain++) {
    for (const l of cur) for (const i of l) g[i] = -1;
    // Gravity only: empty cells (-1) float to the top and never match.
    for (let c = 0; c < n; c++) {
      const col = [];
      for (let r = n - 1; r >= 0; r--) if (g[r * n + c] >= 0) col.push(g[r * n + c]);
      for (let r = n - 1, k = 0; r >= 0; r--, k++) g[r * n + c] = col[k] ?? -1;
    }
    cur = findLines(g, n);
    if (cur.length) {
      points += stepPoints(cur, chain);
      falls.push(...cur);
    }
  }
  return { a, b, lines, falls, points };
}

/**
 * The guide's pick: the swap with the most sure points; ties go to the lowest swap on the board (it
 * shakes up more gems, so the refills have more chances to cascade).
 */
export function bestMove(s: Pick<State, 'grid' | 'n'>): Preview | null {
  let best: Preview | null = null;
  for (const [a, b] of validMoves(s.grid, s.n)) {
    const p = preview(s, a, b);
    if (!p) continue;
    if (!best || p.points > best.points || (p.points === best.points && Math.max(a, b) > Math.max(best.a, best.b))) best = p;
  }
  return best;
}

/** Restore a saved board defensively: null unless it's a settled, playable position of this level. */
export function restore(s: State, v: unknown): State | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Partial<Record<'grid' | 'score' | 'moves' | 'k', unknown>>;
  const { grid, score, moves, k } = o;
  if (!Array.isArray(grid) || grid.length !== s.n * s.n || !grid.every((x) => Number.isInteger(x) && x >= 0 && x < s.colours)) return null;
  if (!Number.isInteger(score) || !Number.isInteger(moves) || !Number.isInteger(k)) return null;
  const sc = score as number,
    mv = moves as number,
    kk = k as number;
  if (sc < 0 || sc >= s.target || mv < 1 || mv > s.moves || kk < 0) return null;
  const g = grid as number[];
  if (hasLine(g, s.n) || !hasMove(g, s.n)) return null;
  return { ...s, grid: [...g], score: sc, moves: mv, k: kk };
}
