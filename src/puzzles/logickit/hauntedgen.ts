// Haunted mirrors: sight lines, a propagation solver and the generator.
import type { Rng } from '../../core/rng';

/** Monster kinds: 0 empty, 1 ghost, 2 vampire, 3 zombie. Domains are bit masks (1 << (kind - 1)). */
export const GHOST = 1,
  VAMPIRE = 2,
  ZOMBIE = 3;
export const ALL = 7;
export const bit = (v: number) => 1 << (v - 1);

/** One sight line from border slot `k` (side = k / n: 0 top, 1 right, 2 bottom, 3 left; pos = k % n). */
export interface Path {
  /** Cells passed, in order, and whether the line had bounced already. */
  seq: { cell: number; after: boolean }[];
  /** Distinct cells with how often they are seen before (`b`) and after (`a`) the first bounce. */
  cells: number[];
  b: number[];
  a: number[];
}

/** Times a monster of kind `v` is counted by a cell seen `b` times directly and `a` times reflected. */
export const seen = (v: number, b: number, a: number) => (v === GHOST ? a : v === VAMPIRE ? b : a + b);

/** Trace every border sight line. `mir`: 0 none, 1 '/', 2 '\'. */
function tracePaths(n: number, mir: ArrayLike<number>): Path[] {
  return Array.from({ length: 4 * n }, (_, k) => {
    const side = Math.floor(k / n),
      pos = k % n;
    let r = side === 0 ? -1 : side === 2 ? n : pos,
      c = side === 3 ? -1 : side === 1 ? n : pos;
    let dr = side === 0 ? 1 : side === 2 ? -1 : 0,
      dc = side === 3 ? 1 : side === 1 ? -1 : 0;
    let after = false;
    const seq: Path['seq'] = [];
    for (let guard = 0; guard < 8 * n * n; guard++) {
      r += dr;
      c += dc;
      if (r < 0 || c < 0 || r >= n || c >= n) break;
      const i = r * n + c;
      if (mir[i] === 1) {
        [dr, dc] = [-dc, -dr];
        after = true;
      } else if (mir[i] === 2) {
        [dr, dc] = [dc, dr];
        after = true;
      } else seq.push({ cell: i, after });
    }
    const cells: number[] = [],
      b: number[] = [],
      a: number[] = [];
    for (const s of seq) {
      let j = cells.indexOf(s.cell);
      if (j < 0) {
        j = cells.push(s.cell) - 1;
        b.push(0);
        a.push(0);
      }
      if (s.after) a[j]++;
      else b[j]++;
    }
    return { seq, cells, b, a };
  });
}

/** What a full assignment shows from each border slot. */
const clueValues = (paths: Path[], vals: ArrayLike<number>) =>
  paths.map((p) => p.cells.reduce((sum, c, j) => sum + (vals[c] ? seen(vals[c], p.b[j], p.a[j]) : 0), 0));

/** Smallest and largest count a path can still show given per-cell domains. */
export function pathRange(p: Path, dom: ArrayLike<number>): [number, number] {
  let lo = 0,
    hi = 0;
  p.cells.forEach((c, j) => {
    let mn = 99,
      mx = 0;
    for (let v = 1; v <= 3; v++)
      if (dom[c] & bit(v)) {
        const x = seen(v, p.b[j], p.a[j]);
        mn = Math.min(mn, x);
        mx = Math.max(mx, x);
      }
    lo += mn === 99 ? 0 : mn;
    hi += mx;
  });
  return [lo, hi];
}

export interface Rules {
  paths: Path[];
  clue: number[];
  /** Which clues are shown. */
  on: boolean[];
  /** Totals of ghosts, vampires, zombies. */
  totals: [number, number, number];
}

/** Sums reachable by adding one option from each set (bit s = sum s). */
const sumset = (a: number, b: number) => {
  let out = 0;
  for (let s = 0; s < 31 && a >>> s; s++) if ((a >>> s) & 1) out |= b << s;
  return out;
};

