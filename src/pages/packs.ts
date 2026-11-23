import { CATEGORIES } from '../core/categories';
import { L } from '../core/i18n';
import { PACK_SIZE, packProgress, UNLOCK_AT, type PackProgress, type TierProgress } from '../core/packs';
import { getSave, packSaveKey } from '../core/saves';
import { LEVEL_NAMES, type PuzzleDef } from '../core/types';
import { fmtTime, h } from '../ui/dom';

/** "★ 14 / 180" style star count. */
const starCount = (have: number, max: number) => `★ ${have} / ${max}`;

/** A tier's badge: complete (every puzzle solved) or perfect (three stars everywhere). */
function badge(t: TierProgress) {
  if (t.state === 'perfect') return h('span', { class: 'pack-badge perfect' }, L('★ Perfect', '★ Parfait'));
  if (t.state === 'complete') return h('span', { class: 'pack-badge' }, L('✓ Complete', '✓ Terminé'));
  return null;
}

/** Three star slots, the earned ones filled. */
const stars = (n: number) =>
  h('span', { class: 'pack-stars', 'aria-hidden': 'true' }, ...[1, 2, 3].map((i) => h('i', { class: i <= n ? 'on' : '' }, '★')));

/** Overall progress line of a game's pack: solved count, then stars. */
export const packSummary = (p: PackProgress) => `${p.solved} / ${p.total} · ${starCount(p.stars, p.maxStars)}`;

/** One tier: heading with progress and badge, then its numbered puzzles (locked tiers say how to open them). */
function tierSection(def: PuzzleDef, t: TierProgress, prev: TierProgress | undefined) {
  const locked = t.state === 'locked';
  const tiles = t.entries.map((e, i) => {
    const n = i + 1;
    const started = !locked && !e && getSave(packSaveKey(def.id, t.level, i), 'pack');
    const label = e
      ? L(`Puzzle ${n}: ${e.s} of 3 stars, ${fmtTime(e.ms)}`, `Partie ${n} : ${e.s} étoile${e.s > 1 ? 's' : ''} sur 3, ${fmtTime(e.ms)}`)
      : started
        ? L(`Puzzle ${n}: in progress`, `Partie ${n} : en cours`)
        : L(`Puzzle ${n}`, `Partie ${n}`);
    const body = [h('b', null, n), e ? stars(e.s) : started ? h('span', { class: 'pack-dot', 'aria-hidden': 'true' }) : null];
    const cls = `pack-tile ${e ? 'is-solved' : ''} ${e?.s === 3 ? 'is-perfect' : ''} ${started ? 'is-started' : ''}`;
    return locked
      ? h('span', { class: `${cls} is-locked`, 'aria-label': `${label} (${L('locked', 'verrouillée')})` }, h('b', null, n))
      : h('a', { class: cls, href: `/packs/${def.id}/${t.level}/${n}`, 'aria-label': label, title: e ? fmtTime(e.ms) : '' }, ...body);
  });
  return h(
    'section',
    { class: `pack-tier ${locked ? 'locked' : ''}` },
    h(
      'h3',
      null,
      LEVEL_NAMES[t.level],
      h('span', { class: 'pack-count' }, `${t.solved} / ${PACK_SIZE} · ${starCount(t.stars, 3 * PACK_SIZE)}`),
      badge(t),
    ),
    locked && prev
      ? h(
          'p',
          { class: 'muted small' },
          L(
            `🔒 Solve ${UNLOCK_AT} of ${PACK_SIZE} ${LEVEL_NAMES[prev.level]} puzzles to unlock (${prev.solved} so far).`,
            `🔒 Réussissez ${UNLOCK_AT} des ${PACK_SIZE} parties ${LEVEL_NAMES[prev.level].toLowerCase()} pour débloquer (${prev.solved} jusqu’ici).`,
          ),
        )
      : null,
    h('div', { class: 'pack-grid' }, ...tiles),
  );
}

