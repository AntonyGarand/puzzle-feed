// Busy Week without the DOM: the generator, task geometry, scoring, save validation and the guide's
// searches. Everything here is state in, answer out, so it can be unit-tested directly.
import type { Rng } from '../../core/rng';
import { byLevel, type Difficulty } from '../../core/types';
import { int, isIntArr } from '../../kits/move/kit';

/** A task's cells as [row, col] offsets, normalised so the top-left of its bounding box is [0, 0]. */
export type Shape = [number, number][];

/** Shifts a shape so its bounding box starts at [0, 0] and sorts its cells (so equal shapes compare equal). */
const norm = (cs: Shape): Shape => {
  const r0 = Math.min(...cs.map((c) => c[0])),
    c0 = Math.min(...cs.map((c) => c[1]));
  return cs.map(([r, c]) => [r - r0, c - c0] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
};
const rotCW = (cs: Shape): Shape => norm(cs.map(([r, c]) => [c, -r] as [number, number]));

/** The shape turned clockwise `k` quarter turns. */
export const turn = (cs: Shape, k: number) => {
  let s = cs;
  for (let i = 0; i < k; i++) s = rotCW(s);
  return s;
};

/** Height and width of a shape's bounding box. */
export const ext = (cs: Shape) => ({ h: Math.max(...cs.map((c) => c[0])) + 1, w: Math.max(...cs.map((c) => c[1])) + 1 });

/** Whether two normalised shapes are the same cells. */
const same = (a: Shape, b: Shape) => a.length === b.length && a.every(([r, c], i) => r === b[i][0] && c === b[i][1]);

/** One task in the tray. */
interface Task {
  /** Cells in the solution orientation (rotation 0). */
  shape: Shape;
  /** Colour index into the game's task colours. */
  col: number;
  /** Top-left cell of the shape in the built solution, or -1 for a decoy. */
  sol: number;
}

/** A generated week: `R` days of `C` hours, the busy hours, the tray and the score to reach. */
export interface Week {
  R: number;
  C: number;
  busy: boolean[];
  tasks: Task[];
  target: number;
}

/** The player's position: each task's top-left cell (-1 = in the tray) and its quarter turns. */
export interface Layout {
  pos: number[];
  rot: number[];
}

/** Generator knobs for one difficulty level. */
interface Level {
  R: number;
  C: number;
  /** Busy hours to block out. */
  nBusy: number;
  /** Relative weights of task sizes 2, 3, 4, 5. */
  sizeW: number[];
  /** Number of colours. */
  K: number;
  /** Extra tasks that are not part of the built plan. */
  nDecoys: number;
  /** Share of the built plan's bonus the target forgives (0 = the plan's full score). */
  slack: number;
}

/** Board size and generator knobs for difficulty `d` (1–5). */
export const levelOf = (d: Difficulty): Level => ({
  C: byLevel(d, [6, 7, 7, 8, 9]),
  R: byLevel(d, [4, 4, 5, 5, 5]),
  nBusy: byLevel(d, [2, 3, 3, 4, 5]),
  sizeW: byLevel(d, [
    [1, 4, 4, 0],
    [1, 3, 4, 1],
    [1, 3, 4, 2],
    [0.5, 2, 4, 3],
    [0.5, 2, 4, 4],
  ]),
  K: byLevel(d, [2, 2, 3, 3, 4]),
  nDecoys: byLevel(d, [0, 0, 1, 2, 2]),
  slack: byLevel(d, [0.5, 0.3, 0.15, 0, 0]),
});

/**
 * Score of a board given each cell's owner (-1 = none): 1 per covered cell, +1 per edge between two
 * different tasks of the same colour.
 */
export function scoreOf(own: readonly number[], col: (k: number) => number, R: number, C: number) {
  let cells = 0,
    bonus = 0;
  for (let i = 0; i < R * C; i++) {
    const a = own[i];
    if (a < 0) continue;
    cells++;
    const r = Math.floor(i / C),
      c = i % C;
    if (c + 1 < C && own[i + 1] >= 0 && own[i + 1] !== a && col(own[i + 1]) === col(a)) bonus++;
    if (r + 1 < R && own[i + C] >= 0 && own[i + C] !== a && col(own[i + C]) === col(a)) bonus++;
  }
  return { cells, bonus, total: cells + bonus };
}

/**
 * Builds a known plan: cut the free hours into 2–5 cell tasks, colour them in clusters, score it.
 * Decoys are extra tasks that don't belong to the plan. The target is the plan's score minus the
 * level's slack, so the plan itself always reaches it. `rot` is each task's starting turn in the tray.
 */
export function generate(rng: Rng, lv: Level): Week & { rot: number[] } {
  const { R, C, nBusy, sizeW, K, nDecoys, slack } = lv;
  const N = R * C;
  const nbrs = (i: number) => {
    const r = Math.floor(i / C),
      c = i % C,
      out: number[] = [];
    if (r > 0) out.push(i - C);
    if (r < R - 1) out.push(i + C);
    if (c > 0) out.push(i - 1);
    if (c < C - 1) out.push(i + 1);
    return out;
  };
  const extOk = (cells: number[]) => {
    const rs = cells.map((i) => Math.floor(i / C)),
      cs = cells.map((i) => i % C);
    return Math.max(...rs) - Math.min(...rs) < 4 && Math.max(...cs) - Math.min(...cs) < 4;
  };
  const pickSize = () => {
    let t = rng.next() * sizeW.reduce((a, b) => a + b, 0);
    for (let s = 0; s < sizeW.length; s++) if ((t -= sizeW[s]) < 0) return s + 2;
    return 3;
  };
  for (let attempt = 0; ; attempt++) {
    const busy = new Array<boolean>(N).fill(false);
    const order = rng.shuffle([...Array(N).keys()]);
    for (let j = 0; j < nBusy; j++) busy[order[j]] = true;
    const own = new Array<number>(N).fill(-1);
    const pieces: number[][] = [];
    const deg = (i: number) => nbrs(i).filter((j) => !busy[j] && own[j] < 0).length;
    for (;;) {
      // Start from the most cornered free cell so nothing gets stranded.
      let start = -1,
        best = Infinity;
      for (let i = 0; i < N; i++) {
        if (busy[i] || own[i] >= 0) continue;
        const v = deg(i) + rng.next() * 0.6;
        if (v < best) [best, start] = [v, i];
      }
      if (start < 0) break;
      const id = pieces.length;
      const size = pickSize();
      const cells = [start];
      own[start] = id;
      while (cells.length < size) {
        const front = [...new Set(cells.flatMap(nbrs))].filter((j) => !busy[j] && own[j] < 0 && extOk([...cells, j]));
        if (!front.length) break;
        let pick = front[0],
          pv = Infinity;
        for (const j of front) {
          const v = deg(j) + rng.next() * 1.5;
          if (v < pv) [pv, pick] = [v, j];
        }
        cells.push(pick);
        own[pick] = id;
      }
      if (cells.length === 1) {
        // A lone cell joins a neighbouring task, or becomes busy time.
        const opts = nbrs(start).filter((j) => own[j] >= 0 && pieces[own[j]].length < 5 && extOk([...pieces[own[j]], start]));
        if (opts.length) {
          const p = own[rng.pick(opts)];
          own[start] = p;
          pieces[p].push(start);
        } else {
          own[start] = -1;
          busy[start] = true;
        }
        continue;
      }
      pieces.push(cells);
    }
    if (busy.filter(Boolean).length > nBusy + 1 && attempt < 40) continue;

    // Colour the tasks in small same-colour clusters, spreading colours evenly.
    const adj = pieces.map(() => new Set<number>());
    for (let i = 0; i < N; i++) for (const j of nbrs(i)) if (own[i] >= 0 && own[j] >= 0 && own[i] !== own[j]) adj[own[i]].add(own[j]);
    const col = new Array<number>(pieces.length).fill(-1);
    const use = new Array<number>(K).fill(0);
    for (const p of rng.shuffle([...pieces.keys()])) {
      if (col[p] >= 0) continue;
      const least = Math.min(...use);
      const c = rng.pick([...use.keys()].filter((k) => use[k] === least));
      const size = rng.int(2, 3);
      const queue = [p];
      col[p] = c;
      use[c]++;
      let n = 1;
      while (queue.length && n < size) {
        const q = queue.shift()!;
        for (const x of rng.shuffle([...adj[q]]))
          if (col[x] < 0 && n < size) {
            col[x] = c;
            use[c]++;
            n++;
            queue.push(x);
          }
      }
    }
    const sol = scoreOf(own, (k) => col[k], R, C);
    const tasks: Task[] = pieces.map((cells, k) => {
      const rc = cells.map((i) => [Math.floor(i / C), i % C] as [number, number]);
      const r0 = Math.min(...rc.map((x) => x[0])),
        c0 = Math.min(...rc.map((x) => x[1]));
      return { shape: norm(rc), col: col[k], sol: r0 * C + c0 };
    });
    for (let d = 0; d < nDecoys; d++) {
      const size = rng.int(3, 4);
      const cs: Shape = [[0, 0]];
      while (cs.length < size) {
        const [r, c] = rng.pick(cs);
        const [dr, dc] = rng.pick([
          [0, 1],
          [1, 0],
          [0, -1],
          [-1, 0],
        ]);
        if (!cs.some(([a, b]) => a === r + dr && b === c + dc)) cs.push([r + dr, c + dc]);
      }
      tasks.push({ shape: norm(cs), col: rng.int(0, K - 1), sol: -1 });
    }
    rng.shuffle(tasks);
    const target = sol.total - Math.floor(sol.bonus * slack);
    return { R, C, busy, tasks, target, rot: tasks.map(() => rng.int(0, 3)) };
  }
}

/** Board cells covered by task `k` with its top-left at `top`, turned `r` times. */
export const cellsAt = (w: Week, k: number, top: number, r: number) => turn(w.tasks[k].shape, r).map(([dr, dc]) => top + dr * w.C + dc);

/** Which task covers each cell (-1 = none). */
export function owners(w: Week, lay: Layout): number[] {
  const own = new Array<number>(w.R * w.C).fill(-1);
  lay.pos.forEach((p, k) => {
    if (p >= 0) for (const i of cellsAt(w, k, p, lay.rot[k])) own[i] = k;
  });
  return own;
}

/** Can task `k` (at its current turn) sit with its top-left at (r, c)? Its own current cells don't count. */
export function fits(w: Week, lay: Layout, k: number, r: number, c: number, own = owners(w, lay)): boolean {
  const s = turn(w.tasks[k].shape, lay.rot[k]);
  const e = ext(s);
  if (r < 0 || c < 0 || r + e.h > w.R || c + e.w > w.C) return false;
  return s.every(([dr, dc]) => {
    const i = (r + dr) * w.C + c + dc;
    return !w.busy[i] && (own[i] < 0 || own[i] === k);
  });
}

/**
 * Top-left cell that centres a shape of size `e` on cell `i`, clamped inside the board, so a tap places
 * the selected task around the tapped hour.
 */
export function topAround(w: Week, e: { h: number; w: number }, i: number): number {
  const r = Math.max(0, Math.min(w.R - e.h, Math.floor(i / w.C) - Math.floor((e.h - 1) / 2)));
  const c = Math.max(0, Math.min(w.C - e.w, (i % w.C) - Math.floor((e.w - 1) / 2)));
  return r * w.C + c;
}

/** Whether `x` is a `{ pos, rot }` for this week with every task inside the board, off busy hours and not overlapping. */
export function isLayout(w: Week, x: unknown): x is Layout {
  if (!x || typeof x !== 'object') return false;
  const { pos: p, rot: r } = x as { pos?: unknown; rot?: unknown };
  const T = w.tasks.length,
    N = w.R * w.C;
  if (!isIntArr(p, T) || !isIntArr(r, T) || !r.every((v) => v >= 0 && v < 4) || !p.every((v) => v >= -1 && v < N)) return false;
  const seen = new Set<number>();
  return p.every((top, k) => {
    if (top < 0) return true;
    const s = turn(w.tasks[k].shape, r[k]);
    const e = ext(s);
    const tr = Math.floor(top / w.C),
      tc = top % w.C;
    if (tr + e.h > w.R || tc + e.w > w.C) return false;
    return s.every(([dr, dc]) => {
      const i = top + dr * w.C + dc;
      if (w.busy[i] || seen.has(i)) return false;
      seen.add(i);
      return true;
    });
  });
}

/** A restored game: the layout, the selected tray task (-1 = none) and up to 100 undo steps. */
interface Restored extends Layout {
  sel: number;
  hist: Layout[];
}

/**
 * Reads a saved `{ pos, rot, sel, hist }` snapshot, or null when it doesn't describe a legal board.
 * A selection on a placed task is dropped and illegal history steps are skipped, so a stale or
 * hand-edited save can't break the game.
 */
export function restore(w: Week, saved: unknown): Restored | null {
  if (!isLayout(w, saved)) return null;
  const sv = saved as Layout & { sel?: unknown; hist?: unknown };
  const pos = sv.pos.slice();
  let sel = int(sv.sel, -1);
  if (sel < 0 || sel >= w.tasks.length || pos[sel] >= 0) sel = -1;
  const hist = Array.isArray(sv.hist)
    ? sv.hist
        .filter((x): x is Layout => isLayout(w, x))
        .map((x) => ({ pos: x.pos.slice(), rot: x.rot.slice() }))
        .slice(-100)
    : [];
  return { pos, rot: sv.rot.slice(), sel, hist };
}

// ---- Guide ----

/** One step of a way to finish: put task `k`, turned `r` times, with its top-left at `top` (covering `cells`). */
export interface Put {
  k: number;
  r: number;
  top: number;
  cells: number[];
}

const sortKey = (cs: number[]) =>
  cs
    .slice()
    .sort((a, b) => a - b)
    .join(',');

/**
 * Placed tasks that aren't on a slot of the built plan. A slot is a colour plus a set of cells: any
 * task of that colour covering exactly those cells counts as on-plan, whichever task it is.
 */
export function offPlan(w: Week, lay: Layout): number[] {
  const slotKeys = new Set<string>();
  w.tasks.forEach((t, j) => {
    if (t.sol >= 0) slotKeys.add(`${t.col}:${sortKey(cellsAt(w, j, t.sol, 0))}`);
  });
  return lay.pos.flatMap((p, k) => (p >= 0 && !slotKeys.has(`${w.tasks[k].col}:${sortKey(cellsAt(w, k, p, lay.rot[k]))}`) ? [k] : []));
}

/**
 * The rest of the built plan: each open slot with a tray task of its colour and shape (and the turn it
 * needs). Null when some open slot is blocked or has no matching task left.
 */
function planRest(w: Week, pos: readonly number[], own: readonly number[]): Put[] | null {
  const used = new Set<number>();
  const out: Put[] = [];
  for (const [j, t] of w.tasks.entries()) {
    if (t.sol < 0) continue;
    const cells = cellsAt(w, j, t.sol, 0);
    if (cells.some((i) => own[i] >= 0)) continue;
    let put: Put | null = null;
    for (const x of [j, ...w.tasks.keys()]) {
      if (pos[x] >= 0 || used.has(x) || w.tasks[x].col !== t.col) continue;
      const r = [0, 1, 2, 3].find((q) => same(turn(w.tasks[x].shape, q), t.shape));
      if (r !== undefined) {
        put = { k: x, r, top: t.sol, cells };
        break;
      }
    }
    if (!put) return null;
    used.add(put.k);
    out.push(put);
  }
  return out;
}

/**
 * A way to reach the target that keeps every placed task where it is: fills the hours in reading
 * order, each with a tray task or left empty, pruned by the best score still possible. 'capped' when
 * the search budget runs out (no proof either way), null when there is none.
 */
export function search(w: Week, pos: readonly number[], own0: readonly number[], budget = 8000): Put[] | null | 'capped' {
  const { R, C, busy, tasks, target } = w;
  const N = R * C;
  const own = own0.map((k, i) => (busy[i] ? -3 : k));
  // Tray tasks grouped by colour and shape (interchangeable), each with its distinct turns.
  type Turn = { r: number; s: Shape; c0: number; e: { h: number; w: number }; off: number[] };
  const groups: { ids: number[]; turns: Turn[] }[] = [];
  const byKey = new Map<string, number>();
  for (let k = 0; k < tasks.length; k++) {
    if (pos[k] >= 0) continue;
    const turns = [0, 1, 2, 3].map((r) => ({ r, s: turn(tasks[k].shape, r) }));
    const gk = `${tasks[k].col}:${turns.map((x) => JSON.stringify(x.s)).sort()[0]}`;
    const g = byKey.get(gk);
    if (g != null) {
      groups[g].ids.push(k);
      continue;
    }
    byKey.set(gk, groups.length);
    const uniq = turns.filter((x, q) => turns.findIndex((y) => same(y.s, x.s)) === q);
    groups.push({ ids: [k], turns: uniq.map((x) => ({ ...x, c0: x.s[0][1], e: ext(x.s), off: x.s.map(([dr, dc]) => dr * C + dc) })) });
  }
  // Bigger tasks first: they are the hardest to fit later.
  groups.sort((a, b) => b.turns[0].s.length - a.turns[0].s.length);
  const left = groups.map((g) => g.ids.length);
  // Running totals, updated cell by cell: placed hours, bonus edges, and edges that could still
  // become a bonus (one end open, the other open or placed). Best score still possible = all three
  // plus the open hours.
  const colOf = (k: number) => tasks[k].col;
  let placed = 0,
    open = 0,
    bonus = 0,
    maybe = 0;
  const bon = (x: number, y: number) => (x >= 0 && y >= 0 && x !== y && colOf(x) === colOf(y) ? 1 : 0);
  const pot = (x: number, y: number) => ((x === -1 && (y >= 0 || y === -1)) || (y === -1 && x >= 0) ? 1 : 0);
  const around = (i: number) => [i >= C ? i - C : -1, i + C < N ? i + C : -1, i % C ? i - 1 : -1, (i + 1) % C ? i + 1 : -1];
  const nbrs = Array.from({ length: N }, (_, i) => around(i).filter((x) => x >= 0));
  const count = (i: number, sign: number) => {
    const x = own[i];
    if (x >= 0) placed += sign;
    else if (x === -1) open += sign;
    for (const n of nbrs[i]) {
      bonus += sign * bon(x, own[n]);
      maybe += sign * pot(x, own[n]);
    }
  };
  const set = (i: number, v: number) => {
    count(i, -1);
    own[i] = v;
    count(i, 1);
  };
  for (let i = 0; i < N; i++) {
    if (own[i] >= 0) placed++;
    else if (own[i] === -1) open++;
    for (const n of nbrs[i])
      if (n > i) {
        bonus += bon(own[i], own[n]);
        maybe += pot(own[i], own[n]);
      }
  }
  const path: (Put & { s: Shape })[] = [];
  let nodes = 0;
  const dfs = (from: number): boolean | 'capped' => {
    if (++nodes > budget) return 'capped';
    if (placed + bonus >= target) return true;
    if (placed + bonus + open + maybe < target) return false;
    let i = from;
    while (i < N && own[i] !== -1) i++;
    if (i >= N) return false;
    const r0 = Math.floor(i / C);
    for (let g = 0; g < groups.length; g++) {
      if (!left[g]) continue;
      const k = groups[g].ids[groups[g].ids.length - left[g]];
      for (const t of groups[g].turns) {
        const tc = (i % C) - t.c0;
        if (tc < 0 || tc + t.e.w > C || r0 + t.e.h > R) continue;
        const top = r0 * C + tc;
        let free = true;
        for (const o of t.off) if (own[top + o] !== -1) free = false;
        if (!free) continue;
        const cells = t.off.map((o) => top + o);
        for (const x of cells) set(x, k);
        left[g]--;
        path.push({ k, r: t.r, s: t.s, top, cells });
        const res = dfs(i + 1);
        if (res) return res;
        path.pop();
        left[g]++;
        for (const x of cells) set(x, -1);
      }
    }
    set(i, -2);
    const res = dfs(i + 1);
    set(i, -1);
    return res;
  };
  const res = dfs(0);
  if (res === 'capped') return 'capped';
  // Same group means same shape, but each task may need its own turn to get it.
  return res
    ? path.map(({ k, s, top, cells }) => ({ k, r: [0, 1, 2, 3].find((q) => same(turn(tasks[k].shape, q), s))!, top, cells }))
    : null;
}

/**
 * How to finish from this layout: the rest of the built plan while every placed task is on it,
 * otherwise a search that keeps the placed tasks (null = the target is out of reach, 'capped' = the
 * search gave up).
 */
export function finishFrom(w: Week, lay: Layout): Put[] | null | 'capped' {
  const own = owners(w, lay);
  return offPlan(w, lay).length ? search(w, lay.pos, own) : planRest(w, lay.pos, own);
}

/**
 * The placed task to blame when the target is out of reach: an off-plan task whose removal makes the
 * target reachable again (proved by a search), else one that strands a pocket no tray task fits,
 * else the first off-plan task. Null when nothing is off the plan.
 */
export function culprit(w: Week, lay: Layout): number | null {
  const off = offPlan(w, lay);
  if (!off.length) return null;
  const without = (k: number): Layout => ({ pos: lay.pos.map((p, x) => (x === k ? -1 : p)), rot: lay.rot });
  const freeing = off.find((k) => Array.isArray(finishFrom(w, without(k))));
  if (freeing != null) return freeing;
  return off.find((k) => stranded(w, lay, k) !== null) ?? off[0];
}

/** Open hours next to placed task `k` that form a pocket too small for any task left in the tray, if any. */
export function stranded(w: Week, lay: Layout, k: number): number[] | null {
  const { C, busy, tasks } = w;
  const N = w.R * C;
  const own = owners(w, lay);
  const minSize = Math.min(...tasks.flatMap((t, x) => (lay.pos[x] < 0 ? [t.shape.length] : [])));
  const seen = new Set<number>();
  const around = (x: number) => [x - C, x + C, x % C ? x - 1 : -1, (x + 1) % C ? x + 1 : -1];
  for (const i of cellsAt(w, k, lay.pos[k], lay.rot[k]))
    for (const n0 of around(i)) {
      if (n0 < 0 || n0 >= N || busy[n0] || own[n0] >= 0 || seen.has(n0)) continue;
      const region = [n0];
      seen.add(n0);
      for (let q = 0; q < region.length; q++)
        for (const y of around(region[q]))
          if (y >= 0 && y < N && !busy[y] && own[y] < 0 && !seen.has(y)) {
            seen.add(y);
            region.push(y);
          }
      if (region.length < minSize) return region;
    }
  return null;
}

/**
 * The guide's pick among the steps of a way to finish: the most hemmed-in one (fewest open
 * neighbours). `walls` are the busy or covered hours around it, `bonus` the same-colour edges it would
 * add with tasks already placed.
 */
export function bestPut(w: Week, own: readonly number[], rest: readonly Put[]): Put & { walls: number[]; bonus: number } {
  const { R, C, busy, tasks } = w;
  const N = R * C;
  let best: (Put & { free: number; walls: number[] }) | null = null;
  for (const put of rest) {
    const set = new Set(put.cells);
    let free = 0;
    const walls: number[] = [];
    for (const i of put.cells) {
      const ri = Math.floor(i / C),
        ci = i % C;
      for (const [y, x] of [
        [ri - 1, ci],
        [ri + 1, ci],
        [ri, ci - 1],
        [ri, ci + 1],
      ]) {
        if (y < 0 || x < 0 || y >= R || x >= C) continue;
        const n = y * C + x;
        if (set.has(n)) continue;
        if (busy[n] || own[n] >= 0) walls.push(n);
        else free++;
      }
    }
    if (!best || free < best.free) best = { ...put, free, walls };
  }
  const { k, r, top, cells, walls } = best!;
  const bonus = new Set<string>();
  for (const i of cells)
    for (const n of [i - C, i + C, i % C ? i - 1 : -1, (i + 1) % C ? i + 1 : -1])
      if (n >= 0 && n < N && own[n] >= 0 && tasks[own[n]].col === tasks[k].col) bonus.add(`${i}-${n}`);
  return { k, r, top, cells, walls, bonus: bonus.size };
}
