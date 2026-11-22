import { getProfile, prefs, resetAllToAuto, setLevel, setWeight, update, type Theme, type Weight } from '../core/store';
import { LEVELS, LEVEL_NAMES, type Difficulty, type PuzzleDef } from '../core/types';
import { btn, h } from '../core/ui';
import { CATEGORIES } from '../core/categories';
import { L, LOCALES, locale, setLocale, type Locale } from '../core/i18n';
import { analyticsEnabled, setAnalyticsEnabled } from '../core/analytics';

function segmented<T extends string | number>(options: { label: string; value: T }[], current: T, onpick: (v: T) => void) {
  const el = h('div', { class: 'seg', role: 'radiogroup' });
  const draw = (cur: T) =>
    el.replaceChildren(
      ...options.map((o) =>
        h(
          'button',
          {
            type: 'button',
            role: 'radio',
            'aria-checked': String(o.value === cur),
            class: o.value === cur ? 'on' : '',
            onclick: () => {
              onpick(o.value);
              draw(o.value);
            },
          },
          o.label,
        ),
      ),
    );
  draw(current);
  return el;
}

export function renderSettings(el: HTMLElement, defs: PuzzleDef[]) {
  const p = getProfile();

  const levelSelect = (id: string) => {
    const pr = prefs(id);
    const sel = h(
      'select',
      { class: 'select' },
      h('option', { value: 'auto' }, pr.manual ? 'Auto' : `Auto · ${LEVEL_NAMES[pr.level]}`),
      ...LEVELS.map((l) => h('option', { value: String(l) }, LEVEL_NAMES[l])),
    );
    sel.value = pr.manual ? String(pr.level) : 'auto';
    sel.addEventListener('change', () => {
      setLevel(id, sel.value === 'auto' ? 'auto' : (Number(sel.value) as Difficulty));
      renderSettings(el, defs);
    });
    return sel;
  };

  const weights: { label: string; value: Weight }[] = [
    { label: L('Off', 'Jamais'), value: 0 },
    { label: L('Less', 'Moins'), value: 1 },
    { label: L('Normal', 'Normal'), value: 2 },
    { label: L('More', 'Plus'), value: 3 },
  ];

  const prefRow = (d: PuzzleDef) =>
    h(
      'div',
      { class: `setting puzzle-pref ${prefs(d.id).weight === 0 ? 'off' : ''}`, 'data-puzzle': d.id },
      h(
        'div',
        null,
        h(
          'a',
          { class: 'name', href: `#/game/${d.id}`, title: `${L('Open', 'Ouvrir')} ${d.name}` },
          h('span', { class: 'swatchlet' }),
          d.name,
          h('span', { class: 'play-link' }, L('play →', 'jouer →')),
        ),
        h('div', { class: 'muted small' }, d.rules),
      ),
      h(
        'div',
        { class: 'row' },
        segmented(weights, prefs(d.id).weight, (v) => {
          setWeight(d.id, v);
          renderSettings(el, defs);
        }),
        levelSelect(d.id),
      ),
    );

  el.replaceChildren(
    h(
      'div',
      { class: 'page' },
      h('h1', null, L('Settings', 'Réglages')),
      h(
        'div',
        { class: 'setting' },
        h(
          'div',
          null,
          h('div', null, L('Language', 'Langue')),
          h('div', { class: 'muted small' }, L('Interface and word games.', 'Interface et jeux de mots.')),
        ),
        segmented<Locale>(
          LOCALES.map((l) => ({ label: l.name, value: l.id })),
          locale(),
          (v) => setLocale(v),
        ),
      ),
      h(
        'div',
        { class: 'setting' },
        h('div', null, h('div', null, L('Theme', 'Thème'))),
        segmented<Theme>(
          [
            { label: L('System', 'Système'), value: 'system' },
            { label: L('Light', 'Clair'), value: 'light' },
            { label: L('Dark', 'Sombre'), value: 'dark' },
          ],
          p.theme,
          (v) => update({ theme: v }),
        ),
      ),
      h(
        'div',
        { class: 'setting' },
        h(
          'div',
          null,
          h('div', null, L('Auto-advance', 'Avance automatique')),
          h('div', { class: 'muted small' }, L('Scroll to the next puzzle after a solve.', 'Passer au jeu suivant après une réussite.')),
        ),
        segmented(
          [
            { label: L('On', 'Oui'), value: 1 },
            { label: L('Off', 'Non'), value: 0 },
          ],
          p.autoAdvance ? 1 : 0,
          (v) => update({ autoAdvance: v === 1 }),
        ),
      ),
      h(
        'div',
        { class: 'setting' },
        h(
          'div',
          null,
          h('div', null, L('Starting level', 'Niveau de départ')),
          h('div', { class: 'muted small' }, L('For games you have not played yet.', 'Pour les jeux pas encore joués.')),
        ),
        segmented(
          LEVELS.map((l) => ({ label: LEVEL_NAMES[l], value: l })),
          p.startLevel,
          (v) => update({ startLevel: v }),
        ),
      ),
      h('h3', null, L('Games', 'Jeux')),
      h(
        'p',
        { class: 'muted small' },
        L(
          'Auto raises the level when you solve quickly and cleanly, and eases off after misses. Picking a level yourself locks it.',
          'Le mode Auto monte le niveau quand vous résolvez vite et sans faute, et le baisse après des échecs. Choisir un niveau vous-même le fixe.',
        ),
      ),
      ...CATEGORIES.map((c) => ({ c, games: defs.filter((d) => d.category === c.id) }))
        .filter((x) => x.games.length)
        .map(({ c, games }) => {
          const allOff = games.every((d) => prefs(d.id).weight === 0);
          return h(
            'section',
            { class: 'pref-cat' },
            h(
              'div',
              { class: 'pref-cat-head' },
              h('h4', null, c.name, h('span', { class: 'muted small' }, ` · ${games.length}`)),
              btn(
                allOff ? L('Turn all on', 'Tout activer') : L('Turn all off', 'Tout désactiver'),
                () => {
                  games.forEach((d) => setWeight(d.id, allOff ? 2 : 0));
                  renderSettings(el, defs);
                },
                'ghost',
              ),
            ),
            h('div', { class: 'puzzle-prefs' }, ...games.map(prefRow)),
          );
        }),
      h(
        'div',
        { class: 'row' },
        btn(
          L('All on', 'Tout activer'),
          () => {
            defs.forEach((d) => prefs(d.id).weight === 0 && setWeight(d.id, 2));
            renderSettings(el, defs);
          },
          'ghost',
        ),
        btn(
          L('All levels to auto', 'Tous les niveaux en Auto'),
          () => {
            resetAllToAuto();
            renderSettings(el, defs);
          },
          'ghost',
        ),
      ),
      h(
        'div',
        { class: 'setting' },
        h(
          'div',
          null,
          h('div', null, L('Anonymous stats', 'Statistiques anonymes')),
          h(
            'div',
            { class: 'muted small' },
            L(
              'Shares play stats (game, level, time, result) and page visits to help tune the puzzles. Your name never leaves this device.',
              'Partage des statistiques de jeu (jeu, niveau, temps, résultat) et les pages visitées pour ajuster les casse-têtes. Votre nom ne quitte jamais cet appareil.',
            ),
          ),
        ),
        segmented(
          [
            { label: L('On', 'Oui'), value: 1 },
            { label: L('Off', 'Non'), value: 0 },
          ],
          analyticsEnabled() ? 1 : 0,
          (v) => setAnalyticsEnabled(v === 1),
        ),
      ),
      h('p', { class: 'muted small app-version' }, `puzzle feed · ${__APP_VERSION__}`),
    ),
  );
}
