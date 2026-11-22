import type { Rng } from '../../core/rng';

export function neighbours(n: number, i: number): number[] {
  const r = Math.floor(i / n),
    c = i % n;
  const out: number[] = [];
  if (r > 0) out.push(i - n);
  if (r < n - 1) out.push(i + n);
  if (c > 0) out.push(i - 1);
  if (c < n - 1) out.push(i + 1);
  return out;
}

function connected(n: number, region: number[], id: number): boolean {
  let start = -1,
    total = 0;
  for (let i = 0; i < region.length; i++)
    if (region[i] === id) {
      total++;
      if (start < 0) start = i;
    }
  if (start < 0) return true;
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const i = stack.pop()!;
    for (const j of neighbours(n, i))
      if (region[j] === id && !seen.has(j)) {
        seen.add(j);
        stack.push(j);
      }
  }
  return seen.size === total;
}

/**
 * Random partition of an n×n grid into n contiguous regions of n cells each.
 * Starts from the row layout and performs many size-preserving swaps across region borders.
 */
export function jigsawRegions(n: number, rng: Rng): number[] {
  const region = Array.from({ length: n * n }, (_, i) => Math.floor(i / n));
  const want = n * n * 4;
  let done = 0;
  for (let tries = 0; tries < n * n * 60 && done < want; tries++) {
    const b = rng.int(0, n * n - 1);
    const B = region[b];
    const nb = neighbours(n, b).filter((j) => region[j] !== B);
    if (!nb.length) continue;
    const A = region[rng.pick(nb)];
    // b moves to A; some A cell touching B (other than via b) moves to B.
    region[b] = A;
    const pool: number[] = [];
    for (let c = 0; c < n * n; c++) {
      if (region[c] !== A || c === b) continue;
      if (neighbours(n, c).some((j) => region[j] === B)) pool.push(c);
    }
    if (!pool.length) {
      region[b] = B;
      continue;
    }
    const c = rng.pick(pool);
    region[c] = B;
    if (connected(n, region, A) && connected(n, region, B)) done++;
    else {
      region[c] = A;
      region[b] = B;
    }
  }
  return region;
}

/** Greedy colouring so adjacent regions get different tint indexes (0..3-ish). */
export function regionTints(n: number, region: number[]): number[] {
  const k = Math.max(...region) + 1;
  const adj: Set<number>[] = Array.from({ length: k }, () => new Set());
  for (let i = 0; i < region.length; i++) for (const j of neighbours(n, i)) if (region[i] !== region[j]) adj[region[i]].add(region[j]);
  const tint = new Array(k).fill(-1);
  for (let r = 0; r < k; r++) {
    let t = 0;
    while ([...adj[r]].some((o) => tint[o] === t)) t++;
    tint[r] = t;
  }
  return tint;
}
