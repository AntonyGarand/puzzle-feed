import type { DailyEntry } from './store';
import { LEVEL_NAMES, type Difficulty } from './types';

/** One square per puzzle: solved clean, solved with mistakes, not solved yet, not played. */
export function dailySquare(e: DailyEntry): string {
  if (e.o === 'solved') return e.m ? '🟨' : '🟩';
  return e.o === 'failed' ? '🟥' : '⬜';
}

/**
 * Spoiler-free text to share a daily list's results: no game names, one square per puzzle, the solve
 * count and total time, and a link to the same list.
 */
export function dailyShareText(
  list: DailyEntry[],
  o: {
    level: Difficulty;
    /** The date, already formatted for the reader's locale. */
    date: string;
    /** Site origin for the link, e.g. `https://puzzle.garand.dev`. */
    origin: string;
    fmtTime: (ms: number) => string;
  },
): string {
  const solved = list.filter((e) => e.o === 'solved');
  const total = solved.reduce((a, e) => a + (e.ms ?? 0), 0);
  const score = [`${list.map(dailySquare).join('')} ${solved.length}/${list.length}`];
  if (solved.length) score.push(o.fmtTime(total));
  return [`Puzzle Feed · ${o.date} · ${LEVEL_NAMES[o.level]}`, score.join(' · '), `${o.origin}/daily/${o.level}`].join('\n');
}
