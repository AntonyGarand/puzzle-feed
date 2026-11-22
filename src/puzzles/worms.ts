import { L, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, h, PALETTE, restartBtn, s, shake, undoBtn } from '../core/ui';
import { int, keyDir, type Dir } from './movekit/kit';
import { stepper } from './movekit/pushgen';
import { applyMove, estimate, generateWorms, isHome, loneTables, occupancy, solveWorms, type WormSpec } from './movekit/wormgen';
import './worms.css';

/** Worm colours (p8 is the game's tone, used for selection marks). */
const TONES = [PALETTE[0], PALETTE[1], PALETTE[6], PALETTE[4]];

const SPECS: [WormSpec, WormSpec, WormSpec, WormSpec, WormSpec] = [
  { w: 5, h: 5, lens: [2, 3], walls: 1, min: 7, max: 12, extra: 2, cap: 15000, work: 20000 },
  { w: 6, h: 5, lens: [3, 3], walls: 3, min: 10, max: 18, extra: 3, cap: 10000, work: 15000 },
  { w: 6, h: 6, lens: [2, 3, 4], walls: 5, min: 13, max: 24, extra: 4, cap: 12000, work: 20000 },
  { w: 7, h: 6, lens: [3, 3, 4], walls: 7, min: 16, max: 30, extra: 6, cap: 10000, work: 15000 },
  { w: 7, h: 7, lens: [3, 3, 4, 4], walls: 10, min: 20, max: 36, extra: 6, cap: 12000, work: 18000 },
];

