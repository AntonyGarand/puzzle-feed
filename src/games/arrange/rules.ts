/**
 * Arrange, the pure part: board occupancy and fit checks, the fill solver, saved-game parsing, and
 * the reasoning behind `check()` / `hint()`. No DOM and no `ctx`, so all of it can be tested directly.
 *
 * Cells are numbered `r * cols + c`. A piece `p` is placed by the board cell of its shape's (0,0)
 * corner, in its current turn `rot[p]`.
 */
import { rotated, type ArrangePuzzle, type Shape } from './gen';

/** Where each piece sits (its shape's origin), or null while it's in the tray. */
export type Place = ([number, number] | null)[];
/** A board position: where each piece sits and how it is turned (quarter turns clockwise, 0–3). */
export type Pos = { place: Place; rot: number[] };
/** One piece dropped by the solver: piece, turn and origin. */
type Spot = { p: number; rot: number; r: number; c: number };
/** Solver outcome. `capped`: ran out of budget, so a null `sol` means "don't know" rather than "impossible". */
type SolveResult = { sol: Spot[] | null; capped: boolean };

/** Order-independent key of a shape's cells, to compare shapes. */
const shapeKey = (sh: Shape) =>
  sh
    .map((q) => q.join(','))
    .sort()
    .join(' ');

/** Piece `p`'s cells in its current turn. */
export const shapeOf = (P: ArrangePuzzle, rot: readonly number[], p: number): Shape => rotated(P.pieces[p].shape, rot[p]);

/** Board cells as owning piece index, -1 for empty. Assumes the position is legal (see `legal()`). */
export function occupancy(P: ArrangePuzzle, pos: Pos): Int16Array {
  const owner = new Int16Array(P.rows * P.cols).fill(-1);
  pos.place.forEach((o, p) => o && shapeOf(P, pos.rot, p).forEach(([r, c]) => (owner[(o[0] + r) * P.cols + o[1] + c] = p)));
  return owner;
}

/** Does `sh` placed at (r0, c0) stay inside the board and land only on empty cells of `owner`? */
export function fitsAt(P: ArrangePuzzle, owner: Int16Array, sh: Shape, r0: number, c0: number): boolean {
  return sh.every(([r, c]) => {
    const rr = r0 + r,
      cc = c0 + c;
    return rr >= 0 && rr < P.rows && cc >= 0 && cc < P.cols && owner[rr * P.cols + cc] < 0;
  });
}

/** Every piece is on the board. Placements are always legal, so this means the board is filled exactly. */
export const isSolved = (pos: Pos) => pos.place.every(Boolean);

/** Did the placement (not just turns of tray pieces) change between two positions? Decides what Undo records. */
export const placeChanged = (a: Pos, b: Pos) => a.place.some((o, p) => (o?.join() ?? '') !== (b.place[p]?.join() ?? ''));

/** Deep copy of a position (for the undo history). */
export const copyPos = (pos: Pos): Pos => ({ place: pos.place.map((o) => (o ? [o[0], o[1]] : null)), rot: pos.rot.slice() });

/** Orthogonal neighbours of cell `j` inside the board. */
function around(P: ArrangePuzzle, j: number): number[] {
  const { rows, cols } = P;
  const r = Math.floor(j / cols),
    c = j % cols;
  return [r > 0 ? j - cols : -1, r < rows - 1 ? j + cols : -1, c > 0 ? j - 1 : -1, c < cols - 1 ? j + 1 : -1].filter((x) => x >= 0);
}

/** Connected groups of cells where `free` holds, in scan order. */
export function gaps(P: ArrangePuzzle, free: (i: number) => boolean): number[][] {
  const N = P.rows * P.cols;
  const seen = new Uint8Array(N);
  const out: number[][] = [];
  for (let i = 0; i < N; i++) {
    if (!free(i) || seen[i]) continue;
    const reg = [i];
    seen[i] = 1;
    for (let t = 0; t < reg.length; t++)
      for (const x of around(P, reg[t]))
        if (free(x) && !seen[x]) {
          seen[x] = 1;
          reg.push(x);
        }
    out.push(reg);
  }
  return out;
}

