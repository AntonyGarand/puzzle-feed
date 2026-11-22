import './style.css';
import type { Rng } from '../../core/rng';
import { L } from '../../core/i18n';
import { byLevel, type PuzzleDef } from '../../core/types';
import { h } from '../../ui/dom';
import { entryGame, entryHelpSteps } from '../../kits/sudoku/entry';
import { entryPlace, entryVals, makeCheck, makeHint, type HintOpts } from '../../kits/sudoku/hint';
import { revealUntilUnique, solve, type Problem, type Unit } from '../../kits/sudoku/solver';

interface Run {
  cells: number[];
  clue: number;
  across: boolean;
}

/** All runs (≥1 cell) of white cells; `clue` is the black cell just before the run. */
function runsOf(n: number, white: boolean[]): Run[] {
  const out: Run[] = [];
  for (const across of [true, false]) {
    for (let a = 0; a < n; a++) {
      let cur: number[] = [];
      for (let b = 0; b <= n; b++) {
        const i = across ? a * n + b : b * n + a;
        if (b < n && white[i]) {
          cur.push(i);
          continue;
        }
        if (cur.length) out.push({ cells: cur, clue: cur[0] - (across ? 1 : n), across });
        cur = [];
      }
    }
  }
  return out;
}

function valid(n: number, white: boolean[]): boolean {
  const runs = runsOf(n, white);
  if (runs.some((r) => r.cells.length < 2)) return false;
  const start = white.indexOf(true);
  if (start < 0) return false;
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const i = stack.pop()!;
    const r = Math.floor(i / n),
      c = i % n;
    for (const [rr, cc] of [
      [r - 1, c],
      [r + 1, c],
      [r, c - 1],
      [r, c + 1],
    ]) {
      const j = rr * n + cc;
      if (rr >= 0 && cc >= 0 && rr < n && cc < n && white[j] && !seen.has(j)) {
        seen.add(j);
        stack.push(j);
      }
    }
  }
  return seen.size === white.filter(Boolean).length;
}

/** Symmetric black/white layout with clue row/column, runs of 2..maxRun cells. */
function layout(n: number, maxRun: number, blackFrac: number, rng: Rng): boolean[] | null {
  const white = Array.from({ length: n * n }, (_, i) => i >= n && i % n > 0);
  const mirror = (i: number) => (n - Math.floor(i / n)) * n + (n - (i % n));
  const blacken = (i: number) => {
    const m = mirror(i);
    if (!white[i] || !white[m]) return false;
    white[i] = white[m] = false;
    if (valid(n, white)) return true;
    white[i] = white[m] = true;
    return false;
  };
  for (let tries = 0; tries < 300; tries++) {
    const long = runsOf(n, white).filter((r) => r.cells.length > maxRun);
    if (!long.length) break;
    blacken(rng.pick(rng.pick(long).cells));
  }
  if (runsOf(n, white).some((r) => r.cells.length > maxRun)) return null;
  const interior = (n - 1) * (n - 1);
  for (let tries = 0; tries < 200; tries++) {
    if (interior - white.filter(Boolean).length >= interior * blackFrac) break;
    blacken(rng.int(n + 1, n * n - 1));
  }
  return white;
}

