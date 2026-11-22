import { getProfile, prefs, resetAllToAuto, setWeight, update, type Style, type Theme } from '../core/store';
import { LEVELS, LEVEL_NAMES, type PuzzleDef } from '../core/types';
import { h, segmented } from '../ui/dom';
import { L, LOCALES, P, locale, setLocale, type Locale } from '../core/i18n';
import { analyticsEnabled, setAnalyticsEnabled } from '../core/analytics';

export function renderSettings(el: HTMLElement, defs: PuzzleDef[]) {
  const p = getProfile();
  const off = defs.filter((d) => prefs(d.id).weight === 0).length;
  const fixed = defs.filter((d) => prefs(d.id).manual).length;
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
        h(
          'div',
          null,
          h('div', null, L('Theme', 'Thème')),
          h(
            'div',
            { class: 'muted small' },
            L(
              'Neo: bold and colourful. Minimal: quiet and clean. Soft: round and pastel. Newsprint: the puzzle page of a paper.',
              'Néo : franc et coloré. Minimal : sobre et épuré. Doux : arrondi et pastel. Journal : la page des jeux du journal.',
            ),
          ),
        ),
        segmented<Style>(
          [
            { label: L('Neo', 'Néo'), value: 'neo' },
            { label: L('Minimal', 'Minimal'), value: 'minimal' },
            { label: L('Soft', 'Doux'), value: 'soft' },
            { label: L('Newsprint', 'Journal'), value: 'newsprint' },
          ],
          p.style ?? 'neo',
          (v) => update({ style: v }),
        ),
      ),
      h(
        'div',
        { class: 'setting' },
        h('div', null, h('div', null, L('Light or dark', 'Clair ou sombre'))),
        segmented<Theme>(
          [
            { label: L('System', 'Système'), value: 'system' },
            { label: L('Light', 'Clair'), value: 'light' },
            { label: L('Dark', 'Sombre'), value: 'dark' },
            { label: L('Black', 'Noir'), value: 'oled' },
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
          h('div', null, L('Colour symbols', 'Symboles de couleur')),
          h(
            'div',
            { class: 'muted small' },
            L(
              'A shape on every colour-coded piece, for colour-blind play.',
              'Une forme sur chaque pièce colorée, pour jouer sans distinguer les couleurs.',
            ),
          ),
        ),
        segmented(
          [
            { label: L('On', 'Oui'), value: 1 },
            { label: L('Off', 'Non'), value: 0 },
          ],
          p.symbols ? 1 : 0,
          (v) => update({ symbols: v === 1 }),
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
          'How often each game shows up in the feed, and its level, are set on its tile in ',
          'La fréquence de chaque jeu dans le fil et son niveau se règlent sur sa tuile dans l’onglet ',
        ),
        h('a', { href: '/games' }, L('Games', 'Jeux')),
        L(
          '. Auto raises the level when you solve quickly and cleanly, and eases off after misses. Picking a level yourself locks it.',
          '. Le mode Auto monte le niveau quand vous résolvez vite et sans faute, et le baisse après des échecs. Choisir un niveau vous-même le fixe.',
        ),
      ),
      h(
        'div',
        { class: 'row settings-games' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn ghost',
            disabled: !off,
            onclick: () => {
              defs.forEach((d) => prefs(d.id).weight === 0 && setWeight(d.id, 2));
              renderSettings(el, defs);
            },
          },
          off
            ? `${L('Turn on', 'Réactiver')} ${P(off, ['hidden game', 'hidden games'], ['jeu masqué', 'jeux masqués'])}`
            : L('Every game is on', 'Tous les jeux sont actifs'),
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'btn ghost',
            disabled: !fixed,
            onclick: () => {
              resetAllToAuto();
              renderSettings(el, defs);
            },
          },
          fixed
            ? `${L('Set', 'Remettre')} ${P(fixed, ['fixed level', 'fixed levels'], ['niveau fixe', 'niveaux fixes'])} ${L('to Auto', 'en Auto')}`
            : L('Every level is Auto', 'Tous les niveaux sont en Auto'),
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
