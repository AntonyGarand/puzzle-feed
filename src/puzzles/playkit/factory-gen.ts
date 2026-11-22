// Board generator and evaluator for Factory. Not a PuzzleDef module.
import type { Rng } from '../../core/rng';
import { byLevel, type Difficulty } from '../../core/types';

export type Op = '+1' | '+2' | '+3' | '−1' | '−2' | '×2' | '×3' | '÷2';
/** belt: plain conveyor; slot: takes a tile; turn: sends the lane into `into`; join: adds what a turn brings; dead: past a turn. */
type Kind = 'belt' | 'slot' | 'turn' | 'join' | 'dead';

/** Largest value a belt can carry; anything outside 0..MAX (or an odd number halved) jams. */
const MAX = 99;

export function applyOp(op: Op, v: number): number | null {
  const n = Number(op[1]);
  let r: number;
  switch (op[0]) {
    case '+':
      r = v + n;
      break;
    case '−':
      r = v - n;
      break;
    case '×':
      r = v * n;
      break;
    default:
      if (v % n) return null;
      r = v / n;
  }
  return r >= 0 && r <= MAX ? r : null;
}

export interface Factory {
  rows: number;
  cols: number;
  inputs: number[];
  kinds: Kind[];
  /** For turn cells: the lane they flow into (same column). */
  into: number[];
  /** Cell index of each slot, in flow order (column by column). */
  slots: number[];
  /** Target per lane, or null when the lane turns into another one. */
  targets: (number | null)[];
  /** Tile types in the tray (shuffled), and which tray tile each slot holds in the found solution. */
  tray: Op[];
  solution: number[];
}

type Step = { t: 'slot'; lane: number; s: number } | { t: 'merge'; from: number; to: number; cell: number };

/** The board as a straight list of steps, in the order the numbers move. */
function program(f: Pick<Factory, 'rows' | 'cols' | 'kinds' | 'into' | 'slots'>): Step[] {
  const steps: Step[] = [];
  for (let c = 0; c < f.cols; c++) {
    const merges: Step[] = [];
    for (let r = 0; r < f.rows; r++) {
      const i = r * f.cols + c;
      if (f.kinds[i] === 'slot') steps.push({ t: 'slot', lane: r, s: f.slots.indexOf(i) });
      else if (f.kinds[i] === 'turn') merges.push({ t: 'merge', from: r, to: f.into[i], cell: f.into[i] * f.cols + c });
    }
    steps.push(...merges);
  }
  return steps;
}

/**
 * Value leaving every board cell (null = jammed or not reached) and arriving at each lane's output.
 * `ops[s]` is the tile in slot s, or null.
 */
export function evaluate(f: Pick<Factory, 'rows' | 'cols' | 'kinds' | 'into' | 'slots' | 'inputs'>, ops: (Op | null)[]) {
  const { rows, cols, kinds } = f;
  const cur: (number | null)[] = [...f.inputs];
  const alive = cur.map(() => true);
  const vals: (number | null)[] = kinds.map(() => null);
  for (let c = 0; c < cols; c++) {
    const merges: [number, number | null][] = [];
    for (let r = 0; r < rows; r++) {
      if (!alive[r]) continue;
      const i = r * cols + c;
      if (kinds[i] === 'slot') {
        const op = ops[f.slots.indexOf(i)];
        const v = cur[r];
        if (op && v != null) cur[r] = applyOp(op, v);
      } else if (kinds[i] === 'turn') {
        merges.push([f.into[i], cur[r]]);
        alive[r] = false;
      }
      vals[i] = cur[r];
    }
    for (const [t, v] of merges) {
      const a = cur[t];
      cur[t] = a == null || v == null || a + v > MAX ? null : a + v;
      vals[t * cols + c] = cur[t];
    }
  }
  return { vals, outs: cur.map((v, r) => (alive[r] ? v : undefined)) };
}

/**
 * Count tray placements that hit every target, stopping at `limit`. Slots may stay empty.
 * Returns `limit` too when the node budget runs out (treat as "not unique").
 */
function countSolutions(f: Factory, limit: number, budget: number): { n: number; nodes: number } {
  const steps = program(f);
  const types = [...new Set(f.tray)];
  const left = types.map((t) => f.tray.filter((x) => x === t).length);
  // A lane is settled after step k when nothing later touches it.
  const touched = (lane: number, k: number) =>
    steps.slice(k).some((s) => (s.t === 'slot' ? s.lane === lane : s.from === lane || s.to === lane));
  const settled = steps.map((_, k) => f.targets.map((tg, r) => tg != null && !touched(r, k + 1)));
  let found = 0,
    nodes = 0;
  const go = (k: number, cur: (number | null)[]): void => {
    if (found >= limit || ++nodes > budget) return;
    if (k === steps.length) {
      found++;
      return;
    }
    const st = steps[k];
    const next = (vals: (number | null)[]) => {
      for (let r = 0; r < f.rows; r++) if (settled[k][r] && vals[r] !== f.targets[r]) return;
      go(k + 1, vals);
    };
    if (st.t === 'merge') {
      const a = cur[st.to],
        b = cur[st.from];
      const v = a == null || b == null || a + b > MAX ? null : a + b;
      if (v == null) return;
      const vals = [...cur];
      vals[st.to] = v;
      next(vals);
      return;
    }
    next(cur);
    for (let j = 0; j < types.length; j++) {
      if (!left[j]) continue;
      const v = applyOp(types[j], cur[st.lane]!);
      if (v == null) continue;
      left[j]--;
      const vals = [...cur];
      vals[st.lane] = v;
      next(vals);
      left[j]++;
    }
  };
  go(0, [...f.inputs]);
  return { n: nodes > budget ? limit : found, nodes };
}

