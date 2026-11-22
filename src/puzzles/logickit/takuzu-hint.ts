// Guide deductions for the two-symbol grid (eclipse). Cells: -1 empty, 0 or 1.

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
