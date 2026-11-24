// Seats' icons and words: wishes, traits and each venue's vocabulary.
import { L, P } from '../../core/i18n';
import { s } from '../../ui/dom';
import { letter, type Trait, type Wish } from './rules';
import type { Kind } from './venues';

/** Trait icons, 24 × 24 strokes. */
const TRAIT: Record<Trait | 'plate', string> = {
  smell: 'M6 20c-2-3 2-5 0-8s2-5 0-8M12 20c-2-3 2-5 0-8s2-5 0-8M18 20c-2-3 2-5 0-8s2-5 0-8',
  loud: 'M9 18V5l10-2v13M9 18a3 3 0 1 1-6 0a3 3 0 1 1 6 0M19 16a3 3 0 1 1-6 0a3 3 0 1 1 6 0',
  kid: 'M12 3a5 5 0 1 1 0 10a5 5 0 1 1 0-10M12 13v8M12 5.5a2.5 2.5 0 1 1 0 5',
  food: 'M4 11a8 6 0 0 1 16 0zM3 14h18M5 17h14a2 2 0 0 1-2 3H7a2 2 0 0 1-2-3',
  hat: 'M7 4h10v11H7zM3 15h18v3H3zM7 11h10',
  plate: 'M12 4a8 8 0 1 1 0 16a8 8 0 1 1 0-16M12 8.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7',
};
/** "Not near this trait" wishes: the trait icon, small, inside a no-entry ring. */
const NOT: Partial<Record<Wish['t'], Trait>> = { quiet: 'loud', nosmell: 'smell', nokid: 'kid' };

/** Wish icons, 24 × 24 strokes. */
const WISH: Record<Wish['t'], string> = {
  window: 'M4 4h16v16H4zM12 4v16M4 12h16',
  aisle: 'M5 3v18M19 3v18M12 4v3M12 10.5v3M12 17v3',
  front: 'M3 3h18v6H3zM6 15h0M12 15h0M18 15h0M6 20h0M12 20h0M18 20h0',
  back: 'M3 15h18v6H3zM6 4h0M12 4h0M18 4h0M6 9h0M12 9h0M18 9h0',
  center: 'M12 3v5M12 16v5M3 12h5M16 12h5M12 9.5a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0-5',
  kitchen: 'M7 14a4 4 0 1 1 1.5-7.7a4 4 0 0 1 7 0A4 4 0 1 1 17 14v6H7zM7 17h10',
  table: 'M3 9h18M6 9v10M18 9v10',
  alone: 'M12 4.5a3 3 0 1 1 0 6a3 3 0 1 1 0-6M6.5 20c0-3.5 2.5-6 5.5-6s5.5 2.5 5.5 6M2 9v8M22 9v8',
  next: 'M12 20 4.5 12.6C2.3 10.4 3.2 6 6.6 5.5c2.1-.3 4 .8 5.4 2.6 1.4-1.8 3.3-2.9 5.4-2.6 3.4.5 4.3 4.9 2.1 7.1Z',
  left: 'M3 7h8v10H3zM14 12h7M18 9l3 3-3 3',
  apart: 'M5 5l14 14M19 5 5 19',
  across: 'M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4',
  behind: 'M12 21V5M6 11l6-6 6 6',
  quiet: '',
  nosmell: '',
  nokid: '',
  adult:
    'M8 4.5a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0-5M3.5 21v-5a4.5 4.5 0 0 1 9 0v5M17 11a2 2 0 1 1 0 4a2 2 0 1 1 0-4M14 21v-2a3 3 0 0 1 6 0v2',
  see: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9.5a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0-5',
};

