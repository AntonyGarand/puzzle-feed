import { L, P } from '../../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../../core/types';
import { board, clearBtn, h, ruleBreaks } from '../../ui/dom';
import { tapOrHold } from '../../kits/grid/press';
import { colourRegions, edgeClasses, nb8, regionAdjacency, tint } from '../../kits/logic/kit';
import { genStars, solveStars } from './gen';
import './style.css';

export const stars: PuzzleDef = {
  id: 'stars',
  get name() {
    return L('Stars', 'Étoiles');
  },
  category: 'logic',
  undo: true,
  get rules() {
    return L('One star per row, column and region. Stars never touch.', 'Une étoile par rangée, colonne et région. Jamais collées.');
  },
  help: () => ({
    goal: L(
      'Place exactly one star in every row, every column and every coloured region.',
      'Placez exactement une étoile dans chaque rangée, chaque colonne et chaque région colorée.',
    ),
    steps: [
      L('Each row, column and coloured region gets exactly one star.', 'Chaque rangée, colonne et région colorée reçoit une seule étoile.'),
      L('Two stars may never touch, not even at a corner.', 'Deux étoiles ne se touchent jamais, même pas en diagonale.'),
      L(
        'Tap a cell once for a star, twice to mark it ✕ (no star), a third time to clear it. Long-press (or right-click) to mark ✕ directly.',
        'Touchez une case une fois pour une étoile, deux fois pour la marquer ✕ (pas d’étoile), trois fois pour l’effacer. Appuyez longuement (ou cliquez droit) pour marquer ✕ directement.',
      ),
      L(
        'Clashing stars turn red and count as a mistake. The footer counts the stars placed; Clear wipes the board.',
        'Les étoiles en conflit deviennent rouges et comptent comme une erreur. Le bas de la carte compte les étoiles placées; Effacer vide la grille.',
      ),
    ],
    tips: [
      L(
        'A region that fits inside one row or column owns that line’s star: cross out the rest of the line.',
        'Une région contenue dans une seule rangée ou colonne y prend l’étoile : barrez le reste de la ligne.',
      ),
      L(
        'After placing a star, cross out its 8 neighbours plus the rest of its row, column and region.',
        'Après avoir placé une étoile, barrez ses 8 voisines ainsi que le reste de sa rangée, de sa colonne et de sa région.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [35, 70, 120, 200, 300]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const n = byLevel(d, [5, 6, 7, 8, 9]);
    const { region, sol, unique } = genStars(n, rng);
    // Distinct colours while the palette lasts; otherwise neighbours differ.
    const colour =
      n <= 8 ? rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7]).slice(0, n) : colourRegions(n, regionAdjacency(region, n, n, n), rng.int(0, 7));
    const edges = edgeClasses(n, n, (i) => region[i]);

    // 0 empty, 1 marked ✕, 2 star
    const st = new Array<number>(n * n).fill(0);
    const grid = board(n, n, 'lk-plate');
    const cells = st.map((_, i) => {
      const el = h('button', {
        type: 'button',
        class: `cell ${edges[i]}`,
        'data-i': i,
        style: `--rc:${tint(colour[region[i]], 42)}`,
      });
      grid.append(el);
      return el;
    });

    const render = () => {
      const starsAt = st.map((v, i) => (v === 2 ? i : -1)).filter((i) => i >= 0);
      const bad = new Set<number>();
      for (const a of starsAt)
        for (const b of starsAt) {
          if (a >= b) continue;
          const clash = Math.floor(a / n) === Math.floor(b / n) || a % n === b % n || region[a] === region[b] || nb8(a, n, n).includes(b);
          if (clash) {
            bad.add(a);
            bad.add(b);
          }
        }
      cells.forEach((el, i) => {
        el.classList.toggle('star', st[i] === 2);
        el.classList.toggle('x', st[i] === 1);
        el.classList.toggle('err', bad.has(i));
      });
      ctx.status(`${starsAt.length} / ${P(n, ['star', 'stars'], ['étoile', 'étoiles'])}`);
      return starsAt.length === n && bad.size === 0;
    };

    let done = false;
    /** Counts a mistake when a placed star clashes (✕ marks never do). */
    const watch = ruleBreaks(grid, ctx.mistake);
    const set = (i: number, v: number) => {
      if (done || st[i] === v) return;
      ctx.touch();
      st[i] = v;
      const won = render();
      watch(v === 2);
      if (won) {
        done = true;
        ctx.solved();
      }
    };
    // Tap cycles empty → star → ✕ → empty; long-press (or right-click) toggles ✕.
    const cleanup = tapOrHold(
      grid,
      (i) => set(i, st[i] === 0 ? 2 : st[i] === 2 ? 1 : 0),
      (i) => set(i, st[i] === 1 ? 0 : 1),
    );

    const sv = ctx.saved as { st?: unknown } | undefined;
    if (Array.isArray(sv?.st) && sv.st.length === st.length) sv.st.forEach((v, i) => (st[i] = v === 1 || v === 2 ? v : 0));
    root.append(grid);
    render();
    watch(false);
    ctx.controls(
      clearBtn(() => {
        if (done || st.every((v) => !v)) return;
        ctx.touch();
        st.fill(0);
        render();
        watch(false);
      }),
    );

    const all = [...st.keys()];
    const rowOf = (i: number) => Math.floor(i / n);
    const colOf = (i: number) => i % n;
    /** Cells a star at `i` rules out: its row, column, region and 8 neighbours. */
    const reach = (i: number) =>
      all.filter((j) => j !== i && (rowOf(j) === rowOf(i) || colOf(j) === colOf(i) || region[j] === region[i] || nb8(i, n, n).includes(j)));
    const units = () => {
      const out: { kind: 'row' | 'col' | 'region'; k: number; cells: number[] }[] = [];
      for (let k = 0; k < n; k++) {
        out.push({ kind: 'region', k, cells: all.filter((i) => region[i] === k) });
        out.push({ kind: 'row', k, cells: all.filter((i) => rowOf(i) === k) });
        out.push({ kind: 'col', k, cells: all.filter((i) => colOf(i) === k) });
      }
      return out;
    };
    const unitName = (u: { kind: string; k: number }) =>
      u.kind === 'row'
        ? L(`row ${u.k + 1}`, `la rangée ${u.k + 1}`)
        : u.kind === 'col'
          ? L(`column ${u.k + 1}`, `la colonne ${u.k + 1}`)
          : L('this region', 'cette région');
    const els = (ix: number[]) => ix.map((i) => cells[i]);
    const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
    const cross = (ix: number[]) => () => ix.forEach((i) => st[i] === 0 && set(i, 1));
    const place = (i: number) => () => set(i, 2);

    /**
     * The solution the board is heading for: the stored one when the puzzle is unique (or the board
     * agrees with it), else one that keeps the player's stars and ✕ marks, or null if none does.
     */
    let memo: { key: string; cols: number[] | null } | null = null;
    const target = (): number[] | null => {
      const key = st.join('');
      if (memo?.key === key) return memo.cols;
      const fits = (cols: number[]) => st.every((v, i) => (v === 2 ? cols[rowOf(i)] === colOf(i) : v !== 1 || cols[rowOf(i)] !== colOf(i)));
      let cols: number[] | null = fits(sol) ? sol : null;
      if (!cols && !unique) {
        const mine = all.filter((i) => st[i] === 2);
        const allow = (i: number) =>
          st[i] !== 1 && mine.every((j) => j === i || (rowOf(j) !== rowOf(i) && colOf(j) !== colOf(i) && region[j] !== region[i]));
        const { sols } = solveStars(n, region, 1, 20000, allow);
        cols = sols.find(fits) ?? null;
      }
      memo = { key, cols };
      return cols;
    };
    const isSol = (cols: number[], i: number) => cols[rowOf(i)] === colOf(i);
    /** Clear cell `i` through the same path as a player's tap. */
    const clearCell = (i: number) => () => set(i, 0);
    const fixHint = (i: number, text: string, why: number[] = []): Hint => ({
      kind: 'fix',
      text,
      why: els(why),
      at: els([i]),
      action: st[i] === 2 ? L('Remove the star', 'Enlever l’étoile') : L('Remove the ✕', 'Enlever le ✕'),
      play: clearCell(i),
    });
    /** What's wrong on the board: a broken rule first, then a mark that leads to a dead end. */
    const check = (): Hint | null => {
      if (done) return null;
      const cols = target() ?? sol;
      const placed = all.filter((i) => st[i] === 2);
      // Pick the star to remove from a clashing pair: one off the solution if possible.
      const pickStar = (a: number, b: number) => (isSol(cols, a) && !isSol(cols, b) ? b : a);
      for (const a of placed)
        for (const b of placed) {
          if (a >= b) continue;
          const i = pickStar(b, a);
          if (nb8(a, n, n).includes(b))
            return fixHint(
              i,
              L(
                'These two stars touch: stars never touch, not even at a corner.',
                'Ces deux étoiles se touchent : jamais collées, même en coin.',
              ),
              [a, b],
            );
          const u =
            rowOf(a) === rowOf(b)
              ? unitName({ kind: 'row', k: rowOf(a) })
              : colOf(a) === colOf(b)
                ? unitName({ kind: 'col', k: colOf(a) })
                : region[a] === region[b]
                  ? unitName({ kind: 'region', k: region[a] })
                  : '';
          if (u)
            return fixHint(
              i,
              L(`${cap(u)} has two stars, but it gets exactly one.`, `${cap(u)} a deux étoiles, mais n’en reçoit qu’une.`),
              [a, b],
            );
        }
      // A row, column or region whose every cell is crossed out.
      for (const u of units()) {
        if (!u.cells.every((i) => st[i] === 1)) continue;
        const i = u.cells.find((j) => isSol(cols, j)) ?? u.cells[0];
        const name = unitName(u);
        return fixHint(
          i,
          L(
            `Every cell of ${name} is crossed out, but it needs a star.`,
            `Toutes les cases de ${name} sont barrées, mais il lui faut une étoile.`,
          ),
          u.cells,
        );
      }
      const star = placed.find((i) => !isSol(cols, i));
      if (star != null)
        return fixHint(
          star,
          L(
            'This star breaks no rule yet, but it leads to a dead end: some row, column or region would be left with no room.',
            'Cette étoile ne brise encore aucune règle, mais elle mène à une impasse : une rangée, une colonne ou une région n’aurait plus de place.',
          ),
        );
      const x = all.find((i) => st[i] === 1 && isSol(cols, i));
      if (x != null)
        return fixHint(
          x,
          L(
            'This ✕ leads to a dead end: the star of this row has to go here.',
            'Ce ✕ mène à une impasse : l’étoile de cette rangée doit aller ici.',
          ),
        );
      return null;
    };

    let last = -1;
    /** The next deduction for the guide, from the stars and ✕ marks on the board. */
    const hint = (): Hint | null => {
      if (done) return null;
      const placed = all.filter((i) => st[i] === 2);
      const ruled = new Set(placed.flatMap(reach));
      const free = (i: number) => st[i] === 0 && !ruled.has(i);
      const open = units().filter((u) => !u.cells.some((i) => st[i] === 2));

      const clear = (): Hint | null => {
        // A star rules out its row, column, region and neighbours: mark them.
        for (const a of placed) {
          const ix = reach(a).filter((j) => st[j] === 0);
          if (ix.length)
            return {
              text: L(
                'A star rules out the rest of its row, column and region, and the 8 cells around it. Long-press them to mark ✕.',
                'Une étoile exclut le reste de sa rangée, de sa colonne et de sa région, ainsi que ses 8 voisines. Appuyez longuement dessus pour les marquer ✕.',
              ),
              why: els([a]),
              at: els(ix),
              play: cross(ix),
            };
        }
        return null;
      };
      const single = (): Hint | null => {
        // A row, column or region with one free cell left gets its star there.
        for (const kind of ['region', 'row', 'col'])
          for (const u of open) {
            if (u.kind !== kind) continue;
            const f = u.cells.filter(free);
            if (f.length !== 1) continue;
            const name = unitName(u);
            return {
              text: L(
                `Every other cell of ${name} is ruled out, so its star must go here. Tap once for a star.`,
                `Toutes les autres cases de ${name} sont exclues : son étoile va donc ici. Touchez une fois pour une étoile.`,
              ),
              why: els(u.cells.filter((i) => i !== f[0])),
              at: els(f),
              play: place(f[0]),
            };
          }
        return null;
      };
      const inLine = (): Hint | null => {
        // A region whose free cells sit in one row (or column) owns that line's star.
        for (const u of open) {
          if (u.kind !== 'region') continue;
          const f = u.cells.filter(free);
          if (!f.length) continue;
          for (const row of [true, false]) {
            const line = row ? rowOf(f[0]) : colOf(f[0]);
            if (!f.every((i) => (row ? rowOf(i) : colOf(i)) === line)) continue;
            const ix = all.filter((j) => (row ? rowOf(j) : colOf(j)) === line && region[j] !== u.k && st[j] === 0);
            if (!ix.length) continue;
            return {
              text: L(
                `This region’s free cells all lie in ${row ? 'row' : 'column'} ${line + 1}, so that line’s one star belongs to this region. Cross out the rest of the ${row ? 'row' : 'column'}.`,
                `Les cases libres de cette région sont toutes dans la ${row ? 'rangée' : 'colonne'} ${line + 1} : l’unique étoile de cette ligne revient à la région. Barrez le reste de la ${row ? 'rangée' : 'colonne'}.`,
              ),
              why: els(f),
              at: els(ix),
              play: cross(ix),
            };
          }
        }
        return null;
      };
      const squeeze = (): Hint | null => {
        // A star here would leave some row, column or region with no room at all.
        for (const i of all) {
          if (!free(i)) continue;
          const hit = new Set(reach(i));
          for (const u of open) {
            if (u.cells.includes(i)) continue;
            const f = u.cells.filter(free);
            if (!f.length || !f.every((j) => hit.has(j))) continue;
            const name = unitName(u);
            return {
              text: L(
                `A star here would rule out every free cell of ${name}, leaving it no star. Mark this cell ✕.`,
                `Une étoile ici exclurait toutes les cases libres de ${name}, qui n’aurait plus d’étoile. Marquez cette case ✕.`,
              ),
              why: els(f),
              at: els([i]),
              play: cross([i]),
            };
          }
        }
        return null;
      };
      const rules = [clear, single, inLine, squeeze];
      for (const rule of [...rules.filter((_, k) => k !== last), ...rules.filter((_, k) => k === last)]) {
        const found = rule();
        if (found) {
          last = rules.indexOf(rule);
          return found;
        }
      }
      // Nothing simple: follow the solution for the first row still missing its star.
      const cols = target() ?? sol;
      const r = cols.findIndex((c, rr) => st[rr * n + c] !== 2);
      if (r < 0) return null;
      const i = r * n + cols[r];
      last = -1;
      return {
        text: L(
          `Only this cell fits row ${r + 1}’s star (check its column, its region and its neighbours).`,
          `Seule cette case convient à l’étoile de la rangée ${r + 1} (vérifiez sa colonne, sa région et ses voisines).`,
        ),
        at: els([i]),
        play: place(i),
      };
    };
    return { snapshot: () => ({ st }), hint, check, destroy: cleanup };
  },
};
