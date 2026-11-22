// Guide deductions for the two-symbol grid (eclipse). Cells: -1 empty, 0 or 1.
import { L } from '../../core/i18n';

export type TakuzuRule = 'pair' | 'gap' | 'count' | 'twin';

export interface TakuzuStep {
  rule: TakuzuRule;
  /** Row (true) or column (false) the deduction happens in, and its index. */
  row: boolean;
  line: number;
  /** Cells that justify the move. */
  why: number[];
  /** Cells to fill, with the value each one gets. */
  at: number[];
  vals: number[];
  /** The symbol the reasoning is about (the pair's, the gap's ends', the full half's, …). */
  v: number;
  /** For 'twin': the finished line being compared with. */
  other?: number;
}

const lines = (n: number) => {
  const out: { row: boolean; line: number; cells: number[] }[] = [];
  for (let r = 0; r < n; r++) out.push({ row: true, line: r, cells: Array.from({ length: n }, (_, c) => r * n + c) });
  for (let c = 0; c < n; c++) out.push({ row: false, line: c, cells: Array.from({ length: n }, (_, r) => r * n + c) });
  return out;
};

function pair(g: number[], n: number): TakuzuStep | null {
  for (const { row, line, cells } of lines(n))
    for (let k = 0; k + 1 < n; k++) {
      const a = cells[k],
        b = cells[k + 1];
      if (g[a] < 0 || g[a] !== g[b]) continue;
      const ends = [cells[k - 1], cells[k + 2]].filter((e) => e != null && g[e] < 0);
      if (ends.length) return { rule: 'pair', row, line, why: [a, b], at: ends, vals: ends.map(() => 1 - g[a]), v: g[a] };
    }
  return null;
}

function gap(g: number[], n: number): TakuzuStep | null {
  for (const { row, line, cells } of lines(n))
    for (let k = 0; k + 2 < n; k++) {
      const a = cells[k],
        m = cells[k + 1],
        b = cells[k + 2];
      if (g[a] >= 0 && g[a] === g[b] && g[m] < 0) return { rule: 'gap', row, line, why: [a, b], at: [m], vals: [1 - g[a]], v: g[a] };
    }
  return null;
}

function count(g: number[], n: number): TakuzuStep | null {
  for (const { row, line, cells } of lines(n)) {
    const empty = cells.filter((i) => g[i] < 0);
    if (!empty.length) continue;
    for (const v of [0, 1]) {
      const have = cells.filter((i) => g[i] === v);
      if (have.length === n / 2) return { rule: 'count', row, line, why: have, at: empty, vals: empty.map(() => 1 - v), v };
    }
  }
  return null;
}

/** A line one-of-each short of done that would otherwise copy a finished line: flip the copy. */
function twin(g: number[], n: number): TakuzuStep | null {
  const all = lines(n);
  for (const { row, line, cells } of all) {
    const empty = cells.filter((i) => g[i] < 0);
    if (empty.length !== 2) continue;
    const ones = cells.filter((i) => g[i] === 1).length;
    if (ones !== n / 2 - 1) continue;
    for (const o of all) {
      if (o.row !== row || o.line === line || o.cells.some((i) => g[i] < 0)) continue;
      const pos = (k: number) => o.cells[k];
      const ks = empty.map((i) => cells.indexOf(i));
      if (!cells.every((i, k) => g[i] < 0 || g[i] === g[pos(k)])) continue;
      if (g[pos(ks[0])] === g[pos(ks[1])]) continue;
      return { rule: 'twin', row, line, why: o.cells, at: empty, vals: ks.map((k) => 1 - g[pos(k)]), v: 0, other: o.line };
    }
  }
  return null;
}

const RULES: Record<TakuzuRule, (g: number[], n: number) => TakuzuStep | null> = { pair, gap, count, twin };