/** Cells piece `p` covers in the stored solution. */
export const solCells = (P: ArrangePuzzle, p: number) =>
  P.pieces[p].shape.map(([r, c]) => (P.pieces[p].r + r) * P.cols + P.pieces[p].c + c);

/** Is piece `p` turned as in the stored solution? */
const solTurn = (P: ArrangePuzzle, rot: readonly number[], p: number) => shapeKey(shapeOf(P, rot, p)) === shapeKey(P.pieces[p].shape);

/** A placed piece sits where the stored solution has it (same turn). */
export function atHome(P: ArrangePuzzle, pos: Pos, p: number): boolean {
  const o = pos.place[p];
  return !!o && o[0] === P.pieces[p].r && o[1] === P.pieces[p].c && solTurn(P, pos.rot, p);
}

/**
 * Fill the empty cells with the pieces left (turning them when the puzzle allows it), placed pieces
 * staying put. Depth-first on the first empty cell, pruning any gap smaller than the smallest piece
 * left. Gives up after `budget` nodes (`capped`).
 */
export function solveFill(P: ArrangePuzzle, pos: Pos, budget: number): SolveResult {
  const { rows, cols, pieces } = P;
  const occ = Array.from(occupancy(P, pos), (o) => o >= 0);
  const left = pieces.map((_, p) => p).filter((p) => !pos.place[p]);
  const forms = left.map((p) => {
    const keys = new Set<string>();
    const out: { rot: number; sh: Shape }[] = [];
    for (const k of P.rotate ? [0, 1, 2, 3] : [pos.rot[p]]) {
      const sh = rotated(pieces[p].shape, k);
      const key = shapeKey(sh);
      if (keys.has(key)) continue;
      keys.add(key);
      out.push({ rot: k, sh });
    }
    return out;
  });
  const minSize = Math.min(...left.map((p) => pieces[p].shape.length));
  const used = new Uint8Array(left.length);
  const out: Spot[] = [];
  let nodes = 0;
  let capped = false;
  const rec = (): boolean => {
    const i = occ.indexOf(false);
    if (i < 0) return true;
    if (++nodes > budget) {
      capped = true;
      return false;
    }
    if (gaps(P, (x) => !occ[x]).some((g) => g.length < minSize)) return false;
    const R = Math.floor(i / cols),
      C = i % cols;
    const tried = new Set<string>();
    for (let k = 0; k < left.length; k++) {
      if (used[k]) continue;
      for (const f of forms[k]) {
        const key = shapeKey(f.sh);
        if (tried.has(key)) continue;
        tried.add(key);
        const r0 = R - f.sh[0][0],
          c0 = C - f.sh[0][1];
        const ix = f.sh.map(([r, c]) => (r0 + r >= 0 && r0 + r < rows && c0 + c >= 0 && c0 + c < cols ? (r0 + r) * cols + c0 + c : -1));
        if (ix.some((x) => x < 0 || occ[x])) continue;
        for (const x of ix) occ[x] = true;
        used[k] = 1;
        out.push({ p: left[k], rot: f.rot, r: r0, c: c0 });
        if (rec()) return true;
        out.pop();
        used[k] = 0;
        for (const x of ix) occ[x] = false;
        if (capped) return false;
      }
    }
    return false;
  };
  const ok = rec();
  return { sol: ok ? out : null, capped: !ok && capped };
}

/**
 * `solveFill` with a 4000-node budget, remembering the last result until a piece moves (or, when
 * turning is off, turns), so `check()` and `hint()` can share it cheaply.
 */
export function makeSolver(P: ArrangePuzzle): (pos: Pos) => SolveResult {
  let memo: (SolveResult & { key: string }) | null = null;
  return (pos) => {
    const key = JSON.stringify([pos.place, P.rotate ? 0 : pos.rot]);
    if (memo?.key !== key) memo = { key, ...solveFill(P, pos, 4000) };
    return memo;
  };
}

const ROT = new Set([0, 1, 2, 3]);
const isRot = (v: unknown) => ROT.has(v as number);
const isCell = (q: unknown): q is [number, number] => Array.isArray(q) && q.length === 2 && q.every(Number.isInteger);

