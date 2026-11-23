import { L, P } from '../core/i18n';
import { RUSH_MINUTES, RUSH_MODES, RACE_STEP, rushKey, type RushMinutes, type RushMode } from '../core/rush';
import { getProfile, rushRecord } from '../core/store';
import { h, segmented } from '../ui/dom';

let mode: RushMode = 'classic';
let minutes: RushMinutes = 3;

export const rushModeName = (m: RushMode) => (m === 'race' ? L('Race', 'Montée') : L('Classic', 'Classique'));

/** One line about a mode, for the picker and the Games tab. */
const modeBlurb = (m: RushMode) =>
  m === 'race'
    ? L(
        `Starts on Easy and goes up a level every ${RACE_STEP} solves.`,
        `Commence en Facile et monte d’un niveau toutes les ${RACE_STEP} réussites.`,
      )
    : L('Each game at your level, up to Hard.', 'Chaque jeu à votre niveau, jusqu’à Difficile.');

/** Best score of every mode and duration, as a small table. */
function bests(): HTMLElement {
  return h(
    'table',
    { class: 'rush-bests' },
    h('thead', null, h('tr', null, h('th', null, ''), ...RUSH_MINUTES.map((m) => h('th', { scope: 'col' }, `${m} min`)))),
    h(
      'tbody',
      null,
      ...RUSH_MODES.map((md) =>
        h(
          'tr',
          null,
          h('th', { scope: 'row' }, rushModeName(md)),
          ...RUSH_MINUTES.map((m) => h('td', null, String(rushRecord(rushKey(md, m))?.best ?? '—'))),
        ),
      ),
    ),
  );
}

/** Rush setup: pick a duration and a mode, see your records, start. */
export function renderRush(el: HTMLElement) {
  const start = h('a', { class: 'btn primary rush-start' });
  const blurb = h('p', { class: 'muted small rush-mode-blurb' });
  const sync = () => {
    start.setAttribute('href', `/rush/play/${mode}/${minutes}`);
    start.textContent = L(`Start · ${minutes} min`, `Commencer · ${minutes} min`);
    blurb.textContent = modeBlurb(mode);
  };
  sync();
  const runs = Object.values(getProfile().rush ?? {}).reduce((a, r) => a + r.runs, 0);
  el.replaceChildren(
    h(
      'div',
      { class: 'page rush-setup' },
      h('a', { class: 'btn ghost back', href: '/games' }, L('← Games', '← Jeux')),
      h('h1', null, L('Rush', 'Sprint')),
      h(
        'p',
        { class: 'muted' },
        L(
          'Solve as many puzzles as you can before the clock runs out. Quick games only, one after the other.',
          'Résolvez le plus de parties possible avant la fin du temps. Seulement des jeux rapides, l’un après l’autre.',
        ),
      ),
      h('h3', null, L('Duration', 'Durée')),
      segmented(
        RUSH_MINUTES.map((m) => ({ label: `${m} min`, value: m })),
        minutes,
        (v) => {
          minutes = v;
          sync();
        },
        { 'aria-label': L('Duration', 'Durée') },
      ),
      h('h3', null, L('Mode', 'Mode')),
      segmented(
        RUSH_MODES.map((m) => ({ label: rushModeName(m), value: m })),
        mode,
        (v) => {
          mode = v;
          sync();
        },
        { 'aria-label': L('Mode', 'Mode') },
      ),
      blurb,
      start,
      h('h3', null, L('Records', 'Records')),
      bests(),
      runs ? h('p', { class: 'muted small' }, P(runs, ['run finished', 'runs finished'], ['sprint terminé', 'sprints terminés'])) : null,
      h('h3', null, L('Rules', 'Règles')),
      h(
        'ul',
        { class: 'rush-rules' },
        h(
          'li',
          null,
          L('A solve scores a point and deals the next puzzle.', 'Chaque réussite vaut un point et passe à la partie suivante.'),
        ),
        h('li', null, L('A lost puzzle moves on, with no point.', 'Une partie ratée passe à la suivante, sans point.')),
        h('li', null, L('Skip costs 5 seconds.', 'Passer coûte 5 secondes.')),
        h(
          'li',
          null,
          L('No hints. The clock pauses while a help sheet is open.', 'Pas d’indices. Le chrono s’arrête quand l’aide est ouverte.'),
        ),
        h(
          'li',
          null,
          L(
            'Rush puzzles don’t change your game levels, stats or XP. Zen mode doesn’t apply.',
            'Les parties du sprint ne changent ni vos niveaux, ni vos statistiques, ni votre XP. Le mode zen ne s’applique pas.',
          ),
        ),
      ),
    ),
  );
}

/** The Rush block at the top of the Games tab. */
export function rushBanner(): HTMLElement {
  const best = Math.max(0, ...RUSH_MODES.flatMap((md) => RUSH_MINUTES.map((m) => rushRecord(rushKey(md, m))?.best ?? 0)));
  return h(
    'a',
    { class: 'rush-banner', href: '/rush' },
    h('span', { class: 'rush-banner-icon', 'aria-hidden': 'true' }, '⏱'),
    h(
      'span',
      { class: 'rush-banner-text' },
      h('strong', null, L('Rush', 'Sprint')),
      h(
        'span',
        { class: 'small' },
        L('As many puzzles as you can in 1, 3 or 5 minutes.', 'Le plus de parties possible en 1, 3 ou 5 minutes.'),
        best ? ` ${L(`Best: ${best}.`, `Record : ${best}.`)}` : '',
      ),
    ),
    h('span', { class: 'tile-go', 'aria-hidden': 'true' }, '▶'),
  );
}
