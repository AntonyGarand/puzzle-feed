import { L } from '../../core/i18n';
import type { Hint, PuzzleInstance } from '../../core/types';
import { directPlace } from './notes';

/**
 * Step-by-step guide for the number-entry grids (sudoku family, cross sums, latin squares).
 * Core rules work on "distinct" units (no repeated digit; `full` = holds every digit once; `sum` = adds up).
 * Games add their own rules (signs, cages, edge clues) through `pre` / `post`.
 */

type Kind = 'row' | 'col' | 'box' | 'shape' | 'cage' | 'run';

export interface HUnit {
  kind: Kind;
  cells: number[];
  /** Row / column number (0-based). */
  idx?: number;
  sum?: number;
  /** Holds every digit 1..n exactly once. */
  full?: boolean;
  /** For runs. */
  across?: boolean;
  /** Clue elements to outline (sum label…). */
  clue?: Element[];
}

interface Found {
  text: string;
  why: Element[];
  at: number[];
  /** [cell, digit] entries to make. */
  moves: [number, number][];
}

interface Kit {
  n: number;
  vals: number[];
  cells: Element[];
  units: HUnit[];
  empties: number[];
  /** Digits not already in one of the cell's units. */
  free(i: number): number[];
  /** Outline elements + "its row and column" for the digits a cell already sees. */
  witness(i: number, ds: number[]): { els: Element[]; where: string };
  /** Digit sets that can fill a sum unit's empty cells. */
  combos(u: HUnit): number[][];
}

type Rule = (k: Kit) => Found | null;

export interface HintOpts {
  n: number;
  givens: number[];
  sol: number[];
  cells: Element[];
  units: HUnit[];
  vals: () => number[];
  place: (i: number, v: number) => void;
  /** Fallback wording: [en "its row, column and box", fr "sa rangée, sa colonne et son bloc"]. */
  scope: [string, string];
  pre?: Record<string, Rule>;
  post?: Record<string, Rule>;
}

