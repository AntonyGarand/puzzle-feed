import type { CategoryId } from './categories';
import { L } from './i18n';
import type { Rng } from './rng';

export type Difficulty = 1 | 2 | 3 | 4 | 5;
export const LEVELS: Difficulty[] = [1, 2, 3, 4, 5];
export const LEVEL_NAMES: Record<Difficulty, string> = {
  get 1() {
    return L('Easy', 'Facile');
  },
  get 2() {
    return L('Medium', 'Moyen');
  },
  get 3() {
    return L('Hard', 'Difficile');
  },
  get 4() {
    return L('Expert', 'Expert');
  },
  get 5() {
    return L('Master', 'Maître');
  },
};
/** Stable English level ids for telemetry (LEVEL_NAMES is localized). */
export const LEVEL_IDS: Record<Difficulty, string> = { 1: 'easy', 2: 'medium', 3: 'hard', 4: 'expert', 5: 'master' };

/**
 * How-to-play content shown behind the card's "?" button. Write it with L(en, fr).
 * @public
 */
export interface Help {
  /** One or two sentences: what you're trying to achieve. */
  goal: string;
  /** Numbered steps: how to play and the controls (tap, drag, keys). */
  steps: string[];
  /** Optional strategy hints. */
  tips?: string[];
}

/**
 * One step of logic, shown by the animated guide behind the "?" button: the guide outlines `why`,
 * draws an arrow to `at`, shows `text`, then calls `play()` to make the move on the real board.
 * @public
 */
export interface Hint {
  /** What to notice and what it lets you do (one or two short sentences, via L()). */
  text: string;
  /** Elements that justify the move (clues, numbers, neighbours). Outlined. */
  why?: Element[];
  /** Where the move happens. Ringed; the arrow points here. */
  at: Element[];
  /** Make the move exactly as a player would (same code path as a tap). */
  play(): void;
  /**
   * What the hint is about (default `step`):
   * - `step`: the next logical move.
   * - `fix`: a mistake already on the board (a wrong entry, a broken rule). `play()` undoes it.
   * - `stuck`: a dead end, no solution is reachable from here (boxed in, out of moves). `play()`
   *   backs out of it (an undo, or a restart when there's no undo).
   */
  kind?: 'step' | 'fix' | 'stuck';
  /** Label of the button that calls `play()` in the in-game hint bubble (default per kind). Use L(). */
  action?: string;
}

export interface PuzzleCtx {
  difficulty: Difficulty;
  rng: Rng;
  /** Puzzle content goes here. */
  root: HTMLElement;
  /**
   * Call once when the puzzle is completed. Endless games can pass `keepPlaying` when the goal is
   * reached: the solve (and its time) is recorded right away, but the board stays playable. Call
   * `solved()` again when the run ends to close the card without recording a second result.
   */
  solved(opts?: { keepPlaying?: boolean }): void;
  /** Call once when the puzzle can no longer be completed (out of moves/lives). */
  failed(): void;
  /** Count a wrong move. */
  mistake(): void;
  /** Mark that the player has started interacting. */
  touch(): void;
  /**
   * Lives left, shown as hearts in the card header (next to the mistakes counter). Call it on every
   * render for games with a fixed number of lives; never call it otherwise. Losing a life is a mistake
   * too: call `mistake()` as well.
   */
  lives(left: number, max: number): void;
  /** Short status line shown in the card footer. */
  status(text: string): void;
  /** Extra buttons shown in the card footer. */
  controls(...els: HTMLElement[]): void;
  /** State previously returned by `snapshot()` when resuming; same seed, so generation matches. */
  saved?: unknown;
}

export interface PuzzleInstance {
  /** Card became the visible one. Called on every activation. */
  activate?(): void;
  /** Keyboard input while this card is active. Return true if handled. */
  onKey?(e: KeyboardEvent): boolean;
  /**
   * The next logical move from the current state, explained; null when there's nothing left to show.
   * Powers the step-by-step guide, so prefer moves a person can deduce (not just "the answer is X").
   */
  hint?(): Hint | null;
  /**
   * What's wrong with the current position, explained; null when the board is still on track.
   * Return a `fix` hint for a mistake (a wrong entry, a broken rule: say which rule when it's visible,
   * otherwise "this leads to a dead end") or a `stuck` hint when no solution is reachable any more.
   * The in-game hint button asks `check()` first and only then `hint()`, so `hint()` may assume
   * the board holds no mistake. Must be fast (well under 100 ms) and never change the board.
   */
  check?(): Hint | null;
  /** Serializable progress, restored through `ctx.saved`. */
  snapshot?(): unknown;
  destroy?(): void;
}

export interface PuzzleDef {
  id: string;
  name: string;
  /** One short line shown under the title. */
  rules: string;
  category: CategoryId;
  /** Tutorial (localised via L()). */
  help?: () => Help;
  /** Content depends on the locale (word games): saves from another locale aren't resumed. */
  localized?: boolean;
  /** Starts switched off in the mixed feed (the player can turn it on); still playable from its own page. */
  offByDefault?: boolean;
  /**
   * Show the card's Undo button (and Ctrl/Cmd+Z): it steps back through `snapshot()` states by
   * re-creating the game from an earlier one, so restoring from `ctx.saved` must be exact. Only for
   * games where taking a move back reveals nothing (no hidden info, lives, random spawns or scores),
   * and that don't already have their own Undo. Top-level `sel`/`cur` (selection, cursor) are not
   * undo steps: moving them alone adds no entry, and undo keeps the current ones.
   */
  undo?: boolean;
  /** Target solve time in seconds at a given difficulty; used for auto-levelling. */
  par: (d: Difficulty) => number;
  create(ctx: PuzzleCtx): PuzzleInstance | void;
}

/** Pick per-difficulty value from a 5-tuple. */
export const byLevel = <T>(d: Difficulty, values: readonly [T, T, T, T, T]): T => values[d - 1];
