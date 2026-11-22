import { L, P } from '../core/i18n';
import type { Rng } from '../core/rng';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, btn, h, shake } from '../core/ui';
import { anim, int, isIntArr } from './movekit/kit';
import './week.css';

/** Task colours (kept away from the purple accent). */
const COLS = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p7)'];

type Shape = [number, number][];
const norm = (cs: Shape): Shape => {
  const r0 = Math.min(...cs.map((c) => c[0])),
    c0 = Math.min(...cs.map((c) => c[1]));
  return cs.map(([r, c]) => [r - r0, c - c0] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
};
const rotCW = (cs: Shape): Shape => norm(cs.map(([r, c]) => [c, -r] as [number, number]));
const turn = (cs: Shape, k: number) => {
  let s = cs;
  for (let i = 0; i < k; i++) s = rotCW(s);
  return s;
};
const ext = (cs: Shape) => ({ h: Math.max(...cs.map((c) => c[0])) + 1, w: Math.max(...cs.map((c) => c[1])) + 1 });
const same = (a: Shape, b: Shape) => a.length === b.length && a.every(([r, c], i) => r === b[i][0] && c === b[i][1]);

interface Task {
  /** Cells in the solution orientation (rotation 0). */
  shape: Shape;
  /** Colour index into COLS. */
  col: number;
  /** Top-left cell of the shape in the built solution, or -1 for a decoy. */
  sol: number;
}

/** Score: 1 per covered cell, +1 per edge between two different pieces of the same colour. */
function scoreOf(own: number[], col: (k: number) => number, R: number, C: number) {
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
 * Decoys are extra tasks that don't belong to the plan.
 */
function generate(rng: Rng, R: number, C: number, nBusy: number, sizeW: number[], K: number, nDecoys: number, slack: number) {
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
    return { busy, tasks, target, rot: tasks.map(() => rng.int(0, 3)) };
  }
}

export const week: PuzzleDef = {
  id: 'week',
  get name() {
    return L('Busy Week', 'Semaine chargée');
  },
  category: 'logic',
  offByDefault: true,
  get rules() {
    return L('Reach the target: 1 pt per hour, +1 per same-colour edge', 'Visez la cible : 1 pt par heure, +1 par côté même couleur');
  },
  help: () => ({
    goal: L(
      'Fit tasks into your week’s free hours to reach the target score.',
      'Casez des tâches dans les heures libres de votre semaine pour atteindre le pointage visé.',
    ),
    steps: [
      L(
        'Each row is a day and each square an hour. Hatched hours are busy: nothing goes there.',
        'Chaque rangée est une journée et chaque case, une heure. Les heures hachurées sont occupées : rien n’y va.',
      ),
      L('Every hour covered by a task scores 1 point.', 'Chaque heure couverte par une tâche vaut 1 point.'),
      L(
        'Two different tasks of the same colour score +1 for every edge they share (shown by a dot).',
        'Deux tâches différentes de la même couleur valent +1 par côté commun (marqué d’un point).',
      ),
      L(
        'Tap a task to pick it, tap it again (or Rotate) to turn it, then tap the grid or drag it there.',
        'Touchez une tâche pour la choisir, touchez-la encore (ou Pivoter) pour la tourner, puis touchez la grille ou glissez-la.',
      ),
      L(
        'Tap or drag a placed task to take it back. Undo and Reset are in the footer.',
        'Touchez ou glissez une tâche posée pour la reprendre. Annuler et Recommencer sont en bas.',
      ),
    ],
    tips: [
      L(
        'Fill the awkward corners and gaps next to busy hours first.',
        'Remplissez d’abord les coins et les trous difficiles près des heures occupées.',
      ),
      L(
        'On harder levels some tasks are extra: not everything fits, so leave out the ones that don’t.',
        'Aux niveaux difficiles, certaines tâches sont en trop : tout ne rentre pas, laissez de côté celles qui ne vont pas.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [60, 100, 160, 240, 330]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const C = byLevel(d, [6, 7, 7, 8, 9]);
    const R = byLevel(d, [4, 4, 5, 5, 5]);
    const N = R * C;
    const gen = generate(
      rng,
      R,
      C,
      byLevel(d, [2, 3, 3, 4, 5]),
      byLevel(d, [
        [1, 4, 4, 0],
        [1, 3, 4, 1],
        [1, 3, 4, 2],
        [0.5, 2, 4, 3],
        [0.5, 2, 4, 4],
      ]),
      byLevel(d, [2, 2, 3, 3, 4]),
      byLevel(d, [0, 0, 1, 2, 2]),
      byLevel(d, [0.5, 0.3, 0.15, 0, 0]),
    );
    const { busy, tasks, target } = gen;
    const T = tasks.length;

    let pos = tasks.map(() => -1);
    let rot = gen.rot.slice();
    let sel = -1;
    let over = false;
    let hist: { pos: number[]; rot: number[] }[] = [];

    const shapeOf = (k: number, r = rot[k]) => turn(tasks[k].shape, r);
    const cellsAt = (k: number, top: number, r = rot[k]) => shapeOf(k, r).map(([dr, dc]) => top + dr * C + dc);
    const owners = () => {
      const own = new Array<number>(N).fill(-1);
      pos.forEach((p, k) => {
        if (p >= 0) for (const i of cellsAt(k, p)) own[i] = k;
      });
      return own;
    };
    /** Can task k sit with its top-left at (r, c)? Its own current cells don't count. */
    const fits = (k: number, r: number, c: number, own = owners()) => {
      const s = shapeOf(k);
      const e = ext(s);
      if (r < 0 || c < 0 || r + e.h > R || c + e.w > C) return false;
      return s.every(([dr, dc]) => {
        const i = (r + dr) * C + c + dc;
        return !busy[i] && (own[i] < 0 || own[i] === k);
      });
    };

    // Restore a save if it describes a legal board.
    const sv = ctx.saved as { pos?: unknown; rot?: unknown; sel?: unknown; hist?: unknown } | undefined;
    const okState = (p: unknown, r: unknown): p is number[] => {
      if (!isIntArr(p, T) || !isIntArr(r, T) || !r.every((x) => x >= 0 && x < 4) || !p.every((x) => x >= -1 && x < N)) return false;
      const seen = new Set<number>();
      return p.every((top, k) => {
        if (top < 0) return true;
        const s = turn(tasks[k].shape, r[k]);
        const e = ext(s);
        const tr = Math.floor(top / C),
          tc = top % C;
        if (tr + e.h > R || tc + e.w > C) return false;
        return s.every(([dr, dc]) => {
          const i = top + dr * C + dc;
          if (busy[i] || seen.has(i)) return false;
          seen.add(i);
          return true;
        });
      });
    };
    if (sv && okState(sv.pos, sv.rot)) {
      pos = sv.pos.slice();
      rot = (sv.rot as number[]).slice();
      sel = int(sv.sel, -1);
      if (sel < 0 || sel >= T || pos[sel] >= 0) sel = -1;
      if (Array.isArray(sv.hist))
        hist = sv.hist
          .filter((x): x is { pos: number[]; rot: number[] } => !!x && typeof x === 'object' && okState(x.pos, x.rot))
          .map((x) => ({ pos: x.pos.slice(), rot: x.rot.slice() }))
          .slice(-100);
    }

    const scoreEl = h('strong', { class: 'wk-pts' });
    const bonusEl = h('span', { class: 'wk-bonus' });
    const bar = h('div', { class: 'wk-bar' }, h('span', null, L('Score', 'Pointage'), ' ', scoreEl, ` / ${target}`), bonusEl);
    const grid = board(C, R, 'wk-grid');
    const els = busy.map((_, i) => {
      const el = h('button', { type: 'button', class: 'cell', onclick: () => tapCell(i) });
      el.addEventListener('pointerdown', (e) => {
        const k = owners()[i];
        if (k >= 0) startDrag(k, e, el, true);
      });
      grid.append(el);
      return el;
    });
    const trayEl = h('div', { class: 'wk-tray', style: `--tc:${T > 12 ? 7 : 6}` });
    const slots = tasks.map((_, k) => {
      const el = h('button', { type: 'button', class: 'key wk-slot', onclick: () => tapSlot(k) });
      el.addEventListener('pointerdown', (e) => {
        if (pos[k] < 0) startDrag(k, e, el, false);
      });
      trayEl.append(el);
      return el;
    });
    const rotBtn = btn(L('Rotate', 'Pivoter'), () => rotate(), 'ghost');
    ctx.controls(
      rotBtn,
      btn(L('Undo', 'Annuler'), () => undo(), 'ghost'),
      btn(L('Reset', 'Recommencer'), () => reset(), 'ghost'),
    );

    let preview: { k: number; top: number; cells: number[] } | null = null;
    const render = () => {
      const own = owners();
      const pv = new Set(preview?.cells ?? []);
      const colOf = (k: number) => tasks[k].col;
      els.forEach((el, i) => {
        const k = own[i];
        const r = Math.floor(i / C),
          c = i % C;
        let cls = 'cell';
        let style = '';
        if (busy[i]) cls += ' busy';
        else if (k >= 0) {
          cls += ' fill';
          style = `--c:${COLS[colOf(k)]}`;
          const rk = c + 1 < C ? own[i + 1] : -1;
          const dk = r + 1 < R ? own[i + C] : -1;
          if (rk === k) cls += ' jr';
          else if (rk >= 0 && colOf(rk) === colOf(k)) cls += ' br';
          if (dk === k) cls += ' jd';
          else if (dk >= 0 && colOf(dk) === colOf(k)) cls += ' bd';
        } else if (pv.has(i)) {
          cls += ' pv';
          style = `--c:${COLS[colOf(preview!.k)]}`;
        }
        el.className = cls;
        if (style) el.setAttribute('style', style);
        else el.removeAttribute('style');
      });
      slots.forEach((el, k) => {
        const placed = pos[k] >= 0;
        el.className = `key wk-slot${k === sel ? ' sel' : ''}${placed ? ' used' : ''}`;
        el.setAttribute('aria-label', P(tasks[k].shape.length, ['hour', 'hours'], ['heure', 'heures']));
        if (placed) {
          el.replaceChildren();
          return;
        }
        const s = shapeOf(k);
        const e = ext(s);
        el.replaceChildren(
          h(
            'span',
            { class: 'wk-mini', style: `--w:${e.w};--h:${e.h}` },
            ...s.map(([r, c]) => h('i', { style: `grid-row:${r + 1};grid-column:${c + 1};--c:${COLS[tasks[k].col]}` })),
          ),
        );
      });
      const sc = scoreOf(own, colOf, R, C);
      scoreEl.textContent = String(sc.total);
      bonusEl.textContent = sc.bonus ? L(`bonus +${sc.bonus}`, `boni +${sc.bonus}`) : '';
      bar.classList.toggle('won', sc.total >= target);
      rotBtn.disabled = over || sel < 0;
      const placed = pos.filter((p) => p >= 0).length;
      const free = N - sc.cells - busy.filter(Boolean).length;
      ctx.status(
        over
          ? L(`Target reached: ${sc.total} points!`, `Cible atteinte : ${sc.total} points!`)
          : `${L('Tasks', 'Tâches')} ${placed}/${T} · ${L(`${free} h free`, `${free} h libres`)}`,
      );
    };

    const save = () => {
      hist.push({ pos: pos.slice(), rot: rot.slice() });
      if (hist.length > 100) hist.shift();
    };

    const place = (k: number, top: number, record = true): boolean => {
      const r = Math.floor(top / C),
        c = top % C;
      if (over || k < 0 || !fits(k, r, c)) return false;
      ctx.touch();
      if (record) save();
      pos[k] = top;
      sel = -1;
      preview = null;
      render();
      for (const i of cellsAt(k, top)) anim(els[i], [{ transform: 'scale(0.8)' }, { transform: 'scale(1)' }], 140);
      const sc = scoreOf(owners(), (x) => tasks[x].col, R, C);
      if (sc.total >= target) {
        over = true;
        render();
        anim(bar, [{ transform: 'scale(1.08)' }, { transform: 'scale(1)' }], 260);
        ctx.solved();
      }
      return true;
    };

    const pickUp = (k: number) => {
      if (over || pos[k] < 0) return;
      ctx.touch();
      save();
      pos[k] = -1;
      sel = k;
      render();
      anim(slots[k], [{ transform: 'scale(0.85)' }, { transform: 'scale(1)' }], 160);
    };

    const rotate = () => {
      if (over || sel < 0) return;
      ctx.touch();
      rot[sel] = (rot[sel] + 1) % 4;
      render();
      anim(slots[sel], [{ transform: 'rotate(-90deg)' }, { transform: 'rotate(0)' }], 160);
    };

    const undo = () => {
      if (over || !hist.length) return;
      ctx.touch();
      const s = hist.pop()!;
      pos = s.pos;
      rot = s.rot;
      sel = -1;
      render();
    };

    const reset = () => {
      if (over || pos.every((p) => p < 0)) return;
      ctx.touch();
      save();
      pos = pos.map(() => -1);
      sel = -1;
      render();
    };

    let suppressClick = false;
    const tapSlot = (k: number) => {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      if (over || pos[k] >= 0) return;
      ctx.touch();
      if (sel === k) rotate();
      else {
        sel = k;
        render();
      }
    };
    /** Tap on the board: pick up a placed task, or centre the selected one on the tapped hour. */
    const tapCell = (i: number) => {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      if (over) return;
      const k = owners()[i];
      if (k >= 0) return pickUp(k);
      if (sel < 0 || busy[i]) return;
      const e = ext(shapeOf(sel));
      const r = Math.max(0, Math.min(R - e.h, Math.floor(i / C) - Math.floor((e.h - 1) / 2)));
      const c = Math.max(0, Math.min(C - e.w, (i % C) - Math.floor((e.w - 1) / 2)));
      if (!place(sel, r * C + c)) shake(grid);
    };

    // Drag (from the tray or the board): a ghost follows the pointer, lifted above the finger on touch.
    let drag: {
      k: number;
      id: number;
      sx: number;
      sy: number;
      active: boolean;
      ghost: HTMLElement | null;
      lift: number;
      fromBoard: boolean;
      before: { pos: number[]; rot: number[] } | null;
    } | null = null;
    const geom = () => {
      const a = els[0].getBoundingClientRect(),
        b = els[1].getBoundingClientRect();
      return { ox: a.left, oy: a.top, cs: a.width, pitch: b.left - a.left };
    };
    const startDrag = (k: number, e: PointerEvent, el: HTMLElement, fromBoard: boolean) => {
      if (over || drag) return;
      drag = {
        k,
        id: e.pointerId,
        sx: e.clientX,
        sy: e.clientY,
        active: false,
        ghost: null,
        lift: e.pointerType === 'touch' ? 1 : 0,
        fromBoard,
        before: null,
      };
      el.setPointerCapture?.(e.pointerId);
    };
    const moveDrag = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const k = drag.k;
      const g = geom();
      if (!drag.active) {
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
        ctx.touch();
        drag.active = true;
        if (drag.fromBoard) {
          drag.before = { pos: pos.slice(), rot: rot.slice() };
          pos[k] = -1;
        }
        sel = k;
        const s = shapeOf(k);
        const ex = ext(s);
        drag.ghost = h(
          'div',
          { class: 'wk-ghost', style: `--cs:${g.cs}px;--gap:${g.pitch - g.cs}px;--w:${ex.w};--h:${ex.h}` },
          ...s.map(([r, c]) => h('i', { style: `grid-row:${r + 1};grid-column:${c + 1};--c:${COLS[tasks[k].col]}` })),
        );
        root.append(drag.ghost);
        render();
      }
      const ex = ext(shapeOf(k));
      const gw = ex.w * g.pitch,
        gh = ex.h * g.pitch;
      const gx = e.clientX - gw / 2,
        gy = e.clientY - gh / 2 - drag.lift * (gh / 2 + g.pitch * 1.2);
      drag.ghost!.style.left = `${gx}px`;
      drag.ghost!.style.top = `${gy}px`;
      const r = Math.round((gy - g.oy) / g.pitch),
        c = Math.round((gx - g.ox) / g.pitch);
      const next = fits(k, r, c) ? { k, top: r * C + c, cells: cellsAt(k, r * C + c) } : null;
      if (next?.top !== preview?.top || !next !== !preview) {
        preview = next;
        render();
      }
    };
    const endDrag = (e: PointerEvent, cancel = false) => {
      if (!drag || e.pointerId !== drag.id) return;
      const g = drag;
      drag = null;
      if (!g.active) return;
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 0);
      g.ghost?.remove();
      const pv = preview;
      preview = null;
      if (!cancel && pv) {
        if (g.before) hist.push(g.before);
        if (place(g.k, pv.top, !g.before)) return;
        if (g.before) hist.pop();
      }
      if (g.before) {
        const gr = grid.getBoundingClientRect();
        const outside = e.clientX < gr.left || e.clientX > gr.right || e.clientY < gr.top || e.clientY > gr.bottom;
        if (outside && !cancel) {
          // Dropped off the board: back to the tray.
          hist.push(g.before);
          if (hist.length > 100) hist.shift();
        } else {
          pos[g.k] = g.before.pos[g.k];
          sel = -1;
        }
      }
      render();
    };
    for (const el of [grid, trayEl]) {
      el.addEventListener('pointermove', moveDrag);
      el.addEventListener('pointerup', (e) => endDrag(e));
      el.addEventListener('pointercancel', (e) => endDrag(e, true));
    }

    /** Guide: follows the built plan, most hemmed-in open slot first. */
    const hint = (): Hint | null => {
      if (over) return null;
      const own = owners();
      const solCells = (j: number) => cellsAt(j, tasks[j].sol, 0);
      const key = (cs: number[]) =>
        cs
          .slice()
          .sort((a, b) => a - b)
          .join(',');
      const slotKeys = new Map<string, number>();
      tasks.forEach((t, j) => {
        if (t.sol >= 0) slotKeys.set(`${t.col}:${key(solCells(j))}`, j);
      });
      // A placed task off the plan: take it back.
      for (let k = 0; k < T; k++) {
        if (pos[k] < 0) continue;
        const cs = cellsAt(k, pos[k]);
        if (slotKeys.has(`${tasks[k].col}:${key(cs)}`)) continue;
        return {
          text: L(
            'This task blocks a better plan. Tap it to send it back to the tray.',
            'Cette tâche bloque un meilleur plan. Touchez-la pour la renvoyer dans le bac.',
          ),
          at: cs.map((i) => els[i]),
          play: () => tapCell(cs[0]),
        };
      }
      let best: { j: number; k: number; r: number; cells: number[]; free: number; walls: number[] } | null = null;
      for (const [j, t] of tasks.entries()) {
        if (t.sol < 0) continue;
        const cells = solCells(j);
        if (cells.some((i) => own[i] >= 0)) continue;
        const shape = t.shape;
        // A task in the tray with this shape and colour (itself if it's still there).
        let k = -1,
          r = 0;
        for (const x of [j, ...tasks.keys()]) {
          if (pos[x] >= 0 || tasks[x].col !== t.col) continue;
          const rr = [0, 1, 2, 3].find((q) => same(turn(tasks[x].shape, q), shape));
          if (rr !== undefined) {
            [k, r] = [x, rr];
            break;
          }
        }
        if (k < 0) continue;
        const set = new Set(cells);
        let free = 0;
        const walls: number[] = [];
        for (const i of cells) {
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
        if (!best || free < best.free) best = { j, k, r, cells, free, walls };
      }
      if (!best) return null;
      const { j, k, r, cells, walls } = best;
      const top = tasks[j].sol;
      const sz = cells.length;
      const bonus = new Set<string>();
      for (const i of cells)
        for (const n of [i - C, i + C, i % C ? i - 1 : -1, (i + 1) % C ? i + 1 : -1])
          if (n >= 0 && n < N && own[n] >= 0 && tasks[own[n]].col === tasks[k].col) bonus.add(`${i}-${n}`);
      const play = () => {
        if (sel !== k) tapSlot(k);
        while (rot[k] !== r) rotate();
        place(k, top);
      };
      const nb = bonus.size;
      const text =
        nb > 0
          ? L(
              `This ${sz}-hour task fits here and touches ${nb === 1 ? 'one same-colour edge' : `${nb} same-colour edges`}: ${sz} points plus ${nb} bonus.`,
              `Cette tâche de ${sz} heures va ici et touche ${nb === 1 ? 'un côté de même couleur' : `${nb} côtés de même couleur`} : ${sz} points plus ${nb} de boni.`,
            )
          : walls.some((i) => busy[i])
            ? L(
                `This ${sz}-hour task fills the gap beside the busy hours without leaving a hole.`,
                `Cette tâche de ${sz} heures comble le trou près des heures occupées sans laisser de vide.`,
              )
            : L(
                `This ${sz}-hour task fits snugly against the edge, leaving no stranded hours.`,
                `Cette tâche de ${sz} heures se cale contre le bord sans laisser d’heures isolées.`,
              );
      return { text, why: walls.length ? walls.map((i) => els[i]) : [slots[k]], at: cells.map((i) => els[i]), play };
    };

    root.append(bar, grid, trayEl);
    render();
    return {
      snapshot: () => ({ pos, rot, sel, hist }),
      hint,
      onKey(e) {
        if (e.key === 'r' || e.key === 'R') {
          rotate();
          return true;
        }
        if (e.key === 'u' || e.key === 'U' || ((e.ctrlKey || e.metaKey) && e.key === 'z')) {
          undo();
          return true;
        }
        if (e.key === 'Escape') {
          sel = -1;
          render();
          return true;
        }
        return false;
      },
      destroy() {
        drag?.ghost?.remove();
      },
    };
  },
};
