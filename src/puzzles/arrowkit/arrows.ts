import type { Rng } from '../../core/rng';

/** Directions: 0 up, 1 right, 2 down, 3 left. */
export const DR = [-1, 0, 1, 0];
export const DC = [0, 1, 0, -1];

export interface Arrow {
  /** Cells from the head (index 0) to the tail; consecutive cells are orthogonal neighbours. */
  cells: number[];
  /** Direction the head points (and the whole arrow slides). */
  dir: number;
}

/** Cells from just past the head to the board edge, in the arrow's direction. */
export function ray(n: number, head: number, dir: number): number[] {
  const out: number[] = [];
  let r = Math.floor(head / n) + DR[dir],
    c = (head % n) + DC[dir];
  while (r >= 0 && r < n && c >= 0 && c < n) {
    out.push(r * n + c);
    r += DR[dir];
    c += DC[dir];
  }
  return out;
}

function neighbours(n: number, i: number): number[] {
  const r = Math.floor(i / n),
    c = i % n;
  const out: number[] = [];
  if (r > 0) out.push(i - n);
  if (c < n - 1) out.push(i + 1);
  if (r < n - 1) out.push(i + n);
  if (c > 0) out.push(i - 1);
  return out;
}

/** Index of the first arrow (other than `self`) on `a`'s path to the edge, or -1 when the way is clear. */
export function blocker(n: number, a: Arrow, occ: ArrayLike<number>): { at: number; by: number } {
  const path = ray(n, a.cells[0], a.dir);
  for (let k = 0; k < path.length; k++) if (occ[path[k]] >= 0) return { at: k, by: occ[path[k]] };
  return { at: path.length, by: -1 };
}

/**
 * Fill an n×n board with arrows that can all leave. Every arrow gets a rank (its turn in a clearing
 * order, highest first): an arrow's way out may only cross arrows that leave before it, and its cells
 * may only sit on the ways out of arrows that leave after it. Random arrows are placed newest-first,
 * then the gaps are filled by growing arrows (tail backwards, head forwards) and by slotting short
 * arrows in at whatever rank still works.
 */
