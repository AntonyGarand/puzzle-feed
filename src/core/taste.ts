import type { TypeStats } from './store';

/** How many of a game's latest events count toward its affinity. */
const WINDOW = 20;
/** Events older than this no longer count: tastes change. */
const MAX_AGE_MS = 60 * 86_400_000;
/** Feed weight for a card of the same category as the one before it (when there is a choice). */
export const SAME_CATEGORY = 0.35;

/**
 * How much the player seems to enjoy a game, as a feed weight multiplier in [0.5, 1.5]. Looks at its
 * latest feed events: a finished puzzle (solved or failed) counts for it, a skip or leaving a started
 * puzzle counts against. Daily and shared puzzles are ignored: the player didn't choose those. A prior
 * of two of each keeps a game with little history near 1, so one skip doesn't bury it.
 */
export function affinity(st: TypeStats | undefined, now = Date.now()): number {
  if (!st) return 1;
  const since = now - MAX_AGE_MS;
  const events: { at: number; good: boolean }[] = [];
  for (const r of st.recent) if (!r.dy && !r.sh && r.at >= since) events.push({ at: r.at, good: r.o !== 'skipped' });
  for (const at of st.left ?? []) if (at >= since) events.push({ at, good: false });
  const last = events.toSorted((a, b) => a.at - b.at).slice(-WINDOW);
  const pos = last.filter((e) => e.good).length;
  const neg = last.length - pos;
  return 0.5 + (pos + 2) / (pos + neg + 4);
}

/**
 * Feed weights after taste and category spacing: each base weight times the game's affinity (`taste`),
 * and times {@link SAME_CATEGORY} when it shares the previous card's category (only when the pool has
 * more than one category, so a single-category feed isn't affected).
 */
export function tasteWeights<T extends { category: string }>(
  pool: { d: T; w: number }[],
  opts: { prevCategory?: string | undefined; affinity?: ((d: T) => number) | undefined },
): void {
  const cats = new Set(pool.map((x) => x.d.category));
  for (const x of pool) {
    if (opts.affinity) x.w *= opts.affinity(x.d);
    if (cats.size > 1 && opts.prevCategory && x.d.category === opts.prevCategory) x.w *= SAME_CATEGORY;
  }
}
