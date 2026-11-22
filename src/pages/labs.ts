import { helpButton } from '../core/help';
import { L, locale, P } from '../core/i18n';
import { CATEGORIES, type CategoryId } from '../core/categories';
import { allSaves, clearSave, type Save } from '../core/saves';
import { encodeCode, resolveCode } from '../core/share';
import { prefs, setLevel, setWeight, stats, type Weight } from '../core/store';
import { LEVELS, LEVEL_NAMES, type Difficulty, type PuzzleDef } from '../core/types';
import { fmtTime, h, segmented } from '../core/ui';

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return L('just now', 'à l’instant');
  if (m < 60) return L(`${m}m ago`, `il y a ${m} min`);
  const hrs = Math.round(m / 60);
  return hrs < 24 ? L(`${hrs}h ago`, `il y a ${hrs} h`) : L(`${Math.round(hrs / 24)}d ago`, `il y a ${Math.round(hrs / 24)} j`);
};

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
 * Games tab: every game grouped by category, with search. Each tile resumes the unfinished game or
 * starts a new one, and holds the game's level and how often it shows up in the feed.
 */
export function renderLabs(el: HTMLElement, defs: PuzzleDef[], codeError?: { input: string; error: string }) {
  // Saves of word games made in the other language can't be resumed here.
  const saves = Object.fromEntries(
    Object.entries(allSaves()).filter(([id, sv]) => !defs.find((d) => d.id === id)?.localized || (sv.locale ?? 'en') === locale()),
  );
  const rerender = () => renderLabs(el, defs);
  const catName = (d: PuzzleDef) => CATEGORIES.find((c) => c.id === d.category)?.name ?? '';

  const tile = (d: PuzzleDef, save: Save | undefined) => {
    const st = stats(d.id);
    // The same level the feed uses: Auto follows auto-levelling, picking one locks it (like the card's cog).
    const levelSel = h(
      'select',
      { class: 'select', 'aria-label': `${d.name} — ${L('level', 'niveau')}` },
      h('option', { value: 'auto' }),
      ...LEVELS.map((l) => h('option', { value: String(l) }, LEVEL_NAMES[l])),
    );
    const meta = h('p', { class: 'lab-meta' });
    const drawLevel = () => {
      const pr = prefs(d.id);
      levelSel.options[0].textContent = pr.manual ? 'Auto' : `Auto · ${LEVEL_NAMES[pr.level]}`;
      levelSel.value = pr.manual ? String(pr.level) : 'auto';
      if (save) return;
      const best = st.best[pr.level];
      meta.replaceChildren(
        P(st.solved, ['solved', 'solved'], ['réussi', 'réussis']),
        best != null ? ` · ${L('best', 'record')} ${fmtTime(best)}` : '',
      );
    };
    levelSel.addEventListener('change', () => {
      setLevel(d.id, levelSel.value === 'auto' ? 'auto' : (Number(levelSel.value) as Difficulty));
      drawLevel();
    });
    drawLevel();
    if (save)
      meta.append(
        `${LEVEL_NAMES[save.level]} · ${fmtTime(save.elapsed)} · ${ago(save.at)} · `,
        h(
          'button',
          {
            type: 'button',
            class: 'linkish',
            onclick: () => {
              clearSave(d.id);
              rerender();
            },
          },
          L('discard', 'abandonner'),
        ),
      );
    const startNew = () => (location.hash = `#/game/${d.id}/new/${prefs(d.id).level}`);

    const art = h(
      'article',
      {
        class: `lab-tile ${save ? 'has-save' : ''} ${prefs(d.id).weight === 0 ? 'off' : ''}`,
        'data-puzzle': d.id,
        'data-search': fold(`${d.name} ${d.id} ${d.rules} ${catName(d)}`),
      },
      h('header', null, h('h2', null, d.name), save ? h('span', { class: 'badge' }, L('In progress', 'En cours')) : null, helpButton(d)),
      h('p', { class: 'rules' }, d.rules),
      meta,
      h(
        'div',
        { class: 'lab-new' },
        save ? h('a', { class: 'btn primary', href: `#/game/${d.id}` }, L('Resume', 'Reprendre')) : null,
        levelSel,
        h(
          'button',
          { type: 'button', class: `btn ${save ? '' : 'primary'}`, onclick: startNew },
          save ? L('New', 'Nouvelle') : L('Play', 'Jouer'),
        ),
      ),
      h(
        'div',
        { class: 'lab-freq' },
        h('span', { class: 'lab-freq-label' }, L('In the feed', 'Dans le fil')),
        segmented(
          weights(),
          prefs(d.id).weight,
          (v) => {
            setWeight(d.id, v);
            art.classList.toggle('off', v === 0);
          },
          { 'aria-label': `${d.name} — ${L('how often in the feed', 'fréquence dans le fil')}` },
        ),
      ),
    );
    return art;
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
        location.hash = `#/s/${encodeCode(res.code)}`;
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
        const hit = words.every((w) => t.dataset.search!.includes(w));
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
          `${defs.length} games. Pick any game and level — unfinished ones are saved automatically. “In the feed” sets how often a game shows up in the Feed tab.`,
          `${defs.length} jeux. Choisissez un jeu et un niveau — les parties en cours sont sauvegardées automatiquement. « Dans le fil » règle la fréquence d’un jeu dans l’onglet Fil.`,
        ),
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
