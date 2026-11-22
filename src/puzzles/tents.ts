import { L } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, countClue, h, s, setCountClue } from '../core/ui';
import { nb4, nb8 } from './logickit/kit';
import { genTents, tentsMatch } from './logickit/tentsgen';
import './tents.css';

const treeSvg = () =>
  s(
    'svg',
    { viewBox: '0 0 100 100', class: 'lk-tree', 'aria-hidden': 'true' },
    s('rect', { x: 43, y: 56, width: 14, height: 32, rx: 3, class: 'trunk' }),
    s('circle', { cx: 50, cy: 40, r: 27, class: 'crown' }),
  );
const tentSvg = () =>
  s(
    'svg',
    { viewBox: '0 0 100 100', class: 'lk-tent', 'aria-hidden': 'true' },
    s('polygon', { points: '50,14 90,84 10,84', class: 'canvas' }),
    s('polygon', { points: '50,46 63,84 37,84', class: 'door' }),
  );

export const tents: PuzzleDef = {
  id: 'tents',
  get name() {
    return L('Tents', 'Tentes');
  },
  category: 'logic',
  get rules() {
    return L('A tent beside each tree. Tents never touch. Match counts.', 'Une tente près de chaque arbre, sans contact. Totaux exacts.');
  },
  help: () => ({
    goal: L(
      'Pitch one tent next to each tree, so the numbers on the edges match the tents in every row and column.',
      'Plantez une tente à côté de chaque arbre, de sorte que les nombres en bordure correspondent aux tentes de chaque rangée et colonne.',
    ),
    steps: [
      L(
        'Each tree gets its own tent, directly above, below, left or right of it (not diagonally).',
        'Chaque arbre a sa propre tente, juste au-dessus, en dessous, à gauche ou à droite (pas en diagonale).',
      ),
      L('Tents never touch each other, not even at a corner.', 'Les tentes ne se touchent jamais, même pas en diagonale.'),
      L(
        'The numbers on top and on the left say how many tents go in that column or row.',
        'Les nombres en haut et à gauche indiquent combien de tentes vont dans cette colonne ou cette rangée.',
      ),
      L(
        'Tap a cell once for grass (no tent), twice for a tent, a third time to clear it.',
        'Touchez une case une fois pour du gazon (pas de tente), deux fois pour une tente, trois fois pour l’effacer.',
      ),
    ],
    tips: [
      L('A row or column marked 0 is all grass.', 'Une rangée ou une colonne marquée 0 est entièrement en gazon.'),
      L(
        'Cells that don’t touch any tree side-on can never hold a tent: fill them with grass first.',
        'Les cases qui ne touchent aucun arbre par un côté ne peuvent pas avoir de tente : mettez-y du gazon d’abord.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [40, 70, 120, 180, 300]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const n = byLevel(d, [5, 6, 7, 8, 10]);
    const density = byLevel(d, [0.16, 0.17, 0.18, 0.19, 0.2]);
    const p = genTents(n, density, rng);
    const isTree = new Array<boolean>(n * n).fill(false);
    p.trees.forEach((t) => (isTree[t] = true));

    // 0 empty, 1 grass, 2 tent
    const st = new Array<number>(n * n).fill(0);
    const grid = board(n + 1, n + 1, 'lk-tents');
    const colEls = p.cols.map((v) => countClue('lk-clue', v));
    const rowEls = p.rows.map((v) => countClue('lk-clue', v));
    grid.append(h('div', { class: 'lk-clue corner' }), ...colEls);
    const cells: HTMLElement[] = [];
    for (let r = 0; r < n; r++) {
      grid.append(rowEls[r]);
      for (let c = 0; c < n; c++) {
        const i = r * n + c;
        const el = isTree[i]
          ? h('div', { class: 'cell given tree', 'data-i': i }, treeSvg())
          : h('button', { type: 'button', class: 'cell', 'data-i': i, onclick: () => tap(i) }, tentSvg());
        cells.push(el);
        grid.append(el);
      }
    }

    const render = () => {
      const placed = st.map((v, i) => (v === 2 ? i : -1)).filter((i) => i >= 0);
      const rows = new Array<number>(n).fill(0),
        cols = new Array<number>(n).fill(0);
      for (const t of placed) {
        rows[Math.floor(t / n)]++;
        cols[t % n]++;
      }
      cells.forEach((el, i) => {
        if (isTree[i]) return;
        const tent = st[i] === 2;
        const bad = tent && (nb8(i, n, n).some((j) => st[j] === 2) || !nb4(i, n, n).some((j) => isTree[j]));
        el.classList.toggle('tent', tent);
        el.classList.toggle('grass', st[i] === 1);
        el.classList.toggle('err', bad);
      });
      let ok = true;
      const clue = (el: HTMLElement, have: number, want: number) => {
        ok = setCountClue(el, have, want) && ok;
      };
      colEls.forEach((el, c) => clue(el, cols[c], p.cols[c]));
      rowEls.forEach((el, r) => clue(el, rows[r], p.rows[r]));
      ctx.status(L(`${placed.length} / ${p.trees.length} tents`, `${placed.length} / ${p.trees.length} tentes`));
      return ok && !placed.some((t) => nb8(t, n, n).some((j) => st[j] === 2)) && tentsMatch(n, p.trees, placed);
    };

    let done = false;
    const tap = (i: number) => {
      if (done) return;
      ctx.touch();
      st[i] = (st[i] + 1) % 3;
      if (render()) {
        done = true;
        ctx.solved();
      }
    };

    const sv = ctx.saved as { st?: unknown } | undefined;
    if (Array.isArray(sv?.st) && sv.st.length === st.length) sv.st.forEach((v, i) => (st[i] = !isTree[i] && (v === 1 || v === 2) ? v : 0));
    root.append(grid);
    render();

    const all = [...st.keys()];
    const lineOf = (row: boolean, i: number) => (row ? Math.floor(i / n) : i % n);
    const lineName = (row: boolean, k: number) =>
      row ? L(`Row ${k + 1}`, `La rangée ${k + 1}`) : L(`Column ${k + 1}`, `La colonne ${k + 1}`);
    const els = (ix: number[]) => ix.map((i) => cells[i]);
    const grass = (ix: number[]) => () => ix.forEach((i) => st[i] === 0 && tap(i));
    const pitch = (ix: number[]) => () =>
      ix.forEach((i) => {
        for (let t = 0; t < 2 && st[i] !== 2; t++) tap(i);
      });

    let last = -1;
    /** The next deduction for the guide, from the clues, trees, tents and grass on the board. */
    const hint = (): Hint | null => {
      if (done) return null;
      const empty = all.filter((i) => !isTree[i] && st[i] === 0);
      if (!empty.length) return null;
      const tentAt = (i: number) => st[i] === 2;
      const nearTree = (i: number) => nb4(i, n, n).some((j) => isTree[j]);
      /** Empty cells that could still hold a tent. */
      const cand = (i: number) => st[i] === 0 && !isTree[i] && nearTree(i) && !nb8(i, n, n).some(tentAt);
      const lines = [true, false].flatMap((row) =>
        Array.from({ length: n }, (_, k) => {
          const ix = all.filter((i) => lineOf(row, i) === k);
          return { row, k, ix, want: (row ? p.rows : p.cols)[k], clue: (row ? rowEls : colEls)[k], tents: ix.filter(tentAt) };
        }),
      );

      const zero = (): Hint | null => {
        // Every row (or every column) marked 0 at once.
        for (const row of [true, false]) {
          const zs = lines.filter((ln) => ln.row === row && ln.want === 0 && ln.ix.some((i) => !isTree[i] && st[i] === 0));
          if (!zs.length) continue;
          const ix = zs.flatMap((ln) => ln.ix.filter((i) => !isTree[i] && st[i] === 0));
          const ks = zs.map((ln) => ln.k + 1);
          const list = ks.length === 1 ? `${ks[0]}` : `${ks.slice(0, -1).join(', ')} ${L('and', 'et')} ${ks[ks.length - 1]}`;
          const one = ks.length === 1;
          return {
            text: row
              ? L(
                  `${one ? 'Row' : 'Rows'} ${list} ${one ? 'is' : 'are'} marked 0: no tents at all, so all grass. Tap a cell once for grass.`,
                  `${one ? 'La rangée' : 'Les rangées'} ${list} ${one ? 'est marquée' : 'sont marquées'} 0 : aucune tente, donc tout en gazon. Touchez une case une fois pour du gazon.`,
                )
              : L(
                  `${one ? 'Column' : 'Columns'} ${list} ${one ? 'is' : 'are'} marked 0, so ${one ? 'it is' : 'they are'} all grass too.`,
                  `${one ? 'La colonne' : 'Les colonnes'} ${list} ${one ? 'est marquée' : 'sont marquées'} 0 : tout en gazon aussi.`,
                ),
            why: zs.map((ln) => ln.clue),
            at: els(ix),
            play: grass(ix),
          };
        }
        return null;
      };
      const lonely = (): Hint | null => {
        const ix = empty.filter((i) => !nearTree(i));
        if (!ix.length) return null;
        return {
          text: L(
            'These cells don’t touch any tree side-on, so they can never hold a tent: grass.',
            'Ces cases ne touchent aucun arbre par un côté : jamais de tente, donc du gazon.',
          ),
          at: els(ix),
          play: grass(ix),
        };
      };
      const tree = (): Hint | null => {
        for (const t of p.trees) {
          const nb = nb4(t, n, n);
          if (nb.some(tentAt)) continue;
          const c = nb.filter(cand);
          if (c.length !== 1) continue;
          return {
            text: L(
              'This tree has no tent yet and only one free spot beside it, so its tent goes there. Tap twice for a tent.',
              'Cet arbre n’a pas encore de tente et une seule place libre à côté : sa tente va là. Touchez deux fois pour une tente.',
            ),
            why: els([t]),
            at: els(c),
            play: pitch(c),
          };
        }
        return null;
      };
      const touch = (): Hint | null => {
        for (const t of all.filter(tentAt)) {
          const ix = nb8(t, n, n).filter((j) => !isTree[j] && st[j] === 0);
          if (!ix.length) continue;
          return {
            text: L(
              'Tents never touch, not even at a corner: every empty cell around this tent is grass.',
              'Les tentes ne se touchent jamais, même en coin : toutes les cases vides autour de cette tente sont du gazon.',
            ),
            why: els([t]),
            at: els(ix),
            play: grass(ix),
          };
        }
        return null;
      };
      const full = (): Hint | null => {
        for (const ln of lines) {
          const ix = ln.ix.filter((i) => !isTree[i] && st[i] === 0);
          if (ln.want === 0 || ln.tents.length !== ln.want || !ix.length) continue;
          return {
            text: L(
              `${lineName(ln.row, ln.k)} needs ${ln.want} and already has ${ln.want === 1 ? 'its tent' : `its ${ln.want} tents`}, so the rest of it is grass.`,
              `${lineName(ln.row, ln.k)} demande ${ln.want} et a déjà ${ln.want === 1 ? 'sa tente' : `ses ${ln.want} tentes`} : le reste est du gazon.`,
            ),
            why: [ln.clue, ...els(ln.tents)],
            at: els(ix),
            play: grass(ix),
          };
        }
        return null;
      };
      const fill = (): Hint | null => {
        for (const ln of lines) {
          const need = ln.want - ln.tents.length;
          const c = ln.ix.filter(cand);
          if (need <= 0 || c.length !== need) continue;
          const name = lineName(ln.row, ln.k);
          return {
            text: L(
              `${name} needs ${ln.want} ${ln.want === 1 ? 'tent' : 'tents'}${ln.tents.length ? ` (${ln.tents.length} placed)` : ''} and has exactly ${need === 1 ? 'one spot' : `${need} spots`} left that could hold one: ${need === 1 ? 'it gets a tent' : 'they all get tents'}.`,
              `${name} demande ${ln.want} ${ln.want === 1 ? 'tente' : 'tentes'}${ln.tents.length ? ` (${ln.tents.length} placée${ln.tents.length > 1 ? 's' : ''})` : ''} et il reste exactement ${need === 1 ? 'une place possible : elle reçoit une tente' : `${need} places possibles : elles reçoivent toutes une tente`}.`,
            ),
            why: [ln.clue],
            at: els(c),
            play: pitch(c),
          };
        }
        return null;
      };
      const rules = [zero, lonely, tree, touch, full, fill];
      for (const rule of [...rules.filter((_, k) => k !== last), ...rules.filter((_, k) => k === last)]) {
        const found = rule();
        if (found) {
          last = rules.indexOf(rule);
          return found;
        }
      }
      const i = p.tents.find((t) => st[t] === 0);
      if (i == null) return null;
      last = -1;
      return {
        text: L(
          'Only a tent fits here: every tree still needs its own tent, and the row and column counts leave no other spot.',
          'Seule une tente convient ici : chaque arbre a besoin de sa tente, et les totaux de la rangée et de la colonne ne laissent pas d’autre place.',
        ),
        at: els([i]),
        play: pitch([i]),
      };
    };
    return { snapshot: () => ({ st }), hint };
  },
};
