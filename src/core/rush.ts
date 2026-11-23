import type { Difficulty, PuzzleDef } from './types';

/**
 * Puzzle Rush: solve as many puzzles as you can before the clock runs out. Classic deals each game at
 * your level (capped at Hard); Race starts on Easy and steps up a level every two solves.
 * Rush puzzles never touch per-game stats, auto-levelling or XP: only the run's score is kept.
 */

export type RushMode = 'classic' | 'race';
export type RushMinutes = 1 | 3 | 5;
export const RUSH_MODES: RushMode[] = ['classic', 'race'];
export const RUSH_MINUTES: RushMinutes[] = [1, 3, 5];

/** Time taken off the clock by a skip. */
export const SKIP_PENALTY_MS = 5000;
/** Solves per Race level. */
export const RACE_STEP = 2;
/** Classic never deals above Hard, so a short run still sees several puzzles. */
const CLASSIC_MAX: Difficulty = 3;
/** Only games whose par time at the dealt level is at most this (seconds) are dealt. */
const MAX_PAR: Record<Difficulty, number> = { 1: 60, 2: 75, 3: 100, 4: 150, 5: 200 };

/** Storage key of a mode and duration, e.g. `race-3`. */
export const rushKey = (mode: RushMode, minutes: RushMinutes) => `${mode}-${minutes}`;

/** The mode and minutes of a `/rush/play/<mode>/<minutes>` path, or undefined. */
export function parseRush(mode: string | undefined, minutes: string | undefined): { mode: RushMode; minutes: RushMinutes } | undefined {
  const m = Number(minutes);
  if (!RUSH_MODES.includes(mode as RushMode) || !RUSH_MINUTES.includes(m as RushMinutes)) return undefined;
  return { mode: mode as RushMode, minutes: m as RushMinutes };
}

/** Race level after `solved` solves: Easy, then one level up every {@link RACE_STEP} solves. */
export const raceLevel = (solved: number): Difficulty => Math.min(5, 1 + Math.floor(solved / RACE_STEP)) as Difficulty;

/** The level a game is dealt at: Race follows the score, Classic the game's own level, capped at Hard. */
export const rushLevel = (mode: RushMode, solved: number, own: Difficulty): Difficulty =>
  mode === 'race' ? raceLevel(solved) : (Math.min(own, CLASSIC_MAX) as Difficulty);

type RushDef = Pick<PuzzleDef, 'id' | 'category' | 'par'>;

/**
 * The next puzzle of a run: a quick game (par within {@link MAX_PAR} at its level), not one of the
 * last three, and preferably not from the previous card's category. `random` is in [0, 1).
 */
export function rushPick<D extends RushDef>(
  defs: D[],
  recent: string[],
  levelOf: (d: D) => Difficulty,
  random: () => number,
): { def: D; level: Difficulty } | null {
  if (!defs.length) return null;
  const leveled = defs.map((d) => ({ def: d, level: levelOf(d) }));
  let pool = leveled.filter((x) => x.def.par(x.level) <= MAX_PAR[x.level]);
  // Nothing quick enough: the five quickest at their level.
  if (!pool.length) pool = leveled.toSorted((a, b) => a.def.par(a.level) - b.def.par(b.level)).slice(0, 5);
  const last = recent.at(-1);
  const lastCat = defs.find((d) => d.id === last)?.category;
  const weighted = pool.map((x) => {
    const w = recent.slice(-3).includes(x.def.id) ? 0 : x.def.category === lastCat ? 0.25 : 1;
    return { x, w };
  });
  const total = weighted.reduce((a, e) => a + e.w, 0);
  if (total <= 0) return pool[Math.floor(random() * pool.length)];
  let r = random() * total;
  for (const e of weighted) if ((r -= e.w) < 0 && e.w > 0) return e.x;
  return weighted.findLast((e) => e.w > 0)!.x;
}
