import { L } from '../../core/i18n';
import type { Hint } from '../../core/types';
import { btn, bulbIcon, h, s as svg } from '../../ui/dom';
import { drawHint } from '../../ui/hint-overlay';

/** What the hint popup needs from its card. */
export interface HintHost {
  /** The card element (the bubble sits over its footer) and its stage (the board overlay goes there). */
  card: HTMLElement;
  stage: HTMLElement;
  /** A hint can be shown now (the puzzle is mounted and not finished). */
  canShow: () => boolean;
  /** What's wrong (`check()`), else the next step (`hint()`), else null. */
  ask: () => Hint | null;
  /** A hint was shown: count it. */
  onShown: (hint: Hint) => void;
  /** The player let the hint make its move. */
  onPlayed: () => void;
}

/**
 * In-game hint: first what's wrong with the position (`check()`), otherwise the next step (`hint()`).
 * The clue and the move are outlined on the live board; a bubble over the footer explains it and
 * offers to make the move (or undo the mistake).
 */
export class HintPopup {
  readonly button: HTMLButtonElement;
  private ui: { el: HTMLElement; layer: SVGSVGElement; hint: Hint | null } | null = null;

  constructor(private readonly host: HintHost) {
    this.button = h(
      'button',
      { type: 'button', class: 'icon-btn hint-btn', 'data-action': 'hint', title: L('Hint', 'Indice'), 'aria-label': L('Hint', 'Indice') },
      bulbIcon(),
    );
    this.button.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.ui) this.close();
      else this.show();
    });
  }

  show() {
    if (!this.host.canShow()) return;
    this.close();
    const hint = this.host.ask();
    if (hint) this.host.onShown(hint);
    const layer = svg('svg', { class: 'guide-layer hint-layer', 'aria-hidden': 'true' });
    const kind = hint?.kind ?? 'step';
    const action =
      hint?.action ?? (kind === 'fix' ? L('Fix it', 'Corriger') : kind === 'stuck' ? L('Undo', 'Annuler') : L('Play it', 'Jouer le coup'));
    const el = h(
      'div',
      { class: `hint-pop ${kind}`, role: 'status', 'aria-live': 'polite' },
      h(
        'p',
        null,
        hint
          ? hint.text
          : L('No hint here: nothing sure to suggest from this position.', 'Pas d’indice ici : rien de sûr à suggérer pour le moment.'),
      ),
      h(
        'div',
        { class: 'hint-actions' },
        hint ? btn(action, () => this.play(), 'primary') : null,
        btn('✕', () => this.close(), 'ghost'),
      ),
    );
    this.host.stage.append(layer);
    this.host.card.append(el);
    this.button.classList.add('on');
    this.ui = { el, layer, hint };
    requestAnimationFrame(() => this.draw());
  }

  /** Redraw the board overlay (after a resize). */
  draw() {
    if (this.ui) drawHint(this.ui.layer, this.host.stage, this.ui.hint);
  }

  close() {
    const ui = this.ui;
    if (!ui) return;
    this.ui = null;
    ui.el.remove();
    ui.layer.remove();
    this.button.classList.remove('on');
  }

  private play() {
    const hint = this.ui?.hint;
    this.close();
    if (!hint || !this.host.canShow()) return;
    try {
      hint.play();
    } catch (err) {
      console.error(err);
    }
    this.host.onPlayed();
  }
}
