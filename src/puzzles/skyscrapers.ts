import './skyscrapers.css';
import { L } from '../core/i18n';
import { byLevel, type PuzzleDef } from '../core/types';
import { addTally, board, h, setTally } from '../core/ui';
import { latinEntry, latinEntrySteps } from './latinkit/entry';
import { entryPlace, entryVals, lineHUnits, makeCheck, makeHint, type Broken, type HintOpts } from './sudokukit/hint';
import { latinConflicts, latinUnique, randomLatin, revealLatin, type Table } from './latinkit/solver';

/** Buildings seen from the start of `line` (taller ones hide shorter ones behind them). */
const visible = (line: ArrayLike<number>) => {
  let max = 0,
    k = 0;
  for (let i = 0; i < line.length; i++)
    if (line[i] > max) {
      max = line[i];
      k++;
    }
  return k;
};

interface Perms {
  flat: Uint8Array;
  fwd: Uint8Array;
  back: Uint8Array;
}
const PERMS = new Map<number, Perms>();
/** Every permutation of 1..n with its visibility from both ends (cached per n). */
function perms(n: number): Perms {
  const hit = PERMS.get(n);
  if (hit) return hit;
  const out: number[][] = [];
  const cur: number[] = [];
  const used = new Array(n + 1).fill(false);
  const rec = () => {
    if (cur.length === n) return void out.push([...cur]);
    for (let v = 1; v <= n; v++) {
      if (used[v]) continue;
      used[v] = true;
      cur.push(v);
      rec();
      cur.pop();
      used[v] = false;
    }
  };
  rec();
  const p: Perms = {
    flat: Uint8Array.from(out.flat()),
    fwd: Uint8Array.from(out, (q) => visible(q)),
    back: Uint8Array.from(out, (q) => visible([...q].reverse())),
  };
  PERMS.set(n, p);
  return p;
}