/** The next deduction, simplest rule first, avoiding `last` when another rule applies. */
export function takuzuStep(g: number[], n: number, last: TakuzuRule | undefined, rules: TakuzuRule[]): TakuzuStep | null {
  const order = [...rules.filter((r) => r !== last), ...rules.filter((r) => r === last)];
  for (const r of order) {
    const s = RULES[r](g, n);
    if (s) return s;
  }
  return null;
}

/** A rule the two-symbol grid breaks, for `check()`: what's wrong, the cells at fault, and the one to clear. */
export interface TakuzuFault {
  text: string;
  /** Cells at fault (ringed). */
  at: number[];
  /** The entry to clear: a wrong one among `at` that isn't given. */
  clear: number;
}

/**
 * What's wrong with a two-symbol grid (eclipse): three alike side by side, more than half of one
 * symbol in a line, two identical full lines, else any entry that differs from the unique `sol`.
 * `names` gives the localized symbol words: ["This sun" / "Ce soleil", plural "suns" / "soleils"] per symbol.
 */
export function takuzuCheck(g: number[], n: number, sol: number[], given: boolean[], names: [string, string][]): TakuzuFault | null {
  const pick = (at: number[]) => {
    const mine = at.filter((i) => !given[i] && g[i] >= 0);
    return mine.find((i) => g[i] !== sol[i]) ?? mine[0];
  };
  const all = lines(n);
  const lineName = (row: boolean, k: number) =>
    row ? L(`row ${k + 1}`, `la rangée ${k + 1}`) : L(`column ${k + 1}`, `la colonne ${k + 1}`);
  for (const { row, line, cells } of all) {
    for (let k = 0; k + 2 < n; k++) {
      const at = cells.slice(k, k + 3);
      const v = g[at[0]];
      if (v < 0 || g[at[1]] !== v || g[at[2]] !== v) continue;
      const clear = pick(at);
      if (clear == null) continue;
      return {
        text: L(
          `Three ${names[v][1]} side by side in ${lineName(row, line)}: never three alike in a row.`,
          `Trois ${names[v][1]} côte à côte dans ${lineName(row, line)} : jamais trois pareils de suite.`,
        ),
        at,
        clear,
      };
    }
    for (const v of [0, 1]) {
      const at = cells.filter((i) => g[i] === v);
      if (at.length <= n / 2) continue;
      const clear = pick(at);
      if (clear == null) continue;
      return {
        text: L(
          `${cap(lineName(row, line))} has ${at.length} ${names[v][1]}, but only half its ${n} cells (${n / 2}) may hold them.`,
          `${cap(lineName(row, line))} a ${at.length} ${names[v][1]}, mais seulement la moitié de ses ${n} cases (${n / 2}) peut en avoir.`,
        ),
        at,
        clear,
      };
    }
  }
  for (const a of all) {
    if (a.cells.some((i) => g[i] < 0)) continue;
    for (const b of all) {
      if (b.row !== a.row || b.line <= a.line || b.cells.some((i) => g[i] < 0)) continue;
      if (!a.cells.every((i, k) => g[i] === g[b.cells[k]])) continue;
      const at = [...a.cells, ...b.cells];
      const clear = pick(at);
      if (clear == null) continue;
      return {
        text: L(
          `${cap(lineName(a.row, a.line))} and ${lineName(b.row, b.line)} are identical: no two ${a.row ? 'rows' : 'columns'} may be the same.`,
          `${cap(lineName(a.row, a.line))} et ${lineName(b.row, b.line)} sont identiques : deux ${a.row ? 'rangées' : 'colonnes'} ne peuvent pas être pareilles.`,
        ),
        at,
        clear,
      };
    }
  }
  const i = g.findIndex((v, j) => v >= 0 && !given[j] && v !== sol[j]);
  if (i < 0) return null;
  return {
    text: `${names[g[i]][0]} ${L('breaks no rule yet, but it leads to a dead end: it doesn’t belong here.', 'ne brise encore aucune règle, mais mène à une impasse : sa place n’est pas ici.')}`,
    at: [i],
    clear: i,
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
