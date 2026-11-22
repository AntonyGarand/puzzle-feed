// Solver for "numbered path" boards (Hidato-style): visit every cell once, numbers 1..N in order,
// printed numbers reached exactly on their turn. Shared by the hint guides. Not a PuzzleDef module.

export interface PathSolve {
  /** A full path extending the prefix, or null. */
  path: number[] | null;
  /** The search ran out of budget: null then means "don't know", not "impossible". */
  capped: boolean;
}

/** Why the prefix is already hopeless, when it shows on the board (checked before any search). */
export type DeadEnd =
  | { kind: 'isolated'; cell: number }
  | { kind: 'ends'; cells: number[] }
  | { kind: 'split'; cells: number[] }
  | { kind: 'far'; num: number; cell: number; steps: number; dist: number };

/**
 * Visible dead ends for a path so far: an empty cell nothing can enter, two empty cells that could
 * only be the last one, empty cells cut off from the tip, a printed number too far to reach in time.
 */
export function deadEnd(adj: number[][], givenAt: Map<number, number>, prefix: number[]): DeadEnd | null {
  const N = adj.length;
  const len = prefix.length;
  if (len >= N) return null;
  const used = new Uint8Array(N);
  for (const c of prefix) used[c] = 1;
  const tip = prefix[len - 1];
  const tipAdj = new Set(adj[tip]);
  const ends: number[] = [];
  const endCell = givenAt.get(N);
  for (let i = 0; i < N; i++) {
    if (used[i]) continue;
    const ways = adj[i].filter((j) => !used[j]).length + (tipAdj.has(i) ? 1 : 0);
    if (ways === 0 && len < N) return { kind: 'isolated', cell: i };
    if (ways === 1 && !tipAdj.has(i)) ends.push(i);
  }
  if (ends.length > 1) return { kind: 'ends', cells: ends };
  if (ends.length === 1 && endCell != null && ends[0] !== endCell) return { kind: 'ends', cells: [ends[0], endCell] };
  // Connectivity of the empty cells through the tip.
  const seen = new Uint8Array(N);
  const st = [tip];
  seen[tip] = 1;
  let k = 0;
  while (st.length) {
    for (const j of adj[st.pop()!])
      if (!used[j] && !seen[j]) {
        seen[j] = 1;
        k++;
        st.push(j);
      }
  }
  if (k < N - len) {
    const cells: number[] = [];
    for (let i = 0; i < N; i++) if (!used[i] && !seen[i]) cells.push(i);
    return { kind: 'split', cells };
  }
  // Next printed number: close enough?
  let g = len + 1;
  while (g <= N && !givenAt.has(g)) g++;
  if (g <= N) {
    const G = givenAt.get(g)!;
    const dist = new Int32Array(N).fill(-1);
    dist[tip] = 0;
    const q = [tip];
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      if (i === G) break;
      for (const j of adj[i])
        if (!used[j] && dist[j] < 0) {
          dist[j] = dist[i] + 1;
          q.push(j);
        }
    }
    const steps = g - len;
    if (dist[G] < 0 || dist[G] > steps) return { kind: 'far', num: g, cell: G, steps, dist: dist[G] };
  }
  return null;
}

/**
 * Depth-first search for a full path extending `prefix` (which must already follow the rules).
 * `prefer` (a known solution) is tried first at every step so on-track positions answer at once.
 */
export function solvePath(adj: number[][], givenAt: Map<number, number>, prefix: number[], budget: number, prefer?: number[]): PathSolve {
  const N = adj.length;
  const givenCell = new Int32Array(N);
  givenAt.forEach((cell, num) => (givenCell[cell] = num));
  const path = [...prefix];
  const used = new Uint8Array(N);
  for (const c of path) used[c] = 1;
  let nodes = 0;
  let capped = false;
  const rec = (): boolean => {
    const len = path.length;
    if (len === N) return true;
    if (++nodes > budget) {
      capped = true;
      return false;
    }
    if (deadEnd(adj, givenAt, path)) return false;
    const tip = path[len - 1];
    const next = len + 1;
    const fixed = givenAt.get(next);
    let cands: number[];
    if (fixed != null) cands = !used[fixed] && adj[tip].includes(fixed) ? [fixed] : [];
    else {
      const ways = (i: number) => adj[i].filter((j) => !used[j]).length;
      cands = adj[tip].filter((j) => !used[j] && !givenCell[j]).sort((a, b) => ways(a) - ways(b));
      const p = prefer?.[len];
      if (p != null && cands.includes(p)) cands = [p, ...cands.filter((c) => c !== p)];
    }
    for (const c of cands) {
      used[c] = 1;
      path.push(c);
      if (rec()) return true;
      path.pop();
      used[c] = 0;
      if (capped) return false;
    }
    return false;
  };
  const ok = rec();
  return { path: ok ? path : null, capped: !ok && capped };
}
