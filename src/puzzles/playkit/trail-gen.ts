import type { Rng } from '../../core/rng';
import { byLevel, type Difficulty } from '../../core/types';
import { nbrs } from '../pathkit/grid';

export interface TrailPuzzle {
  n: number;
  /** The generated solution: every cell once, start at mark 1, end at the last mark. */
  path: number[];
  /** cell -> checkpoint number (0 = none). */
  marks: number[];
  /** Number of checkpoints (the last one ends the path). */
  last: number;
  /** Walls between orthogonal neighbours, as `wallKey(a, b)`. */
  walls: number[];
}

/** Key of the edge between neighbouring cells a and b (order-free). */
export const wallKey = (a: number, b: number) => (a < b ? a * 4096 + b : b * 4096 + a);

/** Random Hamiltonian path on an n x n grid: serpentine, then many backbite moves. */
function hamPath(rng: Rng, n: number): number[] {
  const N = n * n;
  const p: number[] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) p.push(r * n + (r % 2 ? n - 1 - c : c));
  const reverse = (lo: number, hi: number) => {
    for (; lo < hi; lo++, hi--) [p[lo], p[hi]] = [p[hi], p[lo]];
  };
  for (let it = 0; it < N * 40; it++) {
    if (rng.chance(0.5)) reverse(0, N - 1);
    const end = p[N - 1];
    const x = rng.pick(nbrs(end, n, n));
    if (x === p[N - 2]) continue;
    reverse(p.indexOf(x) + 1, N - 1);
  }
  return p;
}

interface SolveResult {
  /** A solution different from `path`, if found. */
  alt: number[] | null;
  /** The search ran out of budget before finishing. */
  exhausted: boolean;
}

/** Look for a second solution (any solution other than `path`) with a node budget. */
function findAlt(
  n: number,
  marks: number[],
  last: number,
  walls: Set<number>,
  path: number[],
  budget: number,
): SolveResult & { used: number } {
  const N = n * n;
  const adj = Array.from({ length: N }, (_, i) => nbrs(i, n, n).filter((j) => !walls.has(wallKey(i, j))));
  const end = path[N - 1];
  const vis = new Uint8Array(N);
  const cur: number[] = [path[0]];
  vis[path[0]] = 1;
  let nodes = 0;
  let alt: number[] | null = null;
  let exhausted = false;
  const stack = new Int16Array(N);
  const seen = new Uint8Array(N);

  /** Unvisited cells stay connected to the head, and no non-final cell is a dead end. */
  const ok = (head: number, left: number) => {
    for (let i = 0; i < N; i++) {
      if (vis[i]) continue;
      let deg = 0;
      for (const j of adj[i]) if (!vis[j] || j === head) deg++;
      if (deg < (i === end ? 1 : 2)) return false;
    }
    seen.fill(0);
    let sp = 0,
      cnt = 0;
    for (const j of adj[head])
      if (!vis[j] && !seen[j]) {
        seen[j] = 1;
        stack[sp++] = j;
      }
    while (sp) {
      const i = stack[--sp];
      cnt++;
      for (const j of adj[i])
        if (!vis[j] && !seen[j]) {
          seen[j] = 1;
          stack[sp++] = j;
        }
    }
    return cnt === left;
  };

  const dfs = (head: number, next: number, count: number): boolean => {
    if (count === N) {
      if (head === end && cur.some((v, i) => v !== path[i])) {
        alt = cur.slice();
        return true;
      }
      return false;
    }
    if (++nodes > budget) {
      exhausted = true;
      return true;
    }
    if (head === end) return false;
    if (!ok(head, N - count)) return false;
    for (const j of adj[head]) {
      if (vis[j]) continue;
      const m = marks[j];
      if (m && m !== next) continue;
      if (m === last && count + 1 !== N) continue;
      vis[j] = 1;
      cur.push(j);
      const stop = dfs(j, m ? next + 1 : next, count + 1);
      cur.pop();
      vis[j] = 0;
      if (stop) return true;
    }
    return false;
  };
  dfs(path[0], 2, 1);
  return { alt, exhausted, used: nodes };
}

/** Does `seq` visit the checkpoint cells (path indexes `cps`, in order) in increasing order? */
const respects = (seq: number[], path: number[], cps: number[]) => {
  const at = new Map(seq.map((c, i) => [c, i]));
  let prev = -1;
  for (const k of cps) {
    const i = at.get(path[k])!;
    if (i < prev) return false;
    prev = i;
  }
  return true;
};