export const worms: PuzzleDef = {
  id: 'worms',
  get name() {
    return L('Worms', 'Vers');
  },
  category: 'moves',
  offByDefault: true,
  get rules() {
    return L('Wriggle each worm onto the squares of its colour.', 'Faites ramper chaque ver sur les cases de sa couleur.');
  },
  help: () => ({
    goal: L(
      'Every worm must lie fully on the goal squares of its own colour, all at the same time.',
      'Chaque ver doit être couché en entier sur les cases cibles de sa couleur, tous en même temps.',
    ),
    steps: [
      L(
        'Tap a worm to pick it. Its head (the end with eyes) moves one square at a time and the body follows.',
        'Touchez un ver pour le choisir. Sa tête (le bout avec les yeux) avance d’une case à la fois et le corps suit.',
      ),
      L(
        'Worms can’t go through walls, other worms or themselves, and there’s no gravity.',
        'Les vers ne traversent ni les murs, ni les autres vers, ni eux-mêmes, et il n’y a pas de gravité.',
      ),
      L(
        'Tap a full dot to move the head there. Hollow dots sit by the tail: tap one and the worm backs up tail first, which becomes its new head.',
        'Touchez un point plein pour y avancer la tête. Les points creux sont près de la queue : touchez-en un et le ver recule queue en premier, qui devient sa nouvelle tête.',
      ),
      L(
        'You can also drag from either end of a worm, swipe, or use the arrow keys (Tab picks a worm, E swaps its ends).',
        'Vous pouvez aussi glisser à partir d’un bout du ver, balayer l’écran, ou utiliser les flèches (Tab choisit un ver, E inverse ses bouts).',
      ),
      L(
        'Undo (Z) takes back a step; Restart (R) puts every worm back. “best” is the fewest moves possible.',
        'Annuler (Z) reprend un pas; Repartir (R) remet les vers au départ. « min. » indique le plus petit nombre de coups possible.',
      ),
    ],
    tips: [
      L(
        'Settle the worm whose goal is deepest in a corner first, then the ones that block the way out.',
        'Placez d’abord le ver dont la cible est au fond d’un coin, puis ceux qui bloquent la sortie.',
      ),
      L(
        'A worm stuck in a dead end can always back out the way it came: lead with its tail.',
        'Un ver coincé dans un cul-de-sac peut toujours ressortir par où il est venu : faites-le avancer par la queue.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [30, 60, 100, 160, 240]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const room = generateWorms(rng, byLevel(d, SPECS));
    const { w, h: hh, floor, goals, optimal } = room;
    const n = w * hh;
    const nb = stepper(w, hh);
    const lens = goals.map((g) => g.length);
    const gsets = goals.map((g) => new Set(g));
    const goalOf = new Map<number, number>();
    goals.forEach((g, k) => g.forEach((c) => goalOf.set(c, k)));
    const tables = loneTables(w, hh, floor, goals);

    let ws = room.start.map((sq) => sq.slice());
    /** Layouts before each move (head first, so Undo restores which end leads). */
    let history: number[][][] = [];
    let sel = -1;
    let done = false;
    const solved = (x: number[][]) => x.every((sq, k) => isHome(sq, gsets[k]));

    const valid = (v: unknown): v is number[][] => {
      if (!Array.isArray(v) || v.length !== lens.length) return false;
      const seen = new Set<number>();
      return v.every(
        (sq, k) =>
          Array.isArray(sq) &&
          sq.length === lens[k] &&
          sq.every((c, j) => {
            if (!Number.isInteger(c) || c < 0 || c >= n || !floor[c] || seen.has(c)) return false;
            seen.add(c);
            return j === 0 || [0, 1, 2, 3].some((dd) => nb(sq[j - 1], dd) === c);
          }),
      );
    };
    const sv = ctx.saved as { w?: unknown; h?: unknown; s?: unknown } | undefined;
    if (valid(sv?.w) && !solved(sv.w)) {
      ws = sv.w.map((sq) => sq.slice());
      if (Array.isArray(sv.h)) history = sv.h.filter(valid).map((x) => x.map((sq) => sq.slice()));
      sel = int(sv.s, -1);
      if (sel < -1 || sel >= ws.length) sel = -1;
    }

    // Board: floor cells are buttons, walls are plain tiles; the worms are drawn on an SVG layer above.
    const grid = board(w, hh, 'wm-grid');
    const els: HTMLElement[] = [];
    for (let i = 0; i < n; i++) {
      const g = goalOf.get(i);
      const el = floor[i]
        ? h('button', {
            type: 'button',
            class: 'cell',
            style: g != null ? `--c:${TONES[g]}` : null,
            onclick: () => click(i),
          })
        : h('div', { class: 'cell wall' });
      els.push(el);
      grid.append(el);
    }
    const layer = s('svg', { class: 'wm-layer', viewBox: `0 0 ${w} ${hh}`, 'aria-hidden': 'true' });
    grid.append(layer);

    const xy = (i: number) => [(i % w) + 0.5, Math.floor(i / w) + 0.5];
    const pts = (sq: number[]) =>
      sq
        .map((c) =>
          xy(c)
            .map((v) => v.toFixed(2))
            .join(','),
        )
        .join(' ');
    const drawWorm = (sq: number[], k: number) => {
      const home = isHome(sq, gsets[k]);
      const g = s('g', { class: `wm ${k === sel ? 'sel' : ''} ${home ? 'home' : ''}`.trim(), style: `--c:${TONES[k]}` });
      const line = pts(sq);
      if (k === sel) g.append(s('polyline', { class: 'shadow', points: line }));
      g.append(s('polyline', { class: 'edge', points: line }), s('polyline', { class: 'body', points: line }));
      // creases between segments
      for (let j = 1; j < sq.length; j++) {
        const [x0, y0] = xy(sq[j - 1]),
          [x1, y1] = xy(sq[j]);
        const mx = (x0 + x1) / 2,
          my = (y0 + y1) / 2,
          px = (y1 - y0) * 0.2,
          py = (x0 - x1) * 0.2;
        g.append(s('line', { class: 'crease', x1: mx - px, y1: my - py, x2: mx + px, y2: my + py }));
      }
      // head: a round cap with two eyes looking the way it's facing
      const [hx, hy] = xy(sq[0]),
        [nx, ny] = xy(sq[1]);
      const fx = hx - nx,
        fy = hy - ny;
      g.append(s('circle', { class: 'head', cx: hx, cy: hy, r: 0.34 }));
      for (const side of [-1, 1]) {
        const ex = hx + fx * 0.1 + fy * side * 0.15,
          ey = hy + fy * 0.1 - fx * side * 0.15;
        if (home) {
          // content: closed, smiling eyes
          g.append(
            s('path', {
              class: 'lid',
              d: `M${(ex - 0.07).toFixed(3)},${(ey + 0.02).toFixed(3)} q0.07,-0.09 0.14,0`,
            }),
          );
        } else g.append(s('circle', { class: 'eye', cx: ex + fx * 0.03, cy: ey + fy * 0.03, r: 0.065 }));
      }
      return g;
    };

    /** Free floor cells next to an end of the selected worm: 1 = head, 2 = tail. */
    const targets = () => {
      const out = new Map<number, number>();
      if (sel < 0 || done) return out;
      const occ = occupancy(ws, n);
      const sq = ws[sel];
      for (const [end, mark] of [
        [sq[sq.length - 1], 2],
        [sq[0], 1],
      ])
        for (let dd = 0; dd < 4; dd++) {
          const y = nb(end, dd);
          if (y >= 0 && floor[y] && !occ[y]) out.set(y, mark);
        }
      return out;
    };

    const render = () => {
      const tg = targets();
      const occ = occupancy(ws, n);
      els.forEach((el, i) => {
        if (!floor[i]) return;
        const g = goalOf.get(i);
        const cls = ['cell'];
        if (g != null) cls.push('goal');
        if (occ[i]) cls.push('wm-on');
        if (sel >= 0 && ws[sel][0] === i) cls.push('hd');
        const t = tg.get(i);
        if (t) cls.push(t === 1 ? 'to' : 'to tl');
        el.className = cls.join(' ');
      });
      // the selected worm is drawn last, on top
      const order = ws.map((_, k) => k).sort((a, b) => Number(a === sel) - Number(b === sel));
      layer.replaceChildren(...order.map((k) => drawWorm(ws[k], k)));
      const home = ws.filter((sq, k) => isHome(sq, gsets[k])).length;
      const moves = history.length;
      ctx.status(
        `${P(moves, ['move', 'moves'], ['coup', 'coups'])} · ${L(
          `best ${optimal} · ${home} / ${ws.length} home`,
          `min. ${optimal} · ${home} / ${ws.length} placés`,
        )}`,
      );
    };

    /** Move worm `k`'s head (or its tail, which then becomes the head) in direction `dir`. */
    const step = (k: number, dir: number, tail = false) => {
      if (done) return false;
      const occ = occupancy(ws, n);
      const nx = applyMove(ws, { k, tail, dir }, floor, nb, occ);
      if (!nx) return false;
      ctx.touch();
      history.push(ws);
      // whichever end led is the head now
      ws = nx.map((sq, j) => (j === k && tail ? sq.slice().reverse() : sq));
      sel = k;
      if (solved(ws)) {
        done = true;
        sel = -1;
        render();
        ctx.solved();
        return true;
      }
      render();
      return true;
    };
    const flip = (k: number) => {
      ws = ws.map((sq, j) => (j === k ? sq.slice().reverse() : sq));
    };
    const dirTo = (a: number, b: number) => [0, 1, 2, 3].find((dd) => nb(a, dd) === b) ?? -1;

    const tap = (i: number) => {
      if (done) return;
      const k = ws.findIndex((sq) => sq.includes(i));
      if (k >= 0) {
        // tapping the tail end makes it the head
        if (ws[k][ws[k].length - 1] === i) flip(k);
        sel = k;
        render();
        return;
      }
      if (sel < 0) return;
      const sq = ws[sel];
      const dh = dirTo(sq[0], i);
      if (dh >= 0) {
        if (!step(sel, dh)) shake(grid);
        return;
      }
      const dt = dirTo(sq[sq.length - 1], i);
      if (dt >= 0) {
        if (!step(sel, dt, true)) shake(grid);
        return;
      }
      sel = -1;
      render();
    };
    /** A cell's click, unless it ends a drag or a swipe. */
    let swiped = false;
    const click = (i: number) => {
      if (swiped) swiped = false;
      else tap(i);
    };
    const move = (dir: Dir) => {
      if (done) return;
      if (sel < 0) {
        sel = 0;
        render();
        return;
      }
      if (!step(sel, dir)) shake(grid);
    };
    const undo = () => {
      if (done || drag) return;
      const prev = history.pop();
      if (!prev) return;
      ws = prev;
      render();
    };
    const restart = () => {
      if (done || drag || !history.length) return;
      ws = room.start.map((sq) => sq.slice());
      history = [];
      sel = -1;
      render();
    };

    // Drag from either end of a worm: that end becomes the head and follows the finger square by square;
    // going back over the neck takes the last step back. Elsewhere, a swipe moves the selected head.
    const cellAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)?.closest('.cell');
      return el ? els.indexOf(el as HTMLElement) : -1;
    };
    let drag: { id: number; k: number; steps: number } | null = null;
    let down: { id: number; x: number; y: number } | null = null;
    const follow = (g: { k: number; steps: number }, t: number) => {
      for (let guard = 0; guard < 8; guard++) {
        const sq = ws[g.k];
        if (t === sq[0]) return;
        if (g.steps > 0 && t === sq[1]) {
          ws = history.pop()!;
          g.steps--;
          render();
          return;
        }
        const dr = Math.floor(t / w) - Math.floor(sq[0] / w),
          dc = (t % w) - (sq[0] % w);
        const v = dr > 0 ? 2 : 0,
          hz = dc > 0 ? 1 : 3;
        const order = !dr ? [hz] : !dc ? [v] : Math.abs(dr) >= Math.abs(dc) ? [v, hz] : [hz, v];
        if (!order.some((dd) => step(g.k, dd))) return;
        g.steps++;
        if (done) return;
      }
    };
    grid.addEventListener('pointerdown', (e) => {
      swiped = false;
      if (done || drag || down) return;
      const i = cellAt(e.clientX, e.clientY);
      const k = ws.findIndex((sq) => sq[0] === i || sq[sq.length - 1] === i);
      if (e.button === 0 && k >= 0) {
        // grabbing an end picks the worm and makes that end its head (the same as tapping it)
        if (ws[k][0] !== i) flip(k);
        sel = k;
        render();
        drag = { id: e.pointerId, k, steps: 0 };
        grid.setPointerCapture?.(e.pointerId);
      } else down = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    grid.addEventListener('pointermove', (e) => {
      if (drag?.id !== e.pointerId) return;
      const t = cellAt(e.clientX, e.clientY);
      if (t >= 0) follow(drag, t);
    });
    grid.addEventListener('pointerup', (e) => {
      if (drag?.id === e.pointerId) {
        if (drag.steps) swiped = true; // the click that ends the drag is not a tap
        drag = null;
        return;
      }
      if (down?.id !== e.pointerId) return;
      const dx = e.clientX - down.x,
        dy = e.clientY - down.y;
      down = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return; // a tap: the click handles it
      swiped = true;
      move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
    });
    grid.addEventListener('pointercancel', (e) => {
      if (drag?.id === e.pointerId) drag = null;
      if (down?.id === e.pointerId) down = null;
    });

    /** Guide: the first move of a shortest solution, explained. */
    const DIRS = () => [L('up', 'vers le haut'), L('right', 'vers la droite'), L('down', 'vers le bas'), L('left', 'vers la gauche')];
    const hint = (): Hint | null => {
      if (done) return null;
      const sol = solveWorms(w, hh, floor, goals, ws, 40000, tables);
      if (!sol?.length) return null;
      const m = sol[0];
      const sq = ws[m.k];
      const end = m.tail ? sq[sq.length - 1] : sq[0];
      const to = nb(end, m.dir);
      const dir = DIRS()[m.dir];
      const after = applyMove(ws, m, floor, nb, occupancy(ws, n))!;
      const how =
        history.length === 0
          ? L(' Tap the worm, then the dot where it should go.', ' Touchez le ver, puis le point où il doit aller.')
          : '';
      let text: string;
      if (isHome(after[m.k], gsets[m.k]))
        text = L(
          `One step ${dir} and this worm lies fully on the squares of its colour.`,
          `Un pas ${dir} et ce ver est couché en entier sur les cases de sa couleur.`,
        );
      else if (m.tail)
        text = L(
          `Lead with the tail: this worm should move ${dir}, tail first. Tap its tail end, then the square next to it.`,
          `Menez par la queue : ce ver doit aller ${dir}, la queue en premier. Touchez le bout de sa queue, puis la case voisine.`,
        );
      else if (estimate(tables, after, w) < estimate(tables, ws, w))
        text = L(`Move this worm ${dir}, toward the squares of its colour.`, `Déplacez ce ver ${dir}, vers les cases de sa couleur.`);
      else
        text = L(
          `This worm is in the way: move it ${dir} to make room for the others.`,
          `Ce ver bloque le passage : déplacez-le ${dir} pour laisser de la place aux autres.`,
        );
      return {
        text: text + how,
        why: sq.map((c) => els[c]),
        at: [els[to]],
        play: () => {
          tap(end);
          tap(to);
        },
      };
    };

    ctx.controls(undoBtn(undo), restartBtn(restart));
    root.append(grid);
    render();

    // No check(): a worm can always crawl back the way it came (tail first), so no position is a dead end.
    return {
      snapshot: () => ({ w: ws, h: history, s: sel }),
      hint,
      onKey(e) {
        if (done) return false;
        const k = keyDir(e);
        if (k != null) {
          move(k);
          return true;
        }
        if (e.key === 'Tab' || e.key === ' ') {
          sel = (sel + 1) % ws.length;
          render();
          return true;
        }
        if ((e.key === 'e' || e.key === 'E') && sel >= 0) {
          flip(sel);
          render();
          return true;
        }
        if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace' || e.key === 'u') {
          undo();
          return true;
        }
        if (e.key === 'r' || e.key === 'R') {
          restart();
          return true;
        }
        return false;
      },
    };
  },
};
