/**
 * The 2048 guide: an expectimax search (my slide, then every place a 2 or a 4 can appear, then my
 * next slide…) over boards packed as one number per row (4 bits per tile exponent), with the usual
 * heuristic: free cells, possible merges, rows and columns that rise steadily toward one side.
 */

type Rows = number[];

/** Slides are numbered like the game's: 0 up, 1 right, 2 down, 3 left. */
export type Slide = 0 | 1 | 2 | 3;

/** A lookup per packed line: a flat table for 4×4 boards (16-bit lines), a map for bigger ones. */
function table(bits: number, make: (code: number) => number) {
  if (bits <= 16) {
    const t = new Float64Array(1 << bits).fill(Number.NaN);
    return (code: number) => {
      let v = t[code];
      if (Number.isNaN(v)) v = t[code] = make(code);
      return v;
    };
  }
  const m = new Map<number, number>();
  return (code: number) => {
    let v = m.get(code);
    if (v == null) m.set(code, (v = make(code)));
    return v;
  };
}

export function mergeAI(n: number) {
  const bits = 4 * n;
  const digits = (code: number) => Array.from({ length: n }, (_, i) => (code >>> (4 * i)) & 15);
  const enc = (d: number[]) => d.reduce((a, x, i) => a | (x << (4 * i)), 0) >>> 0;
  /** Slide one line toward its first cell, merging each equal pair once. */
  const left = table(bits, (code) => {
    const d = digits(code).filter((x) => x);
    const out: number[] = [];
    for (let k = 0; k < d.length; k++) {
      if (k + 1 < d.length && d[k] === d[k + 1] && d[k] < 15) {
        out.push(d[k] + 1);
        k++;
      } else out.push(d[k]);
    }
    while (out.length < n) out.push(0);
    return enc(out);
  });
  const rev = table(bits, (code) => enc(digits(code).reverse()));
  const right = table(bits, (code) => rev(left(rev(code))));
  const heurLine = table(bits, (code) => {
    const line = digits(code);
    let sum = 0,
      empty = 0,
      merges = 0,
      prev = 0,
      counter = 0;
    for (const r of line) {
      sum += r ** 3.5;
      if (!r) empty++;
      else {
        if (prev === r) counter++;
        else if (counter > 0) {
          merges += 1 + counter;
          counter = 0;
        }
        prev = r;
      }
    }
    if (counter > 0) merges += 1 + counter;
    let monoL = 0,
      monoR = 0;
    for (let i = 1; i < n; i++) {
      if (line[i - 1] > line[i]) monoL += line[i - 1] ** 4 - line[i] ** 4;
      else monoR += line[i] ** 4 - line[i - 1] ** 4;
    }
    return 200000 + 270 * empty + 700 * merges - 47 * Math.min(monoL, monoR) - 11 * sum;
  });
  const transpose = (rows: Rows) => {
    const out: Rows = [];
    for (let c = 0; c < n; c++) {
      let v = 0;
      for (let r = 0; r < n; r++) v |= ((rows[r] >>> (4 * c)) & 15) << (4 * r);
      out.push(v >>> 0);
    }
    return out;
  };
  const slide = (rows: Rows, dir: Slide): Rows => {
    if (dir === 3) return rows.map(left);
    if (dir === 1) return rows.map(right);
    return transpose(transpose(rows).map(dir === 0 ? left : right));
  };
  const heur = (rows: Rows) => {
    let v = 0;
    for (const r of rows) v += heurLine(r);
    for (const c of transpose(rows)) v += heurLine(c);
    return v;
  };
  const same = (a: Rows, b: Rows) => a.every((x, i) => x === b[i]);

  /** Best slide for a board of tile values (0 = empty), or -1 when nothing moves. */
  return (cells: number[]): Slide | -1 => {
    const rows: Rows = [];
    for (let r = 0; r < n; r++) rows.push(enc(cells.slice(r * n, r * n + n).map((v) => (v ? Math.min(15, Math.round(Math.log2(v))) : 0))));
    let nodes = 0;
    const STOP = {};
    let limit = 1;
    const maxNode = (x: Rows, depth: number): number => {
      let best = 0;
      for (const dir of [0, 1, 2, 3] as Slide[]) {
        const y = slide(x, dir);
        if (!same(x, y)) best = Math.max(best, chance(y, depth));
      }
      return best;
    };
    const chance = (x: Rows, depth: number): number => {
      if (++nodes > 2500) throw STOP;
      if (depth >= limit) return heur(x);
      let sum = 0,
        cnt = 0;
      for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++) {
          if ((x[r] >>> (4 * c)) & 15) continue;
          cnt++;
          const y = x.slice();
          y[r] = (x[r] | (1 << (4 * c))) >>> 0;
          sum += 0.9 * maxNode(y, depth + 1);
          y[r] = (x[r] | (2 << (4 * c))) >>> 0;
          sum += 0.1 * maxNode(y, depth + 1);
        }
      return cnt ? sum / cnt : heur(x);
    };
    // Deepen while the node budget lasts (deeper near the end, when the board is tight).
    let pick: Slide | -1 = -1;
    for (limit = 1; limit <= 3; limit++) {
      let got: Slide | -1 = -1,
        best = -Infinity;
      try {
        for (const dir of [2, 3, 1, 0] as Slide[]) {
          const y = slide(rows, dir);
          if (same(rows, y)) continue;
          const v = chance(y, 0);
          if (v > best) [best, got] = [v, dir];
        }
      } catch (e) {
        if (e !== STOP) throw e;
        break;
      }
      pick = got;
    }
    return pick;
  };
}
