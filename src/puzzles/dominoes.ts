import { L } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, h } from '../core/ui';
import { fullSet, genDominosa, pairIndex } from './gridkit/dominosa';
import { capture } from './pathkit/grid';
import './dominoes.css';

export const dominoes: PuzzleDef = {
  id: 'dominoes',
  get name() {
    return L('Dominoes', 'Dominos');
  },
  category: 'logic',
  undo: true,
  get rules() {
    return L('Split the grid into dominoes, each pair exactly once.', 'Découpez la grille en dominos, chaque paire une seule fois.');
  },
  help: () => ({
    goal: L(
      'Cut the grid of numbers into dominoes so that you use a full set: every pair of numbers exactly once.',
      'Découpez la grille de nombres en dominos pour former un jeu complet : chaque paire de nombres une seule fois.',
    ),
    steps: [
      L(
        'A domino covers two side-by-side cells. Every cell belongs to exactly one domino.',
        'Un domino couvre deux cases voisines par un côté. Chaque case appartient à un seul domino.',
      ),
      L(
        'The set holds every pair from 0-0 up to the highest double, each one once (3-5 and 5-3 are the same domino).',
        'Le jeu contient chaque paire, du 0-0 jusqu’au double le plus haut, une seule fois (3-5 et 5-3 sont le même domino).',
      ),
      L(
        'Tap the line between two cells, or drag from one cell to its neighbour, to place a domino. Do it again to remove it.',
        'Touchez la ligne entre deux cases, ou glissez d’une case à sa voisine, pour poser un domino. Refaites-le pour l’enlever.',
      ),
      L(
        'You can also tap a cell, then a neighbour. Tapping the middle of a domino removes it.',
        'Vous pouvez aussi toucher une case, puis une voisine. Touchez le milieu d’un domino pour l’enlever.',
      ),
      L(
        'The checklist below greys out the pairs you have used; pairs used twice turn red.',
        'La liste en dessous grise les paires déjà utilisées; une paire utilisée deux fois devient rouge.',
      ),
    ],
    tips: [
      L(
        'Look for pairs that can only fit in one place in the whole grid: place those first.',
        'Cherchez les paires qui ne peuvent aller qu’à un seul endroit dans toute la grille : posez-les d’abord.',
      ),
      L(
        'A cell with only one free neighbour must pair with it.',
        'Une case qui n’a qu’une seule voisine libre doit être jumelée avec elle.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [45, 80, 120, 200, 320]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const n = byLevel(d, [3, 4, 4, 5, 6]);
    const p = genDominosa(n, 3, d === 3 || d === 5, rng);
    const { cols, rows, val } = p;
    const N = cols * rows;
    const set = fullSet(n);

    /** Partner of each cell, -1 when free. */
    const mate = new Array<number>(N).fill(-1);
    let sel = -1;
    let done = false;

    const grid = board(cols, rows, 'do-grid');
    const cells = val.map((v, i) => {
      const el = h('div', { class: 'cell', 'data-i': i, style: `grid-area:${Math.floor(i / cols) + 1}/${(i % cols) + 1}` }, v);
      grid.append(el);
      return el;
    });
    const chips = set.map(([a, b]) => h('span', { class: 'do-chip' }, h('b', null, a), h('b', null, b)));
    const list = h('div', { class: 'do-set', 'aria-label': L('Dominoes in the set', 'Dominos du jeu') }, ...chips);
    const wrap = h('div', { class: 'do-wrap' }, grid, list);

    const render = () => {
      const used = new Array<number>(set.length).fill(0);
      for (let i = 0; i < N; i++) if (mate[i] > i) used[pairIndex(val[i], val[mate[i]], n)]++;
      // Tiles are grid items spanning their two cells, under the (transparent) number cells.
      const els: HTMLElement[] = [];
      for (let i = 0; i < N; i++) {
        const j = mate[i];
        if (j < i) continue;
        const r = Math.floor(i / cols) + 1,
          c = (i % cols) + 1;
        const horiz = j === i + 1;
        const dup = used[pairIndex(val[i], val[j], n)] > 1;
        els.push(
          h('div', {
            class: `do-tile ${horiz ? 'h' : 'v'}${dup ? ' err' : ''}${done ? ' won' : ''}`,
            style: `grid-area:${r}/${c}/span ${horiz ? 1 : 2}/span ${horiz ? 2 : 1}`,
          }),
        );
      }
      grid.replaceChildren(...els, ...cells);
      cells.forEach((el, i) => {
        el.classList.toggle('in', mate[i] >= 0);
        el.classList.toggle('sel', i === sel);
      });
      chips.forEach((el, k) => {
        el.classList.toggle('used', used[k] === 1);
        el.classList.toggle('dup', used[k] > 1);
      });
      const placed = used.reduce((t, u) => t + u, 0);
      ctx.status(L(`${placed} / ${set.length} dominoes`, `${placed} / ${set.length} dominos`));
      return placed === set.length && used.every((u) => u === 1);
    };

    const adjacent = (a: number, b: number) =>
      a >= 0 && b >= 0 && ((Math.abs(a - b) === 1 && Math.floor(a / cols) === Math.floor(b / cols)) || Math.abs(a - b) === cols);
    const unpair = (i: number) => {
      if (mate[i] >= 0) mate[mate[i]] = -1;
      mate[i] = -1;
    };
    /** Place a domino on a–b, or remove it if it is already there. */
    const toggle = (a: number, b: number) => {
      if (mate[a] === b) unpair(a);
      else {
        unpair(a);
        unpair(b);
        mate[a] = b;
        mate[b] = a;
      }
      sel = -1;
      after();
    };
    const after = () => {
      if (render() && !done) {
        done = true;
        sel = -1;
        render();
        ctx.solved();
      }
    };

    /** Where a point falls: the cell, and the neighbour across a nearby border (or -1). */
    const locate = (e: PointerEvent): { i: number; edge: number } => {
      const a = cells[0].getBoundingClientRect(),
        z = cells[N - 1].getBoundingClientRect();
      if (!(z.right > a.left) || !(e.clientX || e.clientY)) {
        const t = (e.target as Element | null)?.closest?.('[data-i]') as HTMLElement | null;
        return { i: t ? Number(t.dataset.i) : -1, edge: -1 };
      }
      const fx = ((e.clientX - a.left) / (z.right - a.left)) * cols;
      const fy = ((e.clientY - a.top) / (z.bottom - a.top)) * rows;
      const c = Math.floor(fx),
        r = Math.floor(fy);
      if (c < 0 || r < 0 || c >= cols || r >= rows) return { i: -1, edge: -1 };
      const i = r * cols + c;
      const dx = fx - c - 0.5,
        dy = fy - r - 0.5;
      // The outer 26% of a cell on each side targets the border with that neighbour.
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 0.24) return { i, edge: -1 };
      let j: number;
      if (Math.abs(dx) >= Math.abs(dy)) j = dx > 0 ? (c < cols - 1 ? i + 1 : -1) : c > 0 ? i - 1 : -1;
      else j = dy > 0 ? (r < rows - 1 ? i + cols : -1) : r > 0 ? i - cols : -1;
      return { i, edge: j };
    };

    let down: { id: number; i: number; edge: number; x: number; y: number; dragged: boolean } | null = null;
    grid.addEventListener('pointerdown', (e) => {
      if (done || down || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const at = locate(e);
      if (at.i < 0) return;
      e.preventDefault();
      ctx.touch();
      capture(grid, e.pointerId);
      down = { id: e.pointerId, ...at, x: e.clientX, y: e.clientY, dragged: false };
    });
    grid.addEventListener('pointermove', (e) => {
      if (!down || e.pointerId !== down.id || down.dragged) return;
      const at = locate(e);
      if (at.i >= 0 && at.i !== down.i && adjacent(down.i, at.i) && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) {
        down.dragged = true;
        toggle(down.i, at.i);
      }
    });
    grid.addEventListener('pointerup', (e) => {
      const g = down;
      if (!g || e.pointerId !== g.id) return;
      down = null;
      if (g.dragged || done) return;
      if (g.edge >= 0) return toggle(g.i, g.edge);
      const i = g.i;
      if (mate[i] >= 0) {
        unpair(i);
        sel = -1;
      } else if (adjacent(sel, i)) return toggle(sel, i);
      else sel = sel === i ? -1 : i;
      after();
    });
    grid.addEventListener('pointercancel', () => (down = null));

    const sv = ctx.saved as { mate?: unknown; sel?: unknown } | undefined;
    const sm = sv?.mate;
    if (Array.isArray(sm) && sm.length === N) {
      sm.forEach((j, i) => {
        if (typeof j === 'number' && adjacent(i, j) && sm[j] === i) mate[i] = j;
      });
    }
    const s0 = sv?.sel;
    if (typeof s0 === 'number' && Number.isInteger(s0) && s0 >= 0 && s0 < N && mate[s0] < 0) sel = s0;
    root.append(wrap);
    render();
    // Guide: cells with one partner left, pairs with one spot left, pairs already used.
    let lastKind = '';
    let taught = false;
    const hint = (): Hint | null => {
      if (done) return null;
      const used = new Set<number>();
      for (let i = 0; i < N; i++) if (mate[i] > i) used.add(pairIndex(val[i], val[mate[i]], n));
      const nbs = (i: number) => {
        const r = Math.floor(i / cols),
          c = i % cols;
        return [r > 0 ? i - cols : -1, c < cols - 1 ? i + 1 : -1, r < rows - 1 ? i + cols : -1, c > 0 ? i - 1 : -1].filter((j) => j >= 0);
      };
      const name = (a: number, b: number) => `${Math.min(val[a], val[b])}-${Math.max(val[a], val[b])}`;
      const cands: { kind: string; hint: Hint }[] = [];
      const lay = (a: number, b: number) => () => toggle(a, b);
      for (let i = 0; i < N; i++) {
        if (mate[i] >= 0) continue;
        const free = nbs(i).filter((j) => mate[j] < 0);
        const ok = free.filter((j) => !used.has(pairIndex(val[i], val[j], n)));
        if (ok.length !== 1) continue;
        const j = ok[0];
        if (free.length === 1)
          cands.push({
            kind: 'one',
            hint: {
              text: L(
                `This ${val[i]} has only one free neighbour, the ${val[j]}, so they form the ${name(i, j)}.`,
                `Ce ${val[i]} n’a qu’une seule voisine libre, le ${val[j]} : ensemble, ils forment le ${name(i, j)}.`,
              ),
              why: [cells[i]],
              at: [cells[j]],
              play: lay(i, j),
            },
          });
        else {
          const gone = free.filter((x) => x !== j);
          cands.push({
            kind: 'used',
            hint: {
              text: L(
                `This ${val[i]} could pair with ${gone.length === 1 ? 'another neighbour' : 'other neighbours'}, but ${gone.map((x) => name(i, x)).join(', ')} ${gone.length === 1 ? 'is' : 'are'} already placed. Only the ${name(i, j)} is left.`,
                `Ce ${val[i]} pourrait aller avec ${gone.length === 1 ? 'une autre voisine' : 'd’autres voisines'}, mais ${gone.map((x) => name(i, x)).join(', ')} ${gone.length === 1 ? 'est déjà posé' : 'sont déjà posés'}. Il ne reste que le ${name(i, j)}.`,
              ),
              why: [cells[i], ...gone.map((x) => chips[pairIndex(val[i], val[x], n)])],
              at: [cells[i], cells[j]],
              play: lay(i, j),
            },
          });
        }
      }
      // A pair of the set that fits in one spot only.
      const spots = new Map<number, [number, number][]>();
      for (let i = 0; i < N; i++) {
        if (mate[i] >= 0) continue;
        for (const j of [i + 1, i + cols]) {
          if (j >= N || mate[j] >= 0 || (j === i + 1 && j % cols === 0)) continue;
          const k = pairIndex(val[i], val[j], n);
          if (used.has(k)) continue;
          if (!spots.has(k)) spots.set(k, []);
          spots.get(k)!.push([i, j]);
        }
      }
      for (const [k, at] of spots) {
        if (at.length !== 1) continue;
        const [a, b] = at[0];
        cands.push({
          kind: 'pair',
          hint: {
            text: L(
              `Each pair is used once, and the ${name(a, b)} appears side by side only here: it goes here.`,
              `Chaque paire sert une fois, et le ${name(a, b)} n’apparaît côte à côte qu’ici : il va donc ici.`,
            ),
            why: [chips[k]],
            at: [cells[a], cells[b]],
            play: lay(a, b),
          },
        });
      }
      const order = ['pair', 'one', 'used'];
      cands.sort((x, y) => order.indexOf(x.kind) - order.indexOf(y.kind));
      const pick = cands.find((c) => c.kind !== lastKind) ?? cands[0];
      if (pick) {
        lastKind = pick.kind;
        if (taught) return pick.hint;
        taught = true;
        return {
          ...pick.hint,
          text: pick.hint.text + L(' Tap the line between two cells to place it.', ' Touchez la ligne entre deux cases pour le poser.'),
        };
      }
      lastKind = '';
      const i = p.mate.findIndex((j, x) => mate[x] < 0 && mate[j] < 0);
      if (i < 0) return null;
      const j = p.mate[i];
      return {
        text: L(
          `No single rule decides here. Try the options: only the ${name(i, j)} here leaves every remaining pair a place.`,
          `Aucune règle ne décide seule ici. Essayez les options : seul le ${name(i, j)} ici laisse une place à chaque paire restante.`,
        ),
        why: [chips[pairIndex(val[i], val[j], n)]],
        at: [cells[i], cells[j]],
        play: lay(i, j),
      };
    };
    /** A domino that breaks the set (a pair twice), boxes a cell in or leaves a pair no spot, else one off the unique tiling. */
    const check = (): Hint | null => {
      if (done) return null;
      const sol = p.mate;
      const wrongAt = (i: number) => mate[i] >= 0 && mate[i] !== sol[i];
      const name = (a: number, b: number) => `${Math.min(val[a], val[b])}-${Math.max(val[a], val[b])}`;
      const fix = (i: number, text: string, why: Element[] = []): Hint => {
        const j = mate[i];
        return {
          kind: 'fix',
          text,
          why,
          at: [cells[i], cells[j]],
          action: L('Remove it', 'L’enlever'),
          play: () => {
            if (mate[i] === j) toggle(i, j);
          },
        };
      };
      // The same pair placed twice.
      const seen = new Map<number, number>();
      for (let i = 0; i < N; i++) {
        if (mate[i] < i) continue;
        const k = pairIndex(val[i], val[mate[i]], n);
        const o = seen.get(k);
        if (o === undefined) {
          seen.set(k, i);
          continue;
        }
        const bad = wrongAt(i) ? i : wrongAt(o) ? o : -1;
        if (bad >= 0)
          return fix(
            bad,
            L(
              `The ${name(i, mate[i])} is placed twice, but each pair is used once. This one is the wrong one.`,
              `Le ${name(i, mate[i])} est posé deux fois, mais chaque paire ne sert qu’une fois. Celui-ci est le mauvais.`,
            ),
            [chips[k], cells[i], cells[mate[i]], cells[o], cells[mate[o]]],
          );
      }
      const nbs = (i: number) => [i - cols, i + 1, i + cols, i - 1].filter((j) => adjacent(i, j) && j < N);
      // A free cell whose neighbours are all taken: the domino on its partner-to-be is wrong.
      for (let i = 0; i < N; i++) {
        if (mate[i] >= 0 || nbs(i).some((j) => mate[j] < 0)) continue;
        if (!wrongAt(sol[i])) continue;
        return fix(
          sol[i],
          L(
            `This ${val[i]} is boxed in: every neighbour is already in a domino, so it can never be paired. Remove this domino.`,
            `Ce ${val[i]} est enfermé : toutes ses voisines sont déjà dans un domino, il ne pourra jamais être jumelé. Enlevez ce domino.`,
          ),
          [cells[i]],
        );
      }
      // A pair not placed yet with no free spot left.
      for (let i = 0; i < N; i++) {
        const j = sol[i];
        if (j < i || mate[i] === j) continue;
        const k = pairIndex(val[i], val[j], n);
        if (seen.has(k)) continue;
        let spot = false;
        for (let a = 0; a < N && !spot; a++)
          if (mate[a] < 0)
            for (const b of [a + 1, a + cols])
              if (adjacent(a, b) && b < N && mate[b] < 0 && pairIndex(val[a], val[b], n) === k) spot = true;
        if (spot) continue;
        const bad = wrongAt(i) ? i : j;
        if (!wrongAt(bad)) continue;
        return fix(
          bad,
          L(
            `The ${name(i, j)} has no free spot left on the board, but every pair must be placed. This domino takes its last spot.`,
            `Le ${name(i, j)} n’a plus aucune place libre, mais chaque paire doit être posée. Ce domino lui prend sa dernière place.`,
          ),
          [chips[k]],
        );
      }
      if (!p.unique) return null;
      const i = mate.findIndex((_, x) => wrongAt(x));
      if (i < 0) return null;
      return fix(
        i,
        L(
          `This ${name(i, mate[i])} breaks no rule yet, but it leads to a dead end: with it there, the other dominoes can’t all be placed. Remove it.`,
          `Ce ${name(i, mate[i])} ne brise encore aucune règle, mais il mène à une impasse : s’il reste là, les autres dominos ne peuvent pas tous être placés. Enlevez-le.`,
        ),
      );
    };
    return { snapshot: () => ({ mate, sel }), hint, check };
  },
};
