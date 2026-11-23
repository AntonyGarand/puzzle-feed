import { L, P } from '../core/i18n';
import type { RecordOutcome } from '../core/store';
import { fmtTime, h, s } from './dom';
import { TODAY_BONUSES, xpLevel, type XpGain, type XpLevel, type XpOutcome } from '../core/xp';

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
  levelUp?: { up: boolean; to: string } | undefined;
  /** Auto-advance delay: shows a draining bar along the bottom of the panel. */
  advanceMs?: number | undefined;
  /** Zen mode: no time, counts, records or XP. */
  zen?: boolean;
}

/** A failed attempt: the "Not this time" panel's subset of {@link WinInfo}. */
export interface LostInfo {
  name: string;
  level: string;
  daily?: boolean;
  ms: number;
  mistakes: number;
  /** Hints used (shown under the title when any). */
  hints?: number;
  /** Best time at this level, if any. */
  best?: number | undefined;
  /** Attempts of this game that ended (solved or failed), this one included, and how many were solves. */
  played: number;
  solved: number;
  levelUp?: { up: boolean; to: string } | undefined;
  /** Zen mode: no time, counts or records. */
  zen?: boolean;
}

function crossIcon() {
  return s('svg', { viewBox: '0 0 24 24', class: 'win-check', 'aria-hidden': 'true' }, s('path', { d: 'M7 7l10 10M17 7L7 17' }));
}

/** Game, level, daily tag and hints used (Zen mode keeps only the game and level). */
const subtitle = (w: { name: string; level: string; daily?: boolean; hints?: number; zen?: boolean }) =>
  h(
    'p',
    { class: 'win-sub' },
    [w.name, w.level, w.daily ? L('Daily', 'Quotidien') : '', w.hints && !w.zen ? P(w.hints, ['hint', 'hints'], ['indice', 'indices']) : '']
      .filter(Boolean)
      .join(' · '),
  );

const tile = (label: string, value: string) => h('div', { class: 'win-tile' }, h('span', null, label), h('strong', null, value));

const levelPill = (l: { up: boolean; to: string }) =>
  h(
    'div',
    { class: `win-level ${l.up ? 'up' : 'down'}` },
    `${l.up ? L('Harder puzzles', 'Plus difficile') : L('Easing off', 'On ralentit')} → ${l.to}`,
  );

/** The "Not this time" panel laid over a failed board: the solved panel's twin, without the rewards. */
export function lostCard(w: LostInfo): HTMLElement {
  const rate = w.played ? Math.round((100 * w.solved) / w.played) : 0;
  const scores = w.zen
    ? []
    : [
        h(
          'div',
          { class: 'win-time' },
          h('div', { class: 'win-label' }, h('span', null, L('Time', 'Temps'))),
          h('strong', { class: 'win-clock' }, fmtTime(w.ms)),
        ),
        h(
          'div',
          { class: 'win-stats' },
          tile(L('Mistakes', 'Erreurs'), String(w.mistakes)),
          tile(L('Best', 'Record'), w.best == null ? '—' : fmtTime(w.best)),
          tile(L('Solves', 'Réussites'), String(w.solved)),
          tile(L('Win rate', 'Taux'), `${rate}%`),
        ),
      ];
  return h(
    'div',
    { class: 'win lost', role: 'dialog', 'aria-label': L('Puzzle failed', 'Casse-tête raté') },
    h(
      'div',
      { class: 'win-card' },
      h('div', { class: 'win-badge' }, crossIcon()),
      h('h3', { class: 'win-title' }, L('Not this time', 'Pas cette fois')),
      subtitle(w),
      ...scores,
      w.levelUp ? levelPill(w.levelUp) : null,
      h('p', { class: 'win-hint' }, L('Tap to see the board', 'Touchez pour voir la grille')),
    ),
  );
}

function checkIcon() {
  return s('svg', { viewBox: '0 0 24 24', class: 'win-check', 'aria-hidden': 'true' }, s('path', { d: 'M5 12.5l4.5 4.5L19 7.5' }));
}

/** The "Solved!" panel laid over a finished board: time, mistakes, best, par, level change. */
export function winCard(w: WinInfo): HTMLElement {
  return h(
    'div',
    { class: 'win', role: 'dialog', 'aria-label': L('Puzzle solved', 'Casse-tête réussi') },
    h(
      'div',
      { class: 'win-card' },
      h('div', { class: 'win-badge' }, checkIcon()),
      h('h3', { class: 'win-title' }, L('Solved!', 'Réussi!')),
      subtitle(w),
      ...(w.zen ? [w.levelUp ? levelPill(w.levelUp) : null] : winScores(w)),
      w.advanceMs ? h('div', { class: 'win-advance', style: `animation-duration:${w.advanceMs}ms` }) : null,
    ),
  );
}

/** The solved panel's numbers: time, mistakes, best, par, solves and XP (none of them in Zen mode). */
function winScores(w: WinInfo): (HTMLElement | null)[] {
  const res = w.res;
  const first = !!res && res.prevBest == null;
  const best = res?.prevBest != null ? Math.min(res.prevBest, w.ms) : res ? w.ms : null;
  const tag = res?.best
    ? h('span', { class: 'win-tag' }, L('New best', 'Nouveau record'))
    : first
      ? h('span', { class: 'win-tag' }, L('First clear', 'Première fois'))
      : null;
  return [
    res?.stars ? starRow(res.stars) : null,
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
      tile(L('Mistakes', 'Erreurs'), String(w.mistakes)),
      tile(L('Best', 'Record'), best == null ? '—' : fmtTime(best)),
      tile(L('Par', 'Normale'), fmtTime(w.parMs)),
      tile(L('Solves', 'Réussites'), String(w.solved)),
    ),
    w.levelUp ? levelPill(w.levelUp) : null,
    res?.xp ? xpSection(res.xp, w.name) : null,
  ];
}

/** A pack solve's stars, out of three. */
function starRow(n: number) {
  return h(
    'p',
    { class: 'win-stars', 'aria-label': `${P(n, ['star', 'stars'], ['étoile', 'étoiles'])} ${L('of 3', 'sur 3')}` },
    ...[1, 2, 3].map((i) => h('span', { class: i <= n ? 'on' : '', 'aria-hidden': 'true' }, '★')),
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
        h('span', { class: 'win-xp-num' }, h('b', null, `+${gained}`), `${after.into} / ${after.need} XP`),
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
      h('li', { class: 'win-xp-total' }, h('span', null, L('Total', 'Total')), h('span', null, `+${x.total} XP`)),
    ),
  );
}