/**
 * Keep only the monsters that let line `p` show exactly `t` (exact, via reachable sums). Mutates
 * `dom`; returns -1 on a contradiction, 1 when something changed, 0 otherwise.
 */
export function narrowLine(p: Path, dom: Uint8Array, t: number): number {
  const [lo, hi] = pathRange(p, dom);
  if (t < lo || t > hi) return -1;
  if (lo === hi) return 0;
  const m = p.cells.length;
  const opts = p.cells.map((c, j) => {
    let o = 0;
    for (let v = 1; v <= 3; v++) if (dom[c] & bit(v)) o |= 1 << seen(v, p.b[j], p.a[j]);
    return o;
  });
  let changed = 0;
  if (hi < 30) {
    const pre = [1],
      suf: number[] = [];
    suf[m] = 1;
    for (let j = 0; j < m; j++) pre[j + 1] = sumset(pre[j], opts[j]);
    for (let j = m - 1; j >= 0; j--) suf[j] = sumset(suf[j + 1], opts[j]);
    if (!((pre[m] >>> t) & 1)) return -1;
    for (let j = 0; j < m; j++) {
      const c = p.cells[j],
        d = dom[c];
      if (!(d & (d - 1))) continue;
      const rest = sumset(pre[j], suf[j + 1]);
      let nd = d;
      for (let v = 1; v <= 3; v++) {
        if (!(d & bit(v))) continue;
        const x = seen(v, p.b[j], p.a[j]);
        if (x > t || !((rest >>> (t - x)) & 1)) nd &= ~bit(v);
      }
      if (!nd) return -1;
      if (nd !== d) {
        dom[c] = nd;
        changed = 1;
      }
    }
    return changed;
  }
  // Very long lines: bounds only.
  for (let j = 0; j < m; j++) {
    const c = p.cells[j],
      d = dom[c];
    if (!(d & (d - 1))) continue;
    let mn = 99,
      mx = 0;
    for (let v = 1; v <= 3; v++)
      if (d & bit(v)) {
        const x = seen(v, p.b[j], p.a[j]);
        mn = Math.min(mn, x);
        mx = Math.max(mx, x);
      }
    let nd = d;
    for (let v = 1; v <= 3; v++) {
      if (!(d & bit(v))) continue;
      const x = seen(v, p.b[j], p.a[j]);
      if (lo - mn + x > t || hi - mx + x < t) nd &= ~bit(v);
    }
    if (!nd) return -1;
    if (nd !== d) {
      dom[c] = nd;
      changed = 1;
    }
  }
  return changed;
}

/** Narrow domains in place by the clues and the totals. False on a contradiction. */
export function propagate(R: Rules, dom: Uint8Array, cells: number[]): boolean {
  for (let changed = true; changed;) {
    changed = false;
    for (let k = 0; k < R.paths.length; k++) {
      if (!R.on[k]) continue;
      const r = narrowLine(R.paths[k], dom, R.clue[k]);
      if (r < 0) return false;
      if (r) changed = true;
    }
    for (let v = 1; v <= 3; v++) {
      const m = bit(v);
      let fixed = 0,
        maybe = 0;
      for (const c of cells) {
        if (dom[c] === m) fixed++;
        if (dom[c] & m) maybe++;
      }
      const T = R.totals[v - 1];
      if (fixed > T || maybe < T) return false;
      if (fixed === T && maybe > T) {
        for (const c of cells) if (dom[c] !== m && dom[c] & m) dom[c] &= ~m;
        changed = true;
      } else if (maybe === T && fixed < T) {
        for (const c of cells) if (dom[c] & m) dom[c] = m;
        changed = true;
      }
    }
    for (const c of cells) if (!dom[c]) return false;
  }
  return true;
}

export interface HauntedPuzzle {
  n: number;
  mir: number[];
  sol: number[];
  givens: number[];
  paths: Path[];
  clue: number[];
  on: boolean[];
  totals: [number, number, number];
}

