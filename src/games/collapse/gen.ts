import type { Rng } from '../../core/rng';

/** A board as columns of colours, bottom first; empty columns are dropped (everything is packed left). */
export type Cols = number[][];

/** Cells of the same-colour group at (x, y), as [x, y] pairs. */
export function groupAt(cols: Cols, x: number, y: number): [number, number][] {
  const c = cols[x]?.[y];
  if (c == null) return [];
  const seen = new Set([`${x},${y}`]);
  const out: [number, number][] = [];
  const st: [number, number][] = [[x, y]];
  while (st.length) {
    const [a, b] = st.pop()!;
    out.push([a, b]);
    for (const [u, v] of [
      [a - 1, b],
      [a + 1, b],
      [a, b - 1],
      [a, b + 1],
    ]) {
      if (cols[u]?.[v] !== c || seen.has(`${u},${v}`)) continue;
      seen.add(`${u},${v}`);
      st.push([u, v]);
    }
  }
  return out;
}

/** Remove a set of cells, let the rest fall and slide empty columns left. */
export function removeCells(cols: Cols, cells: [number, number][]): Cols {
  const gone = new Set(cells.map(([x, y]) => `${x},${y}`));
  return cols.map((col, x) => col.filter((_, y) => !gone.has(`${x},${y}`))).filter((col) => col.length);
}

/** Is there any group of 2 or more left? */
export function hasMove(cols: Cols): boolean {
  return cols.some((col, x) => col.some((c, y) => col[y + 1] === c || cols[x + 1]?.[y] === c));
}

/** Blocks that can never be removed: the last block of its colour can't join a group of 2. */
export function stranded(cols: Cols): number {
  const count = new Map<number, number>();
  for (const col of cols) for (const c of col) count.set(c, (count.get(c) ?? 0) + 1);
  return [...count.values()].filter((v) => v === 1).length;
}

/**
 * Solvable board, built backwards: start empty and repeatedly insert a connected group (pushing the
 * blocks above it up, or adding a new column), keeping it apart from same-coloured blocks. Removing
 * the groups in reverse order then clears the board. Returns the board and that clearing order.
 */
export function genCollapse(rng: Rng, W: number, H: number, k: number): { cols: Cols; solution: [number, number][] } {
  let best: { cols: Cols; steps: [number, number][] } = { cols: [], steps: [] };
  const sizes = [2, 2, 2, 2, 3, 3, 3, 4, 4, 5];
  for (let attempt = 0; attempt < 30; attempt++) {
    let cols: Cols = [];
    // one cell of each inserted group, in the board right after that insertion
    const steps: [number, number][] = [];
    let total = 0;
    for (let tries = 0; tries < 4000 && total < W * H; tries++) {
      const room = W * H - total;
      if (room < 2) break;
      let s = Math.min(rng.pick(sizes), room);
      if (room - s === 1) s++; // never leave a single cell to fill
      const c = rng.int(0, k - 1);
      const m = cols.length;
      // span over 1..3 columns, possibly one of them new
      const w = rng.int(1, Math.min(3, s));
      const fresh = m < W && rng.chance(m === 0 ? 1 : 0.25) ? rng.int(0, w - 1) : -1;
      const existing = fresh >= 0 ? w - 1 : w;
      if (existing > m) continue;
      const x0 = rng.int(0, m - existing);
      // split s cells into w runs (each at least 1)
      const runs = new Array<number>(w).fill(1);
      for (let r = w; r < s; r++) runs[rng.int(0, w - 1)]++;
      const next = cols.map((col) => col.slice());
      if (fresh >= 0) next.splice(x0 + fresh, 0, []);
      let ok = true;
      let prevH = -1,
        prevK = 0;
      const placed: [number, number][] = [];
      for (let i = 0; i < w && ok; i++) {
        const col = next[x0 + i];
        const kk = runs[i];
        if (col.length + kk > H) {
          ok = false;
          break;
        }
        let lo = 0,
          hi = col.length;
        if (i > 0) {
          lo = Math.max(lo, prevH - kk + 1);
          hi = Math.min(hi, prevH + prevK - 1);
        }
        if (lo > hi) {
          ok = false;
          break;
        }
        // lean towards low insertions so the colours mix through the whole column
        const hh = Math.min(rng.int(lo, hi), rng.int(lo, hi));
        col.splice(hh, 0, ...new Array<number>(kk).fill(c));
        for (let y = hh; y < hh + kk; y++) placed.push([x0 + i, y]);
        prevH = hh;
        prevK = kk;
      }
      if (!ok) continue;
      if (groupAt(next, placed[0][0], placed[0][1]).length !== s) continue;
      cols = next;
      total += s;
      steps.push(placed[0]);
    }
    if (total > best.cols.reduce((a, col) => a + col.length, 0)) best = { cols, steps };
    if (total === W * H) break;
  }
  return { cols: best.cols, solution: best.steps.reverse() };
}

