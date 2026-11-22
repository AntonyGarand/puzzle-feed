import { L } from '../../core/i18n';
import { prefs, setLevel, setWeight, type Weight } from '../../core/store';
import { LEVEL_NAMES, LEVELS, type Difficulty, type PuzzleDef } from '../../core/types';
import { btn, h } from '../../ui/dom';
import { shareSection } from '../../ui/share';
import { openSheet } from '../../ui/sheet';

/** What the cog sheet needs from its card. */
export interface SettingsHost {
  def: PuzzleDef;
  /** Level being played. */
  level: Difficulty;
  /** The puzzle is over (no Skip / Give up). */
  done: boolean;
  /** Labs: fixed levels, no feed settings, "Give up" instead of "Skip". */
  lab: boolean;
  /** Daily challenge: no level picker, no "New puzzle". */
  daily: boolean;
  /** Share code of the current puzzle. */
  code: string;
  /** Pause the clock while the sheet is open; returns the resume function. */
  pause: () => () => void;
  /** A level was picked. */
  pickLevel: (level: Difficulty) => void;
  /** Skip (feed) or give up (Labs). */
  giveUp: () => void;
  newPuzzle: () => void;
}

/** One-of-n buttons; `onpick` gets the picked value. */
function segmented<T>(name: string, items: { label: string; value: T }[], cur: T, onpick: (v: T) => void): HTMLElement {
  return h(
    'div',
    { class: 'seg wrap', role: 'radiogroup', 'data-setting': name },
    ...items.map((o) =>
      h(
        'button',
        {
          type: 'button',
          role: 'radio',
          'data-value': String(o.value),
          'aria-checked': String(o.value === cur),
          class: o.value === cur ? 'on' : '',
          onclick: () => onpick(o.value),
        },
        o.label,
      ),
    ),
  );
}

/** Mark the picked button of a segmented control (when picking doesn't close the sheet). */
function markPicked<T>(seg: HTMLElement, items: { value: T }[], v: T) {
  seg.querySelectorAll('button').forEach((b, i) => {
    b.classList.toggle('on', items[i].value === v);
    b.setAttribute('aria-checked', String(items[i].value === v));
  });
}

/** The cog sheet: difficulty, auto-levelling, how often this game shows up in the feed, share, skip, new puzzle. */
export function openGameSettings(host: SettingsHost) {
  const { def, level, lab, daily } = host;
  const resume = host.pause();
  const p = prefs(def.id);
  let close = () => {};
  // The picker always shows the level being played; Auto is a separate switch (feed only).
  const levels = LEVELS.map((l) => ({ label: LEVEL_NAMES[l], value: l }));
  const weights: { label: string; value: Weight }[] = [
    { label: L('Off', 'Jamais'), value: 0 },
    { label: L('Less', 'Moins'), value: 1 },
    { label: L('Normal', 'Normal'), value: 2 },
    { label: L('More', 'Plus'), value: 3 },
  ];
  const freq = segmented('weight', weights, p.weight, (v) => {
    setWeight(def.id, v);
    markPicked(freq, weights, v);
  });
  const autoOpts = [
    { label: L('Off', 'Non'), value: 0 },
    { label: L('On', 'Oui'), value: 1 },
  ];
  const auto = segmented('auto', autoOpts, p.manual ? 0 : 1, (v) => {
    // The level stays where it is: On lets auto-levelling move it from here, Off locks it.
    setLevel(def.id, v ? 'auto' : level);
    markPicked(auto, autoOpts, v);
  });
  const showAuto = !daily && !lab;
  close = openSheet({
    title: def.name,
    puzzle: def.id,
    className: 'game-settings',
    body: [
      daily ? null : h('h3', null, L('Difficulty', 'Difficulté')),
      daily
        ? null
        : segmented('level', levels, level, (v) => {
            close();
            host.pickLevel(v);
          }),
      showAuto ? h('h3', null, L('Auto-level', 'Niveau auto')) : null,
      showAuto
        ? h(
            'p',
            { class: 'muted small auto-hint' },
            L('Raises the level when you solve quickly and cleanly.', 'Monte le niveau quand vous résolvez vite et sans faute.'),
          )
        : null,
      showAuto ? auto : null,
      lab ? null : h('h3', null, L('In the feed', 'Dans le fil')),
      lab ? null : freq,
      h('h3', null, L('Share this puzzle', 'Partager cette partie')),
      shareSection(host.code, def.name),
    ],
    footer: [
      h('a', { class: 'btn ghost', href: '/settings', onclick: () => close() }, L('All settings', 'Tous les réglages')),
      host.done
        ? null
        : btn(lab ? L('Give up', 'Abandonner') : L('Skip', 'Passer'), () => {
            close();
            host.giveUp();
          }),
      daily
        ? null
        : btn(
            L('New puzzle', 'Nouvelle partie'),
            () => {
              close();
              host.newPuzzle();
            },
            'primary',
          ),
    ],
    onClose: resume,
  });
}
