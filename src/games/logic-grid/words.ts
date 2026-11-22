// Logic Grid wording: the attributes and their values in English and French, and how clues are
// phrased. No DOM; index.ts turns the ⟦item⟧ markers in clue text into icons.
import { L, locale } from '../../core/i18n';
import type { Rng } from '../../core/rng';
import type { Clue } from './gen';

/** One value of an attribute: its icon and its phrases (subject, predicate, negated predicate, bare word). */
interface Val {
  /** Emoji, or '' for names (shown as text). */
  ic: string;
  /** Palette index for colours. */
  col?: number;
  /** Short text label (names). */
  label?: string;
  en: [string, string, string, string];
  fr: [string, string, string, string];
}
/** One attribute (a row of the grid): its row icon, its name and its possible values. */
interface Group {
  ic: string;
  name: () => string;
  vals: Val[];
}

const NAMES = ['Alice', 'Bruno', 'Chloé', 'David', 'Emma', 'Félix', 'Hugo', 'Léa', 'Inès', 'Théo'];

const GROUPS: Group[] = [
  {
    ic: '👤',
    name: () => L('Name', 'Prénom'),
    vals: NAMES.map((x) => ({
      ic: '',
      label: x,
      en: [x, `is ${x}`, `isn’t ${x}`, x],
      fr: [x, `s’appelle ${x}`, `ne s’appelle pas ${x}`, x],
    })),
  },
  {
    ic: '🐾',
    name: () => L('Pet', 'Animal'),
    vals: (
      [
        ['🐱', 'cat', 'le chat'],
        ['🐶', 'dog', 'le chien'],
        ['🐦', 'bird', 'l’oiseau'],
        ['🐟', 'fish', 'le poisson'],
        ['🐰', 'rabbit', 'le lapin'],
        ['🐢', 'turtle', 'la tortue'],
      ] as const
    ).map(([ic, x, fr]) => ({
      ic,
      en: [`the ${x} owner`, `has the ${x}`, `doesn’t have the ${x}`, `the ${x}`],
      fr: [`la personne qui a ${fr}`, `a ${fr}`, `n’a pas ${fr}`, fr],
    })),
  },
  {
    ic: '🥤',
    name: () => L('Drink', 'Boisson'),
    vals: (
      [
        ['🍵', 'tea', 'du thé', 'de thé', 'le thé'],
        ['☕', 'coffee', 'du café', 'de café', 'le café'],
        ['🥛', 'milk', 'du lait', 'de lait', 'le lait'],
        ['🧃', 'juice', 'du jus', 'de jus', 'le jus'],
        ['💧', 'water', 'de l’eau', 'd’eau', 'l’eau'],
        ['🍋', 'lemonade', 'de la limonade', 'de limonade', 'la limonade'],
      ] as const
    ).map(([ic, x, part, neg, w]) => ({
      ic,
      en: [`the ${x} drinker`, `drinks ${x}`, `doesn’t drink ${x}`, x],
      fr: [`la personne qui boit ${part}`, `boit ${part}`, `ne boit pas ${neg}`, w],
    })),
  },
  {
    ic: '👕',
    name: () => L('Colour', 'Couleur'),
    vals: (
      [
        [0, 'orange', 'orange'],
        [1, 'blue', 'bleu'],
        [2, 'green', 'vert'],
        [3, 'yellow', 'jaune'],
        [4, 'purple', 'mauve'],
        [6, 'pink', 'rose'],
      ] as const
    ).map(([col, x, fr]) => ({
      ic: '',
      col,
      en: [`the person in ${x}`, `wears ${x}`, `doesn’t wear ${x}`, x],
      fr: [`la personne en ${fr}`, `s’habille en ${fr}`, `ne s’habille pas en ${fr}`, `le ${fr}`],
    })),
  },
  {
    ic: '🎯',
    name: () => L('Hobby', 'Loisir'),
    vals: (
      [
        ['♟️', 'the chess player', 'plays chess', 'doesn’t play chess', 'chess', 'joue aux échecs', 'ne joue pas aux échecs', 'les échecs'],
        [
          '🎸',
          'the guitarist',
          'plays guitar',
          'doesn’t play guitar',
          'guitar',
          'joue de la guitare',
          'ne joue pas de guitare',
          'la guitare',
        ],
        ['🎨', 'the painter', 'paints', 'doesn’t paint', 'painting', 'peint', 'ne peint pas', 'la peinture'],
        [
          '⚽',
          'the soccer player',
          'plays soccer',
          'doesn’t play soccer',
          'soccer',
          'joue au soccer',
          'ne joue pas au soccer',
          'le soccer',
        ],
        ['🚲', 'the cyclist', 'cycles', 'doesn’t cycle', 'cycling', 'fait du vélo', 'ne fait pas de vélo', 'le vélo'],
        ['🏊', 'the swimmer', 'swims', 'doesn’t swim', 'swimming', 'nage', 'ne nage pas', 'la natation'],
      ] as const
    ).map(([ic, s, p, n, w, fp, fn, fw]) => ({
      ic,
      en: [s, p, n, w],
      fr: [`la personne qui ${fp}`, fp, fn, fw],
    })),
  },
  {
    ic: '🧺',
    name: () => L('Fruit', 'Fruit'),
    vals: (
      [
        ['🍎', 'apple', 'apples', 'pommes'],
        ['🍌', 'banana', 'bananas', 'bananes'],
        ['🍇', 'grape', 'grapes', 'raisins'],
        ['🍒', 'cherry', 'cherries', 'cerises'],
        ['🍐', 'pear', 'pears', 'poires'],
        ['🍓', 'strawberry', 'strawberries', 'fraises'],
      ] as const
    ).map(([ic, x, pl, fr]) => ({
      ic,
      en: [`the ${x} lover`, `likes ${pl}`, `doesn’t like ${pl}`, pl],
      fr: [`la personne qui aime les ${fr}`, `aime les ${fr}`, `n’aime pas les ${fr}`, `les ${fr}`],
    })),
  },
];