/** What the solver knows about a board: a winning group to tap next, proven hopeless, or not sure. */
export type CollapseVerdict = { status: 'win'; next: [number, number] | null } | { status: 'dead' } | { status: 'capped' };

/** Every group of 2+ on the board as its cells, smallest first (the solver tries them in that order: small groups keep big ones for later). */
export function groupList(cols: Cols): [number, number][][] {
  const S = 32;
  const seen = new Uint8Array(cols.length * S);
  const out: [number, number][][] = [];
  const st: number[] = [];
  for (let x = 0; x < cols.length; x++)
    for (let y = 0; y < cols[x].length; y++) {
      if (seen[x * S + y]) continue;
      const c = cols[x][y];
      const g: [number, number][] = [];
      seen[x * S + y] = 1;
      st.push(x * S + y);
      while (st.length) {
        const v = st.pop()!;
        const a = (v / S) | 0,
          b = v % S;
        g.push([a, b]);
        const add = (u: number, ok: boolean) => {
          if (ok && !seen[u]) {
            seen[u] = 1;
            st.push(u);
          }
        };
        add(v - S, a > 0 && cols[a - 1][b] === c);
        add(v + S, a + 1 < cols.length && cols[a + 1][b] === c);
        add(v - 1, b > 0 && cols[a][b - 1] === c);
        add(v + 1, cols[a][b + 1] === c);
      }
      if (g.length >= 2) out.push(g);
    }
  return out.sort((a, b) => a.length - b.length);
}

/** Remove a group (cells from `groupList`), let the rest fall and close empty columns. */
function without(cols: Cols, g: [number, number][]): Cols {
  const gone = new Map<number, Set<number>>();
  for (const [x, y] of g) {
    let s = gone.get(x);
    if (!s) gone.set(x, (s = new Set()));
    s.add(y);
  }
  const out: Cols = [];
  cols.forEach((col, x) => {
    const s = gone.get(x);
    const c = s ? col.filter((_, y) => !s.has(y)) : col;
    if (c.length) out.push(c);
  });
  return out;
}

/**
 * Solver with memory across calls: can the board get down to `target` blocks or fewer? Positions
 * proven winnable keep their next tap; hopeless ones are remembered; running out of budget proves nothing.
 */
export function collapseSolver(target: number) {
  const win = new Map<string, [number, number] | null>();
  const dead = new Set<string>();
  const key = (cols: Cols) => cols.map((c) => c.join('')).join('|');
  const size = (cols: Cols) => cols.reduce((a, c) => a + c.length, 0);
  const solve = (start: Cols, budget: number, plan: [number, number][] = []): CollapseVerdict => {
    let nodes = 0;
    let capped = false;
    /** `step`: index into `plan` while the search still follows it, else -1. */
    const go = (cols: Cols, step: number): boolean => {
      if (size(cols) <= target) return true;
      const k = key(cols);
      if (win.has(k)) return true;
      if (dead.has(k) || stranded(cols) > target) return false;
      if (++nodes > budget) {
        capped = true;
        return false;
      }
      const opts = groupList(cols);
      const planned = step >= 0 ? plan[step] : undefined;
      const pg = planned ? opts.findIndex((g) => g.some(([a, b]) => a === planned[0] && b === planned[1])) : -1;
      if (pg > 0) opts.unshift(...opts.splice(pg, 1));
      for (let i = 0; i < opts.length; i++) {
        if (go(without(cols, opts[i]), i === 0 && pg >= 0 ? step + 1 : -1)) {
          win.set(k, opts[i][0]);
          return true;
        }
        if (capped) return false;
      }
      dead.add(k);
      return false;
    };
    if (go(start, plan.length ? 0 : -1)) return { status: 'win', next: size(start) <= target ? null : (win.get(key(start)) ?? null) };
    return capped ? { status: 'capped' } : { status: 'dead' };
  };
  /** Proven hopeless already (from earlier searches)? */
  const known = (cols: Cols) => dead.has(key(cols));
  /** How many positions are proven hopeless so far (grows as searches learn). */
  const learned = () => dead.size;
  return { solve, known, learned };
}
