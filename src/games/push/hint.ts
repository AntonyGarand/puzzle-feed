import { liveCells, stepper } from '../../kits/move/pushgen';

export interface PushStep {
  /** Crate cell before the push. */
  box: number;
  /** 0 up, 1 right, 2 down, 3 left. */
  dir: number;
}

/** Why a crate is beyond rescue, for the guide's explanations. */
type DeadCrate = { box: number; why: 'dead' | 'frozen' };

/**
 * Crates that can never reach a target any more, whatever happens: off every target and either on a
 * dead square (a corner, or along a wall with no target, where no push can bring it back) or wedged in
 * a 2×2 block of walls and crates. Both rules are sound, so the solver may prune with them.
 */
export function deadCrates(
  w: number,
  h: number,
  floor: boolean[],
  targets: number[],
  boxes: number[],
  live = liveCells(w, h, floor, targets),
) {
  const tset = new Set(targets);
  const bset = new Set(boxes);
  const out: DeadCrate[] = [];
  const blocked = (r: number, c: number) => r < 0 || c < 0 || r >= h || c >= w || !floor[r * w + c] || bset.has(r * w + c);
  for (const b of boxes) {
    if (tset.has(b)) continue;
    if (!live[b]) {
      out.push({ box: b, why: 'dead' });
      continue;
    }
    const r = Math.floor(b / w),
      c = b % w;
    for (const [dr, dc] of [
      [-1, -1],
      [-1, 0],
      [0, -1],
      [0, 0],
    ])
      if (blocked(r + dr, c + dc) && blocked(r + dr, c + dc + 1) && blocked(r + dr + 1, c + dc) && blocked(r + dr + 1, c + dc + 1)) {
        out.push({ box: b, why: 'frozen' });
        break;
      }
  }
  return out;
}

/** Search outcome: `capped` means the budget ran out (no proof either way). */
export interface PushPlan {
  sol: PushStep[] | null;
  capped: boolean;
}

/**
 * A short push solution from the current position (A* on pushes, crates on dead squares or frozen in a
 * 2×2 block pruned), for the guide. `sol` is null when there is none (`capped` false: proven) or the
 * budget of explored positions ran out (`capped` true).
 */
export function planPush(
  w: number,
  h: number,
  floor: boolean[],
  targets: number[],
  boxes: number[],
  player: number,
  cap = 30000,
  live = liveCells(w, h, floor, targets),
): PushPlan {
  const nb = stepper(w, h);
  const tset = new Set(targets);
  const wall = (i: number) => i < 0 || !floor[i];
  if (boxes.every((b) => tset.has(b))) return { sol: [], capped: false };
  if (deadCrates(w, h, floor, targets, boxes, live).length) return { sol: null, capped: false };
  // Pushes from each cell to the nearest target, ignoring other crates (reverse pulls from the targets).
  const far = new Int32Array(w * h).fill(1 << 20);
  {
    const q = [...targets];
    targets.forEach((t) => (far[t] = 0));
    for (let k = 0; k < q.length; k++) {
      const y = q[k];
      for (let d = 0; d < 4; d++) {
        const x = nb(y, d);
        const p = x >= 0 ? nb(x, d) : -1;
        if (wall(x) || wall(p) || far[x] <= far[y] + 1) continue;
        far[x] = far[y] + 1;
        q.push(x);
      }
    }
  }
  const est = (bx: number[]) => bx.reduce((a, b) => a + far[b], 0);
  const seen = new Uint8Array(w * h);
  const reach = (p: number, bset: Set<number>) => {
    seen.fill(0);
    const q = [p];
    seen[p] = 1;
    let min = p;
    for (let k = 0; k < q.length; k++)
      for (let d = 0; d < 4; d++) {
        const y = nb(q[k], d);
        if (wall(y) || seen[y] || bset.has(y)) continue;
        seen[y] = 1;
        if (y < min) min = y;
        q.push(y);
      }
    return min;
  };
  const frozenAt = (to: number, bset: Set<number>) => {
    if (tset.has(to)) return false;
    const blocked = (r: number, c: number) => r < 0 || c < 0 || r >= h || c >= w || !floor[r * w + c] || bset.has(r * w + c);
    const r = Math.floor(to / w),
      c = to % w;
    for (const [dr, dc] of [
      [-1, -1],
      [-1, 0],
      [0, -1],
      [0, 0],
    ])
      if (blocked(r + dr, c + dc) && blocked(r + dr, c + dc + 1) && blocked(r + dr + 1, c + dc) && blocked(r + dr + 1, c + dc + 1))
        return true;
    return false;
  };
  type Node = { bx: number[]; p: number; g: number; key: string };
  const keyOf = (bx: number[], p: number) => `${[...bx].sort((a, b) => a - b).join(',')}|${reach(p, new Set(bx))}`;
  const k0 = keyOf(boxes, player);
  const prev = new Map<string, { from: string; step: PushStep } | null>([[k0, null]]);
  const best = new Map<string, number>([[k0, 0]]);
  // Binary heap on f = g + est (ties: deeper first).
  const heap: [number, Node][] = [];
  const push = (f: number, n: Node) => {
    heap.push([f, n]);
    for (let i = heap.length - 1; i > 0;) {
      const p = (i - 1) >> 1;
      if (heap[p][0] < heap[i][0] || (heap[p][0] === heap[i][0] && heap[p][1].g >= heap[i][1].g)) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const less = (a: [number, Node], b: [number, Node]) => a[0] < b[0] || (a[0] === b[0] && a[1].g > b[1].g);
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1,
          r = l + 1;
        let m = i;
        if (l < heap.length && less(heap[l], heap[m])) m = l;
        if (r < heap.length && less(heap[r], heap[m])) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top[1];
  };
  push(est(boxes), { bx: boxes.slice(), p: player, g: 0, key: k0 });
  let expanded = 0;
  while (heap.length) {
    const { bx, p, g, key } = pop();
    if (best.get(key)! < g) continue;
    if (bx.every((b) => tset.has(b))) {
      const path: PushStep[] = [];
      for (let s = key; s !== k0;) {
        const e = prev.get(s)!;
        path.unshift(e.step);
        s = e.from;
      }
      return { sol: path, capped: false };
    }
    if (++expanded > cap) return { sol: null, capped: true };
    const bset = new Set(bx);
    reach(p, bset);
    const can = seen.slice();
    for (let bi = 0; bi < bx.length; bi++) {
      const b = bx[bi];
      for (let d = 0; d < 4; d++) {
        const behind = nb(b, (d + 2) % 4);
        const to = nb(b, d);
        if (behind < 0 || !can[behind] || wall(to) || bset.has(to) || !live[to]) continue;
        const nbx = bx.slice();
        nbx[bi] = to;
        const nset = new Set(nbx);
        if (frozenAt(to, nset)) continue;
        const nk = keyOf(nbx, b);
        const ng = g + 1;
        if ((best.get(nk) ?? Infinity) <= ng) continue;
        best.set(nk, ng);
        prev.set(nk, { from: key, step: { box: b, dir: d } });
        push(ng + est(nbx), { bx: nbx, p: b, g: ng, key: nk });
      }
    }
  }
  return { sol: null, capped: false };
}

/**
 * Fewest-pushes solution from the current position, for the guide: the list of pushes, or null when
 * none is found within the budget. Crates in non-target corners are pruned.
 */
export function solvePush(
  w: number,
  h: number,
  floor: boolean[],
  targets: number[],
  boxes: number[],
  player: number,
  cap = 120000,
): PushStep[] | null {
  return planPush(w, h, floor, targets, boxes, player, cap).sol;
}
