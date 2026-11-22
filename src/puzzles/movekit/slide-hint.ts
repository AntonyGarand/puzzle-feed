/** Manhattan distance plus linear conflicts (admissible), for a sliding-tile board with 0 = gap. */
function slideH(t: ArrayLike<number>, n: number): number {
  let h = 0;
  for (let i = 0; i < t.length; i++) {
    const v = t[i];
    if (!v) continue;
    h += Math.abs(Math.floor(i / n) - Math.floor((v - 1) / n)) + Math.abs((i % n) - ((v - 1) % n));
  }
  // Two tiles in their goal row (or column) but in reverse order: one must step aside, 2 extra moves.
  for (let r = 0; r < n; r++)
    for (let a = 0; a < n; a++) {
      const va = t[r * n + a];
      if (!va || Math.floor((va - 1) / n) !== r) continue;
      for (let b = a + 1; b < n; b++) {
        const vb = t[r * n + b];
        if (vb && Math.floor((vb - 1) / n) === r && vb < va) h += 2;
      }
    }
  for (let c = 0; c < n; c++)
    for (let a = 0; a < n; a++) {
      const va = t[a * n + c];
      if (!va || (va - 1) % n !== c) continue;
      for (let b = a + 1; b < n; b++) {
        const vb = t[b * n + c];
        if (vb && (vb - 1) % n === c && vb < va) h += 2;
      }
    }
  return h;
}

/** Optimal solution by IDA*, or null when it needs more than `budget` expanded nodes. */
function idaSlide(tiles: number[], n: number, budget: number): number[] | null {
  const t = tiles.slice();
  const path: number[] = [];
  let nodes = 0;
  let gap = t.indexOf(0);
  const dfs = (g: number, bound: number, prev: number): number => {
    const h = slideH(t, n);
    if (g + h > bound) return g + h;
    if (h === 0) return -1;
    if (++nodes > budget) return Infinity;
    let min = Infinity;
    const r = Math.floor(gap / n),
      c = gap % n;
    const opts = [r > 0 ? gap - n : -1, r < n - 1 ? gap + n : -1, c > 0 ? gap - 1 : -1, c < n - 1 ? gap + 1 : -1];
    for (const x of opts) {
      if (x < 0 || x === prev) continue;
      const from = gap;
      t[gap] = t[x];
      t[x] = 0;
      gap = x;
      path.push(x);
      const res = dfs(g + 1, bound, from);
      if (res === -1) return -1;
      path.pop();
      gap = from;
      t[x] = t[from];
      t[from] = 0;
      if (res < min) min = res;
      if (nodes > budget) return Infinity;
    }
    return min;
  };
  for (let bound = slideH(t, n); ;) {
    const res = dfs(0, bound, -1);
    if (res === -1) return path;
    if (res === Infinity) return null;
    bound = res;
  }
}

/** Weighted A* (not optimal, but fast); null when it expands more than `budget` states. */
function wastarSlide(tiles: number[], n: number, w: number, budget: number): number[] | null {
  const start = tiles.join(',');
  const prev = new Map<string, [string, number]>([[start, ['', -1]]]);
  const gOf = new Map<string, number>([[start, 0]]);
  // Binary heap of [f, key, tiles].
  const heap: [number, string, number[]][] = [];
  const push = (e: [number, string, number[]]) => {
    heap.push(e);
    for (let i = heap.length - 1; i > 0;) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
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
        const l = 2 * i + 1,
          r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  push([w * slideH(tiles, n), start, tiles.slice()]);
  for (let expanded = 0; heap.length && expanded < budget; expanded++) {
    const [, key, t] = pop();
    const g = gOf.get(key)!;
    if (slideH(t, n) === 0) {
      const path: number[] = [];
      for (let s = key; s !== start;) {
        const [p, m] = prev.get(s)!;
        path.unshift(m);
        s = p;
      }
      return path;
    }
    const gap = t.indexOf(0);
    const r = Math.floor(gap / n),
      c = gap % n;
    for (const x of [r > 0 ? gap - n : -1, r < n - 1 ? gap + n : -1, c > 0 ? gap - 1 : -1, c < n - 1 ? gap + 1 : -1]) {
      if (x < 0) continue;
      const nt = t.slice();
      nt[gap] = nt[x];
      nt[x] = 0;
      const nk = nt.join(',');
      const ng = gOf.get(nk);
      if (ng != null && ng <= g + 1) continue;
      gOf.set(nk, g + 1);
      prev.set(nk, [key, x]);
      push([g + 1 + w * slideH(nt, n), nk, nt]);
    }
  }
  return null;
}

/**
 * A solution for the guide from any position (a list of cells whose tile slides into the gap):
 * optimal when IDA* finds it quickly, otherwise a weighted A* route (a bit longer, always fast).
 * Null only if the board is unsolvable (wrong parity) or every search ran out of budget.
 */
export function planSlide(tiles: number[], n: number): number[] | null {
  const best = idaSlide(tiles, n, n <= 3 ? 400000 : 30000);
  if (best) return best;
  for (const w of [3, 6]) {
    const p = wastarSlide(tiles, n, w, 20000);
    if (p) return p;
  }
  return null;
}
