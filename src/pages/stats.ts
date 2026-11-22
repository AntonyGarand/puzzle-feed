import { dailyStats } from '../core/daily';
import { L, localeTag } from '../core/i18n';
import { clearAllSaves } from '../core/saves';
import { confirmSheet, noticeSheet } from '../ui/sheet';
import { dayStreak, exportProfile, getProfile, importProfile, prefs, resetProfile, stats, totalXp, update } from '../core/store';
import { xpLevel } from '../core/xp';
import { xpProgress } from './xp-progress';
import { LEVELS, LEVEL_NAMES } from '../core/types';
import type { PuzzleDef } from '../core/types';
import { btn, fmtTime, h } from '../ui/dom';

export function renderStats(el: HTMLElement, defs: PuzzleDef[]) {
  const p = getProfile();
  const all = defs.map((d) => ({ d, s: stats(d.id), pr: prefs(d.id) }));
  const played = all.reduce((a, x) => a + x.s.played, 0);
  const solved = all.reduce((a, x) => a + x.s.solved, 0);
  const time = all.reduce((a, x) => a + x.s.time, 0);
  const xp = totalXp();
  const pl = xpLevel(xp);

  const tile = (label: string, value: string | number) =>
    h('div', { class: 'stat' }, h('div', { class: 'stat-v' }, value), h('div', { class: 'stat-l' }, label));

  const nameInput = h('input', {
    class: 'input inline',
    value: p.name,
    placeholder: L('Your name', 'Votre nom'),
    'aria-label': L('Your name', 'Votre nom'),
    maxlength: 32,
    onchange: () => update({ name: nameInput.value.trim() }),
  });

  const rows = all
    .sort((a, b) => b.s.played - a.s.played || a.d.name.localeCompare(b.d.name, localeTag()))
    .map(({ d, s, pr }) => {
      const best = s.best[pr.level];
      return h(
        'tr',
        { 'data-puzzle': d.id },
        h(
          'td',
          null,
          h('a', { href: `/game/${d.id}`, title: `${L('Open', 'Ouvrir')} ${d.name}` }, h('span', { class: 'swatchlet' }), d.name),
        ),
        h('td', { class: 'num', title: `${s.xp} XP` }, xpLevel(s.xp!).level),
        h('td', null, LEVEL_NAMES[pr.level], h('span', { class: 'muted' }, pr.manual ? L(' · fixed', ' · fixe') : ' · auto')),
        h('td', { class: 'num' }, s.solved),
        h('td', { class: 'num' }, s.played ? `${Math.round((100 * s.solved) / s.played)}%` : '—'),
        h('td', { class: 'num hide-sm' }, s.solved ? fmtTime(s.time / s.solved) : '—'),
        h('td', { class: 'num' }, best != null ? fmtTime(best) : '—'),
      );
    });

  // Daily challenges: streak and completed lists per difficulty.
  const ds = dailyStats();
  const dailySection = [
    h('h3', null, h('a', { href: '/daily' }, L('Daily challenges', 'Défis du jour'))),
    h(
      'p',
      { class: 'muted small' },
      L(
        `Streak: ${ds.streak} (best ${ds.bestStreak}) · ${ds.completed} lists completed · ${ds.solved} dailies solved`,
        `Série : ${ds.streak} (record ${ds.bestStreak}) · ${ds.completed} listes terminées · ${ds.solved} défis réussis`,
      ),
    ),
    h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        null,
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            ...[L('Level', 'Niveau'), L('Lists', 'Listes'), L('Solved', 'Réussis'), L('Best list', 'Meilleure liste')].map((x, i) =>
              h('th', { class: i ? 'num' : '' }, x),
            ),
          ),
        ),
        h(
          'tbody',
          null,
          ...LEVELS.map((l) => {
            const x = ds.byLevel[l];
            return h(
              'tr',
              null,
              h('td', null, h('a', { href: `/daily/${l}` }, LEVEL_NAMES[l])),
              h('td', { class: 'num' }, x.completed),
              h('td', { class: 'num' }, x.solved),
              h('td', { class: 'num' }, x.bestTotal != null ? fmtTime(x.bestTotal) : '—'),
            );
          }),
        ),
      ),
    ),
  ];

  const fileInput = h('input', { type: 'file', accept: 'application/json', hidden: true });
  const importFile = async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    try {
      importProfile(await f.text());
      renderStats(el, defs);
    } catch (e) {
      noticeSheet(
        L('Import failed', 'Importation impossible'),
        `${L('That file isn’t a puzzle feed profile.', 'Ce fichier n’est pas un profil puzzle feed.')} (${(e as Error).message})`,
      );
    }
  };
  fileInput.addEventListener('change', () => void importFile());

  el.replaceChildren(
    h(
      'div',
      { class: 'page' },
      h('div', { class: 'page-head' }, h('h1', null, L('Profile', 'Profil')), nameInput),
      h(
        'p',
        { class: 'muted' },
        L(
          `Playing since ${new Date(p.created).toLocaleDateString(localeTag())}. Everything is stored on this device.`,
          `Vous jouez depuis le ${new Date(p.created).toLocaleDateString(localeTag())}. Tout est stocké sur cet appareil.`,
        ),
      ),
      h(
        'div',
        { class: 'stats' },
        tile(L('player level', 'niveau joueur'), `${pl.level}`),
        tile(L('XP', 'XP'), `${xp}`),
        tile(L('solved', 'réussis'), solved),
        tile(L('played', 'joués'), played),
        tile(L('solve rate', 'taux de réussite'), played ? `${Math.round((100 * solved) / played)}%` : '—'),
        tile(L('time solving', 'temps de jeu'), fmtTime(time)),
        tile(L('day streak', 'jours de suite'), dayStreak()),
      ),
      h('h3', null, L('XP progress', 'Progression XP')),
      xpProgress(defs),
      ...dailySection,
      h('h3', null, L('By game', 'Par jeu')),
      // Pinned header row and game column: the table scrolls inside its own box.
      h(
        'div',
        { class: 'table-wrap pinned' },
        h(
          'table',
          null,
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              ...[
                L('Game', 'Jeu'),
                L('Lv', 'Niv.'),
                L('Difficulty', 'Difficulté'),
                L('Solved', 'Réussis'),
                L('Rate', 'Taux'),
                L('Avg', 'Moy.'),
                L('Best', 'Record'),
              ].map((x, i) => h('th', { class: `${i === 1 || i > 2 ? 'num' : ''} ${i === 5 ? 'hide-sm' : ''}` }, x)),
            ),
          ),
          h('tbody', null, ...rows),
        ),
      ),
      h(
        'p',
        { class: 'muted small' },
        L(
          'Best is your fastest solve at the current level. Tap a game to open it.',
          'Le record est votre solution la plus rapide au niveau actuel. Touchez un jeu pour l’ouvrir.',
        ),
      ),
      h(
        'div',
        { class: 'row' },
        btn(
          L('Export', 'Exporter'),
          () => {
            const a = h('a', {
              href: URL.createObjectURL(new Blob([exportProfile()], { type: 'application/json' })),
              download: 'puzzle-feed-profile.json',
            });
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          },
          'ghost',
        ),
        btn(L('Import', 'Importer'), () => fileInput.click(), 'ghost'),
        btn(L('Reset everything', 'Tout effacer'), () => void resetEverything(), 'ghost'),
        fileInput,
      ),
    ),
  );

  async function resetEverything() {
    const ok = await confirmSheet({
      title: L('Reset everything?', 'Tout effacer?'),
      message: L(
        'This erases your profile, stats, XP, settings and unfinished games on this device. It can’t be undone. Export first to keep a copy.',
        'Cela efface votre profil, vos statistiques, votre XP, vos réglages et vos parties en cours sur cet appareil. C’est irréversible. Exportez d’abord pour en garder une copie.',
      ),
      action: L('Erase everything', 'Tout effacer'),
      danger: true,
    });
    if (!ok) return;
    resetProfile();
    clearAllSaves();
    renderStats(el, defs);
  }
}
