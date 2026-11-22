import type { Rng } from '../../core/rng';
import { matchingSize, nb4, nb8 } from '../../kits/logic/kit';

export interface TentsPuzzle {
  n: number;
  trees: number[];
  /** Intended tent cells. */
  tents: number[];
  rows: number[];
  cols: number[];
  unique: boolean;
}

/** True when `tents` forms a perfect matching with `trees` (each tent orthogonally next to its own tree). */
export function tentsMatch(n: number, trees: number[], tents: number[]): boolean {
  if (trees.length !== tents.length) return false;
  const tentSet = new Set(tents);
  const opts = trees.map((t) => nb4(t, n, n).filter((j) => tentSet.has(j)));
  return matchingSize(opts) === trees.length;
}

/** Count solutions up to `cap` within a node budget. */
function solveTents(
  n: number,
  trees: number[],
  rows: number[],
  cols: number[],
  cap: number,
  budget = 60000,
): { count: number; complete: boolean } {
  const isTree = new Array<boolean>(n * n).fill(false);
  trees.forEach((t) => (isTree[t] = true));
  const cand: number[] = [];
  for (let i = 0; i < n * n; i++) if (!isTree[i] && nb4(i, n, n).some((j) => isTree[j])) cand.push(i);
  const rowLeft = [...rows],
    colLeft = [...cols];
  const rowRem = new Array<number>(n).fill(0),
    colRem = new Array<number>(n).fill(0);
  for (const i of cand) {
    rowRem[Math.floor(i / n)]++;
    colRem[i % n]++;
  }
  for (let k = 0; k < n; k++) if (rowRem[k] < rowLeft[k] || colRem[k] < colLeft[k]) return { count: 0, complete: true };
  // Per tree: undecided neighbouring candidates and tents placed.
  const treeIdx = new Map(trees.map((t, k) => [t, k]));
  const und = trees.map((t) => nb4(t, n, n).filter((j) => !isTree[j]).length);
  const has = trees.map(() => 0);
  const tent = new Array<boolean>(n * n).fill(false);
  let count = 0,
    nodes = 0;
  const adjTrees = cand.map((i) =>
    nb4(i, n, n)
      .filter((j) => isTree[j])
      .map((j) => treeIdx.get(j)!),
  );
  const rec = (k: number): boolean => {
    if (++nodes > budget) return false;
    if (k === cand.length) {
      if (rowLeft.every((x) => x === 0) && colLeft.every((x) => x === 0)) {
        if (
          tentsMatch(
            n,
            trees,
            tent.map((v, i) => (v ? i : -1)).filter((i) => i >= 0),
          )
        )
          count++;
      }
      return count < cap;
    }
    const i = cand[k],
      r = Math.floor(i / n),
      c = i % n;
    rowRem[r]--;
    colRem[c]--;
    for (const t of adjTrees[k]) und[t]--;
    let go = true;
    // Option 1: tent.
    if (rowLeft[r] > 0 && colLeft[c] > 0 && !nb8(i, n, n).some((j) => tent[j])) {
      tent[i] = true;
      rowLeft[r]--;
      colLeft[c]--;
      for (const t of adjTrees[k]) has[t]++;
      if (rowRem[r] >= rowLeft[r] && colRem[c] >= colLeft[c]) go = rec(k + 1);
      for (const t of adjTrees[k]) has[t]--;
      tent[i] = false;
      rowLeft[r]++;
      colLeft[c]++;
    }
    // Option 2: no tent.
    if (go && rowRem[r] >= rowLeft[r] && colRem[c] >= colLeft[c] && adjTrees[k].every((t) => und[t] > 0 || has[t] > 0)) go = rec(k + 1);
    rowRem[r]++;
    colRem[c]++;
    for (const t of adjTrees[k]) und[t]++;
    return go;
  };
  rec(0);
  return { count, complete: nodes <= budget };
}

export function genTents(n: number, density: number, rng: Rng): TentsPuzzle {
  let best: TentsPuzzle | null = null;
  const target = Math.max(3, Math.round(n * n * density));
  for (let attempt = 0; attempt < 30; attempt++) {
    const kind = new Array<number>(n * n).fill(0); // 1 tent, 2 tree
    const trees: number[] = [],
      tents: number[] = [];
    for (const i of rng.shuffle(Array.from({ length: n * n }, (_, k) => k))) {
      if (tents.length >= target) break;
      if (kind[i] || nb8(i, n, n).some((j) => kind[j] === 1)) continue;
      const spots = nb4(i, n, n).filter((j) => !kind[j]);
      if (!spots.length) continue;
      const t = rng.pick(spots);
      kind[i] = 1;
      kind[t] = 2;
      tents.push(i);
      trees.push(t);
    }
    if (tents.length < target - 1 && attempt < 29) continue;
    trees.sort((a, b) => a - b);
    tents.sort((a, b) => a - b);
    const rows = new Array<number>(n).fill(0),
      cols = new Array<number>(n).fill(0);
    for (const t of tents) {
      rows[Math.floor(t / n)]++;
      cols[t % n]++;
    }
    const { count, complete } = solveTents(n, trees, rows, cols, 2);
    const p = { n, trees, tents, rows, cols, unique: complete && count === 1 };
    if (p.unique) return p;
    best ??= p;
  }
  return best!;
}
