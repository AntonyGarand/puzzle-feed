import { L, P } from '../../core/i18n';
import type { RecordOutcome } from '../../core/store';
import { xpLevel } from '../../core/xp';
import { confetti } from '../../ui/confetti';
import { h } from '../../ui/dom';

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
