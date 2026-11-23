import { packEntries, recordPack, type PackEntry, type PackStars } from './store';
import { LEVELS, type Difficulty } from './types';

/**
 * Packs: every game has a fixed set of puzzles, one tier per difficulty (Easy … Master), the same for
 * everyone. Each solve earns up to three stars; enough solves in a tier unlock the next one.
 */

/** Puzzles per tier. */
export const PACK_SIZE = 12;
/** Solves in a tier that unlock the next one. */
export const UNLOCK_AT = 9;
/** Preset seed of the packs. Changing it changes every pack's puzzles (and orphans the progress). */
const PACK_SEED = 0x9ac4_5eed;

/** Which pack puzzle a card plays: the tier (its level) and the puzzle's index in it. */
export interface PackRef {
  level: Difficulty;
  index: number;
}

/** Seed of puzzle `index` of `id`'s tier `level`: FNV-1a with the preset seed, then a final mix. */
export function packSeed(id: string, level: Difficulty, index: number): number {
  const str = `${id}:${level}:${index}`;
  let x = 0x811c9dc5 ^ PACK_SEED;
  for (let i = 0; i < str.length; i++) x = Math.imul(x ^ str.charCodeAt(i), 0x01000193);
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return x >>> 0;
}

/** ★ solved, ★★ within par, ★★★ within par with no mistakes and no hints. */
export function packStars(r: { ms: number; parMs: number; m: number; hn: number }): PackStars {
  if (r.ms > r.parMs) return 1;
  return r.m === 0 && r.hn === 0 ? 3 : 2;
}

type TierState = 'locked' | 'open' | 'complete' | 'perfect';

export interface TierProgress {
  level: Difficulty;
  state: TierState;
  solved: number;
  stars: number;
  /** One per puzzle: its best result, if solved. */
  entries: (PackEntry | undefined)[];
}

const solvedIn = (entries: readonly (PackEntry | null | undefined)[]) => entries.filter((e) => e?.s).length;

/** Progress of one tier of `id`'s pack. */
export function tierProgress(id: string, level: Difficulty): TierProgress {
  const stored = packEntries(id, level);
  const entries = Array.from({ length: PACK_SIZE }, (_, i) => stored[i] ?? undefined);
  const solved = solvedIn(entries);
  const stars = entries.reduce((a, e) => a + (e?.s ?? 0), 0);
  const open = level === 1 || solvedIn(packEntries(id, (level - 1) as Difficulty)) >= UNLOCK_AT;
  const state: TierState = !open ? 'locked' : solved < PACK_SIZE ? 'open' : stars === 3 * PACK_SIZE ? 'perfect' : 'complete';
  return { level, state, solved, stars, entries };
}

export const tierUnlocked = (id: string, level: Difficulty) => tierProgress(id, level).state !== 'locked';

export interface PackProgress {
  tiers: TierProgress[];
  solved: number;
  stars: number;
  total: number;
  maxStars: number;
}

/** Progress over every tier of `id`'s pack. */
export function packProgress(id: string): PackProgress {
  const tiers = LEVELS.map((l) => tierProgress(id, l));
  const total = PACK_SIZE * LEVELS.length;
  return {
    tiers,
    solved: tiers.reduce((a, t) => a + t.solved, 0),
    stars: tiers.reduce((a, t) => a + t.stars, 0),
    total,
    maxStars: 3 * total,
  };
}

/** The next unsolved puzzle of the tier after `index` (wrapping around, never `index` itself), or null if none. */
export function nextInTier(id: string, level: Difficulty, index: number): number | null {
  const entries = packEntries(id, level);
  for (let k = 1; k < PACK_SIZE; k++) {
    const i = (index + k) % PACK_SIZE;
    if (!entries[i]?.s) return i;
  }
  return null;
}

/** Record a solved pack puzzle: keeps the best stars, time and mistakes. Returns the stars of this solve. */
export function finishPack(id: string, ref: PackRef, r: { ms: number; parMs: number; m: number; hn: number }): PackStars {
  const s = packStars(r);
  recordPack(id, ref.level, ref.index, { s, ms: r.ms, m: r.m });
  return s;
}
