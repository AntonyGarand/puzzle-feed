import { helpButton } from '../ui/help';
import { L, locale, P } from '../core/i18n';
import { CATEGORIES, type CategoryId } from '../core/categories';
import { allSaves, clearSave, type Save } from '../core/saves';
import { navigate } from '../app/nav';
import { encodeCode, resolveCode } from '../core/share';
import { getProfile, prefs, setLevel, setWeight, stats, type Weight } from '../core/store';
import { affinity } from '../core/taste';
import { LEVELS, LEVEL_NAMES, type PuzzleDef } from '../core/types';
import { btn, cogIcon, fmtTime, h, segmented } from '../ui/dom';
import { openSheet } from '../ui/sheet';
import { destroyThumbs, thumb } from '../ui/thumb';
import { levelHex } from '../ui/win';
import { xpLevel } from '../core/xp';
import { packProgress } from '../core/packs';
import { packSummary } from './packs';

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return L('just now', 'à l’instant');
  if (m < 60) return L(`${m}m ago`, `il y a ${m} min`);
  const hrs = Math.round(m / 60);
  return hrs < 24 ? L(`${hrs}h ago`, `il y a ${hrs} h`) : L(`${Math.round(hrs / 24)}d ago`, `il y a ${Math.round(hrs / 24)} j`);
};

/** "Shown a bit more/less often", when the feed's taste has moved this game's weight noticeably. */
function tasteNote(id: string): HTMLElement | null {
  if (getProfile().taste === false || prefs(id).weight === 0) return null;
  const a = affinity(getProfile().stats[id]);
  if (Math.abs(a - 1) < 0.15) return null;
  return h(
    'p',
    { class: 'muted small' },
    a > 1
      ? L('Shown a bit more often: you usually finish it.', 'Revient un peu plus souvent : vous le terminez d’habitude.')
      : L('Shown a bit less often: you often skip it.', 'Revient un peu moins souvent : vous le passez souvent.'),
  );
}

let filter: CategoryId | 'all' = 'all';
let query = '';

/** Lower-case, accents stripped: "élim" and "Elim" both match "Élimination". */
const fold = (str: string) => str.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const weights = (): { label: string; value: Weight }[] => [
  { label: L('Off', 'Jamais'), value: 0 },
  { label: L('Less', 'Moins'), value: 1 },
  { label: L('Normal', 'Normal'), value: 2 },
  { label: L('More', 'Plus'), value: 3 },
];

/**
 * Games tab: every game grouped by category, with search. Each row resumes the unfinished game or
 * starts a new one; its cog holds the game's level and how often it shows up in the feed.
 */
