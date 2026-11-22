import { wordLocale, type Locale } from '../../core/i18n';
import type { Rng } from '../../core/rng';
import { commonSet } from './lexicon';

interface Node {
  k: Map<string, Node>;
  w?: string;
}
const tries: Partial<Record<Locale, Node>> = {};
function root(): Node {
  const have = tries[wordLocale()];
  if (have) return have;
  const trie: Node = { k: new Map() };
  tries[wordLocale()] = trie;
  for (const w of commonSet()) {
    if (w.length < 3) continue;
    let n = trie;
    for (const ch of w) {
      let nx = n.k.get(ch);
      if (!nx) n.k.set(ch, (nx = { k: new Map() }));
      n = nx;
    }
    n.w = w;
  }
  return trie;
}

/** King-move neighbours of `i` on a grid `n` columns wide and `rows` rows tall. */
const neighbours = (n: number, i: number, rows = n) => {
  const r = Math.floor(i / n),
    c = i % n;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr,
        cc = c + dc;
      if (rr >= 0 && rr < rows && cc >= 0 && cc < n) out.push(rr * n + cc);
    }
  return out;
};
export const adjacent = (n: number, a: number, b: number) =>
  a !== b && Math.abs(Math.floor(a / n) - Math.floor(b / n)) <= 1 && Math.abs((a % n) - (b % n)) <= 1;

/** Points for a word: longer words are worth more. */
export const points = (len: number) => (len <= 3 ? 1 : len === 4 ? 2 : len === 5 ? 3 : len === 6 ? 5 : len === 7 ? 7 : 10);

/** All common words (≥ minLen) traceable in the grid. */
function solve(letters: string[], n: number, minLen: number): Set<string> {
  const found = new Set<string>();
  const used = new Array<boolean>(letters.length).fill(false);
  const walk = (i: number, node: Node) => {
    const nx = node.k.get(letters[i]);
    if (!nx) return;
    if (nx.w && nx.w.length >= minLen) found.add(nx.w);
    used[i] = true;
    for (const j of neighbours(n, i)) if (!used[j]) walk(j, nx);
    used[i] = false;
  };
  const t = root();
  for (let i = 0; i < letters.length; i++) walk(i, t);
  return found;
}

/** A path of cell indices spelling `word` (on a grid `n` columns wide, through `free` cells only), or null. */
export function findPath(letters: string[], n: number, word: string, free: (i: number) => boolean = () => true): number[] | null {
  const path: number[] = [];
  const rows = Math.ceil(letters.length / n);
  const go = (i: number, k: number): boolean => {
    if (letters[i] !== word[k] || path.includes(i) || !free(i)) return false;
    path.push(i);
    if (k === word.length - 1) return true;
    for (const j of neighbours(n, i, rows)) if (go(j, k + 1)) return true;
    path.pop();
    return false;
  };
  for (let i = 0; i < letters.length; i++) if (go(i, 0)) return path;
  return null;
}

// Letter weights per locale. English: roughly English letter frequency, no Q.
// French: roughly French letter frequency (accents folded into the base letter), with a little Q (it pairs with U).
const WEIGHTS: Record<Locale, [string, number][]> = {
  en: [
    ['e', 12],
    ['a', 9],
    ['i', 8],
    ['o', 8],
    ['n', 6],
    ['r', 6],
    ['t', 6],
    ['s', 5],
    ['l', 4],
    ['u', 3],
    ['d', 4],
    ['g', 3],
    ['b', 2],
    ['c', 3],
    ['m', 3],
    ['p', 2],
    ['f', 2],
    ['h', 3],
    ['v', 1],
    ['w', 2],
    ['y', 2],
    ['k', 1],
    ['j', 0.5],
    ['x', 0.5],
    ['z', 0.5],
  ],
  fr: [
    ['e', 14],
    ['a', 8],
    ['i', 7.5],
    ['s', 7.5],
    ['n', 7],
    ['r', 6.5],
    ['t', 7],
    ['u', 6],
    ['l', 5.5],
    ['o', 5.5],
    ['d', 3.5],
    ['c', 3.3],
    ['m', 3],
    ['p', 3],
    ['v', 1.5],
    ['q', 0.8],
    ['f', 1.1],
    ['b', 1],
    ['g', 1],
    ['h', 0.8],
    ['j', 0.4],
    ['x', 0.4],
    ['y', 0.3],
    ['z', 0.2],
  ],
};
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
const ODD: Record<Locale, string> = { en: 'jxzkv', fr: 'jxzqyh' };
const roll = (rng: Rng, weights: [string, number][], total: number) => {
  let x = rng.next() * total;
  for (const [ch, w] of weights) if ((x -= w) < 0) return ch;
  return 'e';
};

/** Generate a grid with plenty of common words. Returns letters + the common words in it. */
export function makeGrid(rng: Rng, n: number, minLen: number, minPoints: number) {
  const weights = WEIGHTS[wordLocale()];
  const total = weights.reduce((s, [, w]) => s + w, 0);
  const odds = ODD[wordLocale()];
  let best: { letters: string[]; words: Set<string>; pts: number } | null = null;
  for (let attempt = 0; attempt < 80; attempt++) {
    const letters = Array.from({ length: n * n }, () => roll(rng, weights, total));
    const v = letters.filter((c) => VOWELS.has(c)).length;
    const odd = letters.filter((c) => odds.includes(c)).length;
    if (attempt < 70 && (v < n * n * 0.3 || v > n * n * 0.5 || odd > 1)) continue;
    const words = solve(letters, n, minLen);
    let pts = 0;
    for (const w of words) pts += points(w.length);
    if (!best || pts > best.pts) best = { letters, words, pts };
    if (pts >= minPoints) break;
  }
  return best!;
}