export function genTrail(rng: Rng, d: Difficulty): TrailPuzzle {
  const n = byLevel(d, [5, 6, 6, 7, 8]);
  const N = n * n;
  const k0 = byLevel(d, [9, 8, 7, 7, 7]);
  const w0 = byLevel(d, [0, 0, 2, 4, 6]);
  const useWalls = d >= 3;
  const path = hamPath(rng, n);
  // checkpoints as path indexes: both ends plus evenly spread interior picks
  const cps = new Set([0, N - 1]);
  const inner = k0 - 2;
  for (let g = 0; g < inner; g++) {
    const lo = 1 + Math.floor((g * (N - 2)) / inner),
      hi = Math.floor(((g + 1) * (N - 2)) / inner);
    cps.add(rng.int(lo, Math.max(lo, hi)));
  }
  const used = new Set<number>();
  for (let i = 1; i < N; i++) used.add(wallKey(path[i - 1], path[i]));
  const free: number[] = [];
  for (let i = 0; i < N; i++) for (const j of nbrs(i, n, n)) if (i < j && !used.has(wallKey(i, j))) free.push(wallKey(i, j));
  rng.shuffle(free);
  const walls = new Set(free.slice(0, w0));

  const marksOf = () => {
    const marks = new Array<number>(N).fill(0);
    [...cps].sort((a, b) => a - b).forEach((k, m) => (marks[path[k]] = m + 1));
    return marks;
  };
  // Tighten until the solution is unique (or the search budget runs out: then the rules still decide).
  let budget = 120000;
  for (let round = 0; round < 60 && budget > 0; round++) {
    const res = findAlt(n, marksOf(), cps.size, walls, path, Math.min(budget, 40000));
    budget -= res.used;
    if (res.exhausted) {
      // Too open to search: add a checkpoint in the largest gap and try again.
      const s = [...cps].sort((a, b) => a - b);
      let gi = 0;
      for (let i = 1; i < s.length; i++) if (s[i] - s[i - 1] > s[gi + 1] - s[gi]) gi = i - 1;
      if (s[gi + 1] - s[gi] < 2) break;
      cps.add((s[gi] + s[gi + 1]) >> 1);
      continue;
    }
    const alt = res.alt;
    if (!alt) break;
    const sorted = [...cps].sort((a, b) => a - b);
    let fixed = false;
    if (!useWalls || rng.chance(0.35)) {
      // a checkpoint the alternative visits out of order
      const cand = rng.shuffle(Array.from({ length: N - 2 }, (_, i) => i + 1).filter((i) => !cps.has(i) && alt[i] !== path[i]));
      for (const i of cand) {
        if (
          !respects(
            alt,
            path,
            [...sorted, i].sort((a, b) => a - b),
          )
        ) {
          cps.add(i);
          fixed = true;
          break;
        }
      }
    }
    if (!fixed) {
      const extra: number[] = [];
      for (let i = 1; i < N; i++) {
        const key = wallKey(alt[i - 1], alt[i]);
        if (!used.has(key)) extra.push(key);
      }
      if (useWalls && extra.length) walls.add(rng.pick(extra));
      else {
        // fall back to any distinguishing checkpoint
        const i = Array.from({ length: N - 2 }, (_, x) => x + 1).find((x) => !cps.has(x) && alt[x] !== path[x]);
        if (i == null) break;
        cps.add(i);
      }
    }
  }
  return { n, path, marks: marksOf(), last: cps.size, walls: [...walls] };
}

/**
 * Finish a partial path (`prefix`, starting on mark 1): every cell once, marks in order, ending on
 * the last mark. Returns the full path, `null` when proven impossible, or `undefined` when the node
 * budget ran out first.
 */
export function finishTrail(P: TrailPuzzle, prefix: number[], budget: number): number[] | null | undefined {
  const { n, marks, last } = P;
  const N = n * n;
  const walls = new Set(P.walls);
  const adj = Array.from({ length: N }, (_, i) => nbrs(i, n, n).filter((j) => !walls.has(wallKey(i, j))));
  const end = marks.indexOf(last);
  const vis = new Uint8Array(N);
  for (const x of prefix) vis[x] = 1;
  const cur = prefix.slice();
  let next = 1;
  for (const x of prefix) if (marks[x]) next = Math.max(next, marks[x] + 1);
  const stack = new Int16Array(N);
  const seen = new Uint8Array(N);
  let nodes = 0;
  let capped = false;
  /** Unvisited cells stay connected to the head, and none but the end is a dead end. */
  const ok = (head: number, left: number) => {
    for (let i = 0; i < N; i++) {
      if (vis[i]) continue;
      let deg = 0;
      for (const j of adj[i]) if (!vis[j] || j === head) deg++;
      if (deg < (i === end ? 1 : 2)) return false;
    }
    seen.fill(0);
    let sp = 0,
      cnt = 0;
    for (const j of adj[head])
      if (!vis[j] && !seen[j]) {
        seen[j] = 1;
        stack[sp++] = j;
      }
    while (sp) {
      const i = stack[--sp];
      cnt++;
      for (const j of adj[i])
        if (!vis[j] && !seen[j]) {
          seen[j] = 1;
          stack[sp++] = j;
        }
    }
    return cnt === left;
  };
  const dfs = (head: number, nx: number): boolean => {
    if (cur.length === N) return head === end;
    if (head === end) return false;
    if (++nodes > budget) {
      capped = true;
      return false;
    }
    if (!ok(head, N - cur.length)) return false;
    for (const j of adj[head]) {
      if (vis[j]) continue;
      const m = marks[j];
      if (m && m !== nx) continue;
      if (m === last && cur.length + 1 !== N) continue;
      vis[j] = 1;
      cur.push(j);
      if (dfs(j, m ? nx + 1 : nx)) return true;
      cur.pop();
      vis[j] = 0;
      if (capped) return false;
    }
    return false;
  };
  if (dfs(cur[cur.length - 1], next)) return cur;
  return capped ? undefined : null;
}
