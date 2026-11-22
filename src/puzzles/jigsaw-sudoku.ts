import './jigsaw-sudoku.css';
import { L } from '../core/i18n';
import { byLevel, type PuzzleDef } from '../core/types';
import { edgeClasses, entryGame, entryHelpSteps } from './sudokukit/entry';
import { jigsawRegions, regionTints } from './sudokukit/regions';
import { entryPlace, entryVals, lineHUnits, makeHint } from './sudokukit/hint';
import { digHoles, lineUnits, solve, type Problem } from './sudokukit/solver';

export const jigsawSudoku: PuzzleDef = {
  id: 'jigsaw-sudoku',
  get name() {
    return L('Jigsaw Sudoku', 'Sudoku irrégulier');
  },
  category: 'logic',
  undo: true,
  get rules() {
    return L('Each number once per row, column and outlined shape.', 'Chaque chiffre une fois par rangée, colonne et forme.');
  },
  help: () => ({
    goal: L(
      'Fill the grid so every row, column and outlined shape holds each number exactly once.',
      'Remplissez la grille pour que chaque rangée, chaque colonne et chaque forme encadrée contienne chaque chiffre une seule fois.',
    ),
    steps: [
      L(
        'Use the numbers 1 up to the grid size (1 to 5 on a 5×5 grid).',
        'Utilisez les chiffres de 1 jusqu’à la taille de la grille (1 à 5 sur une grille 5 × 5).',
      ),
      L(
        'No number repeats in a row, a column or a shape with a thick outline. Shapes are irregular, not boxes.',
        'Aucun chiffre ne se répète dans une rangée, une colonne ou une forme au contour épais. Les formes sont irrégulières.',
      ),
      ...entryHelpSteps(),
    ],
    tips: [
      L(
        'Look for a row, column or shape missing just one or two numbers.',
        'Cherchez une rangée, une colonne ou une forme où il ne manque qu’un ou deux chiffres.',
      ),
      L(
        'When a shape’s only spots for a number sit in one row, that number can’t go elsewhere in that row.',
        'Si une forme ne peut placer un chiffre que dans une seule rangée, ce chiffre est exclu du reste de cette rangée.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [45, 100, 170, 300, 480]),
  create(ctx) {
    const { rng, difficulty: d } = ctx;
    const n = byLevel(d, [5, 6, 7, 8, 9]);
    const holes = byLevel(d, [13, 21, 31, 42, 54]);

    let region: number[] = [];
    let problem: Problem | null = null;
    let sol: number[] = [];
    for (let attempt = 0; attempt < 40; attempt++) {
      region = jigsawRegions(n, rng);
      const units = lineUnits(n);
      for (let k = 0; k < n; k++) units.push({ cells: region.flatMap((r, i) => (r === k ? [i] : [])) });
      const p: Problem = { size: n * n, maxDigit: n, units };
      const g = new Array(n * n).fill(0);
      const r = solve(p, g, 1, 3000, rng);
      if (r.count === 1 && !r.aborted) {
        problem = p;
        sol = g;
        break;
      }
    }
    if (!problem) {
      // Fallback: rows as regions trivially fail; use a cyclic Latin square with row-band regions shifted.
      region = Array.from({ length: n * n }, (_, i) => Math.floor(i / n));
      const units = lineUnits(n);
      const p: Problem = { size: n * n, maxDigit: n, units };
      sol = Array.from({ length: n * n }, (_, i) => ((Math.floor(i / n) + (i % n)) % n) + 1);
      problem = p;
    }
    const puzzle = [...sol];
    digHoles(problem, puzzle, holes, 4000, rng);

    const tint = regionTints(n, region);
    const cells: Element[] = [];
    const inst = entryGame({
      ctx,
      cols: n,
      rows: n,
      problem,
      puzzle,
      boardClass: 'slab jigsaw',
      cellClass: (i) => `${edgeClasses(region, n, n, i)} t${tint[region[i]] % 4}`,
      decorate: (el, i) => (cells[i] = el),
    });
    inst.hint = makeHint({
      n,
      givens: puzzle,
      sol,
      cells,
      units: [
        ...Array.from({ length: n }, (_, k) => ({
          kind: 'shape' as const,
          full: true,
          cells: region.flatMap((r, i) => (r === k ? [i] : [])),
        })),
        ...lineHUnits(n),
      ],
      vals: entryVals(inst),
      place: entryPlace(inst, cells),
      scope: ['its row, column and shape', 'sa rangée, sa colonne et sa forme'],
    });
    return inst;
  },
};