const svg = (d: string, cls: string) => s('svg', { viewBox: '0 0 24 24', class: cls, 'aria-hidden': 'true' }, s('path', { d }));
export function wishIcon(t: Wish['t']) {
  const trait = NOT[t];
  if (!trait) return svg(WISH[t], 'st-ico');
  return s(
    'svg',
    { viewBox: '0 0 24 24', class: 'st-ico', 'aria-hidden': 'true' },
    s('path', { d: TRAIT[trait], transform: 'translate(6 6) scale(0.5)', 'stroke-width': 4 }),
    s('path', { d: 'M12 2a10 10 0 1 1 0 20a10 10 0 1 1 0-20M5 5l14 14' }),
  );
}
export const traitIcon = (t: Trait | 'plate') => svg(TRAIT[t], `st-ico st-trait t-${t}`);

/** What a badge shows after its icon: the person named, or the table number. */
export const badgeText = (w: Wish) => ('o' in w ? letter(w.o) : 'n' in w ? String(w.n) : '');

/** A wish in words, after "wants to sit". */
export function say(w: Wish): string {
  switch (w.t) {
    case 'window':
      return L('by a window', 'près d’une fenêtre');
    case 'aisle':
      return L('on the aisle', 'côté allée');
    case 'front':
      return L('in the front row', 'dans la première rangée');
    case 'back':
      return L('in the back row', 'dans la dernière rangée');
    case 'center':
      return L('in the middle of a row', 'au milieu d’une rangée');
    case 'kitchen':
      return L('near the kitchen', 'près de la cuisine');
    case 'table':
      return L(`at table ${w.n}`, `à la table ${w.n}`);
    case 'alone':
      return L('with no one beside', 'sans voisin');
    case 'next':
      return L(`beside ${letter(w.o)}`, `à côté de ${letter(w.o)}`);
    case 'left':
      return L(`right on the left of ${letter(w.o)} (on the plan)`, `juste à gauche de ${letter(w.o)} (sur le plan)`);
    case 'apart':
      return L(`not beside ${letter(w.o)}`, `pas à côté de ${letter(w.o)}`);
    case 'across':
      return L(`facing ${letter(w.o)}`, `face à ${letter(w.o)}`);
    case 'behind':
      return L(`right behind ${letter(w.o)}`, `juste derrière ${letter(w.o)}`);
    case 'quiet':
      return L('with no loud neighbour', 'sans voisin bruyant');
    case 'nosmell':
      return L('away from smells', 'loin des odeurs');
    case 'nokid':
      return L('with no kid beside', 'sans enfant à côté');
    case 'adult':
      return L('beside a grown-up', 'à côté d’un adulte');
    case 'see':
      return L('not behind a big hat', 'pas derrière un grand chapeau');
  }
}
export const sayAll = (ws: Wish[]) => (ws.length ? ws.map(say).join(' · ') : L('anywhere', 'n’importe où'));

export function sayTrait(t: Trait): string {
  switch (t) {
    case 'smell':
      return L('smells strong', 'sent fort');
    case 'loud':
      return L('is loud', 'est bruyant');
    case 'kid':
      return L('is a kid', 'est un enfant');
    case 'food':
      return L('is eating: it smells, and leaves leftovers', 'mange : ça sent, et ça laisse des restes');
    case 'hat':
      return L('wears a big hat', 'porte un grand chapeau');
  }
}

/** Each venue's words: the wall at the top (and bottom), what a stage is, and who the people are. */
export const VENUE: Record<Kind, { top: () => string; bottom?: () => string; stage: () => string; people: (n: number) => string }> = {
  bus: {
    top: () => L('Front', 'Avant'),
    stage: () => L('Stop', 'Arrêt'),
    people: (n) => P(n, ['passenger', 'passengers'], ['passager', 'passagers']),
  },
  cinema: {
    top: () => L('Screen', 'Écran'),
    stage: () => L('Show', 'Séance'),
    people: (n) => P(n, ['moviegoer', 'moviegoers'], ['spectateur', 'spectateurs']),
  },
  diner: {
    top: () => L('Windows', 'Fenêtres'),
    bottom: () => L('Kitchen', 'Cuisine'),
    stage: () => L('Service', 'Service'),
    people: (n) => P(n, ['diner', 'diners'], ['client', 'clients']),
  },
};
