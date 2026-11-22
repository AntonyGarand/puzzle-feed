// Tetromino tiling with a "no same shape side by side" rule. Inspired by a paper-puzzle genre from
// Arvi Teikari's (Hempuli) collections; this implementation and every puzzle are generated here.
import { L, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, clearBtn, h, ruleBreaks, s } from '../core/ui';
import { cellFromPointer, edgeClasses, nb4, tint } from './logickit/kit';
import { genTetro, KINDS, placementsCovering, shapeOf, TetroBoard, TETROS } from './logickit/tetrogen';
import './tetrominoes.css';

/** Palette slot per basic shape (I, L, O, S, T). */
const TONE = [0, 1, 2, 4, 6];

/** Small picture of fixed tetromino `o`, centred in a 4×4 box. */
function shapeIcon(o: number): SVGSVGElement {
  const cs = TETROS[o].cells;
  const c0 = Math.min(...cs.map(([, c]) => c));
  const w = Math.max(...cs.map(([, c]) => c)) - c0 + 1;
  const hgt = Math.max(...cs.map(([r]) => r)) + 1;
  const ox = (4 - w) / 2,
    oy = (4 - hgt) / 2;
  return s(
    'svg',
    { class: 'tt-icon', viewBox: '-0.15 -0.15 4.3 4.3', 'aria-hidden': 'true' },
    ...cs.map(([r, c]) => s('rect', { x: ox + c - c0 + 0.06, y: oy + r + 0.06, width: 0.88, height: 0.88, rx: 0.12 })),
  );
}

