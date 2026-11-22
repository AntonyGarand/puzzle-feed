import './style.css';
import { L } from '../../core/i18n';
import type { Rng } from '../../core/rng';
import { byLevel, type PuzzleDef } from '../../core/types';
import { h } from '../../ui/dom';
import { latinEntry, latinEntrySteps } from '../../kits/latin/entry';
import { and, cap, entryPlace, entryVals, isAre, lineHUnits, makeCheck, makeHint, or, type Broken, type HintOpts } from '../../kits/sudoku/hint';
import { latinConflicts, latinUnique, randomLatin, revealLatin, type Table } from '../../kits/latin/solver';

type Op = '+' | '−' | '×' | '÷' | '';

interface Cage {
  cells: number[];
  op: Op;
  target: number;
}

/** Does a full set of cage values hit the target? (− and ÷ are two-cell cages, either order.) */
function hits(op: Op, target: number, vs: number[]): boolean {
  switch (op) {
    case '':
      return vs[0] === target;
    case '+':
      return vs.reduce((a, b) => a + b, 0) === target;
    case '×':
      return vs.reduce((a, b) => a * b, 1) === target;
    case '−':
      return Math.abs(vs[0] - vs[1]) === target;
    case '÷':
      return Math.max(vs[0], vs[1]) === target * Math.min(vs[0], vs[1]);
  }
}

/** Every value tuple a cage allows (cells sharing a row or column must differ). */
function cageTable(n: number, cage: Cage): Table {
  const { cells } = cage;
  const k = cells.length;
  const out: number[] = [];
  const cur = new Array<number>(k).fill(0);
  const rec = (j: number) => {
    if (j === k) {
      if (hits(cage.op, cage.target, cur)) out.push(...cur);
      return;
    }
    for (let v = 1; v <= n; v++) {
      let ok = true;
      for (let t = 0; t < j && ok; t++) {
        const a = cells[t],
          b = cells[j];
        if (cur[t] === v && (Math.floor(a / n) === Math.floor(b / n) || a % n === b % n)) ok = false;
      }
      if (!ok) continue;
      cur[j] = v;
      rec(j + 1);
    }
  };
  rec(0);
  return { cells, tuples: Uint8Array.from(out) };
}

const nb = (n: number, i: number) => {
  const r = Math.floor(i / n),
    c = i % n;
  const out: number[] = [];
  if (r > 0) out.push(i - n);
  if (r < n - 1) out.push(i + n);
  if (c > 0) out.push(i - 1);
  if (c < n - 1) out.push(i + 1);
  return out;
};

/** Random connected cages of 1..maxSize cells; only a few single cells survive. */
function makeCages(n: number, sol: number[], maxSize: number, singles: number, ops: Op[], rng: Rng): Cage[] {
  const owner = new Array<number>(n * n).fill(-1);
  const groups: number[][] = [];
  for (const start of rng.shuffle([...owner.keys()])) {
    if (owner[start] >= 0) continue;
    const want = rng.chance(0.35) ? 2 : rng.int(2, maxSize);
    const cells = [start];
    owner[start] = groups.length;
    while (cells.length < want) {
      const front = [...new Set(cells.flatMap((c) => nb(n, c)))].filter((j) => owner[j] < 0);
      if (!front.length) break;
      const j = rng.pick(front);
      cells.push(j);
      owner[j] = groups.length;
    }
    groups.push(cells);
  }
  // fold extra single cells into a neighbouring cage
  let kept = 0;
  for (let k = 0; k < groups.length; k++) {
    if (groups[k].length !== 1) continue;
    if (kept < singles) {
      kept++;
      continue;
    }
    const c = groups[k][0];
    const opts = [...new Set(nb(n, c).map((j) => owner[j]))].filter((o) => o !== k && groups[o].length < maxSize);
    if (!opts.length) continue;
    const o = rng.pick(opts);
    groups[o].push(c);
    owner[c] = o;
    groups[k] = [];
  }
  return groups
    .filter((g) => g.length)
    .map((cells) => {
      const vs = cells.map((c) => sol[c]);
      if (cells.length === 1) return { cells, op: '', target: vs[0] };
      const sum = vs.reduce((a, b) => a + b, 0);
      const prod = vs.reduce((a, b) => a * b, 1);
      const choices: [Op, number, number][] = []; // op, target, weight
      if (ops.includes('+')) choices.push(['+', sum, 2]);
      if (ops.includes('×') && prod <= 999) choices.push(['×', prod, cells.length > 2 ? 1 : 1.5]);
      if (cells.length === 2) {
        const [a, b] = [Math.max(...vs), Math.min(...vs)];
        if (ops.includes('−')) choices.push(['−', a - b, 2]);
        if (ops.includes('÷') && a % b === 0) choices.push(['÷', a / b, 4]);
      }
      let w = rng.next() * choices.reduce((s, c) => s + c[2], 0);
      const [op, target] = choices.find((c) => (w -= c[2]) < 0) ?? choices[0];
      return { cells: [...cells].sort((a, b) => a - b), op, target };
    });
}

