import { Rng } from '../../src/core/rng';
import type { Difficulty, PuzzleCtx, PuzzleDef, PuzzleInstance } from '../../src/core/types';
import { PUZZLES } from '../../src/games';

/** What a game reported through its ctx: `reached` is a solve that keeps playing (endless games). */
type GameEvent = 'solved' | 'reached' | 'failed' | 'mistake';

export interface PlayOptions {
  /** Progress to resume from, as returned by `snapshot()`. */
  saved?: unknown;
  /** Attach the board to `document.body` (needed for focus, layout and `closest()` lookups). */
  attach?: boolean;
  /** Append the footer controls to the board, so they can be found and clicked like the real card. */
  controlsInRoot?: boolean;
}

export interface Played {
  def: PuzzleDef;
  root: HTMLElement;
  inst: PuzzleInstance;
  /** Every ctx callback, in order. */
  events: GameEvent[];
  /** The first final result: '' while still playing. A `reached` solve counts as solved. */
  outcome: '' | 'solved' | 'failed';
  /** How many times the game called `ctx.touch()` (every player action should). */
  touches: number;
  /** Last text passed to `ctx.status()`. */
  status: string;
  /** Last controls passed to `ctx.controls()`. */
  controls: HTMLElement[];
}

/** The registered puzzle with this id; throws on a typo instead of failing later on `undefined`. */
export function puzzle(id: string): PuzzleDef {
  const def = PUZZLES.find((p) => p.id === id);
  if (!def) throw new Error(`no puzzle "${id}"`);
  return def;
}

/** Mount a game the way a card does, with a ctx that records everything the game reports. */
export function mountGame(game: PuzzleDef | string, difficulty: Difficulty, seed: number, opts: PlayOptions = {}): Played {
  const def = typeof game === 'string' ? puzzle(game) : game;
  const root = document.createElement('div');
  if (opts.attach) document.body.append(root);
  const g: Played = { def, root, inst: {}, events: [], outcome: '', touches: 0, status: '', controls: [] };
  const ctx: PuzzleCtx = {
    difficulty,
    rng: new Rng(seed),
    root,
    saved: opts.saved,
    solved: (o) => {
      g.events.push(o?.keepPlaying ? 'reached' : 'solved');
      g.outcome ||= 'solved';
    },
    failed: () => {
      g.events.push('failed');
      g.outcome ||= 'failed';
    },
    mistake: () => g.events.push('mistake'),
    touch: () => void g.touches++,
    status: (text) => (g.status = text),
    lives: () => {},
    controls: (...els) => {
      g.controls = els;
      if (opts.controlsInRoot) root.append(...els);
    },
  };
  g.inst = def.create(ctx) || {};
  return g;
}

/** Classes of short-lived feedback (a mistake shake), not board state. */
const TRANSIENT = new Set(['shake']);

/** Inline style without animation timing, which depends on the last move rather than the position. */
const stableStyle = (style: string) =>
  style
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d && !d.startsWith('transition'))
    .join(';');

/** A clue tally pill keeps its last number while hidden (so it fades out with it): not visible state. */
const hiddenTally = (e: Element) => e.classList.contains('cc-have') && !e.parentElement?.classList.contains('counting');

function attrText(e: Element, a: Attr): string {
  if (a.name === 'class') return `class=${[...e.classList].filter((c) => !TRANSIENT.has(c)).join(' ')}`;
  if (a.name === 'style') return `style=${stableStyle(a.value)}`;
  return `${a.name}=${a.value}`;
}

/**
 * What a player sees of the board, one line per element: tag, attributes (classes, inline styles, SVG
 * geometry, data-* and aria-*) and its own text. Input pads are left out: their mode (notes on, an operator
 * picked) is a control setting, not part of the position. Two boards with the same view look the same.
 */
export function boardView(root: HTMLElement): string {
  return [...root.querySelectorAll('*')]
    .filter((e) => !e.closest('.pad'))
    .map((e) => {
      const attrs = [...e.attributes].map((a) => attrText(e, a)).join(' ');
      const text = hiddenTally(e)
        ? ''
        : [...e.childNodes]
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => n.textContent)
            .join('');
      return `<${e.tagName.toLowerCase()} ${attrs}>${text}`;
    })
    .join('\n');
}
