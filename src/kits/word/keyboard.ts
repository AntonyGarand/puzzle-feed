import { L } from '../../core/i18n';
import { h } from '../../ui/dom';
import { letterKey } from './lexicon';
import './keyboard.css';

export type KeyState = 'hit' | 'near' | 'out';
const RANK: Record<KeyState, number> = { out: 1, near: 2, hit: 3 };
export const better = (a: KeyState | undefined, b: KeyState) => (!a || RANK[b] > RANK[a] ? b : a);

// QWERTY in both languages: Québec keyboards (CSA / Canadian French) keep the QWERTY letter rows.
// No accent keys: French words are played without diacritics.
const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

/** On-screen QWERTY keyboard (rows of shared `.key` buttons). Emits a letter, 'enter' or 'back'. */
export function keyboard(onKey: (k: string) => void, enterLabel = L('Enter', 'Entrée')) {
  const keys = new Map<string, HTMLButtonElement>();
  const names: Record<string, string> = { enter: L('Enter', 'Entrée'), back: L('Delete', 'Effacer') };
  const key = (label: string, value: string, cls = '') => {
    const b = h(
      'button',
      { type: 'button', class: `key ${cls}`.trim(), 'aria-label': names[value] ?? value, onclick: () => onKey(value) },
      label,
    );
    if (value.length === 1) keys.set(value, b);
    return b;
  };
  const el = h(
    'div',
    { class: 'kb' },
    ...ROWS.map((row, r) =>
      h(
        'div',
        { class: 'kb-row' },
        ...[...row].map((c) => key(c, c)),
        // Right-hand edge, as on a phone: erase closes the middle row, a wide Enter closes the bottom one.
        r === 1 ? key('⌫', 'back', 'back') : null,
        r === 2 ? key(enterLabel, 'enter', 'wide') : null,
      ),
    ),
  );
  return {
    el,
    /** Colour keys by their best-known state. */
    paint(states: Map<string, KeyState>) {
      for (const [c, b] of keys) {
        const st = states.get(c);
        b.classList.toggle('k-hit', st === 'hit');
        b.classList.toggle('k-near', st === 'near');
        b.classList.toggle('k-out', st === 'out');
      }
    },
  };
}

/** Map a physical key event to a keyboard value, or null. Accented letters fold to a–z (é → e). */
export function keyValue(e: KeyboardEvent): string | null {
  if (e.key === 'Enter') return 'enter';
  if (e.key === 'Backspace') return 'back';
  return letterKey(e.key);
}