export function renderLabs(el: HTMLElement, defs: PuzzleDef[], codeError?: { input: string; error: string }) {
  // Saves of word games made in the other language can't be resumed here.
  const saves = Object.fromEntries(
    Object.entries(allSaves()).filter(([id, sv]) => !defs.find((d) => d.id === id)?.localized || (sv.locale ?? 'en') === locale()),
  );
  destroyThumbs();
  const rerender = () => renderLabs(el, defs);
  const catName = (d: PuzzleDef) => CATEGORIES.find((c) => c.id === d.category)?.name ?? '';

  /** Level, feed frequency and save management, behind the tile's cog. */
  const openTileSettings = (d: PuzzleDef, save: Save | undefined) => {
    const pr = prefs(d.id);
    // The picker always shows the current level; Auto is a separate switch. Picking a level turns Auto off.
    const levelBox = h('div', { class: 'level-box' });
    const drawLevel = () => {
      const p = prefs(d.id);
      levelBox.replaceChildren(
        segmented(
          LEVELS.map((l) => ({ label: LEVEL_NAMES[l], value: l })),
          p.level,
          (v) => {
            setLevel(d.id, v);
            drawLevel();
          },
          { class: 'seg wrap', 'aria-label': L('Difficulty', 'Difficulté') },
        ),
        h('h3', null, L('Auto-level', 'Niveau auto')),
        h(
          'p',
          { class: 'muted small auto-hint' },
          L('Raises the level when you solve quickly and cleanly.', 'Monte le niveau quand vous résolvez vite et sans faute.'),
        ),
        segmented(
          [
            { label: L('Off', 'Non'), value: 0 },
            { label: L('On', 'Oui'), value: 1 },
          ],
          p.manual ? 0 : 1,
          (v) => {
            setLevel(d.id, v ? 'auto' : prefs(d.id).level);
            drawLevel();
          },
          { 'aria-label': L('Auto-level', 'Niveau auto') },
        ),
      );
    };
    drawLevel();
    const close = openSheet({
      title: d.name,
      puzzle: d.id,
      className: 'game-settings',
      body: [
        h('p', { class: 'muted small' }, d.rules),
        h('h3', null, L('Difficulty', 'Difficulté')),
        levelBox,
        h('h3', null, L('In the feed', 'Dans le fil')),
        segmented(weights(), pr.weight, (v) => setWeight(d.id, v)),
        tasteNote(d.id),
        h('h3', null, L('Packs', 'Séries')),
        h(
          'p',
          { class: 'row pack-link' },
          h('span', { class: 'small' }, packSummary(packProgress(d.id))),
          btn(L('Open packs', 'Voir les séries'), () => {
            close();
            navigate(`/packs/${d.id}`);
          }),
        ),
        save
          ? h(
              'p',
              { class: 'small' },
              `${L('Unfinished', 'En cours')} : ${LEVEL_NAMES[save.level]} · ${fmtTime(save.elapsed)} · ${ago(save.at)} · `,
              h(
                'button',
                {
                  type: 'button',
                  class: 'linkish',
                  onclick: () => {
                    clearSave(d.id);
                    close();
                  },
                },
                L('discard', 'abandonner'),
              ),
            )
          : null,
      ],
      onClose: () => {
        // Still on the list (/games, or its /labs alias): redraw so the tile links to the new level.
        if (/^\/(games|labs)\/?$/.test(location.pathname)) rerender();
      },
    });
  };

  /**
   * One row per game: preview, name, rules and stats. The whole row starts the game (or resumes the
   * unfinished one); "?" and the cog are separate buttons layered above the row's link.
   */
  const tile = (d: PuzzleDef, save: Save | undefined) => {
    const st = stats(d.id);
    const pr = prefs(d.id);
    const href = save ? `/game/${d.id}` : `/game/${d.id}/new/${pr.level}`;
    const best = st.best[pr.level];
    const pack = packProgress(d.id);
    const lvl = levelHex(xpLevel(st.xp!).level, 'sm');
    const chips = save
      ? [
          lvl,
          h('span', { class: 'resume-pill' }, `${L('Resume', 'Reprendre')} · ${fmtTime(save.elapsed)}`),
          LEVEL_NAMES[save.level],
          ago(save.at),
        ]
      : [
          lvl,
          `${pr.manual ? '' : 'Auto · '}${LEVEL_NAMES[pr.level]}`,
          st.solved ? P(st.solved, ['solved', 'solved'], ['réussi', 'réussis']) : null,
          best != null ? `${L('best', 'record')} ${fmtTime(best)}` : null,
          pack.solved ? `${L('packs', 'séries')} ${pack.solved} / ${pack.total}` : null,
        ];
    const cog = h(
      'button',
      {
        type: 'button',
        class: 'icon-btn cog-btn',
        title: L('Options', 'Options'),
        'aria-label': `${d.name} — ${L('options', 'options')}`,
        onclick: () => openTileSettings(d, save),
      },
      cogIcon(),
    );
    return h(
      'article',
      {
        class: `lab-tile ${save ? 'has-save' : ''} ${pr.weight === 0 ? 'off' : ''}`,
        'data-puzzle': d.id,
        'data-search': fold(`${d.name} ${d.id} ${d.rules} ${catName(d)}`),
      },
      thumb(d, 'tile-art'),
      h(
        'div',
        { class: 'tile-main' },
        h(
          'header',
          null,
          h(
            'h2',
            null,
            h('a', { class: 'tile-link', href, 'aria-label': `${save ? L('Resume', 'Reprendre') : L('Play', 'Jouer')} ${d.name}` }, d.name),
          ),
          helpButton(d, { quiet: true }),
          cog,
        ),
        h('p', { class: 'rules' }, d.rules),
        h('p', { class: 'lab-meta' }, ...chips.filter(Boolean).map((c) => (typeof c === 'string' ? h('span', null, c) : c))),
      ),
      h('span', { class: 'tile-go', 'aria-hidden': 'true' }, '▶'),
    );
  };

  // Play a puzzle someone shared: paste a code (or a whole link).
  const codeInput = h('input', {
    class: 'input inline',
    type: 'text',
    name: 'code',
    value: codeError?.input ?? '',
    placeholder: 'sudoku-3-1k2x9q',
    autocapitalize: 'off',
    autocomplete: 'off',
    spellcheck: 'false',
    enterkeyhint: 'go',
    'aria-label': L('Puzzle code or link', 'Code ou lien de la partie'),
    'aria-describedby': 'code-msg',
  });
  const codeMsg = h(
    'p',
    { id: 'code-msg', class: `small code-msg ${codeError ? 'bad' : 'muted'}`, role: 'status' },
    codeError?.error ??
      L(
        'Someone sent you a puzzle code? Enter it to play that exact puzzle.',
        'On vous a envoyé un code de partie? Entrez-le pour jouer exactement la même partie.',
      ),
  );
  const codeForm = h(
    'form',
    {
      class: 'code-form',
      onsubmit: (e: SubmitEvent) => {
        e.preventDefault();
        const res = resolveCode(codeInput.value, defs);
        if ('error' in res) {
          codeMsg.textContent = res.error;
          codeMsg.className = 'small code-msg bad';
          codeInput.focus();
          return;
        }
        navigate(`/s/${encodeCode(res.code)}`);
      },
    },
    h('h3', null, L('Play a shared puzzle', 'Jouer une partie partagée')),
    h('div', { class: 'row' }, codeInput, h('button', { type: 'submit', class: 'btn primary' }, L('Play', 'Jouer'))),
    codeMsg,
  );

  const inProgress = defs.filter((d) => saves[d.id]).sort((a, b) => saves[b.id].at - saves[a.id].at);
  const cats = CATEGORIES.map((c) => ({ ...c, games: defs.filter((d) => d.category === c.id) })).filter((c) => c.games.length);
  const shown = filter === 'all' ? cats : cats.filter((c) => c.id === filter);

  const chip = (id: CategoryId | 'all', label: string, n: number) =>
    h(
      'button',
      {
        type: 'button',
        class: `chip-filter ${filter === id ? 'on' : ''}`,
        'aria-pressed': String(filter === id),
        onclick: () => {
          filter = id;
          rerender();
        },
      },
      label,
      h('span', null, n),
    );

  // Search hides tiles in place, so typing never rebuilds the page or loses focus.
  const noMatch = h('p', { class: 'muted no-match', hidden: true });
  const search = h('input', {
    class: 'input search',
    type: 'search',
    name: 'q',
    value: query,
    placeholder: L('Search games', 'Chercher un jeu'),
    autocomplete: 'off',
    spellcheck: 'false',
    enterkeyhint: 'search',
    'aria-label': L('Search games', 'Chercher un jeu'),
  });
  const applySearch = () => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    let any = false;
    for (const sec of el.querySelectorAll<HTMLElement>('section.cat')) {
      let n = 0;
      for (const t of sec.querySelectorAll<HTMLElement>('.lab-tile')) {
        const hit = words.every((w) => t.dataset['search']!.includes(w));
        t.hidden = !hit;
        if (hit) n++;
      }
      sec.hidden = !n;
      any ||= n > 0;
    }
    noMatch.hidden = any;
    noMatch.textContent = L(`No game matches “${query.trim()}”.`, `Aucun jeu ne correspond à « ${query.trim()} ».`);
  };
  search.addEventListener('input', () => {
    query = search.value;
    applySearch();
  });

  /** Category heading, with a switch for all of its games in the feed. */
  const catHead = (c: (typeof cats)[number]) => {
    const allOff = c.games.every((d) => prefs(d.id).weight === 0);
    return h(
      'h3',
      null,
      c.name,
      h('span', { class: 'cat-blurb' }, c.blurb),
      h(
        'button',
        {
          type: 'button',
          class: 'linkish cat-toggle',
          onclick: () => {
            c.games.forEach((d) => setWeight(d.id, allOff ? 2 : 0));
            rerender();
          },
        },
        allOff ? L('Put all in the feed', 'Tout remettre dans le fil') : L('Hide all from the feed', 'Tout retirer du fil'),
      ),
    );
  };

  el.replaceChildren(
    h(
      'div',
      { class: 'page wide games' },
      h('h1', null, L('Games', 'Jeux')),
      h(
        'p',
        { class: 'muted' },
        L(
          `${defs.length} games. Tap one to play — unfinished games are saved automatically. The cog sets its level and how often it shows up in the Feed tab.`,
          `${defs.length} jeux. Touchez un jeu pour jouer — les parties en cours sont sauvegardées automatiquement. La roue dentée règle son niveau et sa fréquence dans l’onglet Fil.`,
        ),
      ),
      h(
        'a',
        { class: 'btn packs-link', href: '/packs' },
        L('Packs', 'Séries'),
        h('span', { class: 'small' }, L(' · set puzzles in five levels, with stars', ' · parties fixes en cinq niveaux, avec étoiles')),
      ),
      codeForm,
      h(
        'div',
        { class: 'games-bar' },
        search,
        h(
          'div',
          { class: 'filters', role: 'toolbar', 'aria-label': L('Categories', 'Catégories') },
          chip('all', L('All', 'Tous'), defs.length),
          ...cats.map((c) => chip(c.id, c.name, c.games.length)),
        ),
      ),
      noMatch,
      inProgress.length && filter === 'all'
        ? h(
            'section',
            { class: 'cat' },
            h('h3', null, L('Continue', 'Reprendre')),
            h('div', { class: 'lab-grid' }, ...inProgress.map((d) => tile(d, saves[d.id]))),
          )
        : null,
      ...shown.map((c) =>
        h(
          'section',
          { class: 'cat', id: `cat-${c.id}` },
          catHead(c),
          h('div', { class: 'lab-grid' }, ...c.games.map((d) => tile(d, saves[d.id]))),
        ),
      ),
    ),
  );
  applySearch();
}
