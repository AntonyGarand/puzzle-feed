// Hint-button check for loop games (loop, pearls): rule breaks a player can see on the lines drawn.
import type { Geo } from './slither';

/** What's wrong, where (`v` a vertex, `es` the edges involved) and which mark to clear (`e`). */
export interface LoopFault {
  kind: 'branch' | 'end' | 'closed';
  v: number;
  es: number[];
  e: number;
}

/**
 * Edge states `st` (0 empty, 1 line, 2 ✕) against the solution loop `sol`: a vertex with more than
 * two lines, a line end with every way on crossed out, or a closed loop that isn't the solution.
 * Each fault comes with a mark that disagrees with `sol` (always one when the solution is unique).
 */
export function loopFault(g: Geo, st: ArrayLike<number>, sol: ArrayLike<boolean>): LoopFault | null {
  const { ea, eb, ve } = g;
  const wrong = (e: number) => (st[e] === 1 && !sol[e]) || (st[e] === 2 && sol[e]);
  for (let v = 0; v < ve.length; v++) {
    const lines = ve[v].filter((e) => st[e] === 1);
    if (lines.length > 2) {
      const e = lines.find(wrong);
      if (e !== undefined) return { kind: 'branch', v, es: lines, e };
    }
    if (lines.length === 1 && !ve[v].some((e) => st[e] === 0)) {
      const e = wrong(lines[0]) ? lines[0] : ve[v].find((f) => st[f] === 2 && sol[f]);
      if (e !== undefined) return { kind: 'end', v, es: ve[v], e };
    }
  }
  // Closed loops: components whose every vertex has exactly two lines.
  const seen = new Uint8Array(st.length);
  for (let e0 = 0; e0 < st.length; e0++) {
    if (st[e0] !== 1 || seen[e0]) continue;
    const comp: number[] = [];
    const stack = [e0];
    seen[e0] = 1;
    let cycle = true;
    while (stack.length) {
      const e = stack.pop()!;
      comp.push(e);
      for (const v of [ea[e], eb[e]]) {
        const ls = ve[v].filter((f) => st[f] === 1);
        if (ls.length !== 2) cycle = false;
        for (const f of ls)
          if (!seen[f]) {
            seen[f] = 1;
            stack.push(f);
          }
      }
    }
    if (!cycle) continue;
    const e = comp.find(wrong);
    if (e !== undefined) return { kind: 'closed', v: ea[e], es: comp, e };
  }
  return null;
}