/** Capitalises the first letter (clue sentences can start with a lowercase phrase). */
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** French "de" + noun phrase, with contraction and elision. */
const deFr = (np: string) =>
  np.startsWith('le ')
    ? `du ${np.slice(3)}`
    : np.startsWith('les ')
      ? `des ${np.slice(4)}`
      : /^[aeiouhéèAEIOUHÉÈ]/.test(np)
        ? `d’${np}`
        : `de ${np}`;

/** French "à" + noun phrase, with contraction. */
export const aFr = (np: string) => (np.startsWith('le ') ? `au ${np.slice(3)}` : np.startsWith('les ') ? `aux ${np.slice(4)}` : `à ${np}`);

/** Icons inside clue text are written as ⟦item⟧ markers (index.ts swaps them for icons). */
export const MARK = /⟦(\d+)⟧/g;
/** Clue text without its icon markers (for aria-labels). */
export const plain = (s: string) => s.replace(MARK, '');

/**
 * Draws the puzzle's rows: Name always comes first, the others are picked at random, and each row keeps
 * `n` of its values in list order. Consumes `rng` before the generator does, so keep the call order.
 */
export function pickGroups(rng: Rng, n: number, K: number): Group[] {
  const gIdx = [0, ...rng.shuffle([1, 2, 3, 4, 5]).slice(0, K - 1)].sort((a, b) => a - b);
  return gIdx.map((gi) => {
    const g = GROUPS[gi];
    const keep = rng
      .shuffle(g.vals.map((_, i) => i))
      .slice(0, n)
      .sort((a, b) => a - b);
    return { ic: g.ic, name: g.name, vals: keep.map((i) => g.vals[i]) };
  });
}

/** The value an item stands for (items are `row * n + value`). */
export const valOf = (groups: readonly Group[], n: number, item: number) => groups[Math.floor(item / n)].vals[item % n];

/** Phrase `k` of an item in the current locale: 0 subject, 1 predicate, 2 negated predicate, 3 bare word. */
const phrase = (groups: readonly Group[], n: number, item: number, k: 0 | 1 | 2 | 3) => {
  const v = valOf(groups, n, item);
  return (locale() === 'fr' ? v.fr : v.en)[k];
};

/** The bare word for an item ("the cat", "le thé"), used in hints and aria-labels. */
export const wordOf = (groups: readonly Group[], n: number, item: number) => phrase(groups, n, item, 3);

/**
 * Every clue as a capitalised sentence, with ⟦item⟧ markers after non-name items. `flip[k]` picks
 * between the two equivalent wordings of clue k (drawn at generation time so the rng stream doesn't
 * depend on the locale).
 */
export function clueTexts(groups: readonly Group[], n: number, clues: readonly Clue[], flip: readonly boolean[]): string[] {
  const fr = locale() === 'fr';
  const isName = (item: number) => item < n;
  const ph = (item: number, k: 0 | 1 | 2 | 3) => phrase(groups, n, item, k);
  const subj = (item: number) => `${ph(item, 0)}${isName(item) ? '' : `⟦${item}⟧`}`;
  const pred = (item: number, neg: boolean) => `${ph(item, neg ? 2 : 1)}${isName(item) ? '' : `⟦${item}⟧`}`;
  const of = (item: number) => (fr ? deFr(subj(item)) : `of ${subj(item)}`);
  const house = (p: number) => {
    if (p === 0) return L('the first house', 'la première maison');
    if (p === n - 1) return L('the last house', 'la dernière maison');
    if (n % 2 && p === (n - 1) / 2) return L('the middle house', 'la maison du milieu');
    return L(`house ${p + 1}`, `la maison ${p + 1}`);
  };
  const sentence = (cl: Clue, k: number) => {
    let { a, b } = cl;
    const f = flip[k];
    switch (cl.t) {
      case 'same':
      case 'diff':
        if (isName(b) || (!isName(a) && f)) [a, b] = [b, a];
        return `${subj(a)} ${pred(b, cl.t === 'diff')}.`;
      case 'at':
        return L(`${subj(a)} lives in ${house(cl.p)}.`, `${subj(a)} habite ${house(cl.p)}.`);
      case 'notAt':
        return L(`${subj(a)} doesn’t live in ${house(cl.p)}.`, `${subj(a)} n’habite pas ${house(cl.p)}.`);
      case 'adj':
        return f
          ? L(`${subj(b)} lives directly right ${of(a)}.`, `${subj(b)} habite juste à droite ${of(a)}.`)
          : L(`${subj(a)} lives directly left ${of(b)}.`, `${subj(a)} habite juste à gauche ${of(b)}.`);
      case 'before':
        return f
          ? L(`${subj(b)} lives somewhere right ${of(a)}.`, `${subj(b)} habite quelque part à droite ${of(a)}.`)
          : L(`${subj(a)} lives somewhere left ${of(b)}.`, `${subj(a)} habite quelque part à gauche ${of(b)}.`);
      case 'next':
        if (f) [a, b] = [b, a];
        return L(`${subj(a)} lives next to ${subj(b)}.`, `${subj(a)} habite à côté ${of(b)}.`);
      case 'either':
        return L(`${subj(a)} is either ${subj(cl.b)} or ${subj(cl.c)}.`, `${subj(a)} est soit ${subj(cl.b)}, soit ${subj(cl.c)}.`);
    }
  };
  return clues.map((cl, k) => cap(sentence(cl, k)));
}