export const tetrominoes: PuzzleDef = {
  id: 'tetrominoes',
  get name() {
    return L('Tetrominoes', 'Tétrominos');
  },
  category: 'logic',
  undo: true,
  offByDefault: true,
  get rules() {
    return L('Cut into tetrominoes; same shapes never share a side.', 'Découpez en tétrominos; formes pareilles jamais côte à côte.');
  },
  help: () => ({
    goal: L(
      'Cut the whole grid into pieces of four cells (tetrominoes). Two pieces of the same shape may never share a side.',
      'Découpez toute la grille en pièces de quatre cases (tétrominos). Deux pièces de même forme ne partagent jamais un côté.',
    ),
    steps: [
      L(
        'There are five shapes: I, L, O, S and T. Mirror images count as the same shape (J is an L, Z is an S).',
        'Il y a cinq formes : I, L, O, S et T. Les images miroirs comptent comme la même forme (J est un L, Z est un S).',
      ),
      L(
        'A cell with a small picture belongs to a piece of exactly that shape, turned exactly that way. A piece holds at most one picture.',
        'Une case avec un petit dessin fait partie d’une pièce de cette forme exacte, tournée exactement ainsi. Une pièce contient au plus un dessin.',
      ),
      L(
        'Drag across four touching cells to place a piece. It replaces any piece it overlaps.',
        'Glissez sur quatre cases voisines pour poser une pièce. Elle remplace celles qu’elle chevauche.',
      ),
      L(
        'Tap a piece to remove it. Pieces are coloured by shape; red marks a broken rule and counts as a mistake. Clear wipes the board.',
        'Touchez une pièce pour l’enlever. Les pièces sont colorées selon leur forme; le rouge signale une règle brisée et compte comme une erreur. Effacer vide la grille.',
      ),
    ],
    tips: [
      L(
        'Start with pictures near a corner or the edge: their shape often fits only one way.',
        'Commencez par les dessins près d’un coin ou du bord : leur forme n’entre souvent que d’une façon.',
      ),
      L(
        'Watch for cells only one piece can still reach, and for gaps that can’t hold a multiple of four cells.',
        'Repérez les cases qu’une seule pièce peut encore atteindre, et les trous qui ne peuvent pas contenir un multiple de quatre cases.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [45, 70, 140, 210, 320]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const [cols, rows] = byLevel<[number, number]>(d, [
      [6, 6],
      [6, 6],
      [8, 8],
      [8, 8],
      [8, 10],
    ]);
    const extra = byLevel(d, [4, 2, 4, 1, 0]);
    const { clue, pieces: sol } = genTetro(cols, rows, extra, rng);
    const N = cols * rows;
    const total = N / 4;

    /** Pieces the player placed (cell lists). */
    let pieces: number[][] = [];
    /** Cells of the piece being dragged. */
    let pending: number[] = [];
    let downAt = -1;
    let done = false;

    const grid = board(cols, rows, 'tt-plate');
    const cells = clue.map((o, i) => {
      const el = h('div', { class: 'cell', 'data-i': i }, o >= 0 ? shapeIcon(o) : null);
      grid.append(el);
      return el;
    });
    /** Counts a mistake when a placed piece breaks a rule. */
    const watch = ruleBreaks(grid, ctx.mistake);

    const ownerMap = () => {
      const owner = new Array<number>(N).fill(-1);
      pieces.forEach((p, k) => p.forEach((i) => (owner[i] = k)));
      return owner;
    };
    const kindOf = (p: number[]) => TETROS[shapeOf(p, cols)].kind;

    /** Indices of pieces that break a rule. */
    const broken = (owner: number[]): Set<number> => {
      const bad = new Set<number>();
      pieces.forEach((p, k) => {
        const o = shapeOf(p, cols);
        const cs = p.filter((i) => clue[i] >= 0);
        if (cs.length > 1 || (cs.length === 1 && clue[cs[0]] !== o)) bad.add(k);
        for (const i of p)
          for (const j of nb4(i, cols, rows)) {
            const q = owner[j];
            if (q >= 0 && q !== k && kindOf(pieces[q]) === TETROS[o].kind) bad.add(k).add(q);
          }
      });
      return bad;
    };

    const render = () => {
      const owner = ownerMap();
      const bad = broken(owner);
      const edges = edgeClasses(cols, rows, (i) => owner[i]);
      cells.forEach((el, i) => {
        const o = owner[i];
        const cls = ['cell', edges[i]];
        if (clue[i] >= 0) cls.push('clue');
        if (o >= 0) cls.push('on');
        if (o >= 0 && bad.has(o)) cls.push('err');
        if (pending.includes(i)) cls.push('pv');
        const c = cls.filter(Boolean).join(' ');
        if (el.className !== c) el.className = c;
        const st = o >= 0 ? `--rc:${tint(TONE[kindOf(pieces[o])], 50)}` : '';
        if ((el.getAttribute('style') ?? '') !== st) el.setAttribute('style', st);
      });
      const good = pieces.length - bad.size;
      ctx.status(`${good} / ${P(total, ['piece', 'pieces'], ['pièce', 'pièces'])}`);
      return owner.every((o) => o >= 0) && bad.size === 0;
    };

    const place = (p: number[]) => {
      const set = new Set(p);
      pieces = pieces.filter((q) => !q.some((i) => set.has(i)));
      pieces.push([...p].sort((a, b) => a - b));
    };
    const check = () => {
      const won = render();
      watch();
      if (won && !done) {
        done = true;
        ctx.solved();
      }
    };
    const finish = () => {
      if (downAt < 0) return;
      const a = downAt;
      downAt = -1;
      const p = pending;
      pending = [];
      if (p.length === 4) place(p);
      else if (p.length === 1 && p[0] === a) {
        const owner = ownerMap();
        if (owner[a] >= 0) pieces.splice(owner[a], 1);
      }
      check();
    };
    const extend = (j: number) => {
      if (j < 0 || downAt < 0) return;
      const at = pending.indexOf(j);
      if (at >= 0) {
        // Back over the previous cell: undo the last step.
        if (at === pending.length - 2) pending.pop();
      } else if (pending.length < 4 && pending.some((x) => nb4(x, cols, rows).includes(j))) pending.push(j);
      else return;
      render();
    };

    grid.addEventListener('pointerdown', (e) => {
      if (done || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const i = cellFromPointer(grid, e, cols, rows);
      if (i < 0) return;
      ctx.touch();
      e.preventDefault();
      try {
        grid.setPointerCapture(e.pointerId);
      } catch {
        /* not capturable */
      }
      downAt = i;
      pending = [i];
      render();
    });
    grid.addEventListener('pointermove', (e) => {
      if (downAt >= 0) extend(cellFromPointer(grid, e, cols, rows));
    });
    grid.addEventListener('pointerup', (e) => {
      if (downAt < 0) return;
      extend(cellFromPointer(grid, e, cols, rows));
      finish();
    });
    grid.addEventListener('pointercancel', () => {
      downAt = -1;
      pending = [];
      render();
    });
    grid.addEventListener('contextmenu', (e) => e.preventDefault());

    const sv = ctx.saved as { pieces?: unknown } | undefined;
    if (Array.isArray(sv?.pieces)) {
      const used = new Set<number>();
      for (const p of sv.pieces) {
        if (!Array.isArray(p) || p.length !== 4) continue;
        if (!p.every((i) => Number.isInteger(i) && i >= 0 && i < N && !used.has(i))) continue;
        if (shapeOf(p as number[], cols) < 0) continue;
        p.forEach((i: number) => used.add(i));
        pieces.push([...(p as number[])].sort((a, b) => a - b));
      }
    }
    root.append(grid);
    render();
    watch(false);
    ctx.controls(
      clearBtn(() => {
        if (done || !pieces.length) return;
        ctx.touch();
        pieces = [];
        pending = [];
        downAt = -1;
        render();
        watch(false);
      }),
    );

    // Guide: undo wrong pieces, then clues that fit one way, cells only one piece can cover.
    const solKey = new Set(sol.map((p) => [...p.cells].sort((a, b) => a - b).join(',')));
    const shapeName = (o: number) => KINDS[TETROS[o].kind];
    /** English article + shape letter ("an L", "a T"). */
    const anS = (o: number) => `${TETROS[o].kind === 4 ? 'a' : 'an'} ${shapeName(o)}`;
    let lastKind = '';
    let taught = false;
    const teach = (h0: Hint): Hint => {
      if (taught) return h0;
      taught = true;
      return { ...h0, text: h0.text + L(' Drag across the four cells.', ' Glissez sur les quatre cases.') };
    };
    const draw = (p: number[]) => () => {
      downAt = p[0];
      pending = [p[0]];
      // Walk the cells in an order where each one touches an earlier one.
      const left = p.slice(1);
      while (left.length) {
        const k = left.findIndex((j) => pending.some((x) => nb4(x, cols, rows).includes(j)));
        if (k < 0) break;
        extend(left.splice(k, 1)[0]);
      }
      finish();
    };
    /** A piece that isn't in the (unique) solution: a broken rule first, else a dead end. */
    const audit = (): Hint | null => {
      if (done) return null;
      const wrongs = pieces.filter((p) => !solKey.has(p.join(',')));
      if (!wrongs.length) return null;
      const owner = ownerMap();
      const fix = (wrong: number[], text: string, why: number[] = []): Hint => ({
        kind: 'fix',
        text: text + L(' Tap it to remove it.', ' Touchez-la pour l’enlever.'),
        why: why.map((i) => cells[i]),
        at: wrong.map((i) => cells[i]),
        action: L('Remove the piece', 'Enlever la pièce'),
        play: () => {
          downAt = wrong[0];
          pending = [wrong[0]];
          finish();
        },
      });
      for (const p of wrongs) {
        const o = shapeOf(p, cols);
        const pics = p.filter((i) => clue[i] >= 0);
        if (pics.length > 1)
          return fix(
            p,
            L(
              'This piece covers two pictures: each piece holds at most one.',
              'Cette pièce couvre deux dessins : chaque pièce en contient au plus un.',
            ),
            pics,
          );
        if (pics.length === 1 && clue[pics[0]] !== o)
          return fix(
            p,
            L(
              `This piece is ${anS(o)}, but the picture it covers is ${anS(clue[pics[0]])}.`,
              `Cette pièce est un ${shapeName(o)}, mais le dessin qu’elle couvre est un ${shapeName(clue[pics[0]])}.`,
            ),
            pics,
          );
        const twin = p
          .flatMap((i) => nb4(i, cols, rows))
          .find((j) => owner[j] >= 0 && !p.includes(j) && kindOf(pieces[owner[j]]) === TETROS[o].kind);
        if (twin != null)
          return fix(
            p,
            L(
              `This ${shapeName(o)} touches another ${shapeName(o)}: two pieces of the same shape never share a side.`,
              `Ce ${shapeName(o)} touche un autre ${shapeName(o)} : deux pièces de même forme ne partagent jamais un côté.`,
            ),
            pieces[owner[twin]],
          );
      }
      return fix(
        wrongs[0],
        L(
          'This piece breaks no rule yet, but it leads to a dead end: the rest of the grid can’t be filled around it.',
          'Cette pièce ne brise encore aucune règle, mais elle mène à une impasse : le reste de la grille ne peut pas être rempli autour.',
        ),
      );
    };
    const hint = (): Hint | null => {
      if (done) return null;
      const wrong = audit();
      if (wrong) return wrong;
      // Board of the (correct) pieces placed so far, to test where new pieces fit.
      const b = new TetroBoard(cols, rows);
      for (const p of pieces) b.put(p, shapeOf(p, cols));
      const fitsHere = (pl: { o: number; cells: number[] }) => {
        if (!b.fits(pl.cells, pl.o, clue)) return false;
        b.put(pl.cells, pl.o);
        const ok = b.areasOk(pl.cells);
        b.pop(pl.cells);
        return ok;
      };
      const options = (i: number) => placementsCovering(i, cols, rows).filter(fitsHere);
      const cands: { kind: string; hint: Hint }[] = [];
      for (let i = 0; i < N && cands.length < 6; i++) {
        if (b.owner[i] >= 0) continue;
        const opts = options(i);
        if (clue[i] >= 0) {
          const own = opts.filter((pl) => pl.o === clue[i]);
          if (own.length === 1)
            cands.push({
              kind: 'clue',
              hint: {
                text: L(
                  `This ${shapeName(clue[i])} picture fits only one way: every other spot hits the edge, a piece, another picture, a matching shape beside it, or leaves a gap that can’t take whole pieces.`,
                  `Ce dessin de ${shapeName(clue[i])} n’entre que d’une façon : toute autre position touche le bord, une pièce, un autre dessin, une forme pareille à côté, ou laisse un trou impossible à remplir.`,
                ),
                why: [cells[i]],
                at: own[0].cells.map((j) => cells[j]),
                play: draw(own[0].cells),
              },
            });
        } else if (opts.length === 1)
          cands.push({
            kind: 'cell',
            hint: {
              text: L(
                `Only one piece can still cover this cell: ${anS(opts[0].o)} placed like this. Every other one breaks a rule or strands cells.`,
                `Une seule pièce peut encore couvrir cette case : un ${shapeName(opts[0].o)} placé ainsi. Toute autre brise une règle ou isole des cases.`,
              ),
              why: [cells[i]],
              at: opts[0].cells.map((j) => cells[j]),
              play: draw(opts[0].cells),
            },
          });
      }
      const pick = cands.find((c) => c.kind !== lastKind) ?? cands[0];
      if (pick) {
        lastKind = pick.kind;
        return teach(pick.hint);
      }
      lastKind = '';
      // Nothing forced: the free cell with the fewest options, placed as in the solution.
      let best = -1,
        bestN = Infinity;
      for (let i = 0; i < N; i++) {
        if (b.owner[i] >= 0) continue;
        const m = options(i).length;
        if (m < bestN) {
          bestN = m;
          best = i;
        }
      }
      const p = sol.find((q) => q.cells.includes(best));
      if (!p) return null;
      return teach({
        text: L(
          `This cell can be covered ${bestN} ways. Try them in your head: only this ${shapeName(p.o)} lets the rest of the grid work out.`,
          `Cette case peut être couverte de ${bestN} façons. Essayez-les mentalement : seul ce ${shapeName(p.o)} permet de remplir le reste de la grille.`,
        ),
        why: [cells[best]],
        at: p.cells.map((j) => cells[j]),
        play: draw(p.cells),
      });
    };

    return { snapshot: () => ({ pieces }), hint, check: audit };
  },
};
