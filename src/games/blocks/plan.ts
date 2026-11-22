import { fits, fitsAnywhere, fullLines, PIECES, type Piece } from './pieces';

/** The guide's plan for the pieces left in the tray. */
export interface TrayPlan {
  /** Placements (tray slot, row, column), in order. Shorter than the tray when they don't all fit. */
  steps: { k: number; r: number; c: number }[];
  /** Some order places every piece left. */
  fitsAll: boolean;
  /** Some order clears the lines still needed for the goal (the game is won at that point). */
  reachesGoal: boolean;
  /** The search was cut short, so "they don't fit" isn't proven. */
  capped: boolean;
}

/** Place piece p at (r, c) and clear the full lines; returns the new board and how many lines went. */
function drop(b: number[], n: number, p: Piece, r: number, c: number) {
  const out = b.slice();
  for (const [dr, dc] of p.cells) out[(r + dr) * n + c + dc] = 1;
  const { rows, cols } = fullLines(out, n);
  for (const rr of rows) for (let j = 0; j < n; j++) out[rr * n + j] = 0;
  for (const cc of cols) for (let j = 0; j < n; j++) out[j * n + cc] = 0;
  return { b: out, lines: rows.length + cols.length };
}

/** Chance of drawing each piece (as `drawPiece` deals them), for a level's size limit and bias. */
const dealOdds = new Map<string, { p: Piece; w: number }[]>();
function odds(maxTier: number, bigBias: number) {
  const key = `${maxTier}:${bigBias}`;
  let out = dealOdds.get(key);
  if (!out) {
    const famCount = new Map<number, number>();
    PIECES.forEach((p) => famCount.set(p.fam, (famCount.get(p.fam) ?? 0) + 1));
    const ws = PIECES.map((p) => (p.tier > maxTier || p.cells.length < 3 ? 0 : (1 + bigBias * (p.tier - 1)) / famCount.get(p.fam)!));
    const sum = ws.reduce((a, x) => a + x, 0);
    out = PIECES.map((p, i) => ({ p, w: ws[i] / sum })).filter((x) => x.w > 0);
    dealOdds.set(key, out);
  }
  return out;
}

/** Weights: ragged borders, cells gathered in lines, chance that the next piece fits nowhere. */
const W_EDGE = 2;
const W_LINE = 0.3;
const W_MISS = 600;

/** How open a board is: free cells, no lone holes, smooth rows and columns. */
function openness(b: number[], n: number) {
  let v = 0;
  const at = (r: number, c: number) => r < 0 || c < 0 || r >= n || c >= n || b[r * n + c] !== 0;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const filled = at(r, c);
      if (!filled) {
        v += 2;
        const walls = Number(at(r - 1, c)) + Number(at(r + 1, c)) + Number(at(r, c - 1)) + Number(at(r, c + 1));
        if (walls === 4) v -= 14;
        else if (walls === 3) v -= 3;
      }
      // Ragged borders between filled and empty cells waste space.
      if (filled !== at(r, c + 1)) v -= W_EDGE;
      if (filled !== at(r + 1, c)) v -= W_EDGE;
    }
  // Filled cells gathered into a few rows and columns are close to clearing.
  for (let j = 0; j < n; j++) {
    let rc = 0,
      cc = 0;
    for (let x = 0; x < n; x++) {
      rc += b[j * n + x] ? 1 : 0;
      cc += b[x * n + j] ? 1 : 0;
    }
    v += W_LINE * (rc * rc + cc * cc);
  }
  return v;
}

/**
 * Best way to place the pieces left in the tray: every order, the most promising placements at each
 * step (a small beam), scored by lines cleared and how open the board stays for the next deal. If
 * the beam finds no way to place them all, an exhaustive search (with a budget) settles it.
 */
export function planTray(cells: number[], n: number, tray: number[], need: number, maxTier: number, bigBias: number): TrayPlan {
  const BEAM = [12, 6, 1000];
  const total = tray.filter((t) => t >= 0).length;
  let capped = false;
  type Node = { steps: TrayPlan['steps']; b: number[]; lines: number; val: number };
  const leaves: (Node & { placed: number })[] = [];
  const finish = (x: Node) => {
    const placed = x.steps.length;
    const val = openness(x.b, n) + x.lines * 30 + (x.lines >= need ? 100000 : 0) - (placed === total ? 0 : 20000 * (total - placed));
    leaves.push({ ...x, val, placed });
  };
  const go = (x: Node, depth: number) => {
    if (x.lines >= need) return finish(x);
    const next: Node[] = [];
    for (let k = 0; k < 3; k++) {
      if (tray[k] < 0 || x.steps.some((s) => s.k === k)) continue;
      const p = PIECES[tray[k]];
      for (let r = 0; r + p.h <= n; r++)
        for (let c = 0; c + p.w <= n; c++) {
          if (!fits(x.b, n, p, r, c)) continue;
          const d = drop(x.b, n, p, r, c);
          next.push({ steps: [...x.steps, { k, r, c }], b: d.b, lines: x.lines + d.lines, val: openness(d.b, n) + d.lines * 30 });
        }
    }
    if (!next.length) return finish(x);
    next.sort((a, b) => b.val - a.val);
    for (const y of next.slice(0, BEAM[depth] ?? 1000)) go(y, depth + 1);
  };
  go({ steps: [], b: cells, lines: 0, val: 0 }, 0);
  // The most promising end boards: also weigh the chance that a newly dealt piece fits nowhere.
  leaves.sort((x, y) => y.val - x.val);
  const deal = odds(maxTier, bigBias);
  let b: (typeof leaves)[number] | null = null;
  for (const x of leaves.slice(0, 40)) {
    let miss = 0;
    for (const o of deal) if (!fitsAnywhere(x.b, n, o.p)) miss += o.w;
    const val = x.val - W_MISS * miss;
    if (!b || val > b.val) b = { ...x, val };
  }
  const fitsAll = !!b && b.placed === total;
  const reachesGoal = !!b && b.lines >= need;
  if (!fitsAll && !reachesGoal) {
    let budget = 60000;
    const path: TrayPlan['steps'] = [];
    const any = (bd: number[], used: number[], lines: number): boolean => {
      if (lines >= need || used.length === total) return true;
      for (let k = 0; k < 3; k++) {
        if (tray[k] < 0 || used.includes(k)) continue;
        const p = PIECES[tray[k]];
        for (let r = 0; r + p.h <= n; r++)
          for (let c = 0; c + p.w <= n; c++) {
            if (!fits(bd, n, p, r, c)) continue;
            if (--budget < 0) {
              capped = true;
              return false;
            }
            const d = drop(bd, n, p, r, c);
            path.push({ k, r, c });
            if (any(d.b, [...used, k], lines + d.lines)) return true;
            path.pop();
          }
      }
      return false;
    };
    if (any(cells, [], 0)) return { steps: path, fitsAll: true, reachesGoal: false, capped: false };
  }
  return { steps: b?.steps ?? [], fitsAll, reachesGoal, capped };
}