function fill(n: number, maxLen: number, rng: Rng): Arrow[] {
  const occ = new Int16Array(n * n).fill(-1);
  const arrows: Arrow[] = [];
  const rank: number[] = [];
  /** For each cell, the arrows whose way out crosses it. */
  const lanes: number[][] = Array.from({ length: n * n }, () => []);
  const add = (cells: number[], dir: number, r: number) => {
    const id = arrows.length;
    arrows.push({ cells, dir });
    rank.push(r);
    for (const j of cells) occ[j] = id;
    for (const j of ray(n, cells[0], dir)) lanes[j].push(id);
  };
  /** Highest rank among the arrows (other than `self`) whose way out crosses `cells`. */
  const laneMax = (cells: number[], self = -1) => {
    let m = -Infinity;
    for (const j of cells) for (const o of lanes[j]) if (o !== self) m = Math.max(m, rank[o]);
    return m;
  };
  const behindOf = (head: number, dir: number) => {
    const r = Math.floor(head / n) - DR[dir],
      c = (head % n) - DC[dir];
    return r < 0 || r >= n || c < 0 || c >= n ? -1 : r * n + c;
  };
  /** Random walk from [head, behind] through empty cells, mostly straight, never onto `banned`. */
  const walk = (cells: number[], dir: number, want: number, banned: Set<number>) => {
    let heading = (dir + 2) % 4;
    while (cells.length < want) {
      const last = cells[cells.length - 1];
      const opts = neighbours(n, last).filter((j) => occ[j] < 0 && !banned.has(j) && !cells.includes(j));
      if (!opts.length) break;
      const straight = last + DR[heading] * n + DC[heading];
      const next = opts.includes(straight) && rng.chance(0.55) ? straight : rng.pick(opts);
      const dr = Math.floor(next / n) - Math.floor(last / n);
      heading = dr === -1 ? 0 : dr === 1 ? 2 : next > last ? 1 : 3;
      cells.push(next);
    }
    return cells;
  };

  // 1. Random arrows, each newer than all before it: its way out must be empty.
  let placed = true;
  while (placed) {
    placed = false;
    for (const head of rng.shuffle([...Array(n * n).keys()].filter((i) => occ[i] < 0))) {
      if (occ[head] >= 0) continue;
      for (const dir of rng.shuffle([0, 1, 2, 3])) {
        const way = ray(n, head, dir);
        const behind = behindOf(head, dir);
        if (behind < 0 || occ[behind] >= 0 || way.some((j) => occ[j] >= 0)) continue;
        add(walk([head, behind], dir, rng.int(2, maxLen), new Set(way)), dir, arrows.length);
        placed = true;
        break;
      }
    }
  }

  // 2. Fill the gaps.
  /** Grow arrows into empty cells; returns whether anything changed. */
  const grow = (cap: number) => {
    let any = false;
    for (const id of rng.shuffle([...arrows.keys()])) {
      const a = arrows[id];
      if (a.cells.length >= cap) continue;
      const head = a.cells[0];
      const own = new Set(ray(n, head, a.dir));
      const opts = neighbours(n, a.cells[a.cells.length - 1]).filter((j) => occ[j] < 0 && !own.has(j) && laneMax([j], id) < rank[id]);
      // The head may also step forward onto its own way out.
      const front = own.size ? ray(n, head, a.dir)[0] : -1;
      const fwd = front >= 0 && occ[front] < 0 && laneMax([front], id) < rank[id];
      if (!opts.length && !fwd) continue;
      if (fwd && (!opts.length || rng.chance(0.5))) {
        a.cells.unshift(front);
        lanes[front] = lanes[front].filter((o) => o !== id);
        occ[front] = id;
      } else {
        const j = rng.pick(opts);
        a.cells.push(j);
        occ[j] = id;
      }
      any = true;
    }
    return any;
  };
  /** Slot short arrows into empty pairs wherever some rank satisfies both rules. */
  const slot = () => {
    let any = false;
    for (const head of rng.shuffle([...Array(n * n).keys()])) {
      if (occ[head] >= 0) continue;
      for (const dir of rng.shuffle([0, 1, 2, 3])) {
        const behind = behindOf(head, dir);
        if (behind < 0 || occ[behind] >= 0) continue;
        const way = ray(n, head, dir);
        const cells = walk([head, behind], dir, rng.int(2, Math.max(2, maxLen - 2)), new Set(way));
        const lo = laneMax(cells);
        let hi = Infinity;
        for (const j of way) if (occ[j] >= 0) hi = Math.min(hi, rank[occ[j]]);
        if (lo >= hi) continue;
        add(cells, dir, hi === Infinity ? Math.max(lo, arrows.length) + 1 : lo === -Infinity ? hi - 1 : (lo + hi) / 2);
        any = true;
        break;
      }
    }
    return any;
  };
  for (const cap of [maxLen + 1, maxLen * 2]) while (grow(cap) || slot());
  return arrows;
}

/** Order in which a player removing every free arrow at once would clear the board: rounds of ids. */
export function rounds(n: number, arrows: Arrow[]): number[][] | null {
  const occ = new Int16Array(n * n).fill(-1);
  arrows.forEach((a, id) => a.cells.forEach((j) => (occ[j] = id)));
  const left = new Set(arrows.keys());
  const out: number[][] = [];
  while (left.size) {
    const free = [...left].filter((id) => blocker(n, arrows[id], occ).by < 0);
    if (!free.length) return null;
    for (const id of free) {
      left.delete(id);
      for (const j of arrows[id].cells) occ[j] = -1;
    }
    out.push(free);
  }
  return out;
}

/** Best of a few boards: fewest empty cells, then the most rounds to clear (longest chain of blockers). */
export function genArrows(n: number, maxLen: number, tries: number, rng: Rng): Arrow[] {
  let best: Arrow[] = [],
    bestScore = -1;
  for (let t = 0; t < tries; t++) {
    const a = fill(n, maxLen, rng);
    const r = rounds(n, a);
    if (!r) continue; // can't happen by construction; skip defensively
    // Deep chains, and few arrows free at the start.
    const empty = n * n - a.reduce((s, x) => s + x.cells.length, 0);
    const score = r.length * 10 - r[0].length - empty * 25;
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}
