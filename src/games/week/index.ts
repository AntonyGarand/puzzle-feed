import { L, P } from '../../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../../core/types';
import { board, btn, h, restartBtn, shake, undoBtn } from '../../ui/dom';
import { dragPoint, TOUCH_LIFT_CELLS } from '../../ui/drag';
import { anim } from '../../kits/move/kit';
import {
  bestPut,
  cellsAt as cellsOf,
  culprit,
  ext,
  finishFrom,
  fits as fitsAt,
  generate,
  type Layout,
  levelOf,
  offPlan as offPlanOf,
  owners as ownersOf,
  type Put,
  restore,
  scoreOf,
  stranded as strandedOf,
  topAround,
  turn,
} from './rules';
import './style.css';

/** Task colours (kept away from the purple accent). */
const COLS = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p7)'];

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
        'Tap or drag a placed task to take it back. Undo (Z) and Restart (R) are in the footer; Space rotates.',
        'Touchez ou glissez une tâche posée pour la reprendre. Annuler (Z) et Repartir (R) sont en bas; Espace fait pivoter.',
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
    const w = generate(rng, levelOf(d));
    const { R, C, busy, tasks, target } = w;
    const N = R * C;
    const T = tasks.length;

    let pos = tasks.map(() => -1);
    let rot = w.rot.slice();
    let sel = -1;
    let over = false;
    let hist: Layout[] = [];

    const lay = (): Layout => ({ pos, rot });
    const shapeOf = (k: number) => turn(tasks[k].shape, rot[k]);
    const cellsAt = (k: number, top: number) => cellsOf(w, k, top, rot[k]);
    const owners = () => ownersOf(w, lay());
    const fits = (k: number, r: number, c: number) => fitsAt(w, lay(), k, r, c);

    // Restore a save if it describes a legal board.
    const sv = restore(w, ctx.saved);
    if (sv) ({ pos, rot, sel, hist } = sv);

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
      undoBtn(() => undo()),
      restartBtn(() => reset()),
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
      rotBtn.disabled = over || sel < 0;
      const placed = pos.filter((p) => p >= 0).length;
      const free = N - sc.cells - busy.filter(Boolean).length;
      ctx.status(`${placed} / ${P(T, ['task', 'tasks'], ['tâche', 'tâches'])} · ${P(free, ['h free', 'h free'], ['h libre', 'h libres'])}`);
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

    const rotate = (record = true) => {
      if (over || sel < 0) return;
      ctx.touch();
      if (record) save();
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
      if (!place(sel, topAround(w, ext(shapeOf(sel)), i))) shake(grid);
    };

    // Drag (from the tray or the board): a ghost follows the pointer; on touch it floats above the finger and runs ahead of it.
    let drag: {
      k: number;
      id: number;
      sx: number;
      sy: number;
      active: boolean;
      ghost: HTMLElement | null;
      touch: boolean;
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
        touch: e.pointerType === 'touch',
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
      const at = dragPoint(drag, e.clientX, e.clientY, gh / 2 + g.pitch * TOUCH_LIFT_CELLS);
      const gx = at.x - gw / 2,
        gy = at.y - gh / 2;
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
        const { pitch } = geom();
        const ex = ext(shapeOf(g.k));
        const at = dragPoint(g, e.clientX, e.clientY, (ex.h * pitch) / 2 + pitch * TOUCH_LIFT_CELLS);
        const outside = at.x < gr.left || at.x > gr.right || at.y < gr.top || at.y > gr.bottom;
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

    // ---- Guide ----
    const offPlan = () => offPlanOf(w, lay());
    /** How to finish from here, kept until the board changes (check() then hint() search once). */
    let memo: { key: string; rest: Put[] | null | 'capped'; blame?: number | null } | null = null;
    const finish = () => {
      const key = owners().join(',');
      if (memo?.key !== key) memo = { key, rest: finishFrom(w, lay()) };
      return memo;
    };
    /**
     * A placed task that puts the target out of reach (proved by the search, not just "off the guide's
     * plan": any arrangement that still reaches the target is left alone).
     */
    const check = (): Hint | null => {
      if (over || drag?.active) return null;
      if (!offPlan().length) return null;
      const m = finish();
      if (m.rest !== null) return null;
      // Blame the task whose removal makes the target reachable again, not just the first off-plan one.
      if (m.blame === undefined) m.blame = culprit(w, lay());
      const k = m.blame;
      if (k == null) return null;
      const cs = cellsAt(k, pos[k]);
      const gap = strandedOf(w, lay(), k);
      return {
        kind: 'fix',
        text: gap
          ? L(
              `This task leaves ${gap.length === 1 ? 'a lone hour' : `a pocket of ${gap.length} hours`} that no task in the tray is small enough to fill, and with it here ${target} points are out of reach. Take it back.`,
              `Cette tâche laisse ${gap.length === 1 ? 'une heure isolée' : `un trou de ${gap.length} heures`} qu’aucune tâche du bac n’est assez petite pour remplir, et avec elle ici, ${target} points sont hors d’atteinte. Reprenez-la.`,
            )
          : L(
              `This task breaks no rule, but with it here no way of filling the other hours reaches ${target} points. Take it back.`,
              `Cette tâche ne brise aucune règle, mais avec elle ici, aucune façon de remplir les autres heures n’atteint ${target} points. Reprenez-la.`,
            ),
        why: gap ? gap.map((i) => els[i]) : undefined,
        at: cs.map((i) => els[i]),
        action: L('Take it back', 'Reprendre'),
        play: () => {
          suppressClick = false;
          tapCell(cs[0]);
        },
      };
    };
    /** Guide: one task of a way to reach the target from here, the most hemmed-in open slot first. */
    const hint = (): Hint | null => {
      if (over || drag?.active) return null;
      const own = owners();
      const { rest } = finish();
      if (!Array.isArray(rest) || !rest.length) {
        // The search gave up: take back a task the built plan has no room for (the plan finishes from there).
        const k = offPlan()[0];
        if (k == null) return null;
        const cs = cellsAt(k, pos[k]);
        return {
          text: L(
            'This task blocks a better plan. Tap it to send it back to the tray.',
            'Cette tâche bloque un meilleur plan. Touchez-la pour la renvoyer dans le bac.',
          ),
          at: cs.map((i) => els[i]),
          play: () => {
            suppressClick = false;
            tapCell(cs[0]);
          },
        };
      }
      const { k, r, top, cells, walls, bonus: nb } = bestPut(w, own, rest);
      const sz = cells.length;
      const play = () => {
        suppressClick = false; // a pending end-of-drag click must not swallow the hint's taps
        if (sel !== k) tapSlot(k);
        if (sel !== k) return;
        // One undo step for the whole move: the turns and the drop.
        save();
        for (let q = 0; q < 4; q++) if (rot[k] !== r) rotate(false);
        if (!place(k, top, false)) hist.pop();
      };
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
      check,
      hint,
      onKey(e) {
        if (e.key === ' ' || e.key === 'e' || e.key === 'E') {
          rotate();
          return true;
        }
        if (e.key === 'r' || e.key === 'R') {
          reset();
          return true;
        }
        if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace' || e.key === 'u' || e.key === 'U') {
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
