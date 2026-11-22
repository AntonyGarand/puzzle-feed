// Shared helpers for the logic-grid games (stars, tents, tiles, mines, bridges).
import './kit.css';

/** Region tint `i` (0–7) at `pct`% over the cell; the theme picks the tone and scales the strength (see --tN in styles/tokens.css). */
export const tint = (i: number, pct = 40) =>
  `color-mix(in srgb, var(--t${(((i % 8) + 8) % 8) + 1}) min(100%, calc(${pct}% * var(--tint-gain))), var(--cell))`;

/** Orthogonal neighbours of cell `i` on a cols×rows grid. */
export function nb4(i: number, cols: number, rows: number): number[] {
  const r = Math.floor(i / cols),
    c = i % cols;
  const out: number[] = [];
  if (r > 0) out.push(i - cols);
  if (c < cols - 1) out.push(i + 1);
  if (r < rows - 1) out.push(i + cols);
  if (c > 0) out.push(i - 1);
  return out;
}

/** All 8 surrounding cells of `i`. */
export function nb8(i: number, cols: number, rows: number): number[] {
  const r = Math.floor(i / cols),
    c = i % cols;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr,
        cc = c + dc;
      if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) out.push(rr * cols + cc);
    }
  return out;
}

/**
 * Edge classes for a gapless "plate" grid: a thick border (`bt`/`br`/`bb`/`bl`) wherever the
 * neighbouring cell belongs to another group, or at the outer frame.
 */
export function edgeClasses(cols: number, rows: number, group: (i: number) => number): string[] {
  return Array.from({ length: cols * rows }, (_, i) => {
    const r = Math.floor(i / cols),
      c = i % cols,
      g = group(i);
    const out: string[] = [];
    if (r === 0 || group(i - cols) !== g) out.push('bt');
    if (c === cols - 1 || group(i + 1) !== g) out.push('br');
    if (r === rows - 1 || group(i + cols) !== g) out.push('bb');
    if (c === 0 || group(i - 1) !== g) out.push('bl');
    return out.join(' ');
  });
}

/** Greedy colouring of a region adjacency graph with 8 palette colours (neighbours differ when possible). */
export function colourRegions(count: number, adj: Set<number>[], offset = 0): number[] {
  const col = new Array<number>(count).fill(-1);
  const order = Array.from({ length: count }, (_, i) => i).sort((a, b) => adj[b].size - adj[a].size || a - b);
  for (const v of order) {
    const used = new Set([...adj[v]].map((u) => col[u]));
    let k = 0;
    while (k < 8 && used.has((k + offset) % 8)) k++;
    col[v] = (k < 8 ? k + offset : v) % 8;
  }
  return col;
}

/** Region adjacency sets from a per-cell region map. */
export function regionAdjacency(region: number[], cols: number, rows: number, count: number): Set<number>[] {
  const adj = Array.from({ length: count }, () => new Set<number>());
  region.forEach((g, i) => {
    if (g < 0) return;
    for (const j of nb4(i, cols, rows)) {
      const h = region[j];
      if (h >= 0 && h !== g) {
        adj[g].add(h);
        adj[h].add(g);
      }
    }
  });
  return adj;
}

/** Bipartite matching size (Kuhn). `opts[a]` lists the right-side vertices left vertex `a` may use. */
export function matchingSize(opts: number[][]): number {
  const owner = new Map<number, number>();
  const tryA = (a: number, seen: Set<number>): boolean => {
    for (const b of opts[a]) {
      if (seen.has(b)) continue;
      seen.add(b);
      const o = owner.get(b);
      if (o === undefined || tryA(o, seen)) {
        owner.set(b, a);
        return true;
      }
    }
    return false;
  };
  let n = 0;
  for (let a = 0; a < opts.length; a++) if (tryA(a, new Set())) n++;
  return n;
}

/**
 * Cell index under a pointer on a gapless grid element; falls back to the event target's `data-i`
 * (useful when layout is unavailable, e.g. in tests).
 */
export function cellFromPointer(grid: HTMLElement, e: PointerEvent | MouseEvent, cols: number, rows: number): number {
  const rect = grid.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0 && (e.clientX || e.clientY)) {
    const c = Math.floor(((e.clientX - rect.left) / rect.width) * cols);
    const r = Math.floor(((e.clientY - rect.top) / rect.height) * rows);
    if (r < 0 || c < 0 || r >= rows || c >= cols) return -1;
    return r * cols + c;
  }
  const t = (e.target as Element | null)?.closest?.('[data-i]') as HTMLElement | null;
  return t && grid.contains(t) ? Number(t.dataset['i']) : -1;
}
