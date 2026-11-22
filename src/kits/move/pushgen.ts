import type { Rng } from '../../core/rng';

export interface Room {
  w: number;
  h: number;
  /** true = floor */
  floor: boolean[];
  targets: number[];
  boxes: number[];
  player: number;
  /** Minimum pushes (verified by BFS), or -1 if the solver ran out of budget. */
  pushes: number;
}

/** Neighbour of cell i in direction d (0 up, 1 right, 2 down, 3 left), or -1 off the grid. */
export const stepper = (w: number, h: number) => (i: number, d: number) => {
  const r = Math.floor(i / w),
    c = i % w;
  if (d === 0) return r === 0 ? -1 : i - w;
  if (d === 2) return r === h - 1 ? -1 : i + w;
  if (d === 1) return c === w - 1 ? -1 : i + 1;
  return c === 0 ? -1 : i - 1;
};

/** Cells a box could still be pushed from onto some target (ignores other boxes). */
export function liveCells(w: number, h: number, floor: boolean[], targets: number[]) {
  const nb = stepper(w, h);
  const live = new Array<boolean>(w * h).fill(false);
  const q = [...targets];
  targets.forEach((t) => (live[t] = true));
  while (q.length) {
    const y = q.pop()!;
    for (let d = 0; d < 4; d++) {
      // the box reached y moving in direction d: it was at x = y - d, the player at x - d
      const x = nb(y, (d + 2) % 4);
      if (x < 0 || !floor[x] || live[x]) continue;
      const p = nb(x, (d + 2) % 4);
      if (p < 0 || !floor[p]) continue;
      live[x] = true;
      q.push(x);
    }
  }
  return live;
}

/**
 * Crates that can never reach a target again (cheap checks only): an off-target crate on a cell no
 * push can bring to any target (corners, walls without targets), or a 2×2 square packed with walls
 * and crates where one of the crates is off target (none of them can move).
 */
export function stuckCrates(
  w: number,
  h: number,
  floor: boolean[],
  targets: number[],
  boxes: number[],
  live = liveCells(w, h, floor, targets),
) {
  const tset = new Set(targets);
  const bset = new Set(boxes);
  const out = new Set<number>();
  for (const b of boxes) if (!tset.has(b) && !live[b]) out.add(b);
  const blocked = (r: number, c: number) => r < 0 || c < 0 || r >= h || c >= w || !floor[r * w + c] || bset.has(r * w + c);
  for (let r = -1; r < h; r++)
    for (let c = -1; c < w; c++) {
      const sq = [
        [r, c],
        [r, c + 1],
        [r + 1, c],
        [r + 1, c + 1],
      ];
      if (!sq.every(([y, x]) => blocked(y, x))) continue;
      const crates = sq.filter(([y, x]) => y >= 0 && x >= 0 && y < h && x < w && bset.has(y * w + x)).map(([y, x]) => y * w + x);
      if (crates.some((b) => !tset.has(b))) for (const b of crates) if (!tset.has(b)) out.add(b);
    }
  return [...out];
}

/** Push-optimal BFS. Returns min pushes, or -1 when unsolvable or out of node/time budget. */
function solvePushes(
  w: number,
  h: number,
  floor: boolean[],
  targets: number[],
  boxes: number[],
  player: number,
  cap = 20000,
  work: { left: number } = { left: Infinity },
): number {
  const nb = stepper(w, h);
  const n = w * h;
  const live = liveCells(w, h, floor, targets);
  const tset = new Set(targets);
  const isGoal = (bs: number[]) => bs.every((b) => tset.has(b));
  const occ = new Uint8Array(n);
  const cur = new Uint8Array(n);
  const tmp = new Uint8Array(n);
  const q = new Int32Array(n);
  const reach = (bs: number[], p: number, out: Uint8Array) => {
    occ.fill(0);
    out.fill(0);
    for (const b of bs) occ[b] = 1;
    let len = 0;
    q[len++] = p;
    out[p] = 1;
    let min = p;
    for (let k = 0; k < len; k++) {
      const x = q[k];
      if (x < min) min = x;
      for (let d = 0; d < 4; d++) {
        const y = nb(x, d);
        if (y < 0 || !floor[y] || occ[y] || out[y]) continue;
        out[y] = 1;
        q[len++] = y;
      }
    }
    return min;
  };
  if (isGoal(boxes)) return 0;
  if (boxes.some((b) => !live[b])) return -1;
  const start = [...boxes].sort((a, b) => a - b);
  const seen = new Set<string>();
  let frontier: { bs: number[]; p: number }[] = [{ bs: start, p: player }];
  seen.add(`${start.join(',')}|${reach(start, player, tmp)}`);
  for (let depth = 1; frontier.length; depth++) {
    const next: typeof frontier = [];
    for (const { bs, p } of frontier) {
      if (--work.left < 0) return -1;
      reach(bs, p, cur);
      for (let k = 0; k < bs.length; k++) {
        const b = bs[k];
        for (let d = 0; d < 4; d++) {
          const from = nb(b, (d + 2) % 4);
          const to = nb(b, d);
          if (from < 0 || to < 0 || !cur[from] || !floor[to] || bs.includes(to) || !live[to]) continue;
          const nbs = bs.slice();
          nbs[k] = to;
          nbs.sort((x, y) => x - y);
          if (isGoal(nbs)) return depth;
          const key = `${nbs.join(',')}|${reach(nbs, b, tmp)}`;
          if (seen.has(key)) continue;
          if (seen.size >= cap) return -1;
          seen.add(key);
          next.push({ bs: nbs, p: b });
        }
      }
    }
    frontier = next;
  }
  return -1;
}

