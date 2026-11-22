import { L, P } from '../../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../../core/types';
import { board, h, restartBtn, s, shake, undoBtn } from '../../ui/dom';
import { anim, keyDir, POP, type Dir } from '../../kits/move/kit';
import { dist, stepper } from '../../kits/move/pushgen';
import { applyMove, genTether, legalMoves, solveTether, type TMove } from './gen';
import './style.css';

const NAMES = ['A', 'B'];

export const tether: PuzzleDef = {
  id: 'tether',
  get name() {
    return L('Tether', 'Attache');
  },
  category: 'moves',
  offByDefault: true,
  get rules() {
    return L('Bring A and B to their goals. The tape can’t cross.', 'Menez A et B à leurs cibles. Le ruban ne se croise pas.');
  },
  help: () => ({
    goal: L(
      'Put token A on goal A and token B on goal B at the same time. A tape joins them and fills every square between them.',
      'Placez le jeton A sur la cible A et le jeton B sur la cible B en même temps. Un ruban les relie et occupe toutes les cases entre eux.',
    ),
    steps: [
      L(
        'Tap a token to pick it, then tap a free square next to it: it steps there and lays one more square of tape behind it.',
        'Touchez un jeton pour le choisir, puis une case libre voisine : il s’y déplace et déroule une case de ruban derrière lui.',
      ),
      L(
        'Tap the tape square right next to the token to reel in: the token steps back onto it and the tape gets one square shorter.',
        'Touchez la case de ruban collée au jeton pour l’enrouler : le jeton recule dessus et le ruban raccourcit d’une case.',
      ),
      L(
        'The tape has a maximum length, shown by the dots under the board. When it’s full, reel in before stretching any further.',
        'Le ruban a une longueur maximale, indiquée par les points sous la grille. Quand il est plein, enroulez-en avant d’aller plus loin.',
      ),
      L(
        'Tokens can’t go through walls, the other token or the tape, so they can’t pass each other in a corridor.',
        'Les jetons ne traversent ni les murs, ni l’autre jeton, ni le ruban : ils ne peuvent pas se doubler dans un couloir.',
      ),
      L(
        'You can also drag a token. Keyboard: arrow keys or WASD move the picked token, Tab switches, Z undoes, R restarts.',
        'Vous pouvez aussi glisser un jeton. Au clavier : flèches ou WASD déplacent le jeton choisi, Tab change de jeton, Z annule, R recommence.',
      ),
    ],
    tips: [
      L(
        'Move like an inchworm: one token stretches ahead, then the other reels in behind it.',
        'Avancez comme une chenille : un jeton s’étire vers l’avant, puis l’autre enroule le ruban derrière lui.',
      ),
      L(
        'If the tokens arrive in the wrong order, look for a loop or an open area where the pair can turn around.',
        'Si les jetons arrivent dans le mauvais ordre, cherchez une boucle ou un espace dégagé pour faire demi-tour.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [40, 75, 120, 180, 260]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const [w, hh, max] = byLevel<[number, number, number]>(d, [
      [5, 5, 2],
      [6, 6, 3],
      [6, 7, 4],
      [7, 7, 4],
      [7, 8, 4],
    ]);
    const [minMoves, maxMoves, minExtra] = byLevel<[number, number, number]>(d, [
      [6, 14, 2],
      [10, 20, 6],
      [14, 28, 10],
      [18, 34, 12],
      [22, 40, 16],
    ]);
    const walls = byLevel(d, [0.24, 0.24, 0.24, 0.3, 0.3]);
    const lv = genTether(rng, { w, h: hh, max, minMoves, maxMoves, minExtra, walls, cap: 80000, budget: 250000 });
    const { floor, goals } = lv;
    const nb = stepper(w, hh);
    const N = w * hh;

    let path = lv.path.slice();
    /** Moves made, as `token * N + cell`. */
    let history: number[] = [];
    let sel: 0 | 1 = 0;
    let done = false;

    const end = (t: 0 | 1) => (t ? path[path.length - 1] : path[0]);
    const moves = (t: 0 | 1) => legalMoves(w, hh, floor, path, max).filter((m) => m.t === t);
    const solved = () => path[0] === goals[0] && path[path.length - 1] === goals[1];

    // Restore: replay the saved moves (stop at the first one that no longer applies).
    const sv = ctx.saved as { h?: unknown; s?: unknown } | undefined;
    if (Array.isArray(sv?.h)) {
      for (const code of sv.h) {
        if (!Number.isInteger(code) || code < 0 || code >= 2 * N) break;
        const m: TMove = { t: code >= N ? 1 : 0, to: code % N };
        if (!moves(m.t).some((x) => x.to === m.to)) break;
        path = applyMove(path, m);
        history.push(code);
      }
      if (solved()) {
        path = lv.path.slice();
        history = [];
      }
    }
    if (sv?.s === 1) sel = 1;

    // Crop to the floor's bounding box.
    let r0 = hh,
      r1 = 0,
      c0 = w,
      c1 = 0;
    floor.forEach((f, i) => {
      if (!f) return;
      const r = Math.floor(i / w),
        c = i % w;
      r0 = Math.min(r0, r);
      r1 = Math.max(r1, r);
      c0 = Math.min(c0, c);
      c1 = Math.max(c1, c);
    });
    const cols = c1 - c0 + 1,
      rows = r1 - r0 + 1;
    const grid = board(cols, rows, 'tether-grid');
    const els = new Map<number, HTMLElement>();
    const idx = new Map<Element, number>();
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        const i = r * w + c;
        const el = floor[i]
          ? h('button', { type: 'button', class: 'cell', onclick: () => click(i) }, i === goals[0] ? 'A' : i === goals[1] ? 'B' : '')
          : h('div', { class: 'cell wall' });
        els.set(i, el);
        idx.set(el, i);
        grid.append(el);
      }
    const svg = s('svg', { class: 'tether-tape', viewBox: `0 0 ${cols} ${rows}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    const under = s('polyline', { class: 'under' });
    const over = s('polyline', { class: 'over' });
    svg.append(under, over);
    grid.append(svg);

    const dots = Array.from({ length: max }, () => h('span', { class: 'dot' }));
    const meter = h(
      'div',
      { class: 'tether-meter' },
      h('span', { class: 'label' }, L('Tape', 'Ruban')),
      h('div', { class: 'dots' }, ...dots),
    );

    const render = () => {
      const tape = new Set(path.slice(1, -1));
      const targets = new Set(done ? [] : moves(sel).map((m) => m.to));
      els.forEach((el, i) => {
        if (!floor[i]) return;
        const cls = ['cell'];
        if (i === goals[0]) cls.push('ga');
        if (i === goals[1]) cls.push('gb');
        if (i === path[0]) cls.push('ta');
        if (i === path[path.length - 1]) cls.push('tb');
        if (tape.has(i)) cls.push('tp');
        if (i === end(sel) && !done) cls.push('sel');
        if (targets.has(i)) cls.push('mv');
        if ((i === path[0] && i === goals[0]) || (i === path[path.length - 1] && i === goals[1])) cls.push('ok');
        el.className = cls.join(' ');
      });
      const pts = path.map((i) => `${(i % w) - c0 + 0.5},${Math.floor(i / w) - r0 + 0.5}`).join(' ');
      under.setAttribute('points', pts);
      over.setAttribute('points', pts);
      const used = path.length - 2;
      grid.classList.toggle('full', used >= max);
      dots.forEach((dd, k) => (dd.className = k < used ? 'dot on' : 'dot'));
      const ms = P(history.length, ['move', 'moves'], ['coup', 'coups']);
      ctx.status(
        used >= max ? L(`Tape full · ${ms}`, `Ruban plein · ${ms}`) : L(`Tape ${used} / ${max} · ${ms}`, `Ruban ${used} / ${max} · ${ms}`),
      );
    };

    const select = (t: 0 | 1) => {
      if (done || sel === t) return;
      sel = t;
      render();
    };
    /** Move token `t` onto cell `to` if that's legal; returns whether it moved. */
    const play = (t: 0 | 1, to: number): boolean => {
      if (done || !moves(t).some((m) => m.to === to)) return false;
      ctx.touch();
      sel = t;
      path = applyMove(path, { t, to });
      history.push(t * N + to);
      render();
      anim(els.get(to)!, POP, 140);
      if (solved()) {
        done = true;
        render();
        ctx.solved();
      }
      return true;
    };
    /** Tap: a move for the picked token, else a move for the other one, else pick the tapped token. */
    const tap = (i: number) => {
      if (done) return;
      if (play(sel, i) || play((1 - sel) as 0 | 1, i)) return;
      if (i === path[0]) return select(0);
      if (i === path[path.length - 1]) return select(1);
      shake(grid);
    };
    const click = (i: number) => {
      if (dragged) dragged = false;
      else tap(i);
    };
    const step = (dir: Dir) => {
      if (done) return;
      const y = nb(end(sel), dir);
      if (y < 0 || !play(sel, y)) shake(grid);
    };
    const replay = () => {
      path = lv.path.slice();
      for (const code of history) path = applyMove(path, { t: code >= N ? 1 : 0, to: code % N });
    };
    const undo = () => {
      if (done || !history.length) return;
      const last = history.pop()!;
      sel = last >= N ? 1 : 0;
      replay();
      render();
    };
    const reset = () => {
      if (done || !history.length) return;
      history = [];
      replay();
      render();
    };

    // Drag a token: it follows the pointer square by square (back over its tape reels in).
    let drag: { id: number; t: 0 | 1 } | null = null;
    let dragged = false;
    const cellAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)?.closest('.cell');
      return el ? (idx.get(el) ?? -1) : -1;
    };
    grid.addEventListener('pointerdown', (e) => {
      dragged = false;
      if (done || drag || e.button !== 0) return;
      const i = cellAt(e.clientX, e.clientY);
      if (i < 0 || (i !== path[0] && i !== path[path.length - 1])) return;
      const t = i === path[0] ? 0 : 1;
      drag = { id: e.pointerId, t };
      grid.setPointerCapture?.(e.pointerId);
      select(t);
    });
    grid.addEventListener('pointermove', (e) => {
      if (drag?.id !== e.pointerId) return;
      const i = cellAt(e.clientX, e.clientY);
      if (i < 0 || i === end(drag.t)) return;
      if (play(drag.t, i)) dragged = true;
    });
    const stop = (e: PointerEvent) => {
      if (drag?.id === e.pointerId) drag = null;
    };
    grid.addEventListener('pointerup', stop);
    grid.addEventListener('pointercancel', stop);

    /** Guide: the next move of a fewest-moves solution, with the reason that applies. */
    const hint = (): Hint | null => {
      if (done) return null;
      const sol = solveTether(w, hh, floor, max, path, goals);
      if (!sol?.length) return null;
      const m = sol[0];
      const name = NAMES[m.t];
      const from = end(m.t);
      const el = (i: number) => els.get(i)!;
      const used = path.length - 2;
      const reel = used > 0 && path[m.t ? path.length - 2 : 1] === m.to;
      const dg = dist(w, hh, floor, goals[m.t]);
      const other = NAMES[1 - m.t];
      const closer = dg[m.to] < dg[from];
      let text: string;
      if (reel && used >= max)
        text = L(
          `The tape is full (${max}/${max}), so nobody can stretch further. Reel ${name} in one square to get some slack back.`,
          `Le ruban est plein (${max}/${max}) : impossible d’aller plus loin. Enroulez une case avec ${name} pour regagner du jeu.`,
        );
      else if (reel && closer)
        text = L(
          `Like an inchworm: ${other} went ahead, now ${name} follows by reeling in, one square closer to goal ${name}.`,
          `Comme une chenille : ${other} a pris les devants, ${name} suit en enroulant le ruban, une case plus près de la cible ${name}.`,
        );
      else if (reel)
        text = L(
          `${name} reels in onto its tape: the tape gets shorter, which frees room for ${other}.`,
          `${name} enroule son ruban : le ruban raccourcit, ce qui laisse plus de place à ${other}.`,
        );
      else if (closer && used === 0)
        text = L(
          `${name} and ${other} are side by side. ${name} leads: it steps toward goal ${name} and lays the first square of tape.`,
          `${name} et ${other} sont côte à côte. ${name} ouvre la marche : il avance vers la cible ${name} et déroule une première case de ruban.`,
        );
      else if (closer)
        text = L(
          `There’s tape to spare (${used}/${max}): ${name} steps toward goal ${name}, laying one more square behind it.`,
          `Il reste du ruban (${used}/${max}) : ${name} avance vers la cible ${name} en déroulant une case de plus.`,
        );
      else
        text = L(
          `${name} has to step away from its goal here: the tape needs this room so both tokens can reach their goals in order.`,
          `${name} doit s’éloigner de sa cible ici : le ruban a besoin de cet espace pour que les deux jetons atteignent leurs cibles dans l’ordre.`,
        );
      return {
        text,
        why: [el(from), el(goals[m.t])],
        at: [el(m.to)],
        play: () => {
          if (sel !== m.t) select(m.t);
          tap(m.to);
        },
      };
    };

    ctx.controls(undoBtn(undo), restartBtn(reset));
    root.append(grid, meter);
    render();

    // No check(): a token can always walk back along its tape, so no position is a dead end.
    return {
      snapshot: () => ({ h: history, s: sel }),
      hint,
      onKey(e) {
        const k = keyDir(e);
        if (k != null) {
          step(k);
          return true;
        }
        if (e.key === 'Tab') {
          select((1 - sel) as 0 | 1);
          return true;
        }
        if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace' || e.key === 'u') {
          undo();
          return true;
        }
        if (e.key === 'r' || e.key === 'R') {
          reset();
          return true;
        }
        return false;
      },
    };
  },
};
