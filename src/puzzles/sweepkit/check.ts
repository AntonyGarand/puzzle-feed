// Hint-button check for minesweeper-style games: a flag on a tile that holds no mine.
import { L } from '../../core/i18n';
import type { Hint } from '../../core/types';

export interface FlagBoard {
  /** Flagged tiles. */
  flag: boolean[];
  mine: boolean[];
  /** Is tile `i` an open (mown) number? */
  open(i: number): boolean;
  count: number[];
  /** Tiles each clue counts. */
  nbs: number[][];
  /** Known mines a clue counts besides flags (exploded tiles in mow). */
  known?(i: number): boolean;
  cells: Element[];
  /** Clue label, e.g. "2" or "2 (cross)". */
  name(i: number): string;
  /** Remove the flag the way a long-press does. */
  unflag(i: number): void;
}

/**
 * A wrong flag: first one that makes an open number count too many mines (a visible broken rule),
 * else any flag on a safe tile (the game knows the layout, so it can say it leads nowhere).
 */
export function wrongFlag(b: FlagBoard): Hint | null {
  const { flag, mine, count, nbs, cells } = b;
  const fix = (i: number, text: string, why: number[]): Hint => ({
    kind: 'fix',
    text,
    why: why.map((j) => cells[j]),
    at: [cells[i]],
    action: L('Remove the flag', 'Retirer le drapeau'),
    play: () => {
      if (flag[i]) b.unflag(i);
    },
  });
  for (let c = 0; c < count.length; c++) {
    if (!b.open(c) || !count[c]) continue;
    const marked = nbs[c].filter((j) => flag[j] || b.known?.(j));
    if (marked.length <= count[c]) continue;
    const i = marked.find((j) => flag[j] && !mine[j]);
    if (i == null) continue;
    const k = marked.length;
    return fix(
      i,
      L(
        `This ${b.name(c)} counts only ${count[c] === 1 ? 'one mine' : `${count[c]} mines`}, but ${k} of its tiles are flagged. This flag is one of the wrong ones.`,
        `Ce ${b.name(c)} ne compte que ${count[c] === 1 ? 'une mine' : `${count[c]} mines`}, mais ${k} de ses cases ont un drapeau. Celui-ci est en trop.`,
      ),
      [c],
    );
  }
  const i = flag.findIndex((f, j) => f && !mine[j]);
  if (i < 0) return null;
  return fix(
    i,
    L(
      'This flag breaks no number yet, but there is no mine under it: it leads to a dead end. Remove it.',
      'Ce drapeau ne contredit encore aucun chiffre, mais il n’y a pas de mine dessous : il mène à une impasse. Retirez-le.',
    ),
    [],
  );
}
