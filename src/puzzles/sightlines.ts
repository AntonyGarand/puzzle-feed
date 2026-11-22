import { L, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, h } from '../core/ui';
import { nb4 } from './gridkit/lightup';
import { cutCells, genSightlines, rays, reach, sees } from './gridkit/sightlines';
import './sightlines.css';

const DIR_NAMES = () => [
  L('up', 'vers le haut'),
  L('to the right', 'vers la droite'),
  L('down', 'vers le bas'),
  L('to the left', 'vers la gauche'),
];

export const sightlines: PuzzleDef = {
  id: 'sightlines',
  get name() {
    return L('Sightlines', 'Lignes de vue');
  },
  category: 'logic',
  undo: true,
  get rules() {
    return L('Shade cells so each number sees that many whites.', 'Noircissez pour que chaque nombre voie autant de blanches.');
  },
  help: () => ({
    goal: L(
      'Shade some cells so that every number sees exactly that many white cells along its row and column.',
      'Noircissez des cases pour que chaque nombre voie exactement autant de cases blanches dans sa rangée et sa colonne.',
    ),
    steps: [
      L(
        'A number counts the white cells it sees in a straight line up, down, left and right, itself included. Shaded cells and the edge block the view.',
        'Un nombre compte les cases blanches qu’il voit en ligne droite vers le haut, le bas, la gauche et la droite, sa propre case comprise. Les cases noires et le bord bloquent la vue.',
      ),
      L(
        'Numbered cells stay white. Shaded cells never touch side by side (corners are fine).',
        'Les cases numérotées restent blanches. Les cases noires ne se touchent jamais par un côté (les coins, ça va).',
      ),
      L(
        'All white cells stay connected in one piece, through their sides.',
        'Toutes les cases blanches restent reliées en un seul morceau, par leurs côtés.',
      ),
      L(
        'Tap a cell to shade it, again for a dot (surely white), once more to clear it. Drag to repeat your first change; long-press (or right-click) to dot.',
        'Touchez une case pour la noircir, encore pour un point (sûrement blanche), puis une autre fois pour l’effacer. Glissez pour répéter votre premier changement; appuyez longuement (ou clic droit) pour un point.',
      ),
      L(
        'Keyboard: arrows move, Space cycles, X dots, Delete clears. Red marks a broken rule: touching shades, an impossible number or a cut-off area.',
        'Au clavier : flèches pour bouger, Espace pour changer, X pour un point, Suppr pour effacer. Le rouge signale une règle brisée : noires qui se touchent, nombre impossible ou zone coupée.',
      ),
    ],
    tips: [
      L(
        'If a number can only just reach its count, every cell it can reach is white.',
        'Si un nombre atteint tout juste son compte, toutes les cases qu’il peut voir sont blanches.',
      ),
      L(
        'Once a number sees enough, shade the cell at the end of each open line.',
        'Quand un nombre en voit assez, noircissez la case au bout de chaque ligne ouverte.',
      ),
      L('Every neighbour of a shaded cell is white: dot them.', 'Toutes les voisines d’une case noire sont blanches : mettez-y un point.'),
    ],
  }),
  par: (d) => byLevel(d, [40, 75, 120, 190, 300]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const n = byLevel(d, [5, 6, 7, 8, 9]);
    // Easy and Medium keep a few spare numbers; the rest are thinned down as far as logic allows.
    const { clue, black: sol } = genSightlines(n, { density: 0.24, keep: byLevel(d, [9, 10, 0, 0, 0]) }, rng);
    const R = rays(n);
    const given = clue.map((k) => k > 0);

    // 0 empty, 1 shaded, 2 dot (white)
    const st = new Array<number>(n * n).fill(0);
    /** Keyboard cursor (-1 until the keyboard is used). */
    let cur = -1;
    let done = false;

    const grid = board(n, n, 'sl-grid');
    const cells = st.map((_, i) => {
      const el = h('div', { class: 'cell', 'data-i': i }, given[i] ? h('span', { class: 'sl-n' }, clue[i]) : null);
      grid.append(el);
      return el;
    });

    /** -1 undecided, 0 white (number or dot), 1 shaded. */
    const at = (i: number) => (given[i] || st[i] === 2 ? 0 : st[i] === 1 ? 1 : -1);

    const render = () => {
      const bad = new Set<number>();
      let ok = true;
      for (let i = 0; i < n * n; i++) if (st[i] === 1) for (const j of nb4(i, n)) if (st[j] === 1) bad.add(i).add(j);
      // White cells (anything not shaded) split into pieces: flag all but the largest.
      const comp = new Int32Array(n * n).fill(-1);
      const sizes: number[] = [];
      for (let s0 = 0; s0 < n * n; s0++) {
        if (st[s0] === 1 || comp[s0] >= 0) continue;
        const stack = [s0];
        comp[s0] = sizes.length;
        let size = 0;
        while (stack.length) {
          const i = stack.pop()!;
          size++;
          for (const j of nb4(i, n))
            if (st[j] !== 1 && comp[j] < 0) {
              comp[j] = sizes.length;
              stack.push(j);
            }
        }
        sizes.push(size);
      }
      if (sizes.length > 1) {
        const main = sizes.indexOf(Math.max(...sizes));
        for (let i = 0; i < n * n; i++) if (comp[i] >= 0 && comp[i] !== main) bad.add(i);
      }
      if (bad.size) ok = false;
      let shaded = 0;
      const blk = st.map((v) => v === 1);
      cells.forEach((el, i) => {
        if (st[i] === 1) shaded++;
        let fade = false;
        if (given[i]) {
          const { lo, hi } = reach(R, i, at);
          const sumLo = lo.reduce((a, b) => a + b, 1),
            sumHi = hi.reduce((a, b) => a + b, 1);
          if (sumLo > clue[i] || sumHi < clue[i]) bad.add(i);
          fade = sumLo === clue[i] && sumHi === clue[i];
          ok &&= sees(R, i, blk) === clue[i];
        }
        let cls = 'cell';
        if (given[i]) cls += ' given num';
        if (fade) cls += ' done';
        if (st[i] === 1) cls += ' shade';
        if (st[i] === 2) cls += ' mark';
        if (i === cur) cls += ' cur';
        if (bad.has(i)) cls += ' err';
        if (el.className !== cls) el.className = cls;
      });
      ctx.status(P(shaded, ['shaded cell', 'shaded cells'], ['case noircie', 'cases noircies']));
      return ok;
    };

    // Long-press (350 ms on the first cell, before the stroke spreads) places a dot directly.
    let pressTimer = 0;
    const cancelPress = () => {
      clearTimeout(pressTimer);
      pressTimer = 0;
      for (const el of cells) el.classList.remove('lp');
    };

    // Tap cycles empty → shaded → dot → empty. Dragging repeats the first cell's change on every cell
    // in the same starting state, so a stroke never overwrites cells of another kind.
    let stroke: { from: number; to: number; first: number; id: number; x: number; y: number; spread: boolean } | null = null;
    const set = (i: number, v: number) => {
      if (done || given[i] || st[i] === v) return;
      ctx.touch();
      st[i] = v;
      if (render()) {
        done = true;
        stroke = null;
        cancelPress();
        ctx.solved();
      }
    };
    const cellAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const c = el?.closest?.('[data-i]') as HTMLElement | null;
      return c && grid.contains(c) ? Number(c.dataset.i) : -1;
    };
    grid.addEventListener('contextmenu', (e) => e.preventDefault());
    grid.addEventListener('pointerdown', (e) => {
      if (done || stroke) return;
      const t = (e.target as Element | null)?.closest?.('[data-i]') as HTMLElement | null;
      const i = t && grid.contains(t) ? Number(t.dataset.i) : cellAt(e.clientX, e.clientY);
      if (i < 0 || given[i]) return;
      e.preventDefault();
      if (cur >= 0) {
        cur = -1;
        render();
      }
      const from = st[i];
      const to = e.button === 2 ? (from === 2 ? 0 : 2) : (from + 1) % 3;
      stroke = { from, to, first: i, id: e.pointerId, x: e.clientX, y: e.clientY, spread: false };
      set(i, to);
      // Only an empty cell turned shaded can still become a dot by holding.
      if (done || to !== 1) return;
      cells[i].classList.add('lp');
      pressTimer = window.setTimeout(() => {
        pressTimer = 0;
        cells[i].classList.remove('lp');
        if (!stroke || stroke.spread || done) return;
        stroke.to = 2;
        set(i, 2);
        try {
          navigator.vibrate?.(15);
        } catch {
          /* not allowed */
        }
      }, 350);
    });
    grid.addEventListener('pointermove', (e) => {
      const g = stroke;
      if (!g || e.pointerId !== g.id) return;
      if (pressTimer && Math.hypot(e.clientX - g.x, e.clientY - g.y) > 10) cancelPress();
      const i = cellAt(e.clientX, e.clientY);
      if (i < 0 || i === g.first || given[i] || st[i] !== g.from) return;
      g.spread = true;
      cancelPress();
      set(i, g.to);
    });
    const end = (e: PointerEvent) => {
      if (stroke && e.pointerId !== stroke.id) return;
      cancelPress();
      stroke = null;
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);

    const sv = ctx.saved as { st?: unknown; cur?: unknown } | undefined;
    if (Array.isArray(sv?.st) && sv.st.length === st.length) sv.st.forEach((v, i) => (st[i] = !given[i] && (v === 1 || v === 2) ? v : 0));
    const c0 = sv?.cur;
    if (typeof c0 === 'number' && Number.isInteger(c0) && c0 >= -1 && c0 < st.length) cur = c0;
    root.append(grid);
    render();

    // Guide: human deductions from the numbers, shades and dots on the board, varied step to step.
    const els = (ix: number[]) => ix.map((j) => cells[j]);
    const fill = (ix: number[], v: number) => () => ix.forEach((j) => set(j, v));
    const empty = (i: number) => !given[i] && st[i] === 0;
    let last = '';
    const taught = { shade: false, dot: false };
    const how = (v: number) => {
      const key = v === 1 ? 'shade' : 'dot';
      if (taught[key]) return '';
      taught[key] = true;
      return v === 1
        ? L(' Tap once to shade.', ' Touchez une fois pour noircir.')
        : L(' Tap twice for a dot.', ' Touchez deux fois pour un point.');
    };
    const hint = (): Hint | null => {
      if (done) return null;
      const dirs = DIR_NAMES();
      const clues = clue.flatMap((k, i) => (k > 0 ? [i] : []));
      const info = clues.map((c) => {
        const { lo, hi } = reach(R, c, at);
        return { c, k: clue[c], need: clue[c] - 1, lo, hi, sumLo: lo.reduce((a, b) => a + b, 0), sumHi: hi.reduce((a, b) => a + b, 0) };
      });

      const beside = (): Hint | null => {
        for (let i = 0; i < n * n; i++) {
          if (st[i] !== 1) continue;
          const ix = nb4(i, n).filter(empty);
          if (!ix.length) continue;
          return {
            text:
              L(
                `Shaded cells never touch side by side, so every neighbour of this shaded cell is white: dot ${ix.length > 1 ? 'them' : 'it'}.`,
                `Les cases noires ne se touchent jamais par un côté : chaque voisine de cette case noire est blanche, mettez-y un point.`,
              ) + how(2),
            why: els([i]),
            at: els(ix),
            play: fill(ix, 2),
          };
        }
        return null;
      };
      const reachAll = (): Hint | null => {
        // A number that needs (almost) all it could see: the nearest cells in some direction are white.
        for (const f of info) {
          if (f.sumLo === f.sumHi) continue;
          const full: number[] = [];
          let one: { d: number; ix: number[]; must: number } | null = null;
          for (let dd = 0; dd < 4; dd++) {
            const must = f.need - (f.sumHi - f.hi[dd]);
            const ix = R[f.c][dd].slice(f.lo[dd], Math.max(f.lo[dd], must)).filter(empty);
            if (!ix.length) continue;
            full.push(...ix);
            one ??= { d: dd, ix, must };
          }
          if (!one) continue;
          if (f.sumHi === f.need)
            return {
              text:
                L(
                  `This ${f.k} can see at most ${f.k} cells before the shades and edges stop it, so it must see all of them: they are all white.`,
                  `Ce ${f.k} peut voir au plus ${f.k} cases avant les noires et les bords : il doit toutes les voir, elles sont toutes blanches.`,
                ) + how(2),
              why: els([f.c]),
              at: els(full),
              play: fill(full, 2),
            };
          const rest = f.sumHi - f.hi[one.d] + 1;
          return {
            text:
              L(
                `Without looking ${dirs[one.d]}, this ${f.k} sees at most ${rest} cell${rest > 1 ? 's' : ''}. It needs ${one.must} more ${dirs[one.d]}, so ${one.must > 1 ? `the nearest ${one.must} are` : 'the nearest one is'} white.`,
                `Sans regarder ${dirs[one.d]}, ce ${f.k} voit au plus ${rest} case${rest > 1 ? 's' : ''}. Il lui en faut ${one.must} de plus ${dirs[one.d]} : ${one.must > 1 ? `les ${one.must} plus proches sont blanches` : 'la plus proche est blanche'}.`,
              ) + how(2),
            why: els([f.c]),
            at: els(one.ix),
            play: fill(one.ix, 2),
          };
        }
        return null;
      };
      const cap = (): Hint | null => {
        // A number that already sees (nearly) enough: block the line where it would see too many.
        for (const f of info) {
          if (f.sumLo === f.sumHi) continue;
          const ends: number[] = [];
          let one: { d: number; i: number; may: number } | null = null;
          for (let dd = 0; dd < 4; dd++) {
            const may = f.need - (f.sumLo - f.lo[dd]);
            const ray = R[f.c][dd];
            if (f.lo[dd] !== may || f.lo[dd] >= ray.length || !empty(ray[f.lo[dd]])) continue;
            ends.push(ray[f.lo[dd]]);
            one ??= { d: dd, i: ray[f.lo[dd]], may };
          }
          if (!one) continue;
          if (f.sumLo === f.need)
            return {
              text:
                L(
                  `This ${f.k} already sees ${f.k} cells, counting itself. Shade the end of each open line so it sees no more.`,
                  `Ce ${f.k} voit déjà ${f.k} cases, la sienne comprise. Noircissez le bout de chaque ligne ouverte pour qu’il n’en voie pas plus.`,
                ) + how(1),
              why: els([f.c]),
              at: els(ends),
              play: fill(ends, 1),
            };
          const seen = f.sumLo - f.lo[one.d] + 1;
          return {
            text:
              L(
                `This ${f.k} already sees ${seen} cells elsewhere, so it can see only ${one.may} ${dirs[one.d]}. Shade the cell that stops its view there.`,
                `Ce ${f.k} voit déjà ${seen} cases ailleurs : il n’en voit que ${one.may} ${dirs[one.d]}. Noircissez la case qui bloque sa vue de ce côté.`,
              ) + how(1),
            why: els([f.c]),
            at: els([one.i]),
            play: fill([one.i], 1),
          };
        }
        return null;
      };
      const cut = (): Hint | null => {
        // Shading this cell would wall off part of the white area.
        const res = cutCells(n, at);
        const i = res?.cuts.find(empty);
        if (i === undefined) return null;
        return {
          text:
            L(
              'Shading this cell would cut the white cells in two, and they must stay in one piece. So it is white.',
              'Noircir cette case couperait les cases blanches en deux, alors qu’elles doivent rester d’un seul morceau. Elle est donc blanche.',
            ) + how(2),
          why: els(
            nb4(i, n)
              .flatMap((j) => nb4(j, n))
              .filter((j, k, a) => st[j] === 1 && a.indexOf(j) === k),
          ),
          at: els([i]),
          play: fill([i], 2),
        };
      };
      const probe = (): Hint | null => {
        // Shading this cell turns its neighbours white, and a number would then see too many.
        for (let i = 0; i < n * n; i++) {
          if (!empty(i)) continue;
          const near = new Set(nb4(i, n));
          const what = (j: number) => (j === i ? 1 : near.has(j) && at(j) < 0 ? 0 : at(j));
          for (const c of clues) {
            const { lo } = reach(R, c, what);
            const seen = lo.reduce((a, b) => a + b, 1);
            if (seen <= clue[c]) continue;
            return {
              text:
                L(
                  `If this cell were shaded, its neighbours would be white and this ${clue[c]} would see ${seen} cells, too many. So it stays white.`,
                  `Si cette case était noire, ses voisines seraient blanches et ce ${clue[c]} verrait ${seen} cases, c’est trop. Elle reste donc blanche.`,
                ) + how(2),
              why: els([c]),
              at: els([i]),
              play: fill([i], 2),
            };
          }
        }
        return null;
      };
      const rules: [string, () => Hint | null][] = [
        ['beside', beside],
        ['reach', reachAll],
        ['cap', cap],
        ['cut', cut],
        ['probe', probe],
      ];
      for (const [kind, rule] of [...rules.filter(([k]) => k !== last), ...rules.filter(([k]) => k === last)]) {
        const found = rule();
        if (found) {
          last = kind;
          return found;
        }
      }
      // Nothing simple: follow the solution for an undecided cell.
      last = '';
      const i = st.findIndex((_, j) => empty(j));
      if (i < 0) return null;
      return {
        text: sol[i]
          ? L(
              'No single number decides here. Try both options: only shading this cell lets every number work out.',
              'Aucun nombre ne décide seul ici. Essayez les deux options : seule une case noire ici permet à tous les nombres de fonctionner.',
            )
          : L(
              'No single number decides here. Try both options: only keeping this cell white lets every number work out.',
              'Aucun nombre ne décide seul ici. Essayez les deux options : seule une case blanche ici permet à tous les nombres de fonctionner.',
            ),
        at: els([i]),
        play: fill([i], sol[i] ? 1 : 2),
      };
    };

    /** A mark that breaks a visible rule (touching shades, a number that can't work, a cut-off area), else one off the unique solution. */
    const check = (): Hint | null => {
      if (done) return null;
      const wrongAt = (j: number) => (st[j] === 1 && !sol[j]) || (st[j] === 2 && sol[j]);
      const fix = (i: number, text: string, why: number[] = []): Hint => ({
        kind: 'fix',
        text,
        why: els(why),
        at: els([i]),
        action: st[i] === 1 ? L('Clear the shade', 'Effacer la case noire') : L('Clear the dot', 'Effacer le point'),
        play: fill([i], 0),
      });
      // Two shades side by side: at least one of them is wrong.
      for (let i = 0; i < n * n; i++) {
        if (st[i] !== 1) continue;
        const j = nb4(i, n).find((k) => st[k] === 1);
        if (j === undefined) continue;
        const bad = wrongAt(i) ? i : wrongAt(j) ? j : -1;
        if (bad < 0) continue;
        return fix(
          bad,
          L(
            'These two shaded cells touch side by side, which is never allowed. This one has to go.',
            'Ces deux cases noires se touchent par un côté, ce qui est interdit. Celle-ci doit partir.',
          ),
          [i, j],
        );
      }
      // A number that sees too many or can no longer see enough.
      for (let c = 0; c < n * n; c++) {
        if (!given[c]) continue;
        const { lo, hi } = reach(R, c, at);
        const seen = lo.reduce((a, b) => a + b, 1),
          most = hi.reduce((a, b) => a + b, 1);
        if (seen > clue[c]) {
          // A dot in its view should be shaded.
          const i = R[c].flatMap((ray, dd) => ray.slice(0, lo[dd])).find(wrongAt);
          if (i !== undefined)
            return fix(
              i,
              L(
                `This ${clue[c]} already sees ${seen} white cells, too many. This dot is in the way: that cell must be shaded.`,
                `Ce ${clue[c]} voit déjà ${seen} cases blanches, c’est trop. Ce point est de trop : cette case doit être noircie.`,
              ),
              [c],
            );
        }
        if (most < clue[c]) {
          // A shade that stops its view too early.
          const i = R[c].map((ray, dd) => ray[hi[dd]]).find((j) => j !== undefined && st[j] === 1 && wrongAt(j));
          if (i !== undefined)
            return fix(
              i,
              L(
                `This ${clue[c]} can see at most ${most} cells now, too few. This shaded cell blocks its view: it has to be white.`,
                `Ce ${clue[c]} ne peut plus voir que ${most} cases, c’est trop peu. Cette case noire bloque sa vue : elle doit être blanche.`,
              ),
              [c],
            );
        }
      }
      // White cells split in pieces: a shade on the wall between them is wrong.
      const piece = new Int32Array(n * n).fill(-1);
      let pieces = 0;
      for (let s0 = 0; s0 < n * n; s0++) {
        if (st[s0] === 1 || piece[s0] >= 0) continue;
        const stack = [s0];
        piece[s0] = pieces;
        while (stack.length) {
          const i = stack.pop()!;
          for (const j of nb4(i, n))
            if (st[j] !== 1 && piece[j] < 0) {
              piece[j] = pieces;
              stack.push(j);
            }
        }
        pieces++;
      }
      if (pieces > 1) {
        const i = st.findIndex(
          (v, j) =>
            v === 1 &&
            wrongAt(j) &&
            new Set(
              nb4(j, n)
                .map((k) => piece[k])
                .filter((p) => p >= 0),
            ).size > 1,
        );
        if (i >= 0)
          return fix(
            i,
            L(
              'This shaded cell cuts the white cells in two, and they must stay in one piece. It has to be white.',
              'Cette case noire coupe les cases blanches en deux, alors qu’elles doivent rester d’un seul morceau. Elle doit être blanche.',
            ),
          );
      }
      // Nothing visible yet: compare with the (unique) solution.
      const i = st.findIndex((_, j) => wrongAt(j));
      if (i < 0) return null;
      return fix(
        i,
        st[i] === 1
          ? L(
              'This shaded cell breaks no rule yet, but it leads to a dead end: it has to stay white. Clear it.',
              'Cette case noire ne brise encore aucune règle, mais elle mène à une impasse : elle doit rester blanche. Effacez-la.',
            )
          : L(
              'This dot breaks no rule yet, but it leads to a dead end: the cell has to be shaded. Clear it.',
              'Ce point ne brise encore aucune règle, mais il mène à une impasse : la case doit être noircie. Effacez-le.',
            ),
      );
    };

    const DIRS: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    return {
      snapshot: () => ({ st, cur }),
      hint,
      check,
      onKey(e) {
        if (done) return false;
        const dir = DIRS[e.key];
        if (dir) {
          if (cur < 0) cur = 0;
          else {
            const r = Math.min(n - 1, Math.max(0, Math.floor(cur / n) + dir[1]));
            const c = Math.min(n - 1, Math.max(0, (cur % n) + dir[0]));
            cur = r * n + c;
          }
          render();
          return true;
        }
        if (cur < 0) return false;
        const k = e.key.toLowerCase();
        const next =
          k === ' ' || k === 'enter'
            ? (st[cur] + 1) % 3
            : k === 'x' || k === '.'
              ? st[cur] === 2
                ? 0
                : 2
              : k === 'backspace' || k === 'delete'
                ? 0
                : -1;
        if (next < 0) return false;
        set(cur, next);
        return true;
      },
      destroy() {
        cancelPress();
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
      },
    };
  },
};