/** Each piece inside the board with no overlap (turns ignored when the puzzle doesn't allow them). */
export function legal(P: ArrangePuzzle, o: Pos): boolean {
  const { rows, cols, pieces } = P;
  const seen = new Set<number>();
  return o.place.every(
    (q, p) =>
      !q ||
      rotated(pieces[p].shape, P.rotate ? o.rot[p] : 0).every(([r, c]) => {
        const rr = q[0] + r,
          cc = q[1] + c,
          i = rr * cols + cc;
        if (rr < 0 || rr >= rows || cc < 0 || cc >= cols || seen.has(i)) return false;
        seen.add(i);
        return true;
      }),
  );
}

/** Is `v` shaped like a `Pos` for this puzzle (right lengths, turns 0–3, integer origins near the board)? */
function okPos(P: ArrangePuzzle, v: unknown): v is Pos {
  const K = P.pieces.length;
  const o = v as Pos | null;
  return (
    !!o &&
    Array.isArray(o.rot) &&
    o.rot.length === K &&
    o.rot.every(isRot) &&
    Array.isArray(o.place) &&
    o.place.length === K &&
    o.place.every((q) => q === null || (isCell(q) && q[0] >= -4 && q[0] < P.rows && q[1] >= -4 && q[1] < P.cols))
  );
}

/**
 * Restore `ctx.saved` (`{ rot, place, hist }`) over the fresh position `pos` (whose `rot` holds the
 * dealt turns), defensively: bad turns are ignored, a piece is placed only where it fits after the
 * pieces before it, the board never resumes solved (the last piece goes back to the tray), and the
 * undo history is kept only if every entry is a legal position. Returns the history.
 */
export function restore(P: ArrangePuzzle, pos: Pos, saved: unknown): Pos[] {
  const K = P.pieces.length;
  const sv = saved as { rot?: unknown; place?: unknown; hist?: unknown } | undefined;
  if (Array.isArray(sv?.rot) && sv.rot.length === K && sv.rot.every(isRot)) {
    (sv.rot as number[]).forEach((v, p) => (pos.rot[p] = P.rotate ? v : 0));
  }
  if (Array.isArray(sv?.place) && sv.place.length === K) {
    (sv.place as unknown[]).forEach((o, p) => {
      if (isCell(o) && fitsAt(P, occupancy(P, pos), shapeOf(P, pos.rot, p), o[0], o[1])) pos.place[p] = [o[0], o[1]];
    });
    if (isSolved(pos)) pos.place[K - 1] = null; // never resume already solved
  }
  const svHist = sv?.hist;
  if (Array.isArray(svHist) && svHist.every((o) => okPos(P, o) && legal(P, o)))
    return (svHist as Pos[]).map((o) => ({ place: o.place, rot: P.rotate ? o.rot : o.rot.map(() => 0) }));
  return [];
}

/** Why the board can't be finished, as found by `deadEnd()`. */
type DeadEnd = {
  /** The misplaced piece to send back: the one touching `gap` the most. */
  p: number;
  /** The smallest empty gap. */
  gap: number[];
  /** `gap` is smaller than every piece left, so nothing can fill it. */
  small: boolean;
};

/**
 * For `check()`: when some piece is off its solution spot and the solver proves the empty cells
 * can't be filled, which piece to send back and why. Null when the board can still be finished,
 * every placed piece is at home, or the solver ran out of budget.
 */
export function deadEnd(P: ArrangePuzzle, pos: Pos, solve: (pos: Pos) => SolveResult): DeadEnd | null {
  const { pieces } = P;
  const owner = occupancy(P, pos);
  const off = pieces.map((_, p) => p).filter((p) => pos.place[p] && !atHome(P, pos, p));
  if (!off.length) return null;
  const res = solve(pos);
  if (res.sol || res.capped) return null;
  const left = pieces.map((_, p) => p).filter((p) => !pos.place[p]);
  const minSize = Math.min(...left.map((p) => pieces[p].shape.length));
  // The smallest empty gap, and the misplaced piece that touches it most.
  const gap = gaps(P, (i) => owner[i] < 0).sort((a, b) => a.length - b.length)[0] ?? [];
  const touch = (p: number) => gap.filter((i) => around(P, i).some((x) => owner[x] === p)).length;
  const p = [...off].sort((a, b) => touch(b) - touch(a))[0];
  return { p, gap, small: gap.length > 0 && gap.length < minSize };
}

