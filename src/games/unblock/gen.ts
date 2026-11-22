import type { Rng } from '../../core/rng';

export const N = 6;
export const EXIT_ROW = 2;

export interface Block {
  /** horizontal? */
  hz: boolean;
  len: number;
  /** row for horizontal blocks, column for vertical ones */
  line: number;
}

export interface Layout {
  blocks: Block[];
  /** start position (column for horizontal, row for vertical) per block; block 0 is the key */
  pos: number[];
  /** minimum number of slides to bring the key to the exit */
  optimal: number;
}

const cellsOf = (b: Block, p: number) => Array.from({ length: b.len }, (_, k) => (b.hz ? b.line * N + p + k : (p + k) * N + b.line));

function occupancy(blocks: Block[], pos: number[], skip = -1) {
  const occ = new Uint8Array(N * N);
  blocks.forEach((b, i) => {
    if (i !== skip) for (const c of cellsOf(b, pos[i])) occ[c] = 1;
  });
  return occ;
}

/** Free slide range [lo, hi] for block i. */
export function range(blocks: Block[], pos: number[], i: number): [number, number] {
  const occ = occupancy(blocks, pos, i);
  const b = blocks[i];
  const at = (p: number) => (b.hz ? b.line * N + p : p * N + b.line);
  let lo = pos[i],
    hi = pos[i];
  while (lo - 1 >= 0 && !occ[at(lo - 1)]) lo--;
  while (hi + b.len < N && !occ[at(hi + b.len)]) hi++;
  return [lo, hi];
}

const POW = Array.from({ length: 20 }, (_, i) => N ** i);

/**
 * Explore the whole state cluster of a board, then BFS backwards from the solved states.
 * Returns per-state distances, or null if the cluster is too big (or out of time) or has no solved state.
 */
/** `work.left` is a deterministic budget of explored states shared across calls (no wall-clock: resume must regenerate identically). */
function analyse(blocks: Block[], start: number[], cap: number, work: { left: number }) {
  const nb = blocks.length;
  const base = blocks.map((b) => (b.hz ? b.line * N : b.line));
  const stride = blocks.map((b) => (b.hz ? 1 : N));
  const states: number[] = [...start];
  let k0 = 0;
  for (let i = 0; i < nb; i++) k0 += start[i] * POW[i];
  const keys: number[] = [k0];
  // open-addressing hash (keys < 6^16 fit exactly in doubles); much faster than a Map
  let bits = 10;
  while (1 << bits < cap * 2) bits++;
  const size = 1 << bits,
    mask = size - 1,
    shift = 32 - bits;
  const hk = new Float64Array(size);
  const hv = new Int32Array(size).fill(-1);
  const slot = (k: number) => {
    let h = Math.imul((k >>> 0) ^ Math.floor(k / 4294967296), 0x9e3779b1) >>> shift;
    while (hv[h] >= 0 && hk[h] !== k) h = (h + 1) & mask;
    return h;
  };
  {
    const h0 = slot(k0);
    hk[h0] = k0;
    hv[h0] = 0;
  }
  const adjStart: number[] = [];
  const adj: number[] = [];
  const occ = new Uint8Array(N * N);
  for (let s = 0; s < keys.length; s++) {
    if (--work.left < 0) return null;
    occ.fill(0);
    const off = s * nb;
    for (let i = 0; i < nb; i++) {
      const c0 = base[i] + states[off + i] * stride[i];
      for (let k = 0; k < blocks[i].len; k++) occ[c0 + k * stride[i]] = 1;
    }
    adjStart.push(adj.length);
    const ks = keys[s];
    for (let i = 0; i < nb; i++) {
      const orig = states[off + i],
        len = blocks[i].len,
        st = stride[i],
        b0 = base[i];
      for (let dir = -1; dir <= 1; dir += 2) {
        for (let q = orig + dir; q >= 0 && q + len <= N; q += dir) {
          const edge = dir < 0 ? q : q + len - 1;
          if (occ[b0 + edge * st]) break;
          const k = ks + (q - orig) * POW[i];
          const h = slot(k);
          let id = hv[h];
          if (id < 0) {
            id = keys.length;
            hk[h] = k;
            hv[h] = id;
            keys.push(k);
            for (let j = 0; j < nb; j++) states.push(j === i ? q : states[off + j]);
            if (keys.length > cap) return null;
          }
          adj.push(id);
        }
      }
    }
  }
  adjStart.push(adj.length);
  const total = keys.length;
  const dist = new Int32Array(total).fill(-1);
  const q: number[] = [];
  for (let s = 0; s < total; s++)
    if (states[s * nb] === N - blocks[0].len) {
      dist[s] = 0;
      q.push(s);
    }
  if (!q.length) return null;
  for (let k = 0; k < q.length; k++) {
    const x = q[k];
    for (let e = adjStart[x]; e < adjStart[x + 1]; e++) {
      const t = adj[e];
      if (dist[t] < 0) {
        dist[t] = dist[x] + 1;
        q.push(t);
      }
    }
  }
  return { states, dist, nb };
}