export const crossSums: PuzzleDef = {
  id: 'cross-sums',
  get name() {
    return L('Cross Sums', 'Sommes croisées');
  },
  category: 'logic',
  undo: true,
  get rules() {
    return L('Digits 1–9 add up to each clue; no repeats in a run.', 'Chiffres 1 à 9 : chaque segment fait sa somme, sans doublon.');
  },
  help: () => ({
    goal: L(
      'Fill every white cell with a digit from 1 to 9 so each run of cells adds up to its clue.',
      'Remplissez chaque case blanche avec un chiffre de 1 à 9 pour que chaque segment donne la somme indiquée.',
    ),
    steps: [
      L(
        'A run is an unbroken line of white cells, across or down. Its clue is in the dark cell just before it.',
        'Un segment est une suite de cases blanches, horizontale ou verticale. Sa somme est dans la case foncée qui le précède.',
      ),
      L(
        'In a clue cell, the top-right number is for the run to the right; the bottom-left one is for the run below.',
        'Dans une case indice, le nombre en haut à droite vaut pour le segment à droite; celui en bas à gauche, pour le segment en dessous.',
      ),
      L('A digit can’t repeat within the same run.', 'Un chiffre ne peut pas se répéter dans un même segment.'),
      ...entryHelpSteps(),
    ],
    tips: [
      L(
        'Some sums have one combination: 3 in two cells is 1+2, 4 is 1+3, 16 is 7+9, 17 is 8+9.',
        'Certaines sommes n’ont qu’une combinaison : 3 en deux cases, c’est 1+2; 4, c’est 1+3; 16, c’est 7+9; 17, c’est 8+9.',
      ),
      L('Start where a short run crosses a run with a tight sum.', 'Commencez là où un segment court croise un segment à la somme serrée.'),
    ],
  }),
  par: (d) => byLevel(d, [40, 90, 160, 260, 420]),
  create(ctx) {
    const { rng, difficulty: d } = ctx;
    const n = byLevel(d, [5, 6, 7, 8, 9]);
    const maxRun = byLevel(d, [4, 4, 5, 5, 6]);
    const blackFrac = byLevel(d, [0.1, 0.16, 0.2, 0.22, 0.24]);

    // Several layouts/fills; keep the one that needs the fewest revealed digits.
    let best: { white: boolean[]; units: Unit[]; puzzle: number[]; runs: Run[]; sol: number[] } | null = null;
    for (let attempt = 0, built = 0; attempt < 30 && built < byLevel(d, [4, 4, 5, 5, 6]); attempt++) {
      const w = layout(n, maxRun, blackFrac, rng);
      if (!w) continue;
      const sol = w.map((x) => (x ? 0 : -1));
      const runs = runsOf(n, w);
      const r = solve({ size: n * n, maxDigit: 9, units: runs.map((run) => ({ cells: run.cells })) }, sol, 1, 20000, rng);
      if (r.count !== 1 || r.aborted) continue;
      built++;
      const units: Unit[] = runs.map((run) => ({ cells: run.cells, sum: run.cells.reduce((s, c) => s + sol[c], 0) }));
      const puzzle = w.map((x) => (x ? 0 : -1));
      revealUntilUnique({ size: n * n, maxDigit: 9, units }, puzzle, sol, 20000, rng);
      const count = (p: number[]) => p.filter((v) => v > 0).length;
      if (!best || count(puzzle) < count(best.puzzle)) best = { white: w, units, puzzle, runs, sol };
    }
    if (!best) {
      // Fallback: open grid with a cyclic fill (always valid, runs of n-1 <= 8 cells); reveal until unique.
      const white = Array.from({ length: n * n }, (_, i) => i >= n && i % n > 0);
      const sol = white.map((w, i) => (w ? ((Math.floor(i / n) + (i % n)) % (n - 1)) + 1 : -1));
      const runs = runsOf(n, white);
      const units: Unit[] = runs.map((run) => ({ cells: run.cells, sum: run.cells.reduce((s, c) => s + sol[c], 0) }));
      const puzzle = white.map((w) => (w ? 0 : -1));
      revealUntilUnique({ size: n * n, maxDigit: 9, units }, puzzle, sol, 20000, rng);
      best = { white, units, puzzle, runs, sol };
    }
    const { units, puzzle, runs, sol } = best;
    const problem: Problem = { size: n * n, maxDigit: 9, units };

    const across = new Map<number, number>(),
      down = new Map<number, number>();
    runs.forEach((run, k) => (run.across ? across : down).set(run.clue, units[k].sum!));
    const cellEls: Element[] = [];
    // Clue number element per run, so the selected cell's runs light up and finished runs fade.
    const clueEls: HTMLElement[] = runs.map((run, k) => h('span', { class: run.across ? 'ac' : 'dn' }, units[k].sum));
    const clueAt = (i: number, isAcross: boolean) => clueEls[runs.findIndex((r) => r.clue === i && r.across === isAcross)];
    const inst = entryGame({
      ctx,
      cols: n,
      rows: n,
      problem,
      puzzle,
      boardClass: 'slab kakuro',
      cellClass: (i) =>
        puzzle[i] < 0 && (across.has(i) || down.has(i)) ? `clue${across.has(i) ? ' has-ac' : ''}${down.has(i) ? ' has-dn' : ''}` : '',
      decorate(el, i) {
        cellEls[i] = el;
        if (puzzle[i] >= 0) return;
        if (across.has(i)) el.append(clueAt(i, true));
        if (down.has(i)) el.append(clueAt(i, false));
      },
      onRender(sel, vals) {
        runs.forEach((run, k) => {
          const full = run.cells.every((c) => vals[c] > 0);
          const sum = run.cells.reduce((s, c) => s + Math.max(0, vals[c]), 0);
          const el = clueEls[k];
          el.classList.toggle('on', sel >= 0 && run.cells.includes(sel));
          el.classList.toggle('ok', full && sum === units[k].sum && new Set(run.cells.map((c) => vals[c])).size === run.cells.length);
        });
      },
    });
    const assist: HintOpts = {
      n: 9,
      givens: puzzle,
      sol,
      cells: cellEls,
      units: runs.map((run, k) => ({ kind: 'run', across: run.across, cells: run.cells, sum: units[k].sum, clue: [cellEls[run.clue]] })),
      vals: entryVals(inst),
      place: entryPlace(inst, cellEls),
      scope: ['its two runs', 'ses deux segments'],
    };
    inst.hint = makeHint(assist);
    inst.check = makeCheck(assist);
    return inst;
  },
};
