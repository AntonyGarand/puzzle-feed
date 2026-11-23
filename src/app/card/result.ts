import { L, P } from '../../core/i18n';
import { getProfile, stats, type RecordOutcome } from '../../core/store';
import { LEVEL_NAMES, type Difficulty, type PuzzleDef } from '../../core/types';
import { xpLevel } from '../../core/xp';
import { confetti } from '../../ui/confetti';
import { h } from '../../ui/dom';
import { lostCard, winCard } from '../../ui/win';

export type Outcome = 'solved' | 'failed' | 'skipped';

/** A level change to announce: up or down, and the new level's name. */
export interface LevelUp {
  up: boolean;
  to: string;
}

/**
 * Confetti for a solve worth celebrating, not every one: a first clear, a new best, a level up
 * (puzzle difficulty, game or player XP level), or a standout bonus (the day's first solve of this
 * game, a daily challenge).
 */
export function celebrate(res: RecordOutcome): boolean {
  if (res.best || res.prevBest == null) return true;
  if (res.levelChange && res.levelChange.to > res.levelChange.from) return true;
  const xp = res.xp;
  if (!xp) return false;
  if (xpLevel(xp.game.after).level > xpLevel(xp.game.before).level) return true;
  if (xpLevel(xp.player.after).level > xpLevel(xp.player.before).level) return true;
  return xp.gains.some((g) => g.why === 'gameToday' || g.why === 'daily');
}

/** Confetti over the board, bigger for a new best. */
export function confettiOver(stage: HTMLElement, res: RecordOutcome) {
  const r = stage.getBoundingClientRect();
  if (r.height) confetti(r.left + r.width / 2, r.top + r.height / 2, res.best ? 90 : 50);
}

/** The footer status line of a finished puzzle: outcome, and for a loss the mistakes and hints. */
export function resultLine(o: Outcome, mistakes: number, hints: number, levelUp: LevelUp | undefined): HTMLElement {
  const parts: (string | HTMLElement)[] = [];
  if (o === 'solved') parts.push(h('strong', { class: 'good' }, L('Solved', 'Réussi')));
  else if (o === 'failed') parts.push(h('strong', { class: 'bad' }, L('Not this time', 'Pas cette fois')));
  else parts.push(h('strong', null, L('Skipped', 'Passé')));
  if (mistakes && o === 'failed') parts.push(` · ${P(mistakes, ['mistake', 'mistakes'], ['erreur', 'erreurs'])}`);
  if (hints && o === 'failed') parts.push(` · ${P(hints, ['hint', 'hints'], ['indice', 'indices'])}`);
  // Solves and losses announce a level change on their panel; a skip has no panel, so it goes here.
  if (o === 'skipped' && levelUp)
    parts.push(
      h(
        'span',
        { class: 'lvl-change' },
        ` · ${levelUp.up ? L('Level up', 'Niveau supérieur') : L('Easing off', 'On ralentit')} → ${levelUp.to}`,
      ),
    );
  return h('span', { class: 'status result' }, ...parts);
}

/**
 * Tap the result panel to peek at the finished board (tap again to bring it back); `onPeek` runs on
 * every tap (the card stops auto-advance). Only taps that start on the panel count: on touch screens,
 * the tap that ended the puzzle fires its `click` after the panel is added, hit-tested onto it, which
 * would hide the panel straight away.
 */
export function makePeekable(panel: HTMLElement, onPeek: () => void) {
  let pressed = false;
  panel.addEventListener('pointerdown', () => (pressed = true));
  panel.addEventListener('click', () => {
    if (!pressed) return;
    pressed = false;
    panel.classList.toggle('peek');
    onPeek();
  });
}

/** The win or loss panel over the board (a skip has none). `res` is null when the outcome isn't known. */
export function resultPanel(
  o: Outcome,
  def: PuzzleDef,
  level: Difficulty,
  run: {
    daily: boolean;
    ms: number;
    mistakes: number;
    hints: number;
    res: RecordOutcome | null;
    levelUp: LevelUp | undefined;
    advanceMs: number | undefined;
  },
): HTMLElement | null {
  const common = {
    name: def.name,
    level: LEVEL_NAMES[level],
    daily: run.daily,
    ms: run.ms,
    mistakes: run.mistakes,
    hints: run.hints,
    levelUp: run.levelUp,
    zen: !!getProfile().zen,
  };
  const st = stats(def.id);
  if (o === 'solved')
    return winCard({ ...common, parMs: def.par(level) * 1000, solved: st.solved, res: run.res, advanceMs: run.advanceMs });
  if (o === 'failed') return lostCard({ ...common, best: st.best[level], played: st.solved + st.failed, solved: st.solved });
  return null;
}