export const mathCages: PuzzleDef = {
  id: 'math-cages',
  get name() {
    return L('Math Cages', 'Cages de calcul');
  },
  category: 'logic',
  undo: true,
  get rules() {
    return L('Numbers once per line; each cage hits its target.', 'Chiffres uniques par ligne; chaque cage atteint sa cible.');
  },
  help: () => ({
    goal: L(
      'Fill the grid so each number appears once in every row and column, and every dashed cage reaches its target.',
      'Remplissez la grille pour que chaque chiffre apparaisse une fois par rangée et par colonne, et que chaque cage pointillée atteigne sa cible.',
    ),
    steps: [
      L(
        'Use the numbers 1 up to the grid size (1 to 4 on a 4×4 grid), once per row and once per column.',
        'Utilisez les chiffres de 1 à la taille de la grille (1 à 4 en 4 × 4), une fois par rangée et par colonne.',
      ),
      L(
        'A cage’s label is a target and an operation: “7+” adds up to 7, “12×” multiplies to 12. A cage with a lone number is that number.',
        'L’étiquette d’une cage donne une cible et une opération : « 7+ » fait 7 en additionnant, « 12× » fait 12 en multipliant. Une cage avec un nombre seul vaut ce nombre.',
      ),
      L(
        '“2−” and “3÷” cages have two cells: the bigger number minus, or divided by, the smaller one. Digits may repeat in a cage if they’re not in the same line.',
        'Les cages « 2− » et « 3÷ » ont deux cases : le plus grand chiffre moins, ou divisé par, le plus petit. Un chiffre peut se répéter dans une cage s’il n’est pas sur la même ligne.',
      ),
      ...latinEntrySteps(),
    ],
    tips: [
      L('Fill single-cell cages first: they’re free.', 'Remplissez d’abord les cages d’une seule case : elles sont données.'),
      L(
        'Few pairs fit some targets: on 4×4, “3÷” must be 1 and 3, and “7+” on two cells must be 3 and 4.',
        'Certaines cibles ont peu de paires : en 4 × 4, « 3÷ » donne 1 et 3, et « 7+ » sur deux cases donne 3 et 4.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [30, 80, 150, 260, 420]),
  create(ctx) {
    const { rng, difficulty: d } = ctx;
    const n = byLevel(d, [3, 4, 5, 6, 7]);
    const maxSize = byLevel(d, [2, 3, 3, 4, 4]);
    const singles = byLevel(d, [1, 1, 1, 0, 0]);
    const ops = byLevel<Op[]>(d, [['+'], ['+', '−'], ['+', '−', '×', '÷'], ['+', '−', '×', '÷'], ['+', '−', '×', '÷']]);
    const budget = byLevel(d, [2000, 2000, 3000, 3000, 3000]);
    const sol = randomLatin(n, rng);

    // A few cage layouts; keep the first that is unique on its own, else the last with revealed givens.
    let cages: Cage[] = [];
    let tables: Table[] = [];
    const givens = new Array<number>(n * n).fill(0);
    for (let attempt = 0; attempt < 12; attempt++) {
      cages = makeCages(n, sol, maxSize, singles, ops, rng);
      tables = cages.map((c) => cageTable(n, c));
      if (latinUnique(n, givens, tables, budget)) break;
    }
    revealLatin(n, givens, tables, sol, budget, rng);

    const cageOf = new Array<number>(n * n).fill(0);
    cages.forEach((c, k) => c.cells.forEach((i) => (cageOf[i] = k)));
    const check = (vals: number[]) => {
      const bad = latinConflicts(n, vals);
      for (const c of cages) {
        const vs = c.cells.map((i) => vals[i]);
        if (vs.every((v) => v > 0) && !hits(c.op, c.target, vs)) for (const i of c.cells) bad.add(i);
      }
      return bad;
    };
    const cellEls: Element[] = [];
    const inst = latinEntry({
      ctx,
      n,
      givens,
      boardClass: 'lk-num lk-slab mc',
      check,
      decorate(el, i) {
        const r = Math.floor(i / n),
          c = i % n,
          k = cageOf[i];
        const side = (cond: boolean, cls: string) => (cond ? cls : '');
        const cls = [
          side(r === 0 || cageOf[i - n] !== k, 'ct'),
          side(r === n - 1 || cageOf[i + n] !== k, 'cb'),
          side(c === 0 || cageOf[i - 1] !== k, 'cl'),
          side(c === n - 1 || cageOf[i + 1] !== k, 'cr'),
        ].join(' ');
        el.append(h('span', { class: `cage ${cls}` }));
        if (cages[k].cells[0] === i) el.append(h('span', { class: 'lbl' }, `${cages[k].target}${cages[k].op}`));
        cellEls[i] = el;
      },
    });
    const label = (c: Cage) => L(`The “${c.target}${c.op}” cage`, `La cage « ${c.target}${c.op} »`);
    /** "1 + 3", "3 − 1", "2 × 2 × 3"… */
    const show = (c: Cage, vs: number[]) => {
      const sorted = [...vs].sort((a, b) => (c.op === '−' || c.op === '÷' ? b - a : a - b));
      return sorted.join(` ${c.op} `);
    };
    /** A cage that misses its target, or can no longer reach it with the numbers already in it. */
    const broken = (vals: number[]): Broken | null => {
      for (let ci = 0; ci < cages.length; ci++) {
        const c = cages[ci];
        const vs = c.cells.map((i) => vals[i]);
        const filled = c.cells.filter((i) => vals[i] > 0);
        if (!filled.length) continue;
        const why = [cellEls[c.cells[0]]];
        if (c.op === '') {
          if (vs[0] === c.target) continue;
          return {
            text: L(
              `This cage is just “${c.target}”: its cell is ${c.target}.`,
              `Cette cage affiche seulement « ${c.target} » : sa case vaut ${c.target}.`,
            ),
            why,
            at: c.cells,
          };
        }
        if (filled.length === c.cells.length) {
          if (hits(c.op, c.target, vs)) continue;
          const [a, b] = [Math.max(...vs), Math.min(...vs)];
          const res =
            c.op === '+' ? vs.reduce((x, y) => x + y, 0) : c.op === '×' ? vs.reduce((x, y) => x * y, 1) : c.op === '−' ? a - b : a / b;
          const whole = Number.isInteger(res);
          return {
            text: L(
              `${label(c)} needs ${c.target}, but ${show(c, vs)}${whole ? ` = ${res}` : ' isn’t a whole number'}.`,
              `${label(c)} doit donner ${c.target}, mais ${show(c, vs)}${whole ? ` = ${res}` : ' ne tombe pas juste'}.`,
            ),
            why,
            at: c.cells,
          };
        }
        const m = c.cells.length;
        const { tuples } = tables[ci];
        let ok = false;
        for (let t = 0; t < tuples.length && !ok; t += m) ok = c.cells.every((i, p) => !vals[i] || vals[i] === tuples[t + p]);
        if (ok) continue;
        const have = filled.map((i) => vals[i]);
        const left = m - filled.length;
        return {
          text: L(
            `${label(c)} needs ${c.target}: with ${and(have)} in it, no number${left > 1 ? 's' : ''} in the other cell${left > 1 ? 's' : ''} can get there.`,
            `${label(c)} doit donner ${c.target} : avec ${and(have)}, aucun chiffre dans ${left > 1 ? 'les autres cases' : 'l’autre case'} ne peut y arriver.`,
          ),
          why,
          at: filled,
        };
      }
      return null;
    };
    const assist: HintOpts = {
      n,
      givens,
      sol,
      cells: cellEls,
      units: lineHUnits(n),
      vals: entryVals(inst),
      place: entryPlace(inst, cellEls),
      scope: ['its row, column and cage', 'sa rangée, sa colonne et sa cage'],
      pre: {
        // A lone number is given away.
        single(k) {
          for (const c of cages) {
            const i = c.cells[0];
            if (c.op !== '' || k.vals[i] !== 0) continue;
            return {
              text: L(
                `A cage with just “${c.target}” is one cell holding that number: free points.`,
                `Une cage qui affiche seulement « ${c.target} » est une case qui vaut ce nombre : c’est donné.`,
              ),
              why: [],
              at: [i],
              moves: [[i, c.target]],
            };
          }
          return null;
        },
      },
      post: {
        // Few ways to hit the target; the row and column pick one.
        cage(k) {
          for (let ci = 0; ci < cages.length; ci++) {
            const c = cages[ci];
            if (c.op === '') continue;
            const m = c.cells.length;
            const emp = c.cells.filter((i) => k.vals[i] === 0);
            if (!emp.length) continue;
            const { tuples } = tables[ci];
            const fits: number[][] = [];
            for (let t = 0; t < tuples.length; t += m) {
              const tu = Array.from(tuples.subarray(t, t + m));
              if (c.cells.every((i, p) => !k.vals[i] || k.vals[i] === tu[p])) fits.push(tu);
            }
            const opts = [...new Set(fits.map((tu) => show(c, tu)))];
            if (!opts.length || opts.length > 3) continue;
            for (const i of emp) {
              const p = c.cells.indexOf(i);
              const can = [...new Set(fits.map((tu) => tu[p]))].sort((a, b) => a - b);
              const f = k.free(i);
              const fit = can.filter((v) => f.includes(v));
              if (fit.length !== 1) continue;
              const v = fit[0];
              const excl = can.filter((x) => x !== v);
              const w = k.witness(i, excl);
              const head = cellEls[c.cells[0]];
              const known = c.cells.filter((j) => k.vals[j] > 0).map((j) => cellEls[j]);
              return {
                text: excl.length
                  ? L(
                      `${label(c)} can only be ${or(opts)}. ${cap(and(excl))} ${isAre(excl)} already in ${w.where}, so this cell is ${v}.`,
                      `${label(c)} ne peut être que ${or(opts)}. ${cap(and(excl))} ${isAre(excl)} déjà dans ${w.where} : cette case vaut donc ${v}.`,
                    )
                  : L(
                      `${label(c)} can only be ${or(opts)}, so this cell is ${v}.`,
                      `${label(c)} ne peut être que ${or(opts)} : cette case vaut donc ${v}.`,
                    ),
                why: [...new Set([head, ...known, ...w.els])],
                at: [i],
                moves: [[i, v]],
              };
            }
          }
          return null;
        },
      },
    };
    inst.hint = makeHint(assist);
    inst.check = makeCheck({ ...assist, rules: [broken] });
    return inst;
  },
};
