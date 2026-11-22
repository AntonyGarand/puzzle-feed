// Solver for Tracks (a path from A to B matching row/column counts and passing through marked
// cells), used by the hint guide. Not a PuzzleDef module.
import { nbrs } from '../../kits/path/grid';

export interface TracksRules {
  n: number;
  b: number;
  rowCounts: number[];
  colCounts: number[];
  givens: number[];
}

export interface TracksSolve {
  path: number[] | null;
  /** Ran out of budget: null then means "don't know". */
  capped: boolean;
}

/** Why the trail so far can't be finished, when it shows without search. */
export type TracksDead =
  | { kind: 'over'; row: boolean; line: number; have: number; want: number }
  | { kind: 'cut'; cells: number[] }
  | { kind: 'short'; row: boolean; line: number; have: number; want: number };

/** Lines over their count, then B or a marked cell cut off from the trail's end, then a line that can't get its cells. */
export function tracksDead(R: TracksRules, trail: number[]): TracksDead | null {
  const { n, b } = R;
  const N = n * n;
  const rc = new Array<number>(n).fill(0),
    cc = new Array<number>(n).fill(0);
  const used = new Uint8Array(N);
  for (const i of trail) {
    used[i] = 1;
    rc[Math.floor(i / n)]++;
    cc[i % n]++;
  }
  for (let l = 0; l < n; l++) {
    if (rc[l] > R.rowCounts[l]) return { kind: 'over', row: true, line: l, have: rc[l], want: R.rowCounts[l] };
    if (cc[l] > R.colCounts[l]) return { kind: 'over', row: false, line: l, have: cc[l], want: R.colCounts[l] };
  }
  const tip = trail[trail.length - 1];
  if (tip === b) {
    for (let l = 0; l < n; l++) {
      if (rc[l] < R.rowCounts[l]) return { kind: 'short', row: true, line: l, have: rc[l], want: R.rowCounts[l] };
      if (cc[l] < R.colCounts[l]) return { kind: 'short', row: false, line: l, have: cc[l], want: R.colCounts[l] };
    }
    const miss = R.givens.filter((g) => !used[g]);
    return miss.length ? { kind: 'cut', cells: miss } : null;
  }
  // Cells the trail could still use: free, in a row and a column with room left.
  const room = (i: number) => !used[i] && rc[Math.floor(i / n)] < R.rowCounts[Math.floor(i / n)] && cc[i % n] < R.colCounts[i % n];
  const seen = new Uint8Array(N);
  const q = [tip];
  seen[tip] = 1;
  for (let h = 0; h < q.length; h++)
    for (const j of nbrs(q[h], n, n))
      if (!seen[j] && room(j)) {
        seen[j] = 1;
        q.push(j);
      }
  const cut = [b, ...R.givens].filter((g) => !used[g] && !seen[g]);
  if (cut.length) return { kind: 'cut', cells: cut };
  // Every line short of its count needs enough reachable cells.
  const rr = new Array<number>(n).fill(0),
    cr = new Array<number>(n).fill(0);
  for (const i of q) {
    if (i === tip) continue;
    rr[Math.floor(i / n)]++;
    cr[i % n]++;
  }
  for (let l = 0; l < n; l++) {
    if (rc[l] + rr[l] < R.rowCounts[l]) return { kind: 'short', row: true, line: l, have: rc[l], want: R.rowCounts[l] };
    if (cc[l] + cr[l] < R.colCounts[l]) return { kind: 'short', row: false, line: l, have: cc[l], want: R.colCounts[l] };
  }
  return null;
}

/** Depth-first search for a full trail extending `trail`; `prefer` (a known solution) goes first. */
export function solveTracks(R: TracksRules, trail: number[], budget: number, prefer?: number[]): TracksSolve {
  const { n, b } = R;
  const path = [...trail];
  const used = new Set(path);
  let nodes = 0;
  let capped = false;
  const rec = (): boolean => {
    if (++nodes > budget) {
      capped = true;
      return false;
    }
    if (tracksDead(R, path)) return false;
    const tip = path[path.length - 1];
    if (tip === b) return true;
    let cands = nbrs(tip, n, n).filter((j) => !used.has(j));
    const p = prefer?.[path.length];
    if (p != null && cands.includes(p) && prefer!.slice(0, path.length).every((c, k) => c === path[k]))
      cands = [p, ...cands.filter((c) => c !== p)];
    for (const c of cands) {
      used.add(c);
      path.push(c);
      if (rec()) return true;
      path.pop();
      used.delete(c);
      if (capped) return false;
    }
    return false;
  };
  const ok = rec();
  return { path: ok ? path : null, capped: !ok && capped };
}