const OPS: Op[][] = [
  ['+1', '+2', '+3', '×2'],
  ['+1', '+2', '+3', '−1', '×2', '×3'],
  ['+1', '+2', '+3', '−1', '−2', '×2', '×3', '÷2'],
  ['+1', '+2', '+3', '−1', '−2', '×2', '×3', '÷2'],
  ['+1', '+2', '+3', '−1', '−2', '×2', '×3', '÷2'],
];

function attempt(d: Difficulty, r: Rng): Factory | null {
  const rows = byLevel(d, [1, 2, 3, 3, 3]);
  const cols = byLevel(d, [3, 4, 4, 5, 5]);
  const nSlots = byLevel(d, [2, 3, 4, 5, 6]);
  const merges = byLevel(d, [0, 0, 1, 1, 1]);
  const decoys = byLevel(d, [0, 1, 1, 2, 2]);
  const ops = OPS[d - 1];
  const kinds: Kind[] = Array.from({ length: rows * cols }, () => 'belt');
  const into = kinds.map(() => -1);
  for (let m = 0; m < merges; m++) {
    const from = r.pick(rows === 3 ? [0, 2] : [0, 1]);
    const to = rows === 3 ? 1 : 1 - from;
    const c = r.int(Math.max(1, cols - 3), cols - 2);
    kinds[from * cols + c] = 'turn';
    into[from * cols + c] = to;
    kinds[to * cols + c] = 'join';
    for (let cc = c + 1; cc < cols; cc++) kinds[from * cols + cc] = 'dead';
  }
  const free = kinds.map((k, i) => (k === 'belt' ? i : -1)).filter((i) => i >= 0);
  if (free.length < nSlots) return null;
  r.shuffle(free);
  for (const i of free.slice(0, nSlots)) kinds[i] = 'slot';
  const slots = kinds
    .map((k, i) => (k === 'slot' ? i : -1))
    .filter((i) => i >= 0)
    .sort((a, b) => (a % cols) - (b % cols) || a - b);
  // A lane that turns must change on the way, or the turn is just a bigger input.
  if (kinds.some((k, i) => k === 'turn' && !kinds.slice(i - (i % cols), i).includes('slot'))) return null;
  const inputs = Array.from({ length: rows }, () => r.int(1, d === 1 ? 5 : 9));
  const sol = slots.map(() => r.pick(ops));
  // Easy: two different tiles, one of them a multiplication, so the order matters.
  if (d === 1 && (sol[0] === sol[1] || !sol.includes('×2'))) return null;
  const base = { rows, cols, kinds, into, slots, inputs };
  const full = evaluate(base, sol);
  if (full.vals.some((v, i) => kinds[i] !== 'dead' && v == null)) return null;
  if (full.vals.some((v) => v != null && v > 60)) return null;
  const empty = evaluate(base, []);
  const targets = full.outs.map((v) => (v === undefined ? null : v));
  // Every output must need at least one tile.
  if (targets.some((t, k) => t != null && t === empty.outs[k])) return null;
  if (targets.some((t) => t === 0)) return null;
  const extra = Array.from({ length: decoys }, () => r.pick(ops));
  // A varied tray: no tile more than twice.
  const pool = [...sol, ...extra];
  if (pool.some((o) => pool.filter((x) => x === o).length > 2)) return null;
  const order = r.shuffle([...sol, ...extra].map((_, k) => k));
  const all = [...sol, ...extra];
  const tray = order.map((k) => all[k]);
  const solution = sol.map((_, s) => order.indexOf(s));
  return { ...base, targets, tray, solution };
}

/** A board whose tray fills its slots in exactly one way (or the fewest found within budget). */
export function genFactory(d: Difficulty, r: Rng): Factory {
  let best: Factory | null = null,
    bestCount = Infinity;
  let budget = 1_500_000;
  for (let tries = 0; tries < 4000 && budget > 0; tries++) {
    const f = attempt(d, r);
    if (!f) continue;
    const { n, nodes } = countSolutions(f, 3, Math.min(budget, 150_000));
    budget -= nodes;
    if (n < bestCount) {
      best = f;
      bestCount = n;
    }
    if (n === 1) break;
  }
  if (best) return best;
  // Fallback: a fixed single-lane board.
  const fb = {
    rows: 1,
    cols: 3,
    inputs: [3],
    kinds: ['slot', 'belt', 'slot'] as Kind[],
    into: [-1, -1, -1],
    slots: [0, 2],
  };
  return { ...fb, targets: [7], tray: ['×2', '+1'], solution: [1, 0] };
}
