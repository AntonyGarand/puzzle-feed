// Mosaic generator: a blobby picture, its 3×3 counts, then clues removed while the picture stays unique.
import type { Rng } from '../../core/rng';

export interface Mosaic {
  n: number;
  sol: boolean[];
  /** Count shown on each cell, -1 when hidden. */
  clue: number[];
  unique: boolean;
}

/** Cell `i` and its up-to-8 neighbours. */
export function block(i: number, n: number): number[] {
  const r = Math.floor(i / n),
    c = i % n;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr,
        cc = c + dc;
      if (rr >= 0 && rr < n && cc >= 0 && cc < n) out.push(rr * n + cc);
    }
  return out;
}

/** Number of pictures matching the clues, up to `limit` (`limit` if the node budget runs out). */
function count(n: number, clue: number[], limit: number, budget: number): { count: number; nodes: number } {
  const N = n * n;
  const blocks = Array.from({ length: N }, (_, i) => block(i, n));
  const clues = clue.map((k, i) => (k >= 0 ? i : -1)).filter((i) => i >= 0);
  /** Clues touching each cell. */
  const touch: number[][] = Array.from({ length: N }, () => []);
  for (const c of clues) for (const j of blocks[c]) touch[j].push(c);
  let found = 0,
    nodes = 0;

  const propagate = (st: Int8Array): boolean => {
    let changed = true;
    while (changed) {
      changed = false;
      for (const c of clues) {
        const k = clue[c];
        let on = 0,
          unk = 0;
        for (const j of blocks[c]) {
          if (st[j] === 1) on++;
          else if (st[j] === -1) unk++;
        }
        if (on > k || on + unk < k) return false;
        if (unk && (on === k || on + unk === k)) {
          const v = on === k ? 0 : 1;
          for (const j of blocks[c]) if (st[j] === -1) st[j] = v;
          changed = true;
        }
      }
    }
    return true;
  };
  const rec = (st: Int8Array) => {
    if (found >= limit) return;
    if (++nodes > budget) {
      found = limit;
      return;
    }
    if (!propagate(st)) return;
    // A cell no clue sees can be either colour.
    let best = -1,
      bestU = 99;
    for (let i = 0; i < N; i++) {
      if (st[i] !== -1) continue;
      if (!touch[i].length) {
        found = limit;
        return;
      }
      for (const c of touch[i]) {
        let u = 0;
        for (const j of blocks[c]) if (st[j] === -1) u++;
        if (u < bestU) {
          bestU = u;
          best = i;
        }
      }
    }
    if (best < 0) {
      found++;
      return;
    }
    for (const v of [1, 0]) {
      const a = st.slice();
      a[best] = v;
      rec(a);
    }
  };
  rec(new Int8Array(N).fill(-1));
  return { count: found, nodes };
}

/** `keep`: share of clues that must stay (0 = as few as uniqueness allows). */
export function genMosaic(n: number, keep: number, rng: Rng): Mosaic {
  const N = n * n;
  let budget = 120000;
  let last: Mosaic | null = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    // Noise smoothed once by majority vote: blobs read like a picture.
    const noise = Array.from({ length: N }, () => rng.chance(0.5));
    const sol = noise.map((v, i) => {
      const b = block(i, n);
      const on = b.filter((j) => noise[j]).length;
      return on * 2 === b.length ? v : on * 2 > b.length;
    });
    const filled = sol.filter(Boolean).length;
    if (filled < N * 0.3 || filled > N * 0.7) continue;
    const clue = sol.map((_, i) => block(i, n).filter((j) => sol[j]).length);
    const full = count(n, clue, 2, 6000);
    budget -= full.nodes;
    last = { n, sol, clue, unique: full.count === 1 };
    if (!last.unique) continue;
    const order = rng.shuffle(Array.from({ length: N }, (_, i) => i));
    const maxRemove = Math.floor(N * (1 - keep));
    let removed = 0;
    for (const i of order) {
      if (removed >= maxRemove || budget <= 0) break;
      const v = clue[i];
      clue[i] = -1;
      const r = count(n, clue, 2, 1500);
      budget -= r.nodes;
      if (r.count === 1) removed++;
      else clue[i] = v;
    }
    return last;
  }
  if (last) return last;
  // Fallback (never seen): a checkerboard-free picture with every clue shown.
  const sol = Array.from({ length: N }, (_, i) => i % 3 === 0);
  return { n, sol, clue: sol.map((_, i) => block(i, n).filter((j) => sol[j]).length), unique: false };
}
