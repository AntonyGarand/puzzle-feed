import './unequal.css';
import { L } from '../core/i18n';
import { byLevel, type PuzzleDef } from '../core/types';
import { h, s } from '../core/ui';
import { entryGame, entryHelpSteps } from './sudokukit/entry';
import { and, entryPlace, entryVals, isAre, lineHUnits, makeCheck, makeHint, type HintOpts } from './sudokukit/hint';
import { isUnique, lineUnits, revealUntilUnique, solve, type Problem } from './sudokukit/solver';

export const unequal: PuzzleDef = {
  id: 'unequal',
  get name() {
    return L('Unequal', 'Inégalités');
  },
  category: 'logic',
  get rules() {
    return L('Each number once per row and column; obey the signs.', 'Chiffres uniques par rangée et colonne; suivez les signes.');
  },
  help: () => ({
    goal: L(
      'Fill the grid so each number appears once in every row and column, and every sign between two cells is true.',
      'Remplissez la grille pour que chaque chiffre apparaisse une fois par rangée et par colonne, en respectant tous les signes.',
    ),
    steps: [
      L(
        'Use the numbers 1 up to the grid size (1 to 4 on a 4×4 grid).',
        'Utilisez les chiffres de 1 jusqu’à la taille de la grille (1 à 4 sur une grille 4 × 4).',
      ),
      L(
        'A chevron between two cells points at the smaller number, like < and >.',
        'Un chevron entre deux cases pointe vers le plus petit chiffre, comme < et >.',
      ),
      ...entryHelpSteps(),
    ],
    tips: [
      L(
        'A cell bigger than a neighbour can’t be 1; a cell smaller than one can’t be the largest number.',
        'Une case plus grande qu’une voisine ne peut pas valoir 1; une case plus petite ne peut pas valoir le maximum.',
      ),
      L(
        'Follow chains of signs: three cells in a row that keep rising leave very few options at each end.',
        'Suivez les chaînes de signes : trois cases qui montent de suite laissent peu de choix aux extrémités.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [35, 70, 110, 200, 330]),
  create(ctx) {
    const { rng, difficulty: d } = ctx;
    const n = byLevel(d, [4, 5, 5, 6, 7]);
    const keepFrac = byLevel(d, [0.4, 0.3, 0.15, 0.1, 0]); // share of all possible signs kept at least
    const extraGivens = byLevel(d, [1, 1, 0, 0, 0]);
    const units = lineUnits(n);
    const sol = new Array(n * n).fill(0);
    solve({ size: n * n, maxDigit: n, units }, sol, 1, 100000, rng);

    const pairs: [number, number][] = [];
    for (let i = 0; i < n * n; i++) {
      for (const j of [i % n < n - 1 ? i + 1 : -1, i + n < n * n ? i + n : -1]) {
        if (j >= 0) pairs.push(sol[i] < sol[j] ? [i, j] : [j, i]);
      }
    }
    const on = pairs.map(() => true);
    const prob = (): Problem => ({ size: n * n, maxDigit: n, units, lt: pairs.filter((_, k) => on[k]) });
    const puzzle = new Array(n * n).fill(0);
    revealUntilUnique(prob(), puzzle, sol, 20000, rng);

    // Strip clues (signs and any givens) while the solution stays unique.
    const minSigns = Math.round(pairs.length * keepFrac);
    type Item = { sign: number } | { cell: number };
    const items: Item[] = rng.shuffle([...pairs.map((_, k) => ({ sign: k })), ...puzzle.flatMap((v, i) => (v ? [{ cell: i }] : []))]);
    let signs = pairs.length;
    for (const it of items) {
      if ('sign' in it) {
        if (signs <= minSigns) continue;
        on[it.sign] = false;
        if (isUnique(prob(), puzzle, 20000)) signs--;
        else on[it.sign] = true;
      } else {
        const v = puzzle[it.cell];
        puzzle[it.cell] = 0;
        if (!isUnique(prob(), puzzle, 20000)) puzzle[it.cell] = v;
      }
    }
    for (let k = 0; k < extraGivens; k++) {
      const c = rng.pick([...puzzle.keys()].filter((i) => !puzzle[i]));
      puzzle[c] = sol[c];
    }

    const signsAt: [string, string, string, number][][] = Array.from({ length: n * n }, () => []);
    pairs.forEach(([a, b], k) => {
      if (!on[k]) return;
      const p = Math.min(a, b),
        q = Math.max(a, b);
      const across = q === p + 1;
      const pSmaller = a === p;
      // chevron points towards the smaller cell
      const pts = across ? (pSmaller ? '66,14 30,50 66,86' : '34,14 70,50 34,86') : pSmaller ? '14,66 50,30 86,66' : '14,34 50,70 86,34';
      signsAt[p].push([across ? 'r' : 'd', pts, across ? (pSmaller ? '<' : '>') : pSmaller ? '^' : 'v', k]);
    });
    const problem = prob();
    const lt = problem.lt ?? [];
    const cells: Element[] = [];
    const signEls: Element[] = [];
    const inst = entryGame({
      ctx,
      cols: n,
      rows: n,
      problem,
      puzzle,
      boardClass: 'unequal',
      decorate(el, i) {
        for (const [dir, pts, label, k] of signsAt[i]) {
          el.append(
            (signEls[k] = h(
              'span',
              { class: `sg ${dir}`, 'data-sign': label },
              s('svg', { viewBox: '0 0 100 100' }, s('polyline', { points: pts })),
            )),
          );
        }
        cells[i] = el;
      },
    });

    // Bounds that chains of signs alone force (a < b < c… means c ≥ 3).
    const lo = new Array<number>(n * n).fill(1),
      hi = new Array<number>(n * n).fill(n);
    for (let it = 0; it <= n; it++)
      for (const [a, b] of lt) {
        lo[b] = Math.max(lo[b], lo[a] + 1);
        hi[a] = Math.min(hi[a], hi[b] - 1);
      }
    const assist: HintOpts = {
      n,
      givens: puzzle,
      sol,
      cells,
      units: lineHUnits(n),
      vals: entryVals(inst),
      place: entryPlace(inst, cells),
      scope: ['its row, column and signs', 'sa rangée, sa colonne et les signes'],
      post: {
        // The signs bound the cell; its row and column rule out the rest.
        signs(k) {
          for (const i of k.empties) {
            let below = 0, // biggest filled neighbour this cell must beat
              above = n + 1; // smallest filled neighbour this cell must stay under
            const near: number[] = [],
              chainLo: number[] = [],
              chainHi: number[] = [];
            for (const [a, b] of lt) {
              if (a === i) {
                if (k.vals[b] > 0) {
                  above = Math.min(above, k.vals[b]);
                  near.push(b);
                } else chainHi.push(b);
              }
              if (b === i) {
                if (k.vals[a] > 0) {
                  below = Math.max(below, k.vals[a]);
                  near.push(a);
                } else chainLo.push(a);
              }
            }
            const l = Math.max(lo[i], below + 1),
              u = Math.min(hi[i], above - 1);
            if (l === 1 && u === n) continue;
            const f = k.free(i);
            const fit = f.filter((v) => v >= l && v <= u);
            if (fit.length !== 1) continue;
            const v = fit[0];
            const excl = Array.from({ length: u - l + 1 }, (_, t) => l + t).filter((x) => x !== v);
            const w = k.witness(i, excl);
            const en: string[] = [],
              fr: string[] = [];
            const why = near.map((j) => cells[j]);
            if (l > 1) {
              if (below + 1 >= lo[i]) {
                en.push(`bigger than the ${below} next to it`);
                fr.push(`plus grande que le ${below} voisin`);
              } else {
                en.push(`at least ${lo[i]} (a chain of ${lo[i]} rising cells ends here)`);
                fr.push(`au moins ${lo[i]} (une chaîne de ${lo[i]} cases croissantes finit ici)`);
                why.push(...chainLo.map((j) => cells[j]));
              }
            }
            if (u < n) {
              if (above - 1 <= hi[i]) {
                en.push(`smaller than the ${above} next to it`);
                fr.push(`plus petite que le ${above} voisin`);
              } else {
                en.push(`at most ${hi[i]} (a chain of ${n - hi[i] + 1} rising cells starts here)`);
                fr.push(`au plus ${hi[i]} (une chaîne de ${n - hi[i] + 1} cases croissantes part d’ici)`);
                why.push(...chainHi.map((j) => cells[j]));
              }
            }
            const rest = excl.length
              ? L(`; ${and(excl)} ${isAre(excl)} already in ${w.where}`, `; ${and(excl)} ${isAre(excl)} déjà dans ${w.where}`)
              : '';
            return {
              text: L(
                `The signs make this cell ${en.join(' and ')}${rest}, so it’s ${v}.`,
                `D’après les signes, cette case est ${fr.join(' et ')}${rest} : c’est donc ${v}.`,
              ),
              why: [...why, ...w.els],
              at: [i],
              moves: [[i, v]],
            };
          }
          return null;
        },
      },
    };
    inst.hint = makeHint(assist);
    inst.check = makeCheck({
      ...assist,
      rules: [
        // A sign that doesn't hold.
        (vals) => {
          for (let k = 0; k < pairs.length; k++) {
            const [a, b] = pairs[k];
            if (!on[k] || vals[a] <= 0 || vals[b] <= 0 || vals[a] < vals[b]) continue;
            return {
              text: L(
                `The sign points at the smaller number, so ${vals[a]} should be smaller than ${vals[b]} here, and it isn’t.`,
                `Le signe pointe vers le plus petit chiffre : ici, ${vals[a]} devrait être plus petit que ${vals[b]}, et ce n’est pas le cas.`,
              ),
              why: [signEls[k]],
              at: [a, b],
            };
          }
          return null;
        },
      ],
    });
    return inst;
  },
};
