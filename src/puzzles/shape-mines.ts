import { L, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, h, s } from '../core/ui';
import { nb8 } from './logickit/kit';
import { explain, explainCount } from './sweepkit/explain';
import { wrongFlag } from './sweepkit/check';
import { cellOf, gridPress } from './sweepkit/press';
import { SHAPES, footprint, patches } from './sweepkit/shapes';
import { genField, pair, single, type Con, type Deduction } from './sweepkit/solve';
import './sweepkit/kit.css';
import './shape-mines.css';

/** Mini 5×5 picture of a shape: the centre tile in ink, the counted tiles in the shape's colour. */
function icon(k: number) {
  const svg = s('svg', { viewBox: '0 0 5 5', class: 'sm-icon', 'aria-hidden': 'true' });
  const on = new Set(SHAPES[k].offs.map(([r, c]) => (r + 2) * 5 + c + 2));
  for (let i = 0; i < 25; i++)
    svg.append(
      s('rect', {
        x: (i % 5) + 0.1,
        y: Math.floor(i / 5) + 0.1,
        width: 0.8,
        height: 0.8,
        rx: 0.15,
        class: i === 12 ? 'me' : on.has(i) ? 'on' : 'off',
      }),
    );
  return svg;
}

export const shapeMines: PuzzleDef = {
  id: 'shape-mines',
  offByDefault: true,
  get name() {
    return L('Shape Mines', 'Mines en formes');
  },
  category: 'logic',
  get rules() {
    return L('Open safe tiles. Each number counts its own shape.', 'Ouvrez les cases sûres. Chaque chiffre a sa forme.');
  },
  help: () => ({
    goal: L(
      'Open every tile that doesn’t hide a mine. Each coloured zone of the board counts mines with a different shape.',
      'Ouvrez toutes les cases qui ne cachent pas de mine. Chaque zone colorée compte les mines selon une forme différente.',
    ),
    steps: [
      L(
        'Tap a tile to open it. Your first tap is always safe. Opening a mine ends the game.',
        'Touchez une case pour l’ouvrir. La première est toujours sûre. Ouvrir une mine met fin à la partie.',
      ),
      L(
        'A number counts the mines in the tiles its shape covers, not just the 8 around it. The tile’s colour and corner mark give its shape: see the legend under the board.',
        'Un chiffre compte les mines dans les cases que couvre sa forme, pas seulement les 8 voisines. La couleur et le symbole en coin donnent la forme : voyez la légende sous la grille.',
      ),
      L(
        'Ring: the 8 neighbours. Cross: 2 tiles in each straight direction. Diagonal: 2 tiles along each diagonal. Knight: the 8 chess-knight jumps.',
        'Anneau : les 8 voisines. Croix : 2 cases dans chaque direction droite. Diagonale : 2 cases sur chaque diagonale. Cavalier : les 8 sauts du cavalier.',
      ),
      L(
        'Tap an open number to outline the tiles it counts. If all its mines are flagged, the tap opens the rest.',
        'Touchez un chiffre ouvert pour encadrer les cases qu’il compte. Si toutes ses mines sont marquées, cela ouvre les autres.',
      ),
      L(
        'Long-press a closed tile (or right-click, or F on the keyboard) to plant or remove a flag.',
        'Appuyez longuement sur une case fermée (ou clic droit, ou F au clavier) pour poser ou retirer un drapeau.',
      ),
    ],
    tips: [
      L(
        'A number far from its counted tiles is easy to misread: tap it to see exactly which tiles it means.',
        'Un chiffre loin des cases qu’il compte se lit mal : touchez-le pour voir exactement lesquelles.',
      ),
      L(
        'Two numbers that share tiles tell you more together than apart. No guessing is ever needed.',
        'Deux chiffres qui partagent des cases en disent plus ensemble. Vous n’avez jamais à deviner.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [45, 90, 150, 220, 300]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const cols = byLevel(d, [7, 8, 9, 9, 10]);
    const rows = byLevel(d, [8, 9, 10, 11, 12]);
    let total = byLevel(d, [8, 13, 19, 25, 31]);
    const use = byLevel(d, [
      [0, 1],
      [1, 2],
      [0, 1, 2],
      [0, 1, 2, 3],
      [0, 1, 2, 3],
    ]);
    const N = cols * rows;
    const kind = patches(cols, rows, byLevel(d, [2, 3, 4, 5, 6]), use, () => rng.next());
    const nbs = kind.map((k, i) => footprint(SHAPES[k], i, cols, rows));

    // Mines are laid lazily on the first dig, from the rng as left by `patches`, so resume rebuilds them.
    let first = -1;
    let mine = new Array<boolean>(N).fill(false);
    let count = new Array<number>(N).fill(0);
    const open = new Array<boolean>(N).fill(false);
    const flag = new Array<boolean>(N).fill(false);
    let sel = -1;
    let over: 'won' | 'lost' | null = null;
    let hit = -1;

    const grid = board(cols, rows, 'sw-board sm-board');
    const cells = Array.from({ length: N }, (_, i) => {
      const el = h('button', { type: 'button', class: 'cell', 'data-i': i, onclick: () => tap(i) });
      grid.append(el);
      return el;
    });
    const shown = [...new Set(kind)].sort();
    const legend = h(
      'div',
      { class: 'sm-legend' },
      ...shown.map((k) => h('div', { class: `sm-key s${k}` }, icon(k), h('span', null, `${SHAPES[k].glyph} ${SHAPES[k].name()}`))),
    );

    const lay = (i: number) => {
      first = i;
      const keep = new Set([i, ...nbs[i], ...nb8(i, cols, rows)]);
      const f = genField(nbs, total, i, keep, rng);
      mine = f.mine;
      count = f.count;
      total = mine.filter(Boolean).length; // the generator may drop a mine to avoid a forced guess
    };

    /** Open `i`; a 0 opens everything its shape counts. */
    const flood = (i: number) => {
      const stack = [i];
      while (stack.length) {
        const k = stack.pop()!;
        if (open[k] || mine[k]) continue;
        open[k] = true;
        flag[k] = false;
        if (count[k] === 0) for (const j of nbs[k]) if (!open[j]) stack.push(j);
      }
    };

    const render = () => {
      const fp = new Set(sel >= 0 ? nbs[sel] : []);
      cells.forEach((el, i) => {
        const cls = ['cell', `s${kind[i]}`];
        let txt = '';
        if (open[i]) {
          cls.push('open');
          if (count[i]) {
            cls.push(`m${count[i]}`);
            txt = String(count[i]);
          }
        } else if (over === 'lost' && mine[i]) {
          cls.push('mine');
          if (i === hit) cls.push('err');
        } else if (flag[i]) {
          cls.push(over === 'lost' && !mine[i] ? 'x' : 'flag');
        }
        if (i === sel) cls.push('pick');
        if (fp.has(i)) cls.push('fp');
        el.className = cls.join(' ');
        if (el.textContent !== txt) el.textContent = txt;
      });
      const flags = flag.filter(Boolean).length;
      ctx.status(
        first < 0
          ? `${P(total, ['mine', 'mines'], ['mine', 'mines'])} · ${L('tap any tile', 'touchez une case')}`
          : P(total - flags, ['mine left', 'mines left'], ['mine restante', 'mines restantes']),
      );
    };

    const boom = (i: number) => {
      over = 'lost';
      hit = i;
      sel = -1;
      render();
      ctx.failed();
    };

    const dig = (i: number) => {
      if (flag[i] || over) return;
      if (first < 0) lay(i);
      if (open[i]) {
        // Chord when every mine of this number is flagged; otherwise show (or hide) its shape.
        const nb = nbs[i];
        const rest = nb.filter((j) => !flag[j] && !open[j]);
        if (count[i] && rest.length && nb.filter((j) => flag[j]).length === count[i]) {
          const bad = rest.find((j) => mine[j]);
          if (bad != null) return boom(bad);
          rest.forEach(flood);
          sel = i;
        } else {
          sel = sel === i || !count[i] ? -1 : i;
          render();
          return;
        }
      } else if (mine[i]) {
        return boom(i);
      } else {
        flood(i);
        sel = -1;
      }
      if (open.filter(Boolean).length === N - total) {
        over = 'won';
        sel = -1;
        mine.forEach((m, k) => (flag[k] = m));
        render();
        ctx.solved();
        return;
      }
      render();
    };

    const toggleFlag = (i: number) => {
      if (over || open[i]) return;
      ctx.touch();
      flag[i] = !flag[i];
      render();
    };

    const press = gridPress(grid, cells, { canFlag: (i) => !over && !open[i], flag: toggleFlag });
    const tap = (i: number) => {
      if (press.swallow() || over) return;
      ctx.touch();
      dig(i);
    };

    const sv = ctx.saved as { first?: unknown; open?: unknown; flag?: unknown; sel?: unknown } | undefined;
    if (sv && typeof sv.first === 'number' && Number.isInteger(sv.first) && sv.first >= 0 && sv.first < N) {
      lay(sv.first);
      const idx = (v: unknown) => (Array.isArray(v) ? v.filter((k): k is number => Number.isInteger(k) && k >= 0 && k < N) : []);
      for (const k of idx(sv.open)) if (!mine[k]) open[k] = true;
      for (const k of idx(sv.flag)) if (!open[k]) flag[k] = true;
      if (typeof sv.sel === 'number' && open[sv.sel] && count[sv.sel]) sel = sv.sel;
    }
    root.append(grid, legend);
    render();

    let lastRule = -1,
      lastShape = -1;
    const hint = (): Hint | null => {
      if (over) return null;
      const els = (ix: number[]) => ix.map((j) => cells[j]);
      if (first < 0) {
        const mid = Math.floor(rows / 2) * cols + Math.floor(cols / 2);
        return {
          text: L(
            'Start anywhere: the first tile is always safe, and a 0 opens every tile its shape covers.',
            'Commencez n’importe où : la première case est toujours sûre, et un 0 ouvre toutes les cases de sa forme.',
          ),
          at: [cells[mid]],
          play: () => dig(mid),
        };
      }
      const cons: Con[] = [];
      for (let i = 0; i < N; i++) {
        if (!open[i] || !count[i]) continue;
        const cs = nbs[i].filter((j) => !open[j] && !flag[j]);
        if (cs.length) cons.push({ at: i, cells: cs, m: count[i] - nbs[i].filter((j) => flag[j]).length });
      }
      type Ok = (dd: Deduction) => boolean;
      const rules = [(ok?: Ok) => single(cons, true, ok), (ok?: Ok) => single(cons, false, ok), (ok?: Ok) => pair(cons, ok)];
      let found: Deduction | null = null;
      // Vary the rule and, when possible, the shape from one step to the next.
      const order = [0, 1, 2].filter((r) => r !== lastRule).concat(lastRule < 0 ? [] : [lastRule]);
      search: for (const ok of [(dd: Deduction) => kind[dd.a.at] !== lastShape, undefined])
        for (const k of order) {
          found = rules[k](ok);
          if (found) {
            lastRule = k;
            lastShape = kind[found.a.at];
            break search;
          }
        }
      const act: [string, string] = ['open', 'Ouvrez'];
      const openAll = (ix: number[]) => () => ix.forEach((j) => !open[j] && !over && dig(j));
      const flagAll = (ix: number[]) => () => ix.forEach((j) => !flag[j] && toggleFlag(j));
      if (found) {
        const dd = found;
        // name() follows the page locale, so both halves read the same shape name.
        const clue = (i: number): [string, string] => {
          const t = `${count[i]} (${SHAPES[kind[i]].name()})`;
          return [t, t];
        };
        return {
          text: explain(dd, clue, (i) => nbs[i].filter((j) => flag[j]).length, act),
          why: els([dd.a.at, ...(dd.b ? [dd.b.at] : []), ...(dd.shared ?? [])]),
          at: els(dd.cells),
          play: () => {
            sel = dd.a.at;
            if (dd.mine) flagAll(dd.cells)();
            else openAll(dd.cells)();
          },
        };
      }
      const unknown = [...Array(N).keys()].filter((i) => !open[i] && !flag[i]);
      const left = total - flag.filter(Boolean).length;
      if (unknown.length && (left === 0 || left === unknown.length))
        return {
          text: explainCount(left === 0, unknown.length, act),
          at: els(unknown),
          play: left === 0 ? openAll(unknown) : flagAll(unknown),
        };
      return null;
    };

    // Partly luck, so check() only covers flags: one on a tile without a mine is a mistake.
    const check = (): Hint | null =>
      over || first < 0
        ? null
        : wrongFlag({
            flag,
            mine,
            count,
            nbs,
            cells,
            open: (i) => open[i],
            name: (i) => `${count[i]} (${SHAPES[kind[i]].name()})`,
            unflag: toggleFlag,
          });

    const list = (a: boolean[]) => a.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    return {
      snapshot: () => ({ first, open: list(open), flag: list(flag), sel }),
      hint,
      check,
      onKey(e) {
        if (e.key !== 'f' && e.key !== 'F') return false;
        const i = cellOf(grid, document.activeElement);
        if (i >= 0) toggleFlag(i);
        return i >= 0;
      },
      destroy: press.cancel,
    };
  },
};