/** Packs: the overview of every game (`def` omitted), or one game's five tiers. */
export function renderPacks(el: HTMLElement, defs: PuzzleDef[], def?: PuzzleDef) {
  el.replaceChildren(h('div', { class: 'page packs' }, ...(def ? gamePage(def) : overview(defs))));
}

function gamePage(def: PuzzleDef) {
  const p = packProgress(def.id);
  return [
    h('a', { class: 'btn ghost back', href: '/packs' }, L('← All packs', '← Toutes les séries')),
    h('h1', { 'data-puzzle': def.id }, h('span', { class: 'swatchlet' }), def.name),
    h(
      'p',
      { class: 'muted' },
      h('strong', null, packSummary(p)),
      '. ',
      L(
        `${PACK_SIZE} set puzzles per level, the same for everyone. ★ solved, ★★ under par, ★★★ under par with no mistakes or hints. Solve ${UNLOCK_AT} to unlock the next level.`,
        `${PACK_SIZE} parties fixes par niveau, les mêmes pour tout le monde. ★ réussie, ★★ sous la normale, ★★★ sous la normale sans erreur ni indice. Réussissez-en ${UNLOCK_AT} pour débloquer le niveau suivant.`,
      ),
    ),
    h('div', { 'data-puzzle': def.id }, ...p.tiers.map((t, i) => tierSection(def, t, p.tiers[i - 1]))),
  ];
}

function overview(defs: PuzzleDef[]) {
  const order = new Map(CATEGORIES.map((c, i) => [c.id, i]));
  const rows = defs
    .map((d, i) => ({ d, i, p: packProgress(d.id) }))
    // Packs in progress first (most solved first), then untouched ones, then finished ones; catalog order within.
    .sort((a, b) => {
      const rank = (p: PackProgress) => (p.solved === 0 ? 1 : p.solved === p.total ? 2 : 0);
      return (
        rank(a.p) - rank(b.p) ||
        (rank(a.p) === 0 ? b.p.solved - a.p.solved : 0) ||
        (order.get(a.d.category) ?? 0) - (order.get(b.d.category) ?? 0) ||
        a.i - b.i
      );
    })
    .map(({ d, p }) => {
      const done = p.tiers.filter((t) => t.state === 'complete' || t.state === 'perfect').length;
      return h(
        'li',
        { class: `daily-item pack-row ${p.solved === p.total ? 'is-solved' : ''}`, 'data-puzzle': d.id },
        h(
          'div',
          { class: 'daily-name' },
          h('strong', null, h('span', { class: 'swatchlet' }), d.name),
          h('span', { class: 'small' }, packSummary(p)),
          h('span', { class: 'pack-bar', 'aria-hidden': 'true' }, h('i', { style: `width:${(100 * p.solved) / p.total}%` })),
        ),
        done ? h('span', { class: 'pack-badge' }, `✓ ${done} / ${p.tiers.length}`) : null,
        h(
          'a',
          {
            class: `btn ${p.solved && p.solved < p.total ? 'primary' : 'ghost'}`,
            href: `/packs/${d.id}`,
            'aria-label': `${d.name} — ${L('pack', 'séries')}`,
          },
          p.solved ? L('Continue', 'Continuer') : L('Open', 'Ouvrir'),
        ),
      );
    });
  return [
    h('a', { class: 'btn ghost back', href: '/games' }, L('← Games', '← Jeux')),
    h('h1', null, L('Packs', 'Séries')),
    h(
      'p',
      { class: 'muted' },
      L(
        `Every game has ${PACK_SIZE} set puzzles per level. Earn up to three stars on each and unlock the next level as you go.`,
        `Chaque jeu a ${PACK_SIZE} parties fixes par niveau. Gagnez jusqu’à trois étoiles sur chacune et débloquez le niveau suivant au fil du jeu.`,
      ),
    ),
    h('ol', { class: 'daily-list pack-list' }, ...rows),
  ];
}
