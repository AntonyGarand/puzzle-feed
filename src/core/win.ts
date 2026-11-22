import { L, P } from './i18n';
import type { RecordOutcome } from './store';
import { fmtTime, h, s } from './ui';
import { TODAY_BONUSES, xpLevel, type XpGain, type XpLevel, type XpOutcome } from './xp';

export interface WinInfo {
  /** Game name and level label, shown under the title. */
  name: string;
  level: string;
  daily?: boolean;
  ms: number;
  mistakes: number;
  /** Hints used (shown under the title when any). */
  hints?: number;
  parMs: number;
  /** Solves of this game so far, this one included. */
  solved: number;
  /** Record outcome; `null` when unknown (a resumed run that had already reached its goal). */
  res: RecordOutcome | null;
  levelUp?: { up: boolean; to: string };
  /** Auto-advance delay: shows a draining bar along the bottom of the panel. */
  advanceMs?: number;
}

function checkIcon() {
  return s('svg', { viewBox: '0 0 24 24', class: 'win-check', 'aria-hidden': 'true' }, s('path', { d: 'M5 12.5l4.5 4.5L19 7.5' }));
}

/** The "Solved!" panel laid over a finished board: time, mistakes, best, par, level change. */
export function winCard(w: WinInfo): HTMLElement {
  const res = w.res;
  const first = !!res && res.prevBest == null;
  const best = res?.prevBest != null ? Math.min(res.prevBest, w.ms) : res ? w.ms : null;
  const tag = res?.best
    ? h('span', { class: 'win-tag' }, L('New best', 'Nouveau record'))
    : first
      ? h('span', { class: 'win-tag' }, L('First clear', 'Première fois'))
      : null;

  const tile = (label: string, value: string, cls = '') =>
    h('div', { class: `win-tile ${cls}`.trim() }, h('span', null, label), h('strong', null, value));
  const underPar = w.ms <= w.parMs;

  return h(
    'div',
    { class: 'win', role: 'dialog', 'aria-label': L('Puzzle solved', 'Casse-tête réussi') },
    h(
      'div',
      { class: 'win-card' },
      h('div', { class: 'win-badge' }, checkIcon()),
      h('h3', { class: 'win-title' }, L('Solved!', 'Réussi!')),
      h(
        'p',
        { class: 'win-sub' },
        [w.name, w.level, w.daily ? L('Daily', 'Quotidien') : '', w.hints ? P(w.hints, ['hint', 'hints'], ['indice', 'indices']) : '']
          .filter(Boolean)
          .join(' · '),
      ),
      h(
        'div',
        { class: 'win-time' },
        h('div', { class: 'win-label' }, h('span', null, L('Time', 'Temps')), tag),
        h('strong', { class: 'win-clock' }, fmtTime(w.ms)),
        res?.best ? h('div', { class: 'win-was' }, `${L('was', 'avant')} ${fmtTime(res.prevBest!)}`) : null,
      ),
      h(
        'div',
        { class: 'win-stats' },
        tile(L('Mistakes', 'Erreurs'), w.mistakes ? String(w.mistakes) : L('None', 'Aucune'), w.mistakes ? '' : 'good'),
        tile(L('Best', 'Record'), best == null ? '—' : fmtTime(best)),
        tile(L('Par', 'Normale'), fmtTime(w.parMs), underPar ? 'good' : ''),
        tile(L('Solves', 'Réussites'), String(w.solved)),
      ),
      w.levelUp
        ? h(
            'div',
            { class: `win-level ${w.levelUp.up ? 'up' : 'down'}` },
            `${w.levelUp.up ? L('Harder puzzles', 'Plus difficile') : L('Easing off', 'On ralentit')} → ${w.levelUp.to}`,
          )
        : null,
      res?.xp ? xpSection(res.xp, w.name) : null,
      w.advanceMs ? h('div', { class: 'win-advance', style: `animation-duration:${w.advanceMs}ms` }) : null,
    ),
  );
}

function reason(g: XpGain, game: string): string {
  switch (g.why) {
    case 'solve':
      return L('Puzzle solved', 'Casse-tête réussi');
    case 'flawless':
      return L('No mistakes', 'Sans erreur');
    case 'par':
      return L('Under par', 'Sous la normale');
    case 'first':
      return L('First clear at this level', 'Première réussite à ce niveau');
    case 'best':
      return L('New best time', 'Nouveau record');
    case 'daily':
      return L('Daily challenge', 'Défi du jour');
    case 'gameToday':
      return L(`First ${game} of the day`, `Première partie du jour : ${game}`);
    case 'today':
      return `${L('Daily bonus', 'Bonus du jour')} (${g.n} / ${TODAY_BONUSES})`;
  }
}

/** Hexagon level badge (win card, card header, Games tiles). */
export function levelHex(level: number, cls = '') {
  return h('span', { class: `lvl-hex ${cls}`.trim(), title: `${L('Level', 'Niveau')} ${level}` }, String(level));
}

/** One level bar: hex badge, label, "(+n) x / y XP", filling from the old position to the new one. */
function xpBar(label: string, kind: 'game' | 'player', gained: number, before: XpLevel, after: XpLevel) {
  const up = after.level > before.level;
  const pct = (l: XpLevel) => `${Math.round((100 * l.into) / l.need)}%`;
  const fill = h('i', { style: `--from:${up ? '0%' : pct(before)};--to:${pct(after)}` });
  return h(
    'div',
    { class: `win-xp-row ${kind}${up ? ' up' : ''}` },
    h('span', { class: 'win-hex-wrap' }, levelHex(after.level, 'win-hex'), up ? h('b', { class: 'win-xp-up' }, L('Up!', 'Niv. +1')) : null),
    h(
      'div',
      { class: 'win-xp-main' },
      h(
        'div',
        { class: 'win-xp-top' },
        h('span', { class: 'win-xp-name' }, label),
        h('span', { class: 'win-xp-num' }, h('b', null, `(+${gained})`), `  ${after.into} / ${after.need} XP`),
      ),
      h('div', { class: 'win-xp-bar' }, fill),
    ),
  );
}

function xpSection(x: XpOutcome, game: string) {
  return h(
    'div',
    { class: 'win-xp' },
    xpBar(game, 'game', x.total, xpLevel(x.game.before), xpLevel(x.game.after)),
    xpBar(L('Player', 'Joueur'), 'player', x.total, xpLevel(x.player.before), xpLevel(x.player.after)),
    h(
      'ul',
      { class: 'win-xp-gains' },
      ...x.gains.map((g) => h('li', null, h('span', null, reason(g, game)), h('span', null, `+${g.xp} XP`))),
    ),
  );
}
