import { L } from '../../core/i18n';
import { LEVEL_NAMES, type Difficulty, type PuzzleDef } from '../../core/types';
import { btn, h } from '../../ui/dom';
import { shareSection } from '../../ui/share';
import { noticeSheet, openSheet } from '../../ui/sheet';
import type { Outcome } from './result';

/** Sheet with a puzzle's share code and link. */
export function openCodeSheet(def: PuzzleDef, level: Difficulty, code: string, onClose: () => void) {
  openSheet({
    title: L('Share this puzzle', 'Partager cette partie'),
    puzzle: def.id,
    className: 'share-sheet',
    body: [
      h(
        'p',
        { class: 'muted small' },
        `${def.name} · ${LEVEL_NAMES[level]}. `,
        L(
          'Send the code or the link: the other person gets the same puzzle at the same level.',
          'Envoyez le code ou le lien : l’autre personne obtient la même partie, au même niveau.',
        ),
      ),
      shareSection(code, def.name),
    ],
    onClose,
  });
}

/** The finished card's Share button: a solve shares its picture; Labs also shares an unsolved puzzle's code. */
export function shareButton(o: Outcome, lab: boolean, picture: () => void, code: () => void): HTMLButtonElement | null {
  if (o === 'solved') return btn(L('Share', 'Partager'), picture, 'ghost');
  return lab ? btn(L('Share', 'Partager'), code, 'ghost') : null;
}

/** The share picture couldn't load: offline before the service worker finished its first install. */
export const shareOffline = () =>
  noticeSheet(
    L('Can’t share right now', 'Impossible de partager pour l’instant'),
    L(
      'Connect to the internet once so the app can download it.',
      'Connectez-vous à Internet une fois pour que l’appli puisse le télécharger.',
    ),
  );