/** Random walls (probability `wallP`), keeping only the largest connected floor area. */
export function makeFloor(w: number, h: number, rng: Rng, wallP: number) {
  const nb = stepper(w, h);
  const floor = Array.from({ length: w * h }, () => !rng.chance(wallP));
  // keep the largest connected component
  const comp = new Int32Array(w * h).fill(-1);
  let best = -1,
    bestSize = 0;
  for (let i = 0, id = 0; i < w * h; i++) {
    if (!floor[i] || comp[i] >= 0) continue;
    const q = [i];
    comp[i] = id;
    for (let k = 0; k < q.length; k++)
      for (let d = 0; d < 4; d++) {
        const y = nb(q[k], d);
        if (y >= 0 && floor[y] && comp[y] < 0) {
          comp[y] = id;
          q.push(y);
        }
      }
    if (q.length > bestSize) {
      bestSize = q.length;
      best = id;
    }
    id++;
  }
  return floor.map((f, i) => f && comp[i] === best);
}

/** BFS distance map over floor from a cell. */
export function dist(w: number, h: number, floor: boolean[], from: number) {
  const nb = stepper(w, h);
  const dd = new Array<number>(w * h).fill(-1);
  dd[from] = 0;
  const q = [from];
  for (let k = 0; k < q.length; k++)
    for (let d = 0; d < 4; d++) {
      const y = nb(q[k], d);
      if (y >= 0 && floor[y] && dd[y] < 0) {
        dd[y] = dd[q[k]] + 1;
        q.push(y);
      }
    }
  return dd;
}

/**
 * Reverse play: start solved, walk the player around pulling boxes. Every pull sequence reversed is a
 * valid push solution, so the result is always solvable. Among several walks we keep the hardest.
 * Budgets are deterministic (solver states / attempts), so a resumed puzzle regenerates identically.
 */
export function generateRoom(rng: Rng, w: number, h: number, nBoxes: number, minPush: number, budget = 20000, maxAttempts = 300): Room {
  const work = { left: budget };
  const nb = stepper(w, h);
  let best: Room | null = null;
  let bestScore = -Infinity;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (work.left <= 0) break;
    const floor = makeFloor(w, h, rng, 0.17 + rng.next() * 0.15);
    const cells = floor.map((f, i) => (f ? i : -1)).filter((i) => i >= 0);
    if (cells.length < nBoxes * 3 + 8) continue;
    const deg = (i: number) =>
      [0, 1, 2, 3].filter((d) => {
        const y = nb(i, d);
        return y >= 0 && floor[y];
      }).length;
    const ok = cells.filter((i) => deg(i) >= 2);
    if (ok.length < nBoxes + 1) continue;
    const targets = rng.shuffle(ok.slice()).slice(0, nBoxes);
    const tdist = targets.map((t) => dist(w, h, floor, t));
    const boxes = targets.slice();
    let player = rng.pick(cells.filter((i) => !boxes.includes(i)));
    const steps = 150 + nBoxes * 120;
    let lastDir = -1;
    // Track the walk state whose boxes sit farthest (by floor distance) from the targets.
    let snap = { boxes: boxes.slice(), player, far: -1 };
    for (let s = 0; s < steps; s++) {
      const d = lastDir >= 0 && rng.chance(0.5) ? lastDir : rng.int(0, 3);
      const nx = nb(player, d);
      if (nx < 0 || !floor[nx] || boxes.includes(nx)) continue;
      const behind = nb(player, (d + 2) % 4);
      const bi = behind >= 0 ? boxes.indexOf(behind) : -1;
      const pulled = bi >= 0 && rng.chance(0.85);
      if (pulled) boxes[bi] = player;
      player = nx;
      lastDir = d;
      if (pulled) {
        let far = 0;
        for (const b of boxes) far += Math.min(...tdist.map((t) => t[b]));
        if (boxes.some((b) => targets.includes(b))) far -= 2;
        if (far > snap.far) snap = { boxes: boxes.slice(), player, far };
      }
    }
    if (snap.far < 0) continue;
    const bs = snap.boxes;
    const onTarget = bs.filter((b) => targets.includes(b)).length;
    if (onTarget === nBoxes) continue;
    // Exact push count for small puzzles; with 3+ boxes the summed box-to-target distance (a lower
    // bound on pushes) is used instead, which keeps generation fast.
    const exact = nBoxes <= 2;
    const pushes = exact ? solvePushes(w, h, floor, targets, bs, snap.player, 15000, work) : -1;
    if (pushes === 0) continue;
    const score = (pushes > 0 ? pushes : snap.far) - onTarget * 3;
    if (score > bestScore) {
      bestScore = score;
      best = { w, h, floor, targets, boxes: bs.slice(), player: snap.player, pushes };
    }
    if (score >= minPush && onTarget === 0) break;
  }
  if (best) return best;
  // Fallback (practically unreachable): one box two steps from its target in an open room.
  const floor = new Array<boolean>(w * h).fill(true);
  const t = w + 1;
  return { w, h, floor, targets: [t], boxes: [t + 1], player: t + 2, pushes: 1 };
}