/** True when the domain holds exactly one kind. */
export const single = (d: number) => d !== 0 && !(d & (d - 1));

/**
 * Random mirrors and monsters, every border clue computed, then clues removed while propagation alone
 * still solves the board (so the answer is unique and never needs a guess). When the full clue set
 * isn't enough, a few monsters are revealed as givens where the deduction gets stuck.
 */
export function genHaunted(n: number, density: number, keepFrac: number, rng: Rng): HauntedPuzzle {
  const solves = (R: Rules, givens: number[], cells: number[]) => {
    const dom = new Uint8Array(n * n);
    for (const c of cells) dom[c] = givens[c] ? bit(givens[c]) : ALL;
    return propagate(R, dom, cells) && cells.every((c) => single(dom[c]));
  };
  let best: HauntedPuzzle | null = null;
  for (let attempt = 0; attempt < 16; attempt++) {
    const mir = Array.from({ length: n * n }, () => (rng.chance(density) ? rng.int(1, 2) : 0));
    const cells = [...mir.keys()].filter((i) => !mir[i]);
    if (cells.length < n * n * 0.4) continue;
    const sol = mir.map((m) => (m ? 0 : rng.int(1, 3)));
    const paths = tracePaths(n, mir);
    const clue = clueValues(paths, sol);
    const totals: [number, number, number] = [0, 0, 0];
    for (const c of cells) totals[sol[c] - 1]++;
    // Lines that see no cell at all say nothing: never show them.
    const on = paths.map((p) => p.cells.length > 0);
    const R: Rules = { paths, clue, on, totals };
    const givens = mir.map(() => 0);
    // Reveal monsters (where the deduction gets stuck) until the full clue set is enough.
    let ok = false;
    for (let g = 0; g < cells.length - 3; g++) {
      if (solves(R, givens, cells)) {
        ok = true;
        break;
      }
      const dom = new Uint8Array(n * n);
      for (const c of cells) dom[c] = givens[c] ? bit(givens[c]) : ALL;
      propagate(R, dom, cells);
      const stuck = cells.filter((c) => !givens[c] && !single(dom[c]));
      const c = rng.pick(stuck.length ? stuck : cells.filter((x) => !givens[x]));
      givens[c] = sol[c];
    }
    if (!ok) continue;
    const p: HauntedPuzzle = { n, mir, sol, givens, paths, clue, on, totals };
    const count = (q: HauntedPuzzle) => q.givens.filter(Boolean).length;
    if (!best || count(p) < count(best)) best = p;
    if (count(p) === 0) break;
  }
  if (!best) {
    // Fallback (shouldn't happen): a nearly full board with two cells left.
    const mir = Array.from({ length: n * n }, (_, i) => (i % (n + 1) === 0 ? 1 + (i % 2) : 0));
    const sol = mir.map((m) => (m ? 0 : rng.int(1, 3)));
    const paths = tracePaths(n, mir);
    const clue = clueValues(paths, sol);
    const totals: [number, number, number] = [0, 0, 0];
    sol.forEach((v) => v && totals[v - 1]++);
    const open = sol.flatMap((v, i) => (v ? [i] : []));
    const keep = new Set(rng.shuffle([...open]).slice(0, 2));
    const givens = sol.map((v, i) => (keep.has(i) ? 0 : v));
    return { n, mir, sol, givens, paths, clue, on: paths.map((q) => q.cells.length > 0), totals };
  }
  // Remove clues while the answer stays unique.
  const { paths, clue, on, totals, givens, mir } = best;
  const cells = [...mir.keys()].filter((i) => !mir[i]);
  const R: Rules = { paths, clue, on, totals };
  let shown = on.filter(Boolean).length;
  const minShown = Math.ceil(shown * keepFrac);
  for (const k of rng.shuffle([...on.keys()])) {
    if (!on[k] || shown <= minShown) continue;
    on[k] = false;
    if (solves(R, givens, cells)) shown--;
    else on[k] = true;
  }
  return best;
}
