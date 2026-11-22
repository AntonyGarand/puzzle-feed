import { L } from '../../core/i18n';
import type { Rng } from '../../core/rng';
import { byLevel, type PuzzleDef } from '../../core/types';
import { entryGame } from '../../kits/sudoku/entry';
import { entryPlace, entryVals, lineHUnits, makeCheck, makeHint, type HintOpts } from '../../kits/sudoku/hint';
import { notesHelpStep } from '../../kits/sudoku/notes';
import { lineUnits, type Unit } from '../../kits/sudoku/solver';
import './style.css';

interface Shape {
  n: number;
  br: number; // box rows
  bc: number; // box cols
}

const SHAPES: Record<number, Shape> = { 4: { n: 4, br: 2, bc: 2 }, 6: { n: 6, br: 2, bc: 3 }, 9: { n: 9, br: 3, bc: 3 } };

const boxOf = (s: Shape, i: number) => {
  const r = Math.floor(i / s.n),
    c = i % s.n;
  return Math.floor(r / s.br) * (s.n / s.bc) + Math.floor(c / s.bc);
};

/** Count solutions up to `limit` using bitmask candidates + MRV. */
function countSolutions(s: Shape, g: number[], limit: number, rng?: Rng): number {
  const { n } = s;
  const rows = new Array(n).fill(0),
    cols = new Array(n).fill(0),
    boxes = new Array(n).fill(0);
  for (let i = 0; i < n * n; i++) {
    if (!g[i]) continue;
    const b = 1 << g[i];
    rows[Math.floor(i / n)] |= b;
    cols[i % n] |= b;
    boxes[boxOf(s, i)] |= b;
  }
  const full = ((1 << (n + 1)) - 1) & ~1;
  let count = 0;
  const rec = (): boolean => {
    let best = -1,
      bestMask = 0,
      bestN = 99;
    for (let i = 0; i < n * n; i++) {
      if (g[i]) continue;
      const m = full & ~(rows[Math.floor(i / n)] | cols[i % n] | boxes[boxOf(s, i)]);
      let k = 0;
      for (let x = m; x; x &= x - 1) k++;
      if (k < bestN) {
        best = i;
        bestMask = m;
        bestN = k;
        if (k <= 1) break;
      }
    }
    if (best === -1) return ++count >= limit;
    if (bestN === 0) return false;
    const digits: number[] = [];
    for (let v = 1; v <= n; v++) if (bestMask & (1 << v)) digits.push(v);
    if (rng) rng.shuffle(digits);
    const r = Math.floor(best / n),
      c = best % n,
      bx = boxOf(s, best);
    for (const v of digits) {
      const b = 1 << v;
      g[best] = v;
      rows[r] |= b;
      cols[c] |= b;
      boxes[bx] |= b;
      if (rec()) {
        if (rng) return true;
        g[best] = 0;
        rows[r] &= ~b;
        cols[c] &= ~b;
        boxes[bx] &= ~b;
        return true;
      }
      g[best] = 0;
      rows[r] &= ~b;
      cols[c] &= ~b;
      boxes[bx] &= ~b;
    }
    return false;
  };
  rec();
  return count;
}

function generate(s: Shape, holes: number, rng: Rng) {
  const sol = new Array(s.n * s.n).fill(0);
  countSolutions(s, sol, 1, rng); // fills `sol` randomly
  const puzzle = [...sol];
  const order = rng.shuffle([...puzzle.keys()]);
  let removed = 0;
  for (const i of order) {
    if (removed >= holes) break;
    const keep = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions(s, [...puzzle], 2) === 1) removed++;
    else puzzle[i] = keep;
  }
  return { sol, puzzle };
}

export const sudoku: PuzzleDef = {
  id: 'sudoku',
  get name() {
    return L('Sudoku', 'Sudoku');
  },
  category: 'logic',
  undo: true,
  get rules() {
    return L('Each number once per row, column and box.', 'Chaque chiffre une fois par rangée, colonne et bloc.');
  },
  help: () => ({
    goal: L(
      'Fill the grid so that every row, column and box contains each number exactly once.',
      'Remplissez la grille pour que chaque rangée, colonne et bloc contienne chaque chiffre une seule fois.',
    ),
    steps: [
      L('The grid grows with the level: 4×4, then 6×6, then 9×9.', 'La grille grandit avec le niveau : 4×4, puis 6×6, puis 9×9.'),
      L(
        'Tap an empty cell to select it. Its row, column and box are highlighted.',
        'Touchez une case vide pour la sélectionner. Sa rangée, sa colonne et son bloc sont surlignés.',
      ),
      L(
        'Tap a number on the pad (or type it) to fill the cell. Tap the same number again, or ✕, to clear it.',
        'Touchez un chiffre du pavé (ou tapez-le) pour remplir la case. Retouchez le même chiffre, ou ✕, pour l’effacer.',
      ),
      L(
        'Numbers that clash turn red and count as a mistake. Starting numbers can’t be changed.',
        'Les chiffres en conflit passent au rouge et comptent comme une erreur. Les chiffres de départ sont fixes.',
      ),
      L(
        'Keyboard: arrow keys move, number keys fill, Backspace or 0 clears. Clear wipes all your numbers.',
        'Clavier : flèches pour se déplacer, chiffres pour remplir, Retour arrière ou 0 pour effacer. Effacer retire tous vos chiffres.',
      ),
      notesHelpStep(),
    ],
    tips: [
      L('Look for a cell where only one number can fit.', 'Cherchez une case où un seul chiffre peut aller.'),
      L(
        'Pick a number and check where it can still go in each box.',
        'Prenez un chiffre et regardez où il peut encore aller dans chaque bloc.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [40, 90, 150, 300, 480]),
  create(ctx) {
    const { rng, difficulty: d } = ctx;
    const s = SHAPES[byLevel(d, [4, 6, 6, 9, 9])];
    const { n } = s;
    const { puzzle, sol } = generate(s, byLevel(d, [8, 16, 22, 42, 52]), rng);
    const cells: Element[] = [];
    const units: Unit[] = [
      ...lineUnits(n),
      ...Array.from({ length: n }, (_, b) => ({ cells: [...puzzle.keys()].filter((i) => boxOf(s, i) === b) })),
    ];
    const inst = entryGame({
      ctx,
      cols: n,
      rows: n,
      problem: { size: n * n, maxDigit: n, units },
      puzzle,
      boardClass: 'sudoku',
      cellClass: (i) => ((Math.floor(Math.floor(i / n) / s.br) + Math.floor((i % n) / s.bc)) % 2 === 1 ? 'alt' : ''),
      decorate: (el, i) => (cells[i] = el),
    });
    const assist: HintOpts = {
      n,
      givens: puzzle,
      sol,
      cells,
      units: [...lineHUnits(n), ...units.slice(2 * n).map((u) => ({ kind: 'box' as const, full: true, cells: u.cells }))],
      vals: entryVals(inst),
      place: entryPlace(inst, cells),
      scope: ['its row, column and box', 'sa rangée, sa colonne et son bloc'],
    };
    inst.hint = makeHint(assist);
    inst.check = makeCheck(assist);
    return inst;
  },
};