const join = (xs: (string | number)[], w: string) =>
  xs.length <= 1 ? String(xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} ${w} ${xs[xs.length - 1]}`;
/** "1, 2 and 3" / "1, 2 et 3". */
export const and = (xs: (string | number)[]) => join(xs, L('and', 'et'));
/** "1 + 4 or 2 + 3" / "… ou …". */
export const or = (xs: (string | number)[]) => join(xs, L('or', 'ou'));
export const isAre = (xs: unknown[]) => (xs.length === 1 ? L('is', 'est') : L('are', 'sont'));
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "row 3" / "la rangée 3", "this box" / "ce bloc"… */
const unitName = (u: HUnit) => {
  const k = (u.idx ?? 0) + 1;
  switch (u.kind) {
    case 'row':
      return L(`row ${k}`, `la rangée ${k}`);
    case 'col':
      return L(`column ${k}`, `la colonne ${k}`);
    case 'box':
      return L('this box', 'ce bloc');
    case 'shape':
      return L('this shape', 'cette forme');
    case 'cage':
      return L('this cage', 'cette cage');
    case 'run':
      return L('this run', 'ce segment');
  }
};

const ORDER: Kind[] = ['row', 'col', 'box', 'shape', 'cage', 'run'];
const own = (u: HUnit): [string, string] => {
  switch (u.kind) {
    case 'row':
      return ['row', 'sa rangée'];
    case 'col':
      return ['column', 'sa colonne'];
    case 'box':
      return ['box', 'son bloc'];
    case 'shape':
      return ['shape', 'sa forme'];
    case 'cage':
      return ['cage', 'sa cage'];
    case 'run':
      return u.across ? ['across run', 'son segment horizontal'] : ['down run', 'son segment vertical'];
  }
};
/** "its row and column" / "sa rangée et sa colonne". */
const where = (us: HUnit[]) => {
  const sorted = [...new Set(us)].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  const names = [...new Set(sorted.map((u) => own(u).join('|')))].map((s) => s.split('|'));
  return L(
    `its ${join(
      names.map((x) => x[0]),
      'and',
    )}`,
    join(
      names.map((x) => x[1]),
      'et',
    ),
  );
};

function subsets(avail: number[], k: number, s: number): number[][] {
  const out: number[][] = [];
  const cur: number[] = [];
  const rec = (from: number, left: number, sum: number) => {
    if (!left) {
      if (sum === s) out.push([...cur]);
      return;
    }
    for (let t = from; t < avail.length; t++) {
      if (sum + avail[t] > s) break;
      cur.push(avail[t]);
      rec(t + 1, left - 1, sum + avail[t]);
      cur.pop();
    }
  };
  rec(0, k, 0);
  return out;
}

const plus = (xs: number[]) => xs.join(' + ');

const CORE: Record<string, Rule> = {
  // A row/column/box missing a single number.
  house(k) {
    for (const u of k.units) {
      if (!u.full) continue;
      const emp = u.cells.filter((i) => k.vals[i] === 0);
      if (emp.length !== 1) continue;
      const have = new Set(u.cells.map((i) => k.vals[i]));
      const v = Array.from({ length: k.n }, (_, t) => t + 1).find((d) => !have.has(d))!;
      const name = cap(unitName(u));
      return {
        text: L(
          `${name} has every number but ${v}, so its last cell is ${v}.`,
          `${name} a tous les chiffres sauf le ${v} : sa dernière case est donc ${v}.`,
        ),
        why: u.cells.filter((i) => i !== emp[0]).map((i) => k.cells[i]),
        at: emp,
        moves: [[emp[0], v]],
      };
    }
    return null;
  },
  // A cage or run with one empty cell: subtract.
  sumLast(k) {
    for (const u of k.units) {
      if (u.sum == null) continue;
      const emp = u.cells.filter((i) => k.vals[i] === 0);
      if (emp.length !== 1) continue;
      const f = u.cells.filter((i) => k.vals[i] > 0).map((i) => k.vals[i]);
      const got = f.reduce((a, b) => a + b, 0);
      const v = u.sum - got;
      if (v < 1 || v > k.n || f.includes(v)) continue;
      const name = cap(unitName(u));
      const parts = f.length > 1 ? `${plus(f)} = ${got}` : `${got}`;
      return {
        text: L(
          `${name} adds up to ${u.sum} and already has ${parts}, so the last cell is ${u.sum} − ${got} = ${v}.`,
          `${name} fait ${u.sum} et contient déjà ${parts} : la dernière case vaut ${u.sum} − ${got} = ${v}.`,
        ),
        why: [...(u.clue ?? []), ...u.cells.filter((i) => i !== emp[0]).map((i) => k.cells[i])],
        at: emp,
        moves: [[emp[0], v]],
      };
    }
    return null;
  },
  // Every other number is already in the cell's row, column…
  naked(k) {
    for (const i of k.empties) {
      const f = k.free(i);
      if (f.length !== 1) continue;
      const seen = Array.from({ length: k.n }, (_, t) => t + 1).filter((d) => d !== f[0]);
      const w = k.witness(i, seen);
      return {
        text: L(
          `This cell already sees ${and(seen)} in ${w.where}, so only ${f[0]} fits.`,
          `Cette case voit déjà ${and(seen)} dans ${w.where} : seul le ${f[0]} peut y aller.`,
        ),
        why: w.els,
        at: [i],
        moves: [[i, f[0]]],
      };
    }
    return null;
  },
  // A number with a single possible spot in a row, column or box.
  hidden(k) {
    for (const u of k.units) {
      if (!u.full) continue;
      const emp = u.cells.filter((i) => k.vals[i] === 0);
      if (emp.length < 2) continue;
      const have = new Set(u.cells.map((i) => k.vals[i]));
      for (let d = 1; d <= k.n; d++) {
        if (have.has(d)) continue;
        const spots = emp.filter((i) => k.free(i).includes(d));
        if (spots.length !== 1) continue;
        const i = spots[0];
        const els = [...new Set(emp.filter((c) => c !== i).flatMap((c) => k.witness(c, [d]).els))];
        const name = unitName(u);
        return {
          text: L(
            `Where does the ${d} go in ${name}? Every other empty cell there already sees a ${d}, so it goes here.`,
            `Où va le ${d} dans ${name}? Les autres cases vides voient déjà un ${d} : il va donc ici.`,
          ),
          why: els,
          at: [i],
          moves: [[i, d]],
        };
      }
    }
    return null;
  },
  // Few combinations add up to a cage/run's sum; the cell's lines rule out the rest.
  sumCombo(k) {
    for (const u of k.units) {
      if (u.sum == null) continue;
      const emp = u.cells.filter((i) => k.vals[i] === 0);
      if (emp.length < 2) continue;
      const cs = k.combos(u);
      if (!cs.length || cs.length > 3) continue;
      const all = [...new Set(cs.flat())].sort((a, b) => a - b);
      for (const i of emp) {
        const f = k.free(i);
        const s = all.filter((d) => f.includes(d));
        if (s.length !== 1) continue;
        const v = s[0];
        const excl = all.filter((d) => d !== v);
        const w = k.witness(i, excl);
        const got = u.cells.reduce((a, c) => a + Math.max(0, k.vals[c]), 0);
        const name = cap(unitName(u));
        const need =
          got > 0
            ? L(`still needs ${u.sum - got} from its ${emp.length} empty cells`, `doit encore faire ${u.sum - got} en ${emp.length} cases`)
            : L(`needs ${u.sum} from ${emp.length} cells`, `doit faire ${u.sum} en ${emp.length} cases`);
        return {
          text: L(
            `${name} ${need}: only ${or(cs.map(plus))}. ${cap(and(excl))} ${isAre(excl)} already in ${w.where}, so this cell is ${v}.`,
            `${name} ${need} : seulement ${or(cs.map(plus))}. ${cap(and(excl))} ${isAre(excl)} déjà dans ${w.where} : cette case vaut donc ${v}.`,
          ),
          why: [...(u.clue ?? []), ...w.els],
          at: [i],
          moves: [[i, v]],
        };
      }
    }
    return null;
  },
  // A cell where two sums cross: only one digit fits both.
  cross(k) {
    for (const i of k.empties) {
      const us = k.units.filter((u) => u.sum != null && u.cells.includes(i));
      if (us.length !== 2) continue;
      const [a, b] = us[0].across === false ? [us[1], us[0]] : us;
      const ca = k.combos(a),
        cb = k.combos(b);
      if (!ca.length || !cb.length || ca.length > 3 || cb.length > 3) continue;
      const da = [...new Set(ca.flat())].sort((x, y) => x - y),
        db = [...new Set(cb.flat())].sort((x, y) => x - y);
      const both = da.filter((d) => db.includes(d));
      if (both.length !== 1 || da.length < 2 || db.length < 2) continue;
      const v = both[0];
      const ra = a.sum! - a.cells.reduce((s, c) => s + Math.max(0, k.vals[c]), 0);
      const rb = b.sum! - b.cells.reduce((s, c) => s + Math.max(0, k.vals[c]), 0);
      const ea = a.cells.filter((c) => k.vals[c] === 0).length,
        eb = b.cells.filter((c) => k.vals[c] === 0).length;
      return {
        text: L(
          `Across, ${ra} in ${ea} cells can only use ${or(da)}; down, ${rb} in ${eb} cells can only use ${or(db)}. Only ${v} is in both.`,
          `À l’horizontale, ${ra} en ${ea} cases n’utilise que ${and(da)}; à la verticale, ${rb} en ${eb} cases n’utilise que ${and(db)}. Seul le ${v} est dans les deux.`,
        ),
        why: [...(a.clue ?? []), ...(b.clue ?? [])],
        at: [i],
        moves: [[i, v]],
      };
    }
    return null;
  },
};

/** Build the `hint()` function for a number-entry grid. */
export function makeHint(o: HintOpts): () => Hint | null {
  const unitsOf: HUnit[][] = o.givens.map(() => []);
  for (const u of o.units) for (const c of u.cells) unitsOf[c].push(u);
  const rules: Record<string, Rule> = { ...o.pre, ...CORE, ...o.post };
  const used = new Map<string, number>();
  let step = 0;

  return () => {
    const vals = o.vals();
    const empties = [...vals.keys()].filter((i) => vals[i] === 0);
    if (!empties.length) return null;
    const free = (i: number) => {
      const out: number[] = [];
      for (let d = 1; d <= o.n; d++) if (!unitsOf[i].some((u) => u.cells.some((c) => c !== i && vals[c] === d))) out.push(d);
      return out;
    };
    const kit: Kit = {
      n: o.n,
      vals,
      cells: o.cells,
      units: o.units,
      empties,
      free,
      witness(i, ds) {
        const els: Element[] = [];
        const us: HUnit[] = [];
        for (const d of ds) {
          for (const u of unitsOf[i]) {
            const j = u.cells.find((c) => c !== i && vals[c] === d);
            if (j == null) continue;
            els.push(o.cells[j]);
            us.push(u);
            break;
          }
        }
        return { els, where: where(us) };
      },
      combos(u) {
        const taken = new Set(u.cells.map((c) => vals[c]).filter((v) => v > 0));
        const got = u.cells.reduce((s, c) => s + Math.max(0, vals[c]), 0);
        const avail = Array.from({ length: o.n }, (_, t) => t + 1).filter((d) => !taken.has(d));
        return subsets(avail, u.cells.filter((c) => vals[c] === 0).length, (u.sum ?? 0) - got);
      },
    };
    // Least recently used rule first (simplest first among ties), so the guide shows several kinds of reasoning.
    const names = Object.keys(rules).sort((a, b) => (used.get(a) ?? -1) - (used.get(b) ?? -1));
    let found: Found | null = null;
    for (const name of names) {
      const r = rules[name](kit);
      if (r && r.moves.length && r.moves.every(([i, v]) => vals[i] === 0 && o.sol[i] === v)) {
        found = r;
        used.set(name, step++);
        break;
      }
    }
    if (!found) {
      // Honest fallback: the most constrained cell, from the solution.
      const i = empties.reduce((b, c) => (free(c).length < free(b).length ? c : b));
      const v = o.sol[i];
      found = {
        text: L(`Only ${v} fits here (check ${o.scope[0]}).`, `Seul le ${v} va ici (vérifiez ${o.scope[1]}).`),
        why: [],
        at: [i],
        moves: [[i, v]],
      };
    }
    const f = found;
    let text = f.text;
    const fresh = vals.every((v, i) => v <= 0 || o.givens[i] > 0);
    if (fresh && f.moves.length === 1) text += L(` Tap the cell, then ${f.moves[0][1]}.`, ` Touchez la case, puis ${f.moves[0][1]}.`);
    return {
      text,
      why: f.why,
      at: f.at.map((i) => o.cells[i]),
      play: () => {
        for (const [i, v] of f.moves) if (o.vals()[i] === 0) o.place(i, v);
      },
    };
  };
}

/** Fill a cell through an entry-grid instance: tap the cell, then type the digit. */
export const entryPlace = (inst: PuzzleInstance, cells: Element[]) => (i: number, v: number) => {
  const direct = directPlace.get(inst);
  if (direct) return direct(i, v);
  (cells[i] as HTMLElement).click();
  inst.onKey?.(new KeyboardEvent('keydown', { key: String(v) }));
};

/** Live values of an entry-grid instance (its snapshot shares the array). */
export const entryVals = (inst: PuzzleInstance) => () => (inst.snapshot!() as { vals: number[] }).vals;

/** Row and column units for an n×n grid. */
export const lineHUnits = (n: number): HUnit[] => [
  ...Array.from({ length: n }, (_, r): HUnit => ({
    kind: 'row',
    idx: r,
    full: true,
    cells: Array.from({ length: n }, (_x, c) => r * n + c),
  })),
  ...Array.from({ length: n }, (_, c): HUnit => ({
    kind: 'col',
    idx: c,
    full: true,
    cells: Array.from({ length: n }, (_x, r) => r * n + c),
  })),
];

/** A rule the board breaks, for `makeCheck`: which cells, and why (via L()). */
export interface Broken {
  text: string;
  /** Clue elements to outline (a sign, a sum label…). */
  why?: Element[];
  /** Cells at fault: the hint rings them and clears the first one that isn't a given. */
  at: number[];
}

/**
 * `check()` for the number-entry grids: first a rule the board visibly breaks (a digit twice in a
 * unit, a full cage with the wrong sum, then the game's own `rules`), else any entry that differs
 * from the (unique) solution. `play()` clears the faulty entry through `o.place(i, 0)`.
 */
export function makeCheck(o: HintOpts & { rules?: ((vals: number[]) => Broken | null)[] }): () => Hint | null {
  const fix = (b: Broken): Hint | null => {
    const vals = o.vals();
    // Clear the entry that's actually wrong when there is one, else the first one the player made.
    const mine = b.at.filter((i) => !o.givens[i] && vals[i] > 0);
    const target = mine.find((i) => vals[i] !== o.sol[i]) ?? mine[0];
    if (target == null) return null;
    return {
      kind: 'fix',
      text: b.text,
      why: b.why,
      at: b.at.map((i) => o.cells[i]),
      action: L(`Clear the ${vals[target]}`, `Effacer le ${vals[target]}`),
      play: () => {
        if (o.vals()[target] > 0) o.place(target, 0);
      },
    };
  };
  return () => {
    const vals = o.vals();
    for (const u of o.units) {
      const seen = new Map<number, number>();
      for (const c of u.cells) {
        const v = vals[c];
        if (v <= 0) continue;
        const j = seen.get(v);
        if (j != null) {
          const h = fix({
            text: L(
              `${cap(unitName(u))} has two ${v}s: each number goes in it only once.`,
              `${cap(unitName(u))} contient deux ${v} : chaque nombre n’y va qu’une fois.`,
            ),
            why: u.clue,
            at: [j, c],
          });
          if (h) return h;
        }
        seen.set(v, c);
      }
      if (u.sum == null) continue;
      const filled = u.cells.filter((c) => vals[c] > 0);
      const got = filled.reduce((t, c) => t + vals[c], 0);
      const left = u.cells.length - filled.length;
      if (!left && got !== u.sum) {
        const h = fix({
          text: L(
            `${cap(unitName(u))} should add up to ${u.sum}, but its digits make ${got}.`,
            `${cap(unitName(u))} devrait faire ${u.sum}, mais ses chiffres font ${got}.`,
          ),
          why: u.clue,
          at: u.cells,
        });
        if (h) return h;
      } else if (left && filled.length && seen.size === filled.length) {
        // The digits in so far leave no way to finish the sum with distinct unused digits.
        const avail = Array.from({ length: o.n }, (_, t) => t + 1).filter((d) => !seen.has(d));
        const need = u.sum - got;
        if (!subsets(avail, left, need).length) {
          const low = avail.slice(0, left).reduce((a, b) => a + b, 0);
          const high = avail.slice(-left).reduce((a, b) => a + b, 0);
          const fv = filled.map((c) => vals[c]);
          const parts = fv.length > 1 ? `${plus(fv)} = ${got}` : `${got}`;
          const name = cap(unitName(u));
          const cellsEn = left > 1 ? `its ${left} empty cells` : 'its empty cell';
          const cellsFr = left > 1 ? `ses ${left} cases vides` : 'sa case vide';
          const en = `${name} adds up to ${u.sum}`;
          const fr = `${name} fait ${u.sum}`;
          const would = L(
            `with ${parts} in it, ${cellsEn} would need ${need}`,
            `avec ${parts}, ${cellsFr} devrai${left > 1 ? 'en' : ''}t faire ${need}`,
          );
          const h = fix({
            text:
              need <= 0
                ? L(
                    `${en}, but ${parts} already ${need < 0 ? 'goes over it' : 'uses it all up'}, with ${cellsEn} still to fill.`,
                    `${fr}, mais ${parts} ${need < 0 ? 'le dépasse' : 'l’atteint'} déjà, et ${cellsFr} reste${left > 1 ? 'nt' : ''} à remplir.`,
                  )
                : left === 1 && need <= o.n
                  ? L(`${en}: ${would}, but there’s already a ${need} in it.`, `${fr} : ${would}, mais il y a déjà un ${need}.`)
                  : need < low
                    ? L(
                        `${en}: ${would}, too little for ${left} different digits.`,
                        `${fr} : ${would}, trop peu pour ${left} chiffres différents.`,
                      )
                    : need > high
                      ? L(`${en}: ${would}, more than ${left > 1 ? 'they' : 'it'} can hold.`, `${fr} : ${would}, c’est trop.`)
                      : L(`${en}: ${would}, and no unused digits make that.`, `${fr} : ${would}, et aucun chiffre libre n’y arrive.`),
            why: u.clue,
            at: filled,
          });
          if (h) return h;
        }
      }
    }
    for (const r of o.rules ?? []) {
      const b = r(vals);
      const h = b && fix(b);
      if (h) return h;
    }
    const i = vals.findIndex((v, j) => v > 0 && !o.givens[j] && v !== o.sol[j]);
    if (i < 0) return null;
    return fix({
      text: L(
        `This ${vals[i]} breaks no rule yet, but it leads to a dead end: it doesn’t belong here.`,
        `Ce ${vals[i]} ne brise encore aucune règle, mais il mène à une impasse : il ne va pas ici.`,
      ),
      at: [i],
    });
  };
}
