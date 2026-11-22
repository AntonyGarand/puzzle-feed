import { L, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, h, s } from '../core/ui';
import { dotCells, genGalaxies, mirror } from './logickit/galaxiesgen';
import { cellFromPointer, colourRegions, edgeClasses, nb4, regionAdjacency, tint } from './logickit/kit';
import './galaxies.css';

export const galaxies: PuzzleDef = {
  id: 'galaxies',
  get name() {
    return L('Galaxies', 'Galaxies');
  },
  category: 'logic',
  get rules() {
    return L('Split the grid into shapes symmetric about one dot.', 'Découpez la grille en formes symétriques autour d’un point.');
  },
  help: () => ({
    goal: L(
      'Divide the whole grid into galaxies. Each galaxy holds exactly one dot and looks the same after a half-turn around it.',
      'Divisez toute la grille en galaxies. Chaque galaxie contient un seul point et reste identique après un demi-tour autour de lui.',
    ),
    steps: [
      L(
        'Every cell belongs to one galaxy. A galaxy is one connected piece with a single dot at its exact centre.',
        'Chaque case appartient à une galaxie. Une galaxie est d’un seul morceau, avec un seul point en son centre exact.',
      ),
      L(
        'Spin a galaxy half a turn around its dot and it must land on itself: every cell has a twin on the opposite side.',
        'Faites faire un demi-tour à une galaxie autour de son point : elle doit retomber sur elle-même. Chaque case a une jumelle de l’autre côté.',
      ),
      L(
        'Tap a dot (or a cell it touches) to pick its galaxy, then tap or drag over cells to add them. Their twins are added too.',
        'Touchez un point (ou une case qu’il touche) pour choisir sa galaxie, puis touchez ou glissez sur des cases pour les ajouter. Leurs jumelles suivent.',
      ),
      L(
        'Tap a cell of the picked galaxy to remove it (and its twin). Cells whose twin is impossible turn red.',
        'Touchez une case de la galaxie choisie pour l’enlever (avec sa jumelle). Les cases sans jumelle possible deviennent rouges.',
      ),
    ],
    tips: [
      L(
        'Near an edge, a dot can’t reach far: the twin would fall off the grid.',
        'Près d’un bord, un point ne va pas loin : la jumelle tomberait hors de la grille.',
      ),
      L(
        'Look for cells only one dot can claim, then grow that galaxy from there.',
        'Cherchez les cases qu’un seul point peut réclamer, puis faites grandir sa galaxie à partir de là.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [35, 75, 120, 180, 270]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const n = byLevel(d, [5, 7, 8, 9, 10]);
    const [lo, hi] = byLevel<[number, number]>(d, [
      [3, 8],
      [4, 12],
      [6, 16],
      [8, 22],
      [10, 28],
    ]);
    const { dots, sol } = genGalaxies(n, lo, hi, rng);
    const N = n * n,
      D = dots.length;
    const colour = colourRegions(D, regionAdjacency(sol, n, n, D), rng.int(0, 7));
    /** Galaxy whose dot touches the cell (fixed from the start), or -1. */
    const given = new Array<number>(N).fill(-1);
    dots.forEach((dot, g) => dotCells(n, dot).forEach((i) => (given[i] = g)));
    const twin = (g: number, i: number) => mirror(n, dots[g], i);

    const own = [...given];
    /** The picked galaxy (-1: none). */
    let cur = -1;
    let done = false;

    const grid = board(n, n, 'gx-plate');
    const cells = own.map((_, i) => {
      // Pointer input goes through the grid; a keyboard/programmatic click (detail 0) taps the cell.
      const el = h('button', { type: 'button', class: 'cell', 'data-i': i, onclick: (e: MouseEvent) => e.detail === 0 && tap(i) });
      grid.append(el);
      return el;
    });
    const layer = s('svg', { class: 'gx-dots', viewBox: `0 0 ${2 * n} ${2 * n}`, 'aria-hidden': 'true' });
    const dotEls = dots.map((dot) => {
      const el = s('circle', { class: 'gx-dot', cx: dot.x, cy: dot.y, r: 0.36 });
      layer.append(el);
      return el;
    });
    grid.append(layer);

    /** Cells that can't keep this galaxy: their twin is off the grid or in another galaxy. */
    const broken = (i: number) => {
      const g = own[i];
      if (g < 0) return false;
      const m = twin(g, i);
      return m < 0 || (own[m] >= 0 && own[m] !== g);
    };
    /** A galaxy is complete when it's symmetric about its dot and in one piece. */
    const complete = (g: number) => {
      const mine = own.flatMap((o, i) => (o === g ? [i] : []));
      if (!mine.every((i) => own[twin(g, i)] === g)) return false;
      const seen = new Set([mine[0]]);
      for (const stack = [mine[0]]; stack.length;)
        for (const j of nb4(stack.pop()!, n, n))
          if (own[j] === g && !seen.has(j)) {
            seen.add(j);
            stack.push(j);
          }
      return seen.size === mine.length;
    };

    const render = () => {
      const edges = edgeClasses(n, n, (i) => own[i]);
      const ok = dots.map((_, g) => complete(g));
      cells.forEach((el, i) => {
        const g = own[i];
        const cls = ['cell', edges[i]];
        if (given[i] >= 0) cls.push('given');
        if (g >= 0 && g === cur) cls.push('cur');
        if (broken(i)) cls.push('err');
        el.className = cls.join(' ');
        el.setAttribute('style', g >= 0 ? `--rc:${tint(colour[g], g === cur ? 62 : 36)}` : '');
      });
      dotEls.forEach((el, g) => el.setAttribute('class', `gx-dot${g === cur ? ' sel' : ''}`));
      const left = own.filter((o) => o < 0).length;
      ctx.status(
        left
          ? P(left, ['free cell', 'free cells'], ['case libre', 'cases libres'])
          : L('Every cell is used: check the shapes', 'Toutes les cases sont prises : vérifiez les formes'),
      );
      return !left && ok.every(Boolean);
    };
    const check = () => {
      if (render() && !done) {
        done = true;
        cur = -1;
        render();
        ctx.solved();
      }
    };

    /** Give cell `i` to galaxy `g`, with its twin if that one is free. */
    const add = (i: number, g: number) => {
      if (given[i] >= 0) return;
      own[i] = g;
      const m = twin(g, i);
      if (m >= 0 && own[m] < 0) own[m] = g;
    };
    /** Free cell `i` and its twin in the same galaxy. */
    const remove = (i: number) => {
      const g = own[i];
      if (g < 0 || given[i] >= 0) return;
      own[i] = -1;
      const m = twin(g, i);
      if (m >= 0 && own[m] === g && given[m] < 0) own[m] = -1;
    };

    /** A tap on cell `i`: pick a galaxy, add the cell to the picked one, or remove it. Returns the drag mode. */
    const tap = (i: number): 'add' | 'remove' | null => {
      if (done) return null;
      ctx.touch();
      let mode: 'add' | 'remove' | null = null;
      if (given[i] >= 0) {
        cur = given[i];
        mode = 'add';
      } else if (cur < 0) {
        if (own[i] >= 0) cur = own[i];
        mode = cur >= 0 ? 'add' : null;
      } else if (own[i] === cur) {
        remove(i);
        mode = 'remove';
      } else {
        add(i, cur);
        mode = 'add';
      }
      check();
      return mode;
    };

    let stroke: { mode: 'add' | 'remove'; last: number; id: number } | null = null;
    grid.addEventListener('pointerdown', (e) => {
      if (done || stroke || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const i = cellFromPointer(grid, e, n, n);
      if (i < 0) return;
      e.preventDefault();
      try {
        grid.setPointerCapture(e.pointerId);
      } catch {
        /* not capturable */
      }
      const mode = tap(i);
      if (mode) stroke = { mode, last: i, id: e.pointerId };
    });
    grid.addEventListener('pointermove', (e) => {
      const g = stroke;
      if (!g || e.pointerId !== g.id || done) return;
      const i = cellFromPointer(grid, e, n, n);
      if (i < 0 || i === g.last) return;
      g.last = i;
      if (given[i] >= 0) return;
      // Dragging only fills free cells, or clears the picked galaxy's own cells.
      if (g.mode === 'add' && own[i] < 0) add(i, cur);
      else if (g.mode === 'remove' && own[i] === cur) remove(i);
      else return;
      check();
    });
    const end = (e: PointerEvent) => {
      if (stroke && e.pointerId === stroke.id) stroke = null;
    };
    grid.addEventListener('pointerup', end);
    grid.addEventListener('pointercancel', end);
    grid.addEventListener('contextmenu', (e) => e.preventDefault());

    const sv = ctx.saved as { own?: unknown; cur?: unknown } | undefined;
    if (Array.isArray(sv?.own) && sv.own.length === N)
      sv.own.forEach((v, i) => {
        if (given[i] < 0) own[i] = Number.isInteger(v) && v >= 0 && v < D ? v : -1;
      });
    if (Number.isInteger(sv?.cur) && (sv!.cur as number) >= -1 && (sv!.cur as number) < D) cur = sv!.cur as number;
    root.append(grid);
    render();

    // ---- Guide: twins, cells only one dot can claim, mistakes to undo. ----
    const cellsOf = (g: number) => dotCells(n, dots[g]).map((i) => cells[i]);
    /** Pick galaxy `g` by tapping its dot cell (as a player would), unless it's already picked. */
    const pick = (g: number) => {
      if (cur !== g) tap(dotCells(n, dots[g])[0]);
    };
    let taught = false;
    const how = () => {
      if (taught) return '';
      taught = true;
      return L(' Tap the dot, then the cell.', ' Touchez le point, puis la case.');
    };
    /** Why dot `g` can't take free cell `i`, or null if it can. `reach` lists the cells each galaxy can still grow into. */
    const why = (g: number, i: number, reach: Set<number>[]): 'off' | 'taken' | 'walled' | null => {
      const m = twin(g, i);
      if (m < 0) return 'off';
      if (own[m] >= 0 && own[m] !== g) return 'taken';
      return reach[g].has(i) ? null : 'walled';
    };
    const reasonText = (r: 'off' | 'taken' | 'walled') =>
      r === 'off'
        ? L('its twin would fall off the grid', 'sa jumelle tomberait hors de la grille')
        : r === 'taken'
          ? L('its twin is already in another galaxy', 'sa jumelle est déjà dans une autre galaxie')
          : L('other galaxies wall it off', 'd’autres galaxies lui bloquent le chemin');
    /** Why the dot on side `at` can't take the cell, in both languages. */
    const ruledOut = (r: 'off' | 'taken' | 'walled', at: [string, string]): [string, string] =>
      r === 'off'
        ? [
            `Mirrored through the dot ${at[0]}, it would land off the grid.`,
            `Reflétée par le point ${at[1]}, elle tomberait hors de la grille.`,
          ]
        : r === 'taken'
          ? [
              `Mirrored through the dot ${at[0]}, it would land in another galaxy.`,
              `Reflétée par le point ${at[1]}, elle tomberait dans une autre galaxie.`,
            ]
          : [`The dot ${at[0]} is walled off from it by other galaxies.`, `Le point ${at[1]} en est coupé par d’autres galaxies.`];
    /** Where dot `g` sits relative to cell `i`, in both languages. */
    const side = (g: number, i: number): [string, string] => {
      const dy = dots[g].y - (2 * Math.floor(i / n) + 1),
        dx = dots[g].x - (2 * (i % n) + 1);
      if (Math.abs(dy) > Math.abs(dx)) return dy < 0 ? ['above it', 'au-dessus'] : ['below it', 'en dessous'];
      return dx < 0 ? ['to its left', 'à sa gauche'] : ['to its right', 'à sa droite'];
    };
    const dist = (g: number, i: number) => Math.hypot(dots[g].y - (2 * Math.floor(i / n) + 1), dots[g].x - (2 * (i % n) + 1));

    let lastKind = '';
    const hint = (): Hint | null => {
      if (done) return null;
      const cands: { kind: string; hint: Hint }[] = [];
      // 1. A cell put in the wrong galaxy: undo it first.
      const wrong = own.findIndex((g, i) => g >= 0 && given[i] < 0 && g !== sol[i]);
      if (wrong >= 0) {
        const g = own[wrong];
        const m = twin(g, wrong);
        const text =
          m < 0 || (own[m] >= 0 && own[m] !== g)
            ? L(
                `This cell can’t stay in this galaxy: ${reasonText(m < 0 ? 'off' : 'taken')}. Pick the galaxy and tap the cell to remove it.`,
                `Cette case ne peut pas rester dans cette galaxie : ${reasonText(m < 0 ? 'off' : 'taken')}. Choisissez la galaxie et touchez la case pour l’enlever.`,
              )
            : L(
                'This cell doesn’t belong to this galaxy: it would leave a neighbouring galaxy no symmetric shape. Pick the galaxy and tap it to remove it.',
                'Cette case n’appartient pas à cette galaxie : une galaxie voisine n’aurait plus de forme symétrique. Choisissez la galaxie et touchez la case pour l’enlever.',
              );
        return {
          text,
          why: cellsOf(g),
          at: [cells[wrong]],
          play: () => {
            pick(g);
            if (own[wrong] === g) tap(wrong);
          },
        };
      }
      // Where each galaxy could still grow: through free cells, from its own cells.
      const reach = dots.map((_, g) => {
        const seen = new Set<number>();
        const stack = own.flatMap((o, i) => (o === g ? [i] : []));
        for (const i of stack) seen.add(i);
        while (stack.length)
          for (const j of nb4(stack.pop()!, n, n))
            if (own[j] < 0 && !seen.has(j)) {
              seen.add(j);
              stack.push(j);
            }
        return seen;
      });
      // 2. A cell of a galaxy whose twin is still free.
      for (let i = 0; i < N && cands.length < 1; i++) {
        const g = own[i];
        if (g < 0) continue;
        const m = twin(g, i);
        if (m < 0 || own[m] >= 0) continue;
        cands.push({
          kind: 'twin',
          hint: {
            text: L(
              'This cell is in the galaxy, so its twin across the dot must be too: the shape has to match after a half-turn.',
              'Cette case fait partie de la galaxie, donc sa jumelle de l’autre côté du point aussi : la forme doit coïncider après un demi-tour.',
            ),
            why: [cells[i], ...cellsOf(g)],
            at: [cells[m]],
            play: () => {
              pick(g);
              if (own[m] < 0) tap(m);
            },
          },
        });
      }
      // 3. A free cell only one dot can claim; vary the reason that rules out the closest other dot.
      const only: { i: number; g: number; rival: number; r: 'off' | 'taken' | 'walled'; near: boolean }[] = [];
      for (let i = 0; i < N; i++) {
        if (own[i] >= 0) continue;
        const ok = dots.flatMap((_, g) => (why(g, i, reach) ? [] : [g]));
        if (ok.length !== 1 || ok[0] !== sol[i]) continue;
        const g = ok[0];
        const rival = dots
          .map((_, k) => k)
          .filter((k) => k !== g)
          .sort((a, b) => dist(a, i) - dist(b, i))[0];
        if (rival === undefined) continue;
        only.push({ i, g, rival, r: why(rival, i, reach)!, near: nb4(i, n, n).some((j) => own[j] === g) });
      }
      only.sort((a, b) => Number(b.near) - Number(a.near) || dist(a.g, a.i) - dist(b.g, b.i));
      for (const r of ['off', 'taken', 'walled'] as const) {
        const o = only.find((x) => x.r === r);
        if (!o) continue;
        const { i, g, rival } = o;
        cands.push({
          kind: r,
          hint: {
            text: L(
              `Only the outlined dot can claim this cell. ${ruledOut(r, side(rival, i))[0]}`,
              `Seul le point encadré peut réclamer cette case. ${ruledOut(r, side(rival, i))[1]}`,
            ),
            why: cellsOf(g),
            at: [cells[i]],
            play: () => {
              pick(g);
              if (own[i] < 0) tap(i);
            },
          },
        });
      }
      const pickIt = cands.find((c) => c.kind !== lastKind) ?? cands[0];
      if (pickIt) {
        lastKind = pickIt.kind;
        return { ...pickIt.hint, text: pickIt.hint.text + how() };
      }
      lastKind = '';
      // 4. Nothing forced by a single look: grow a galaxy toward its intended shape.
      const i = own.findIndex((o, k) => o < 0 && nb4(k, n, n).some((j) => own[j] === sol[k]));
      const k = i >= 0 ? i : own.indexOf(-1);
      if (k < 0) return null;
      const g = sol[k];
      return {
        text: L(
          `This cell joins this galaxy: any other dot that reaches it would leave a cell nobody can claim.${how()}`,
          `Cette case rejoint cette galaxie : tout autre point qui l’atteint laisserait une case que personne ne peut réclamer.${how()}`,
        ),
        why: cellsOf(g),
        at: [cells[k]],
        play: () => {
          pick(g);
          if (own[k] < 0) tap(k);
        },
      };
    };

    return { snapshot: () => ({ own, cur }), hint };
  },
};
