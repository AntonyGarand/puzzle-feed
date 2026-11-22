import type { Rng } from '../../core/rng';
import { byLevel, type Difficulty } from '../../core/types';

export type Pt = { x: number; y: number };
export type Edge = [number, number];

const orient = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const onSeg = (a: Pt, b: Pt, p: Pt) =>
  Math.min(a.x, b.x) - 1e-9 <= p.x &&
  p.x <= Math.max(a.x, b.x) + 1e-9 &&
  Math.min(a.y, b.y) - 1e-9 <= p.y &&
  p.y <= Math.max(a.y, b.y) + 1e-9;

/** Do segments ab and cd intersect (touching counts)? Callers skip edges sharing a vertex. */
function crosses(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const eps = 1e-9;
  const o1 = orient(a, b, c),
    o2 = orient(a, b, d),
    o3 = orient(c, d, a),
    o4 = orient(c, d, b);
  if (((o1 > eps && o2 < -eps) || (o1 < -eps && o2 > eps)) && ((o3 > eps && o4 < -eps) || (o3 < -eps && o4 > eps))) return true;
  if (Math.abs(o1) <= eps && onSeg(a, b, c)) return true;
  if (Math.abs(o2) <= eps && onSeg(a, b, d)) return true;
  if (Math.abs(o3) <= eps && onSeg(c, d, a)) return true;
  if (Math.abs(o4) <= eps && onSeg(c, d, b)) return true;
  return false;
}

/** Indices of edges involved in at least one crossing. */
export function crossingEdges(p: Pt[], edges: Edge[]): Set<number> {
  const bad = new Set<number>();
  for (let i = 0; i < edges.length; i++)
    for (let j = i + 1; j < edges.length; j++) {
      const [a, b] = edges[i],
        [c, d] = edges[j];
      if (a === c || a === d || b === c || b === d) continue;
      if (crosses(p[a], p[b], p[c], p[d])) bad.add(i).add(j);
    }
  return bad;
}

const segPointDist = (a: Pt, b: Pt, p: Pt) => {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
};

export interface UntanglePuzzle {
  /** A planar layout (the hidden solution). */
  solution: Pt[];
  edges: Edge[];
  /** Scrambled starting positions. */
  start: Pt[];
}

export function genUntangle(rng: Rng, d: Difficulty): UntanglePuzzle {
  const V = byLevel(d, [6, 8, 11, 14, 18]);
  const ratio = byLevel(d, [1.34, 1.5, 1.6, 1.75, 1.85]);
  // 1. well-spread random points
  const minD = 62 / Math.sqrt(V);
  const pts: Pt[] = [];
  for (let t = 0; pts.length < V && t < 4000; t++) {
    const p = { x: rng.int(80, 920) / 10, y: rng.int(80, 920) / 10 };
    if (pts.every((q) => Math.hypot(p.x - q.x, p.y - q.y) >= (t < 3000 ? minD : minD / 2))) pts.push(p);
  }
  while (pts.length < V) pts.push({ x: rng.int(80, 920) / 10, y: rng.int(80, 920) / 10 });
  // 2. greedy planar graph: shortest non-crossing edges first, not grazing other vertices
  const cand: Edge[] = [];
  for (let i = 0; i < V; i++) for (let j = i + 1; j < V; j++) cand.push([i, j]);
  const len = (e: Edge) => Math.hypot(pts[e[0]].x - pts[e[1]].x, pts[e[0]].y - pts[e[1]].y);
  cand.sort((e, f) => len(e) - len(f));
  let edges: Edge[] = [];
  for (const e of cand) {
    if (pts.some((p, k) => k !== e[0] && k !== e[1] && segPointDist(pts[e[0]], pts[e[1]], p) < 4)) continue;
    if (
      edges.some(
        (f) => f[0] !== e[0] && f[0] !== e[1] && f[1] !== e[0] && f[1] !== e[1] && crosses(pts[e[0]], pts[e[1]], pts[f[0]], pts[f[1]]),
      )
    )
      continue;
    edges.push(e);
  }
  // 3. thin out to the target edge count, keeping degree >= 2 and connectivity
  const target = Math.round(V * ratio);
  const deg = new Array<number>(V).fill(0);
  edges.forEach(([a, b]) => (deg[a]++, deg[b]++));
  const isConnected = (es: Edge[]) => {
    const adj: number[][] = Array.from({ length: V }, () => []);
    es.forEach(([a, b]) => (adj[a].push(b), adj[b].push(a)));
    const seen = new Set([0]);
    const st = [0];
    while (st.length) {
      for (const j of adj[st.pop()!]) {
        if (seen.has(j)) continue;
        seen.add(j);
        st.push(j);
      }
    }
    return seen.size === V;
  };
  for (const e of rng.shuffle([...edges])) {
    if (edges.length <= target) break;
    if (deg[e[0]] <= 2 || deg[e[1]] <= 2) continue;
    const rest = edges.filter((f) => f !== e);
    if (!isConnected(rest)) continue;
    edges = rest;
    deg[e[0]]--;
    deg[e[1]]--;
  }
  // 4. scramble onto a circle, making sure it starts tangled
  let start: Pt[] = [];
  let bestBad = -1;
  for (let t = 0; t < 40; t++) {
    const order = rng.shuffle(Array.from({ length: V }, (_, i) => i));
    const off = rng.next() * Math.PI * 2;
    const cand2: Pt[] = new Array(V);
    order.forEach((v, k) => {
      const a = off + (k / V) * Math.PI * 2;
      cand2[v] = { x: Math.round((50 + 40 * Math.cos(a)) * 10) / 10, y: Math.round((50 + 40 * Math.sin(a)) * 10) / 10 };
    });
    const bad = crossingEdges(cand2, edges).size;
    if (bad > bestBad) {
      bestBad = bad;
      start = cand2;
    }
    if (bad >= Math.min(edges.length, V)) break;
  }
  return { solution: pts, edges, start };
}
