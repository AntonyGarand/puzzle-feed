import type { Rng } from '../../core/rng';
import { byLevel, type Difficulty } from '../../core/types';

/** Three pegs: 0 left, 1 middle, 2 right. */
export const PEGS = 3;

/** Where each ring sits: `pos[i]` is the peg of ring `i` (0 is the smallest). */
export type Pos = number[];

export interface Move {
  ring: number;
  from: number;
  to: number;
}

export interface Rings {
  n: number;
  start: Pos;
  goal: Pos;
  /** Fewest moves from each state (see `code`) to the goal. */
  dist: Int16Array;
}

export const code = (pos: Pos) => pos.reduce((c, p, i) => c + p * PEGS ** i, 0);

/** The smallest ring on a peg, or -1 when it's empty. */
const top = (pos: Pos, peg: number) => pos.indexOf(peg);

/** The move from one peg to another, or null when the source is empty or the top ring is bigger. */
export function legal(pos: Pos, from: number, to: number): Move | null {
  if (from === to) return null;
  const a = top(pos, from);
  if (a < 0) return null;
  const b = top(pos, to);
  return b >= 0 && b < a ? null : { ring: a, from, to };
}

export function moves(pos: Pos): Move[] {
  const out: Move[] = [];
  for (let from = 0; from < PEGS; from++)
    for (let to = 0; to < PEGS; to++) {
      const m = legal(pos, from, to);
      if (m) out.push(m);
    }
  return out;
}

export const apply = (pos: Pos, m: Move): Pos => pos.map((p, i) => (i === m.ring ? m.to : p));

const decode = (c: number, n: number): Pos => Array.from({ length: n }, (_, i) => Math.floor(c / PEGS ** i) % PEGS);

/** Breadth-first distances from every state to `goal` (moves are reversible, so one search covers all). */
export function distances(goal: Pos): Int16Array {
  const n = goal.length;
  const dist = new Int16Array(PEGS ** n).fill(-1);
  const g = code(goal);
  dist[g] = 0;
  const queue = [g];
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q];
    for (const m of moves(decode(c, n))) {
      const d = c + (m.to - m.from) * PEGS ** m.ring;
      if (dist[d] < 0) {
        dist[d] = dist[c] + 1;
        queue.push(d);
      }
    }
  }
  return dist;
}

/** The moves that bring the position one step closer to the goal. */
export const bestMoves = (pos: Pos, dist: Int16Array) => {
  const here = dist[code(pos)];
  return moves(pos).filter((m) => dist[code(apply(pos, m))] === here - 1);
};

/** The biggest ring that isn't on its goal peg, or -1 when solved. */
export function biggestOut(pos: Pos, goal: Pos) {
  for (let i = pos.length - 1; i >= 0; i--) if (pos[i] !== goal[i]) return i;
  return -1;
}

/** Fewest moves to stack rings 0..k on `peg` (the classic recursive count). */
export function towerCost(pos: Pos, k: number, peg: number): number {
  for (let j = k; j >= 0; j--) if (pos[j] !== peg) return towerCost(pos, j - 1, PEGS - pos[j] - peg) + 2 ** j;
  return 0;
}

/** The first move of the shortest way to stack rings 0..k on `peg`, or null when they already are. */
export function towerMove(pos: Pos, k: number, peg: number): Move | null {
  for (let j = k; j >= 0; j--) if (pos[j] !== peg) return towerMove(pos, j - 1, PEGS - pos[j] - peg) ?? { ring: j, from: pos[j], to: peg };
  return null;
}

/**
 * Easy is the classic tower from the left peg to the right one; Medium starts scattered and stacks
 * on one peg; harder levels go from one scattered layout to another, with more rings.
 */
export function genRings(rng: Rng, d: Difficulty): Rings {
  const n = byLevel(d, [3, 4, 5, 6, 7]);
  if (d === 1) {
    const goal = new Array<number>(n).fill(2);
    return { n, start: new Array<number>(n).fill(0), goal, dist: distances(goal) };
  }
  const [lo, hi] = byLevel(d, [
    [0, 0],
    [9, 15],
    [13, 22],
    [24, 40],
    [42, 70],
  ] as const);
  const scatter = () => Array.from({ length: n }, () => rng.int(0, PEGS - 1));
  let best: Rings | null = null;
  let bestGap = Infinity;
  for (let attempt = 0; attempt < 40; attempt++) {
    const goal = d === 2 ? new Array<number>(n).fill(rng.int(0, PEGS - 1)) : scatter();
    const dist = distances(goal);
    for (let t = 0; t < 30; t++) {
      const start = scatter();
      const k = dist[code(start)];
      const gap = k < lo ? lo - k : k > hi ? k - hi : 0;
      if (k > 0 && gap < bestGap) {
        best = { n, start, goal, dist };
        bestGap = gap;
        if (!gap) return best;
      }
    }
  }
  return best!;
}
