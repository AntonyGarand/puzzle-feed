import { Rng } from './rng';
import { dailyList, getProfile, type DailyEntry } from './store';
import { LEVELS, type Difficulty, type PuzzleDef } from './types';

/**
 * Daily challenges: every calendar day has one list of puzzles per difficulty. Lists come from a fixed
 * seed (`DAILY_SEED`) mixed with the date and level, so everyone gets the same puzzles on the same day.
 * The first time a player opens a list it's stored in their profile, so it stays the same all day even
 * if a new version adds games.
 */

/** Puzzles per daily list. */
export const DAILY_SIZE = 5;
/** Preset seed of the daily challenges. Changing it changes every future (and unstored past) list. */
const DAILY_SEED = 0x5eed_da11;

/** Today's calendar date (local, YYYY-MM-DD). Daily lists change at local midnight. */
export const dailyDate = (t = Date.now()) => new Date(t).toLocaleDateString('en-CA');

/** `date` moved by `days` (YYYY-MM-DD, local calendar). */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d + days).toLocaleDateString('en-CA');
}

/** FNV-1a over the string, mixed with the preset seed. */
function hash(str: string): number {
  let x = 0x811c9dc5 ^ DAILY_SEED;
  for (let i = 0; i < str.length; i++) x = Math.imul(x ^ str.charCodeAt(i), 0x01000193);
  return x >>> 0;
}

/**
 * The puzzles of `date`'s list at `level`: distinct games, spread over as many categories as possible,
 * each with its own seed. Pure: depends only on the date, the level and the set of game ids.
 */
export function generateDaily(date: string, level: Difficulty, defs: Pick<PuzzleDef, 'id' | 'category'>[]): { id: string; seed: number }[] {
  const rng = new Rng(hash(`${date}:${level}`));
  // Sort by id: display names are localised, and the list must not depend on the language.
  const byCat = new Map<string, string[]>();
  for (const d of defs.toSorted((a, b) => (a.id < b.id ? -1 : 1))) {
    const list = byCat.get(d.category) ?? [];
    list.push(d.id);
    byCat.set(d.category, list);
  }
  const cats = rng.shuffle([...byCat.keys()].sort());
  for (const c of cats) rng.shuffle(byCat.get(c)!);
  const out: { id: string; seed: number }[] = [];
  // Round-robin over the shuffled categories, so a list mixes kinds of puzzles.
  for (let round = 0; out.length < DAILY_SIZE; round++) {
    let added = false;
    for (const c of cats) {
      const id = byCat.get(c)![round];
      if (id == null || out.length >= DAILY_SIZE) continue;
      out.push({ id, seed: rng.int(0, 0xffffffff) >>> 0 });
      added = true;
    }
    if (!added) break; // fewer games than DAILY_SIZE
  }
  return out;
}

/** `date`'s list at `level`, as stored in the profile (generated and stored on first use). */
export const getDaily = (date: string, level: Difficulty, defs: PuzzleDef[]): DailyEntry[] =>
  dailyList(date, level, () => generateDaily(date, level, defs));

/** Every puzzle of the list solved. */
export const isComplete = (list: DailyEntry[] | undefined): boolean => !!list?.length && list.every((e) => e.o === 'solved');

/** Levels whose list was completed on `date`. */
export const completedLevels = (date: string): Difficulty[] => LEVELS.filter((l) => isComplete(getProfile().daily[date]?.[l]));

/**
 * Days in a row with at least one completed daily list, ending today (or yesterday, while today's
 * isn't done yet).
 */
export function dailyStreak(today = dailyDate()): number {
  let d = completedLevels(today).length ? today : shiftDate(today, -1);
  let n = 0;
  while (completedLevels(d).length) {
    n++;
    d = shiftDate(d, -1);
  }
  return n;
}

interface LevelDailyStats {
  /** Lists completed (every puzzle solved). */
  completed: number;
  /** Daily puzzles solved. */
  solved: number;
  /** Fastest completed list (sum of the solve times). */
  bestTotal?: number;
}

export interface DailyStats {
  streak: number;
  bestStreak: number;
  /** Days with at least one completed list. */
  days: number;
  completed: number;
  solved: number;
  byLevel: Record<Difficulty, LevelDailyStats>;
}

export function dailyStats(today = dailyDate()): DailyStats {
  const daily = getProfile().daily;
  const byLevel = Object.fromEntries(LEVELS.map((l) => [l, { completed: 0, solved: 0 }])) as Record<Difficulty, LevelDailyStats>;
  const doneDays: string[] = [];
  for (const [date, day] of Object.entries(daily)) {
    let any = false;
    for (const l of LEVELS) {
      const list = day[l];
      if (!list) continue;
      const st = byLevel[l];
      st.solved += list.filter((e) => e.o === 'solved').length;
      if (isComplete(list)) {
        any = true;
        st.completed++;
        const total = list.reduce((a, e) => a + (e.ms ?? 0), 0);
        if (st.bestTotal == null || total < st.bestTotal) st.bestTotal = total;
      }
    }
    if (any) doneDays.push(date);
  }
  doneDays.sort();
  let bestStreak = 0;
  let run = 0;
  for (let i = 0; i < doneDays.length; i++) {
    run = i && shiftDate(doneDays[i - 1], 1) === doneDays[i] ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
  }
  return {
    streak: dailyStreak(today),
    bestStreak,
    days: doneDays.length,
    completed: LEVELS.reduce((a, l) => a + byLevel[l].completed, 0),
    solved: LEVELS.reduce((a, l) => a + byLevel[l].solved, 0),
    byLevel,
  };
}
