import { completedLevels, dailyDate, dailyStats, getDaily, isComplete, shiftDate } from '../core/daily';
import { L, localeTag, P } from '../core/i18n';
import { dailySaveKey, getSave } from '../core/saves';
import { getProfile } from '../core/store';
import { LEVELS, LEVEL_NAMES, type Difficulty, type PuzzleDef } from '../core/types';
import { btn, fmtTime, h } from '../ui/dom';
import { dailyShareText } from '../core/daily-share';
import { shareText } from '../ui/share';

let selected: Difficulty | null = null;

/** Long form of a YYYY-MM-DD date in the current locale. */
const fmtDate = (date: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' }) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(localeTag(), opts);
};

/** Daily tab: today's list for each difficulty, progress, streak and the last four weeks. */
export function renderDaily(el: HTMLElement, defs: PuzzleDef[], level?: Difficulty) {
  const date = dailyDate();
  if (level) selected = level;
  const lvl: Difficulty = (selected ??= getProfile().startLevel);
  const list = getDaily(date, lvl, defs);
  const st = dailyStats(date);
  const done = new Set(completedLevels(date));

  const tile = (label: string, value: string | number) =>
    h('div', { class: 'stat' }, h('div', { class: 'stat-v' }, value), h('div', { class: 'stat-l' }, label));

  const levelPicker = h(
    'div',
    { class: 'seg wrap daily-levels', role: 'tablist', 'aria-label': L('Difficulty', 'Difficulté') },
    ...LEVELS.map((l) =>
      h(
        'a',
        {
          href: `/daily/${l}`,
          role: 'tab',
          'aria-selected': String(l === lvl),
          class: l === lvl ? 'on' : '',
          'data-value': String(l),
        },
        LEVEL_NAMES[l],
        done.has(l) ? h('span', { class: 'tick', 'aria-label': L('completed', 'terminé') }, ' ✓') : null,
      ),
    ),
  );

  const rows = list.map((e, i) => {
    const def = defs.find((d) => d.id === e.id);
    const save = getSave(dailySaveKey(date, lvl, i), 'daily');
    const started = save && save.seed === e.seed;
    const status =
      e.o === 'solved'
        ? h('span', { class: 'good' }, `✓ ${fmtTime(e.ms ?? 0)}`, e.m ? ` · ✕ ${e.m}` : '')
        : started
          ? h('span', null, `${L('In progress', 'En cours')} · ${fmtTime(save.elapsed)}`)
          : e.o === 'failed'
            ? h('span', { class: 'bad' }, L('Not yet', 'Pas encore'))
            : h('span', { class: 'muted' }, '—');
    const href = `/daily/${lvl}/${i + 1}`;
    return h(
      'li',
      { class: `daily-item ${e.o === 'solved' ? 'is-solved' : ''}`, 'data-puzzle': e.id },
      h('span', { class: 'daily-n' }, i + 1),
      h(
        'div',
        { class: 'daily-name' },
        h('strong', null, h('span', { class: 'swatchlet' }), def?.name ?? e.id),
        h('span', { class: 'small' }, status),
      ),
      def
        ? h(
            'a',
            { class: `btn ${e.o === 'solved' ? 'ghost' : 'primary'}`, href },
            e.o === 'solved'
              ? L('Replay', 'Rejouer')
              : started
                ? L('Resume', 'Reprendre')
                : e.o
                  ? L('Retry', 'Réessayer')
                  : L('Play', 'Jouer'),
          )
        : h('span', { class: 'small muted' }, L('Not in this version', 'Absent de cette version')),
    );
  });

  const solved = list.filter((e) => e.o === 'solved');
  const total = solved.reduce((a, e) => a + (e.ms ?? 0), 0);
  const complete = isComplete(list);
  const summary = h(
    'p',
    { class: `daily-summary ${complete ? 'good' : ''}` },
    complete
      ? h('strong', null, L(`${LEVEL_NAMES[lvl]} list complete!`, `Liste ${LEVEL_NAMES[lvl].toLowerCase()} terminée!`))
      : h('strong', null, L(`${solved.length}/${list.length} solved`, `${solved.length}/${list.length} réussies`)),
    solved.length ? ` · ${L('total', 'total')} ${fmtTime(total)}` : '',
    complete && st.byLevel[lvl].bestTotal != null ? ` · ${L('best', 'record')} ${fmtTime(st.byLevel[lvl].bestTotal)}` : '',
  );

  // Share the list's results (spoiler-free squares) once something was played.
  let share: HTMLElement | null = null;
  if (list.some((e) => e.o)) {
    const note = h('span', { class: 'muted small', role: 'status' });
    const label = L('Share results', 'Partager les résultats');
    const b = btn(
      label,
      () => {
        const text = dailyShareText(list, {
          level: lvl,
          date: fmtDate(date, { month: 'short', day: 'numeric' }),
          origin: location.origin,
          fmtTime,
        });
        void shareText(text, L('Daily results', 'Résultats du défi')).then((r) => {
          if (r === 'copied') note.textContent = L('Copied. Paste it anywhere.', 'Copié. Collez-le où vous voulez.');
          else if (r === 'failed' && typeof navigator.share !== 'function')
            note.textContent = L('Couldn’t copy the results.', 'Impossible de copier les résultats.');
        });
      },
      'ghost',
    );
    share = h('div', { class: 'daily-share' }, b, note);
  }

  // Last 4 weeks: how many lists were completed each day.
  const days: HTMLElement[] = [];
  for (let i = 27; i >= 0; i--) {
    const d = shiftDate(date, -i);
    const n = completedLevels(d);
    const label = n.length ? n.map((l) => LEVEL_NAMES[l]).join(', ') : L('none', 'aucune');
    days.push(
      h('span', {
        class: `day ${d === date ? 'today' : ''}`,
        title: `${fmtDate(d, { month: 'short', day: 'numeric' })}: ${label}`,
        style: `--v:${n.length ? 0.35 + (0.65 * n.length) / LEVELS.length : 0}`,
      }),
    );
  }

  const nDays = P(st.days, ['day', 'days'], ['jour', 'jours']);

  el.replaceChildren(
    h(
      'div',
      { class: 'page' },
      h('h1', null, L('Daily', 'Défis du jour')),
      h(
        'p',
        { class: 'muted' },
        h('strong', null, fmtDate(date)),
        '. ',
        L(
          `${list.length} puzzles per difficulty, the same for everyone. New ones every day at midnight: pick a level and solve its list.`,
          `${list.length} parties par difficulté, les mêmes pour tout le monde. Des nouvelles chaque jour à minuit : choisissez un niveau et résolvez sa liste.`,
        ),
      ),
      h(
        'div',
        { class: 'stats' },
        tile(L('daily streak', 'jours de suite'), st.streak),
        tile(L('best streak', 'meilleure série'), st.bestStreak),
        tile(L('lists completed', 'listes terminées'), st.completed),
        tile(L('dailies solved', 'défis réussis'), st.solved),
      ),
      h('h3', null, L('Today', 'Aujourd’hui')),
      levelPicker,
      h('ol', { class: 'daily-list' }, ...rows),
      summary,
      share,
      h('h3', null, L('Last 4 weeks', '4 dernières semaines')),
      h('div', { class: 'days' }, ...days),
      h(
        'p',
        { class: 'muted small' },
        L(
          `A day counts toward your streak when you finish at least one list. ${nDays} so far.`,
          `Une journée compte dans votre série quand vous terminez au moins une liste. ${nDays} jusqu’ici.`,
        ),
      ),
    ),
  );
}
