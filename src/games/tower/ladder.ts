import { wordLocale } from '../../core/i18n';
import type { Rng } from '../../core/rng';
import { answers, commonOfLength } from '../../kits/word/lexicon';

/** Number of positions where two equal-length words differ. */
export const diff = (a: string, b: string) => {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
};

const graphs = new Map<string, Map<string, string[]>>();
/** Adjacency (one letter changed) over the common words of a length. Built once per locale and length. */
function graph(len: number) {
  const id = `${wordLocale()}:${len}`;
  let g = graphs.get(id);
  if (g) return g;
  const words = commonOfLength(len);
  const buckets = new Map<string, string[]>();
  for (const w of words)
    for (let i = 0; i < len; i++) {
      const k = w.slice(0, i) + '_' + w.slice(i + 1);
      const b = buckets.get(k);
      if (b) b.push(w);
      else buckets.set(k, [w]);
    }
  g = new Map();
  for (const w of words) {
    const nb: string[] = [];
    for (let i = 0; i < len; i++) for (const x of buckets.get(w.slice(0, i) + '_' + w.slice(i + 1))!) if (x !== w) nb.push(x);
    g.set(w, nb);
  }
  graphs.set(id, g);
  return g;
}

/**
 * Pick a start and end word (both safe answers) whose shortest ladder over common words is exactly `steps`.
 * Returns the known path (start … end). Falls back to the longest found if no exact match within budget.
 */
export function makeLadder(rng: Rng, len: number, steps: number): string[] {
  const g = graph(len);
  const ends = new Set(answers(len));
  const starts = answers(len).filter((w) => (g.get(w)?.length ?? 0) > 0);
  let best: string[] = [];
  for (let attempt = 0; attempt < 40; attempt++) {
    const start = rng.pick(starts);
    const prev = new Map<string, string | null>([[start, null]]);
    let frontier = [start];
    for (let depth = 0; depth < steps && frontier.length; depth++) {
      const next: string[] = [];
      for (const u of frontier)
        for (const v of g.get(u)!)
          if (!prev.has(v)) {
            prev.set(v, u);
            next.push(v);
          }
      frontier = next;
    }
    const pathTo = (w: string) => {
      const p: string[] = [];
      for (let x: string | null = w; x; x = prev.get(x)!) p.push(x);
      return p.reverse();
    };
    const cands = frontier.filter((w) => ends.has(w)).sort();
    if (cands.length) return pathTo(rng.pick(cands));
    // remember the deepest reachable answer as a fallback
    let far = start;
    let farD = 0;
    for (const w of prev.keys()) {
      if (!ends.has(w)) continue;
      const dl = pathTo(w).length - 1;
      if (dl > farD) {
        far = w;
        farD = dl;
      }
    }
    if (farD + 1 > best.length) best = pathTo(far);
  }
  return best.length >= 2 ? best : [starts[0], g.get(starts[0])![0]];
}
