import './killer-sudoku.css';
import { L } from '../core/i18n';
import { byLevel, type PuzzleDef } from '../core/types';
import { h } from '../core/ui';
import { edgeClasses, entryGame, entryHelpSteps } from './sudokukit/entry';
import { neighbours } from './sudokukit/regions';
import { entryPlace, entryVals, lineHUnits, makeHint, type HUnit } from './sudokukit/hint';
import { lineUnits, revealUntilUnique, solve, type Problem, type Unit } from './sudokukit/solver';

const BOX: Record<number, [number, number]> = { 4: [2, 2], 6: [2, 3], 9: [3, 3] };

export const killerSudoku: PuzzleDef = {
  id: 'killer-sudoku',
  get name() {
    return L('Killer Sudoku', 'Sudoku killer');
  },
  category: 'logic',
  undo: true,
  get rules() {
    return L('Sudoku; dashed cages add up to their sum, no repeats.', 'Sudoku; chaque cage pointillée fait sa somme, sans doublon.');
  },
  help: () => ({
    goal: L(
      'Fill the grid like a sudoku, and make the digits in each dashed cage add up to the small number in its corner.',
      'Remplissez la grille comme un sudoku, en faisant en sorte que les chiffres de chaque cage pointillée donnent le petit nombre dans son coin.',
    ),
    steps: [
      L(
        'Use 1 up to the grid size (4, 6 or 9). Each number appears once per row, column and thick-bordered box.',
        'Utilisez les chiffres de 1 à la taille de la grille (4, 6 ou 9), une fois par rangée, colonne et bloc à bordure épaisse.',
      ),
      L(
        'A dashed cage’s digits add up to its sum, and no digit repeats inside a cage.',
        'Les chiffres d’une cage pointillée donnent sa somme, sans répétition dans la cage.',
      ),
      ...entryHelpSteps(),
    ],
    tips: [
      L(
        'Some cages have one combination: two cells summing to 3 are 1 and 2; on 9×9, two cells summing to 17 are 8 and 9.',
        'Certaines cages n’ont qu’une combinaison : deux cases qui font 3, c’est 1 et 2; en 9 × 9, deux cases qui font 17, c’est 8 et 9.',
      ),
      L(
        'Every row, column and box adds up to the same total (45 on 9×9): use it to find a lone missing cell.',
        'Chaque rangée, colonne et bloc a le même total (45 en 9 × 9) : servez-vous-en pour trouver une case isolée.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [50, 120, 200, 420, 600]),
  create(ctx) {
    const { rng, difficulty: d } = ctx;
    const n = byLevel(d, [4, 6, 6, 9, 9]);
    const maxCage = byLevel(d, [3, 3, 4, 3, 4]);
    const extraGivens = byLevel(d, [3, 4, 1, 4, 0]);
    const [br, bc] = BOX[n];
    const box = Array.from({ length: n * n }, (_, i) => Math.floor(Math.floor(i / n) / br) * (n / bc) + Math.floor((i % n) / bc));
    const base = lineUnits(n);
    for (let k = 0; k < n; k++) base.push({ cells: box.flatMap((b, i) => (b === k ? [i] : [])) });

    // random full grid
    const sol = new Array(n * n).fill(0);
    solve({ size: n * n, maxDigit: n, units: base }, sol, 1, 100000, rng);

    // cages: grow random connected groups without repeated digits
    const cage = new Array(n * n).fill(-1);
    const cages: number[][] = [];
    for (const start of rng.shuffle([...cage.keys()])) {
      if (cage[start] >= 0) continue;
      const want = rng.chance(0.15) ? 2 : rng.int(2, maxCage);
      const cells = [start];
      let mask = 1 << sol[start];
      cage[start] = cages.length;
      while (cells.length < want) {
        const front = [...new Set(cells.flatMap((c) => neighbours(n, c)))].filter((j) => cage[j] < 0 && !(mask & (1 << sol[j])));
        if (!front.length) break;
        const j = rng.pick(front);
        cells.push(j);
        cage[j] = cages.length;
        mask |= 1 << sol[j];
      }
      cages.push(cells);
    }
    // fold most single cells into a neighbouring cage
    for (let k = 0; k < cages.length; k++) {
      if (cages[k].length !== 1) continue;
      const c = cages[k][0];
      const opts = [...new Set(neighbours(n, c).map((j) => cage[j]))].filter(
        (o) => o !== k && cages[o].length > 0 && cages[o].length <= maxCage && !cages[o].some((x) => sol[x] === sol[c]),
      );
      if (!opts.length) continue;
      const o = rng.pick(opts);
      cages[o].push(c);
      cage[c] = o;
      cages[k] = [];
    }
    const live = cages.filter((c) => c.length);
    live.forEach((cells, k) => cells.forEach((c) => (cage[c] = k)));

    const units: Unit[] = [...base, ...live.map((cells) => ({ cells, sum: cells.reduce((s, c) => s + sol[c], 0) }))];
    const problem: Problem = { size: n * n, maxDigit: n, units };
    const puzzle = new Array(n * n).fill(0);
    revealUntilUnique(problem, puzzle, sol, 50000, rng);
    for (let k = 0; k < extraGivens; k++) {
      const open = [...puzzle.keys()].filter((i) => !puzzle[i]);
      if (open.length <= (n * n) / 2) break;
      const c = rng.pick(open);
      puzzle[c] = sol[c];
    }

    const sums = live.map((cells) => cells.reduce((s, c) => s + sol[c], 0));
    const head = live.map((cells) => Math.min(...cells));
    const cellEls: Element[] = [];
    const inst = entryGame({
      ctx,
      cols: n,
      rows: n,
      problem,
      puzzle,
      boardClass: 'slab killer',
      cellClass: (i) => edgeClasses(box, n, n, i),
      decorate(el, i) {
        const r = Math.floor(i / n),
          c = i % n,
          k = cage[i];
        const side = (cond: boolean, cls: string) => (cond ? cls : '');
        const cls = [
          side(r === 0 || cage[i - n] !== k, 'ct'),
          side(r === n - 1 || cage[i + n] !== k, 'cb'),
          side(c === 0 || cage[i - 1] !== k, 'cl'),
          side(c === n - 1 || cage[i + 1] !== k, 'cr'),
        ].join(' ');
        el.append(h('span', { class: `cage ${cls}` }));
        if (head[k] === i) el.append(h('span', { class: 'sum' }, sums[k]));
        cellEls[i] = el;
      },
    });
    inst.hint = makeHint({
      n,
      givens: puzzle,
      sol,
      cells: cellEls,
      units: [
        ...lineHUnits(n),
        ...Array.from({ length: n }, (_, b): HUnit => ({ kind: 'box', full: true, cells: box.flatMap((x, i) => (x === b ? [i] : [])) })),
        ...live.map((cells, k): HUnit => ({ kind: 'cage', cells, sum: sums[k], clue: [cellEls[head[k]]] })),
      ],
      vals: entryVals(inst),
      place: entryPlace(inst, cellEls),
      scope: ['its row, column, box and cage', 'sa rangée, sa colonne, son bloc et sa cage'],
    });
    return inst;
  },
};