/** Try to drop one random block onto free cells. */
function addBlock(rng: Rng, blocks: Block[], pos: number[], occ: Uint8Array, tries: number) {
  for (let t = 0; t < tries; t++) {
    const hz = rng.chance(0.5);
    const len = rng.chance(0.28) ? 3 : 2;
    const line = rng.int(0, N - 1);
    if (hz && line === EXIT_ROW) continue; // would lock the key in forever
    const p = rng.int(0, N - len);
    const b = { hz, len, line };
    const cs = cellsOf(b, p);
    if (cs.some((c) => occ[c])) continue;
    cs.forEach((c) => (occ[c] = 1));
    blocks.push(b);
    pos.push(p);
    return true;
  }
  return false;
}

function randomBoard(rng: Rng): { blocks: Block[]; pos: number[] } {
  const blocks: Block[] = [{ hz: true, len: 2, line: EXIT_ROW }];
  const pos = [N - 2]; // start from a solved position: the cluster then always contains a solution
  const occ = occupancy(blocks, pos);
  const want = rng.int(10, 13);
  while (blocks.length < want && addBlock(rng, blocks, pos, occ, 60));
  return { blocks, pos };
}

/** Small change to a board: remove and/or add a block (key stays). */
function mutate(rng: Rng, blocks: Block[], pos: number[]) {
  const bs = blocks.slice(),
    ps = pos.slice();
  const op = rng.int(0, 2);
  if (op !== 1 && bs.length > 6) {
    const k = rng.int(1, bs.length - 1);
    bs.splice(k, 1);
    ps.splice(k, 1);
  }
  if (op !== 0 || bs.length <= 6) addBlock(rng, bs, ps, occupancy(bs, ps), 40);
  return { blocks: bs, pos: ps };
}

/**
 * Generate a board whose optimal solution length lies in [lo, hi] (best effort within the work budget).
 * Random boards seeded from a solved position, then hill-climbing on the cluster's longest distance.
 */
export function generateUnblock(rng: Rng, lo: number, hi: number, budget = 60000): Layout {
  const work = { left: budget };
  type Cand = { blocks: Block[]; pos: number[]; max: number; res: NonNullable<ReturnType<typeof analyse>> };
  /** Positions of a farthest-from-solved state of a candidate's cluster. */
  const deepest = (c: Cand) => {
    const { states, dist, nb } = c.res;
    let s = 0;
    for (let k = 0; k < dist.length; k++) if (dist[k] > dist[s]) s = k;
    return Array.from({ length: nb }, (_, i) => states[s * nb + i]);
  };
  let cur: Cand | null = null;
  let best: Cand | null = null;
  let stale = 0;
  for (let attempt = 0; attempt < 5000; attempt++) {
    if (work.left <= 0) break;
    const fresh = !cur || stale > 40;
    const c = fresh ? randomBoard(rng) : mutate(rng, cur!.blocks, deepest(cur!));
    if (fresh) stale = 0;
    const res = analyse(c.blocks, c.pos, 2000, work);
    if (!res) {
      stale++;
      continue;
    }
    let max = 0;
    for (let s = 0; s < res.dist.length; s++) if (res.dist[s] > max) max = res.dist[s];
    if (max < 1) {
      stale++;
      continue;
    }
    const cand: Cand = { ...c, max, res };
    if (!cur || fresh || max >= cur.max) {
      if (cur && max > cur.max) stale = 0;
      else stale++;
      cur = cand;
    } else stale++;
    if (!best || max > best.max) best = cand;
    if (best.max >= lo) break;
  }
  if (best) {
    const { states, dist, nb } = best.res;
    const target = Math.min(best.max, hi);
    const pick: number[] = [];
    for (let s = 0; s < dist.length; s++) if (dist[s] === target) pick.push(s);
    const s = rng.pick(pick);
    return { blocks: best.blocks, pos: Array.from({ length: nb }, (_, i) => states[s * nb + i]), optimal: target };
  }
  // Fallback: the key needs one blocker moved first.
  return {
    blocks: [
      { hz: true, len: 2, line: EXIT_ROW },
      { hz: false, len: 2, line: 5 },
    ],
    pos: [0, 2],
    optimal: 2,
  };
}