/** The guide's rules for dropping a tray piece at its solution spot, tried in turn (skipping the last one used). */
type DropRule = 'gap' | 'corner' | 'big';
const DROP_RULES: DropRule[] = ['gap', 'corner', 'big'];

/** The next step the guide suggests; `index.ts` turns it into text and board elements. */
type Step =
  /** Off the stored solution but still finishable: turn tray piece `p` to match the solver's way. */
  | { kind: 'alt-turn'; p: number }
  /** Off the stored solution but still finishable: drop the solver's next piece. */
  | { kind: 'alt-drop'; spot: Spot }
  /** A piece away from its solution spot: send it back to the tray. */
  | { kind: 'send-back'; p: number }
  /** A walled-off gap with exactly piece `p`'s shape (`last`: it's the only piece left). */
  | { kind: 'gap'; p: number; size: number; last: boolean }
  /** Piece `p` fills an empty corner at its solution spot. */
  | { kind: 'corner'; p: number }
  /** The biggest piece left (`edge`: its solution spot touches the border). */
  | { kind: 'big'; p: number; size: number; edge: boolean }
  /** Every piece left needs turning first: turn `p`. */
  | { kind: 'turn'; p: number };

/**
 * For `hint()`: the next step from `pos`. If the board left the stored solution, follow the
 * solver's way when it can still be finished, else send a misplaced piece back. Otherwise drop a
 * tray piece at its solution spot, by the first drop rule that applies (rules are tried starting
 * after `lastRule`, so consecutive hints vary). Null when every piece is placed.
 */
export function nextStep(P: ArrangePuzzle, pos: Pos, solve: (pos: Pos) => SolveResult, lastRule: string): Step | null {
  const { rows, cols, pieces } = P;
  const N = rows * cols;
  const K = pieces.length;
  const owner = occupancy(P, pos);
  if (pieces.some((_, p) => pos.place[p] && !atHome(P, pos, p))) {
    const { sol } = solve(pos);
    if (sol) {
      const sp = sol[0];
      if (!sp) return null;
      if (shapeKey(shapeOf(P, pos.rot, sp.p)) !== shapeKey(rotated(pieces[sp.p].shape, sp.rot))) return { kind: 'alt-turn', p: sp.p };
      return { kind: 'alt-drop', spot: sp };
    }
  }
  for (let p = 0; p < K; p++) if (pos.place[p] && !atHome(P, pos, p)) return { kind: 'send-back', p };
  const left = pieces.map((_, p) => p).filter((p) => !pos.place[p]);
  if (!left.length) return null;
  const turned = (p: number) => solTurn(P, pos.rot, p);
  const regions = gaps(P, (i) => owner[i] < 0);
  const rules: Record<DropRule, () => Step | null> = {
    gap: () => {
      for (const reg of regions)
        for (const p of left) {
          const want = solCells(P, p);
          if (want.length !== reg.length || !want.every((i) => reg.includes(i))) continue;
          if (!turned(p)) continue;
          return { kind: 'gap', p, size: reg.length, last: left.length === 1 };
        }
      return null;
    },
    corner: () => {
      const corners = [0, cols - 1, (rows - 1) * cols, N - 1].filter((i) => owner[i] < 0);
      for (const i of corners) {
        const p = left.find((q) => solCells(P, q).includes(i));
        if (p == null || !turned(p)) continue;
        return { kind: 'corner', p };
      }
      return null;
    },
    big: () => {
      const p = [...left].filter(turned).sort((a, b) => pieces[b].shape.length - pieces[a].shape.length)[0];
      if (p == null) return null;
      const edge = solCells(P, p).some((i) => i < cols || i >= N - cols || i % cols === 0 || i % cols === cols - 1);
      return { kind: 'big', p, size: pieces[p].shape.length, edge };
    },
  };
  const last = DROP_RULES.find((r) => r === lastRule);
  for (const r of [...DROP_RULES.filter((o) => o !== last), ...(last ? [last] : [])]) {
    const found = rules[r]();
    if (found) return found;
  }
  // Every piece left needs turning first.
  return { kind: 'turn', p: left[0] };
}