export const skyscrapers: PuzzleDef = {
  id: 'skyscrapers',
  get name() {
    return L('Skyscrapers', 'Gratte-ciel');
  },
  category: 'logic',
  get rules() {
    return L('Heights once per line; edge clues count what you see.', 'Hauteurs uniques par ligne; les indices comptent les vues.');
  },
  help: () => ({
    goal: L(
      'Place a building in every cell so each row and column has every height once, and the clues around the edge are right.',
      'Placez un immeuble dans chaque case pour que chaque rangée et colonne ait chaque hauteur une fois, en respectant les indices du pourtour.',
    ),
    steps: [
      L(
        'Heights go from 1 to the grid size (1 to 4 on a 4×4 grid), once per row and once per column.',
        'Les hauteurs vont de 1 à la taille de la grille (1 à 4 en 4 × 4), une fois par rangée et par colonne.',
      ),
      L(
        'A clue tells how many buildings you see looking into its line from that side: taller buildings hide shorter ones behind them.',
        'Un indice donne combien d’immeubles on voit en regardant sa ligne de ce côté : les plus hauts cachent les plus bas derrière eux.',
      ),
      ...latinEntrySteps(),
      L(
        'Once a line is full, its clues turn pale when they’re right and red when they’re wrong.',
        'Quand une ligne est pleine, ses indices pâlissent s’ils sont respectés et passent au rouge sinon.',
      ),
    ],
    tips: [
      L(
        'A 1 means the tallest building stands right next to that clue.',
        'Un 1 veut dire que le plus haut immeuble est juste à côté de cet indice.',
      ),
      L(
        'A clue equal to the grid size means the heights climb 1, 2, 3… from that side.',
        'Un indice égal à la taille de la grille veut dire que les hauteurs montent 1, 2, 3… de ce côté.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [45, 90, 170, 260, 420]),
  create(ctx) {
    const { rng, difficulty: d } = ctx;
    const n = byLevel(d, [4, 5, 6, 6, 7]);
    const minClues = Math.round(4 * n * byLevel(d, [0.7, 0.55, 0.45, 0.3, 0]));
    const extraGivens = byLevel(d, [2, 1, 1, 0, 0]);
    const budget = byLevel(d, [3000, 3000, 3000, 4000, 6000]);
    const P = perms(n);
    const sol = randomLatin(n, rng);

    // clue k: side = k / n (0 top, 1 right, 2 bottom, 3 left), position = k % n
    const lineOf = (side: number, pos: number) =>
      Array.from({ length: n }, (_, t) =>
        side === 0 ? t * n + pos : side === 1 ? pos * n + (n - 1 - t) : side === 2 ? (n - 1 - t) * n + pos : pos * n + t,
      );
    const clueLines = Array.from({ length: 4 * n }, (_, k) => lineOf(Math.floor(k / n), k % n));
    const clue = clueLines.map((cells) => visible(cells.map((c) => sol[c])));
    const on = clue.map(() => true);

    const tables = (): Table[] => {
      const out: Table[] = [];
      for (let lane = 0; lane < 2 * n; lane++) {
        // lanes: rows (left → right) then columns (top → bottom)
        const row = lane < n,
          p = lane % n;
        const a = row ? 3 * n + p : p; // clue at the start (left / top)
        const b = row ? n + p : 2 * n + p; // clue at the end (right / bottom)
        if (!on[a] && !on[b]) continue;
        const cells = Array.from({ length: n }, (_, t) => (row ? p * n + t : t * n + p));
        const keep: number[] = [];
        for (let q = 0; q < P.fwd.length; q++) if ((!on[a] || P.fwd[q] === clue[a]) && (!on[b] || P.back[q] === clue[b])) keep.push(q);
        const tuples = new Uint8Array(keep.length * n);
        keep.forEach((q, j) => tuples.set(P.flat.subarray(q * n, q * n + n), j * n));
        out.push({ cells, tuples });
      }
      return out;
    };

    const givens = new Array(n * n).fill(0);
    revealLatin(n, givens, tables(), sol, budget, rng);
    let clues = 4 * n;
    type Item = { clue: number } | { cell: number };
    const items: Item[] = rng.shuffle([...clue.map((_, k) => ({ clue: k })), ...givens.flatMap((v, i) => (v ? [{ cell: i }] : []))]);
    for (const it of items) {
      if ('clue' in it) {
        if (clues <= minClues) continue;
        on[it.clue] = false;
        if (latinUnique(n, givens, tables(), budget)) clues--;
        else on[it.clue] = true;
      } else {
        givens[it.cell] = 0;
        if (!latinUnique(n, givens, tables(), budget)) givens[it.cell] = sol[it.cell];
      }
    }
    for (let k = 0; k < extraGivens; k++) {
      const open = [...givens.keys()].filter((i) => !givens[i]);
      if (open.length <= 2) break;
      const c = rng.pick(open);
      givens[c] = sol[c];
    }

    const clueEls = clue.map((v, k) =>
      on[k] ? addTally(h('div', { class: 'sky-clue', 'data-k': k }, v)) : h('div', { class: 'sky-clue', 'data-k': k }),
    );
    /** Buildings seen through the filled run starting at the clue: a lower bound that only climbs as the line fills. */
    const seenSoFar = (vals: number[], k: number) => {
      const run: number[] = [];
      for (const c of clueLines[k]) {
        if (!vals[c]) break;
        run.push(vals[c]);
      }
      return visible(run);
    };
    const lineState = (vals: number[], k: number) => {
      const vs = clueLines[k].map((c) => vals[c]);
      if (vs.some((v) => !v)) return 0;
      return visible(vs) === clue[k] ? 1 : -1;
    };
    let cellEls: Element[] = [];
    const inst = latinEntry({
      ctx,
      n,
      givens,
      boardClass: 'lk-num sky',
      layout(cells) {
        cellEls = cells;
        const grid = board(n + 2, n + 2, 'lk-num sky');
        const corner = () => h('div', { class: 'sky-corner' });
        grid.append(corner(), ...clueEls.slice(0, n), corner());
        for (let r = 0; r < n; r++) grid.append(clueEls[3 * n + r], ...cells.slice(r * n, r * n + n), clueEls[n + r]);
        grid.append(corner(), ...clueEls.slice(2 * n, 3 * n), corner());
        return grid;
      },
      check: (vals) => latinConflicts(n, vals),
      valid: (vals) => clue.every((_, k) => !on[k] || lineState(vals, k) === 1),
      after(vals) {
        clueEls.forEach((el, k) => {
          const st = on[k] ? lineState(vals, k) : 0;
          el.classList.toggle('ok', st === 1);
          el.classList.toggle('bad', st === -1);
          if (on[k]) {
            const have = seenSoFar(vals, k);
            setTally(el, have, clue[k], st === -1 || have > clue[k], st === -1 || (have > 0 && st !== 1));
          }
        });
      },
    });

    const shown = clue.flatMap((_, k) => (on[k] ? [k] : []));
    const cellsWord = (m: number) =>
      L(m === 1 ? 'first cell' : `first ${m} cells`, m === 1 ? 'la première case' : `les ${m} premières cases`);
    /** An edge clue a full line gets wrong, or a line whose heights can no longer fit its clues. */
    const broken = (vals: number[]): Broken | null => {
      for (const c of shown) {
        const line = clueLines[c];
        const vs = line.map((i) => vals[i]);
        if (vs.some((v) => !v)) continue;
        const seen = visible(vs);
        if (seen === clue[c]) continue;
        return {
          text: L(
            `From this clue you see ${seen} building${seen > 1 ? 's' : ''}, not ${clue[c]}: taller ones hide the shorter ones behind them.`,
            `De cet indice, on voit ${seen} immeuble${seen > 1 ? 's' : ''}, pas ${clue[c]} : les plus hauts cachent les plus bas derrière eux.`,
          ),
          why: [clueEls[c]],
          at: line,
        };
      }
      for (let lane = 0; lane < 2 * n; lane++) {
        const row = lane < n,
          p = lane % n;
        const ks = (row ? [3 * n + p, n + p] : [p, 2 * n + p]).filter((k) => on[k]);
        if (!ks.length) continue;
        const line = clueLines[ks[0]];
        const vs = line.map((i) => vals[i]);
        if (vs.every((v) => v > 0) || !vs.some((v) => v > 0) || new Set(vs.filter((v) => v > 0)).size < vs.filter((v) => v > 0).length)
          continue;
        let ok = false;
        for (let q = 0; q < P.fwd.length && !ok; q++) {
          const perm = P.flat.subarray(q * n, q * n + n);
          if (!vs.every((v, t) => !v || v === perm[t])) continue;
          ok = ks.every((k) => visible(clueLines[k].map((i) => perm[line.indexOf(i)])) === clue[k]);
        }
        if (ok) continue;
        const name = row ? L(`row ${p + 1}`, `la rangée ${p + 1}`) : L(`column ${p + 1}`, `la colonne ${p + 1}`);
        return {
          text:
            ks.length > 1
              ? L(
                  `With the heights already in ${name}, no way of filling the rest matches both its clues.`,
                  `Avec les hauteurs déjà dans ${name}, aucune façon de compléter ne respecte ses deux indices.`,
                )
              : L(
                  `With the heights already in ${name}, no way of filling the rest lets you see ${clue[ks[0]]} from its clue.`,
                  `Avec les hauteurs déjà dans ${name}, aucune façon de compléter ne permet de voir ${clue[ks[0]]} depuis son indice.`,
                ),
          why: ks.map((k) => clueEls[k]),
          at: line.filter((i) => vals[i] > 0),
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
      scope: ['its row, column and edge clues', 'sa rangée, sa colonne et les indices du bord'],
      pre: {
        // A 1: the tallest building is right against the clue.
        one(k) {
          for (const c of shown) {
            const i = clueLines[c][0];
            if (clue[c] !== 1 || k.vals[i] !== 0) continue;
            return {
              text: L(
                `A 1 means you see only one building from here: the tallest, ${n}, stands right next to the clue.`,
                `Un 1 veut dire qu’on ne voit qu’un immeuble de ce côté : le plus haut, ${n}, est juste à côté de l’indice.`,
              ),
              why: [clueEls[c]],
              at: [i],
              moves: [[i, n]],
            };
          }
          return null;
        },
        // An n: the heights climb one by one from the clue.
        all(k) {
          for (const c of shown) {
            const line = clueLines[c];
            const emp = line.filter((i) => k.vals[i] === 0);
            if (clue[c] !== n || !emp.length) continue;
            const steps = Array.from({ length: n }, (_, t) => t + 1).join(', ');
            return {
              text: L(
                `A ${n} means you see all ${n} buildings, so none can hide another: the heights climb ${steps} from this side.`,
                `Un ${n} veut dire qu’on voit les ${n} immeubles, donc aucun n’en cache un autre : les hauteurs montent ${steps} de ce côté.`,
              ),
              why: [clueEls[c]],
              at: emp,
              moves: emp.map((i) => [i, line.indexOf(i) + 1]),
            };
          }
          return null;
        },
      },
      post: {
        // To see c buildings, the tallest can't stand in the first c − 1 cells.
        tallest(k) {
          for (const c of shown) {
            const v = clue[c];
            if (v < 2 || v >= n) continue;
            const line = clueLines[c];
            if (line.some((i) => k.vals[i] === n)) continue;
            const spots = line.filter((i) => k.vals[i] === 0 && k.free(i).includes(n));
            const far = spots.filter((i) => line.indexOf(i) >= v - 1);
            const near = spots.filter((i) => line.indexOf(i) < v - 1);
            if (far.length !== 1 || !near.length) continue;
            const i = far[0];
            const blocked = line.filter((j) => k.vals[j] === 0 && j !== i && !near.includes(j));
            const w = blocked.flatMap((j) => k.witness(j, [n]).els);
            return {
              text: blocked.length
                ? L(
                    `To see ${v} buildings, the ${n} can’t be in the ${cellsWord(v - 1)} from this clue, and the other cells already see a ${n}. It goes here.`,
                    `Pour voir ${v} immeubles, le ${n} ne peut pas être dans ${cellsWord(v - 1)} depuis cet indice, et les autres cases voient déjà un ${n}. Il va ici.`,
                  )
                : L(
                    `To see ${v} buildings, the ${n} can’t be in the ${cellsWord(v - 1)} from this clue: it would hide the rest. It goes here.`,
                    `Pour voir ${v} immeubles, le ${n} ne peut pas être dans ${cellsWord(v - 1)} depuis cet indice : il cacherait le reste. Il va ici.`,
                  ),
              why: [clueEls[c], ...new Set(w)],
              at: [i],
              moves: [[i, n]],
            };
          }
          return null;
        },
        // Try every order of the line: only one height works in this cell.
        line(k) {
          for (const c of shown) {
            const line = clueLines[c];
            const emp = line.filter((i) => k.vals[i] === 0);
            if (emp.length < 2) continue;
            const ks = shown.filter((o) => clueLines[o].every((i) => line.includes(i)));
            const fits: number[][] = [];
            const P0 = perms(n);
            // Heights each cell of the line may hold, as bitmasks (computed once, not per order).
            const allow = line.map((i) => (k.vals[i] ? 1 << k.vals[i] : k.free(i).reduce((m, v) => m | (1 << v), 0)));
            for (let q = 0; q < P0.fwd.length; q++) {
              const base = q * n;
              let fitsLine = true;
              for (let t = 0; t < n && fitsLine; t++) fitsLine = ((allow[t] >> P0.flat[base + t]) & 1) === 1;
              if (!fitsLine) continue;
              const p = Array.from(P0.flat.subarray(base, base + n));
              if (!ks.every((o) => visible(clueLines[o].map((i) => p[line.indexOf(i)])) === clue[o])) continue;
              fits.push(p);
            }
            for (const i of emp) {
              const t = line.indexOf(i);
              const can = [...new Set(fits.map((p) => p[t]))];
              if (can.length !== 1 || k.free(i).length === 1) continue;
              return {
                text: L(
                  `Try each height here: only ${can[0]} lets this line match ${ks.length > 1 ? 'both its clues' : `its ${clue[ks[0]]}`} without repeating a number.`,
                  `Essayez chaque hauteur : seul le ${can[0]} respecte ${ks.length > 1 ? 'les deux indices' : `le ${clue[ks[0]]}`} de cette ligne sans répéter de chiffre.`,
                ),
                why: ks.map((o) => clueEls[o]),
                at: [i],
                moves: [[i, can[0]]],
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
