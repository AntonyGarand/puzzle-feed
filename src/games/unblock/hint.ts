import { N, type Block } from './gen';

/**
 * First move of a shortest solution from `pos` (a slide of any length counts as one move), for the guide.
 * Returns [block, new position], or null when already solved or out of budget.
 */
export function nextUnblockMove(blocks: Block[], pos: number[], cap = 60000): [number, number] | null {
  const done = (p: number[]) => p[0] === N - blocks[0].len;
  if (done(pos)) return null;
  const key = (p: number[]) => p.join(',');
  // first[state] = the first move taken from the start to reach it.
  const first = new Map<string, [number, number] | null>([[key(pos), null]]);
  const q: number[][] = [pos.slice()];
  const occ = new Uint8Array(N * N);
  const cell = (b: Block, p: number) => (b.hz ? b.line * N + p : p * N + b.line);
  for (let k = 0; k < q.length; k++) {
    const p = q[k];
    const f0 = first.get(key(p))!;
    occ.fill(0);
    blocks.forEach((b, i) => {
      for (let j = 0; j < b.len; j++) occ[cell(b, p[i] + j)] = 1;
    });
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      for (const dir of [-1, 1]) {
        for (let np = p[i] + dir; np >= 0 && np + b.len <= N; np += dir) {
          if (occ[cell(b, dir < 0 ? np : np + b.len - 1)]) break;
          const next = p.slice();
          next[i] = np;
          const nk = key(next);
          if (first.has(nk)) continue;
          const mv = f0 ?? ([i, np] as [number, number]);
          if (done(next)) return mv;
          first.set(nk, mv);
          if (first.size > cap) return null;
          q.push(next);
        }
      }
    }
  }
  return null;
}
