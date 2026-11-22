import type { Difficulty } from './types';

/** Why XP was earned on a solve (labels are rendered by the win card). */
type XpReason = 'solve' | 'flawless' | 'par' | 'first' | 'best' | 'daily' | 'gameToday' | 'today';

export interface XpGain {
  why: XpReason;
  xp: number;
  /** `today`: which of the day's bonus solves this was (1 … TODAY_BONUSES). */
  n?: number;
}

/** The first this-many solves of each day earn the daily bonus. */
export const TODAY_BONUSES = 10;

/** Position inside a level: `into` XP of `need` towards the next one. */
export interface XpLevel {
  level: number;
  into: number;
  need: number;
}

/** XP before and after a solve, for one game and for the whole profile. */
export interface XpOutcome {
  gains: XpGain[];
  total: number;
  game: { before: number; after: number };
  player: { before: number; after: number };
}

/** XP for one solve: a base that grows with difficulty, plus bonuses. */
export function xpGains(r: {
  d: Difficulty;
  m: number;
  ms: number;
  parMs: number;
  first: boolean;
  best: boolean;
  daily: boolean;
  /** First solve of this game today. */
  gameToday: boolean;
  /** How many puzzles were solved today, this one included. */
  today: number;
}): XpGain[] {
  const out: XpGain[] = [{ why: 'solve', xp: 5 + 5 * r.d }];
  if (r.m === 0) out.push({ why: 'flawless', xp: 5 });
  if (r.ms <= r.parMs) out.push({ why: 'par', xp: 5 });
  if (r.first) out.push({ why: 'first', xp: 10 });
  else if (r.best) out.push({ why: 'best', xp: 10 });
  if (r.daily) out.push({ why: 'daily', xp: 5 });
  if (r.gameToday) out.push({ why: 'gameToday', xp: 10 });
  if (r.today <= TODAY_BONUSES) out.push({ why: 'today', xp: 5, n: r.today });
  return out;
}

/** Game and player levels share one curve: level 1 needs 100 XP, then 150, 200, … */
export function xpLevel(xp: number): XpLevel {
  let level = 1;
  let need = 100;
  while (xp >= need) {
    xp -= need;
    level++;
    need += 50;
  }
  return { level, into: xp, need };
}
