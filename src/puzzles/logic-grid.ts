import './logic-grid.css';
import { L, locale, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, h, PALETTE, pad } from '../core/ui';
import { type Clue, type ClueType, clueItems, generateDeduct, holds, propagate } from './logickit/deductgen';

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

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
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
const aFr = (np: string) => (np.startsWith('le ') ? `au ${np.slice(3)}` : np.startsWith('les ') ? `aux ${np.slice(4)}` : `à ${np}`);

// Icons inside clue text are written as ⟦item⟧ markers.
const MARK = /⟦(\d+)⟧/g;
const plain = (s: string) => s.replace(MARK, '');

export const logicGrid: PuzzleDef = {
  id: 'logic-grid',
  get name() {
    return L('Logic grid', 'Grille logique');
  },
  category: 'logic',
  offByDefault: true,
  get rules() {
    return L('Use the clues to find who has what in each house.', 'Trouvez qui a quoi dans chaque maison grâce aux indices.');
  },
  help: () => ({
    goal: L(
      'Each house holds one person, and each person has exactly one thing of every kind. Use the clues to work out the whole table.',
      'Chaque maison abrite une personne, et chaque personne a exactement un élément de chaque sorte. Servez-vous des indices pour remplir tout le tableau.',
    ),
    steps: [
      L(
        'Columns are houses, numbered from left to right. Each row is one kind of thing (name, pet, drink…), and every value appears once per row.',
        'Les colonnes sont les maisons, numérotées de gauche à droite. Chaque rangée est une sorte d’élément (prénom, animal, boisson…), et chaque valeur y apparaît une fois.',
      ),
      L(
        '“Next to” means a neighbouring house; “directly left” means the house just before; “somewhere left” means any house before. “Either A or B” means exactly one of the two.',
        '« À côté » veut dire une maison voisine; « juste à gauche », la maison juste avant; « quelque part à gauche », n’importe quelle maison avant. « Soit A, soit B » veut dire exactement l’un des deux.',
      ),
      L(
        'Tap a cell, then a value on the pad to place it. Tap the same value again to erase it.',
        'Touchez une case, puis une valeur du pavé pour la placer. Touchez la même valeur de nouveau pour l’effacer.',
      ),
      L(
        'Switch the pad to ✗ to rule values out of a cell: the cell then lists what is still possible.',
        'Passez le pavé en mode ✗ pour exclure des valeurs d’une case : elle affiche alors ce qui reste possible.',
      ),
      L(
        'Tap a clue to cross it off. Clues fade once their items are placed correctly and turn red when broken.',
        'Touchez un indice pour le rayer. Les indices pâlissent quand leurs éléments sont bien placés et passent au rouge s’ils ne sont pas respectés.',
      ),
    ],
    tips: [
      L(
        'Start with clues that name a house, then follow the clues that link two things together.',
        'Commencez par les indices qui nomment une maison, puis suivez ceux qui relient deux éléments.',
      ),
      L(
        'Someone “directly left” of another can’t be in the last house: rule out the edges with ✗.',
        'Quelqu’un « juste à gauche » d’un autre ne peut pas être dans la dernière maison : excluez les bords avec ✗.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [60, 150, 270, 360, 540]),
  create(ctx) {
    const { rng, difficulty: d } = ctx;
    const n = byLevel(d, [3, 4, 4, 5, 5]);
    const K = byLevel(d, [3, 3, 4, 3, 4]);
    const weights = byLevel<Partial<Record<ClueType, number>>>(d, [
      { same: 5, at: 3, diff: 2, notAt: 1, next: 1, adj: 1 },
      { same: 4, at: 2, diff: 2, notAt: 2, adj: 2, next: 2, before: 1 },
      { same: 3, at: 1.5, diff: 2, notAt: 1.5, adj: 2, next: 2, before: 2, either: 1 },
      { same: 2, at: 1, diff: 2, notAt: 1, adj: 2, next: 2, before: 2, either: 2 },
      { same: 1.5, at: 0.6, diff: 2, notAt: 1, adj: 2, next: 2.5, before: 2.5, either: 2.5 },
    ]);
    const hard: ClueType[] = ['either', 'before', 'next', 'adj', 'notAt', 'diff'];
    const easy: ClueType[] = ['at', 'same', 'diff', 'notAt'];
    const dropFirst = byLevel(d, [hard, hard, [], easy, easy]);

    // Name is always a row; the others are drawn at random, values keep the list order.
    const gIdx = [0, ...rng.shuffle([1, 2, 3, 4, 5]).slice(0, K - 1)].sort((a, b) => a - b);
    const groups = gIdx.map((gi) => {
      const g = GROUPS[gi];
      const keep = rng
        .shuffle(g.vals.map((_, i) => i))
        .slice(0, n)
        .sort((a, b) => a - b);
      return { ic: g.ic, name: g.name, vals: keep.map((i) => g.vals[i]) };
    });
    const { pos: solPos, clues } = generateDeduct({ n, groups: K, weights, dropFirst, rng });
    const size = n * K;
    const val = (item: number) => groups[Math.floor(item / n)].vals[item % n];
    const isName = (item: number) => item < n;
    const fr = locale() === 'fr';
    const ph = (item: number, k: 0 | 1 | 2 | 3) => (fr ? val(item).fr : val(item).en)[k];
    const subj = (item: number) => `${ph(item, 0)}${isName(item) ? '' : `⟦${item}⟧`}`;
    const pred = (item: number, neg: boolean) => `${ph(item, neg ? 2 : 1)}${isName(item) ? '' : `⟦${item}⟧`}`;
    const of = (item: number) => (fr ? deFr(subj(item)) : `of ${subj(item)}`);
    const house = (p: number) => {
      if (p === 0) return L('the first house', 'la première maison');
      if (p === n - 1) return L('the last house', 'la dernière maison');
      if (n % 2 && p === (n - 1) / 2) return L('the middle house', 'la maison du milieu');
      return L(`house ${p + 1}`, `la maison ${p + 1}`);
    };
    // Sentence wording is fixed at generation time (the rng stream must not depend on the locale).
    const flip = clues.map(() => rng.chance(0.5));
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
    const texts = clues.map((cl, k) => cap(sentence(cl, k)));

    // ---- state ----
    const vals = new Array<number>(size).fill(-1); // per cell (row g, column p): value index or -1
    const xs = new Array<number>(size).fill(0); // per cell: bitmask of ruled-out values
    const struck = clues.map(() => 0);
    let sel = 0;
    let mark = false;
    let done = false;

    const saved = ctx.saved as { vals?: unknown[]; xs?: unknown[]; struck?: unknown[]; sel?: unknown; mark?: unknown } | undefined;
    const okInt = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
    if (Array.isArray(saved?.vals) && saved.vals.length === size) saved.vals.forEach((v, i) => okInt(v, -1, n - 1) && (vals[i] = v));
    if (Array.isArray(saved?.xs) && saved.xs.length === size) saved.xs.forEach((v, i) => okInt(v, 0, (1 << n) - 1) && (xs[i] = v));
    if (Array.isArray(saved?.struck) && saved.struck.length === clues.length)
      saved.struck.forEach((v, i) => okInt(v, 0, 1) && (struck[i] = v));
    if (okInt(saved?.sel, 0, size - 1)) sel = saved.sel;
    if (saved?.mark === true) mark = true;

    // ---- view ----
    const icon = (item: number, cls: string) => {
      const v = val(item);
      if (v.col !== undefined) return h('span', { class: `${cls} lg-sw`, style: `--c:${PALETTE[v.col]}` });
      return h('span', { class: `${cls}${v.ic ? '' : ' lg-name'}` }, v.ic || v.label);
    };
    const wordOf = (item: number) => ph(item, 3);

    const grid = board(n + 1, K + 1, 'lg');
    grid.style.setProperty('--n', String(n));
    grid.append(h('div', { class: 'lg-hd' }));
    for (let p = 0; p < n; p++) grid.append(h('div', { class: 'lg-hd' }, String(p + 1)));
    const cellEls: HTMLButtonElement[] = [];
    for (let g = 0; g < K; g++) {
      grid.append(h('div', { class: 'lg-rl', title: groups[g].name(), 'aria-label': groups[g].name() }, groups[g].ic));
      for (let p = 0; p < n; p++) {
        const i = g * n + p;
        const el = h('button', { type: 'button', class: 'cell', 'aria-label': `${groups[g].name()} ${p + 1}`, onclick: () => select(i) });
        cellEls.push(el);
        grid.append(el);
      }
    }

    const clueEls = texts.map((t, k) => {
      const el = h('button', { type: 'button', class: 'lg-clue', 'aria-label': plain(t), onclick: () => strike(k) });
      // Each icon stays on the line of the word before it and the punctuation after it.
      let last = 0;
      for (const m of t.matchAll(MARK)) {
        const [, lead, word] = /^([^]*?)(\S*)$/.exec(t.slice(last, m.index))!;
        last = m.index + m[0].length;
        const punct = /^[.,]?/.exec(t.slice(last))![0];
        last += punct.length;
        el.append(lead, h('span', { class: 'lg-nw' }, word, icon(Number(m[1]), 'lg-ic'), punct));
      }
      el.append(t.slice(last));
      return el;
    });
    const clueBox = h('div', { class: 'lg-clues' }, ...clueEls);
    const padSlot = h('div', { class: 'lg-pad' });

    /** Column of each item on the board, or -1 when not placed exactly once. */
    const placed = () => {
      const out = new Array<number>(size).fill(-1);
      for (let g = 0; g < K; g++)
        for (let v = 0; v < n; v++) {
          let at = -1,
            cnt = 0;
          for (let p = 0; p < n; p++)
            if (vals[g * n + p] === v) {
              at = p;
              cnt++;
            }
          if (cnt === 1) out[g * n + v] = at;
        }
      return out;
    };
    const clueState = (k: number, pos: number[]) => (clueItems(clues[k]).some((it) => pos[it] < 0) ? 0 : holds(clues[k], pos) ? 1 : -1);
    const dupes = () => {
      const bad = new Set<number>();
      for (let g = 0; g < K; g++)
        for (let p = 0; p < n; p++)
          for (let q = p + 1; q < n; q++) {
            const i = g * n + p,
              j = g * n + q;
            if (vals[i] >= 0 && vals[i] === vals[j]) bad.add(i).add(j);
          }
      return bad;
    };

    const renderPad = () => {
      const g = Math.floor(sel / n);
      const keys = groups[g].vals.map((v, i) => ({
        label: v.col !== undefined ? '' : v.ic || v.label!,
        value: String(i),
        class: `${v.col !== undefined ? 'swatch' : v.ic ? 'lg-k' : 'lg-k lg-name'}${xs[sel] & (1 << i) ? ' lg-out' : ''}`,
        style: v.col !== undefined ? `--c:${PALETTE[v.col]}` : undefined,
        aria: wordOf(g * n + i),
      }));
      keys.push({ label: '✗', value: 'x', class: mark ? 'sel' : '', style: undefined, aria: L('Rule out mode', 'Mode exclusion') });
      padSlot.replaceChildren(pad(keys, (k) => (k === 'x' ? toggleMark() : press(Number(k)))));
    };

    const render = () => {
      const bad = dupes();
      const pos = placed();
      const sc = sel % n;
      cellEls.forEach((el, i) => {
        const g = Math.floor(i / n);
        let cls = 'cell';
        if (i === sel) cls += ' sel';
        else if (i % n === sc) cls += ' peer';
        if (bad.has(i)) cls += ' err';
        if (vals[i] < 0 && xs[i]) cls += ' lg-c';
        if (el.className !== cls) el.className = cls;
        if (vals[i] >= 0) el.replaceChildren(icon(g * n + vals[i], 'lg-v'));
        else if (xs[i]) {
          const left = groups[g].vals.flatMap((_, v) => (xs[i] & (1 << v) ? [] : [icon(g * n + v, 'lg-cand')]));
          el.replaceChildren(h('span', { class: 'lg-cands' }, ...left));
        } else el.replaceChildren();
      });
      clueEls.forEach((el, k) => {
        const st = clueState(k, pos);
        const cls = `lg-clue${st === 1 ? ' ok' : st === -1 ? ' bad' : ''}${struck[k] ? ' done' : ''}`;
        if (el.className !== cls) el.className = cls;
      });
      renderPad();
      ctx.status(P(vals.filter((v) => v < 0).length, ['left', 'left'], ['à remplir', 'à remplir']));
    };

    const select = (i: number) => {
      sel = i;
      render();
    };
    const toggleMark = () => {
      mark = !mark;
      render();
    };
    const strike = (k: number) => {
      ctx.touch();
      struck[k] ^= 1;
      render();
    };

    const finish = () => {
      if (vals.some((v) => v < 0) || dupes().size) return;
      const pos = placed();
      if (clues.every((cl) => holds(cl, pos))) {
        done = true;
        ctx.solved();
      }
    };

    /** Put value v in cell i (or take it out if it's already there). */
    const place = (i: number, v: number) => {
      if (done) return;
      ctx.touch();
      sel = i;
      const g = Math.floor(i / n);
      if (vals[i] === v) {
        vals[i] = -1;
        render();
        return;
      }
      vals[i] = v;
      xs[i] &= ~(1 << v);
      const pos = placed();
      const item = g * n + v;
      const broken = dupes().has(i) || clues.some((cl, k) => clueItems(cl).includes(item) && clueState(k, pos) === -1);
      render();
      if (broken) ctx.mistake();
      finish();
    };
    const press = (v: number) => {
      if (done) return;
      if (!mark) return place(sel, v);
      ctx.touch();
      xs[sel] ^= 1 << v;
      if (vals[sel] === v) vals[sel] = -1;
      render();
    };

    ctx.root.append(h('div', { class: 'lg-wrap', style: `--k:${K}` }, grid, clueBox, padSlot));
    render();

    // ---- guide ----
    const known = () => {
      const dom = new Uint8Array(size).fill((1 << n) - 1);
      vals.forEach((v, i) => {
        if (v >= 0) dom[Math.floor(i / n) * n + v] = 1 << (i % n);
      });
      return dom;
    };
    /** First item that `cs` pins to one house which is still empty on the board. */
    const newFact = (cs: Clue[]) => {
      const dom = known();
      if (!propagate(n, K, cs, dom)) return null;
      for (let it = 0; it < size; it++) {
        const m = dom[it];
        if (m & (m - 1)) continue;
        const p = 31 - Math.clz32(m);
        const cell = Math.floor(it / n) * n + p;
        if (vals[cell] < 0) return { it, p, cell };
      }
      return null;
    };
    const hintFor = (f: { it: number; p: number; cell: number }, text: string, why: Element[]): Hint => ({
      text,
      why,
      at: [cellEls[f.cell]],
      play: () => {
        mark = false;
        place(f.cell, f.it % n);
      },
    });
    /** Whether value `v` sits in cell `c` in the (unique) solution. */
    const right = (c: number, v: number) => solPos[Math.floor(c / n) * n + v] === c % n;
    /**
     * A wrong value (a repeated one or a broken clue first), then a ✗ that rules out the right value:
     * ✗ marks are the player's eliminations, so crossing out the answer is a real mistake.
     */
    const check = (): Hint | null => {
      if (done) return null;
      const wrongs = vals.flatMap((v, c) => (v >= 0 && !right(c, v) ? [c] : []));
      if (wrongs.length) {
        const fix = (i: number, text: string, why: Element[] = []): Hint => {
          const v = vals[i];
          return {
            kind: 'fix',
            text,
            why,
            at: [cellEls[i]],
            action: L('Take it out', 'Retirer la valeur'),
            play: () => {
              mark = false;
              if (vals[i] === v) place(i, v);
            },
          };
        };
        const word = (i: number) => wordOf(Math.floor(i / n) * n + vals[i]);
        const twice = dupes();
        const dup = wrongs.find((i) => twice.has(i));
        if (dup !== undefined)
          return fix(
            dup,
            L(
              `${cap(word(dup))} is in two houses, but each value appears once per row.`,
              `${cap(word(dup))} est dans deux maisons, mais chaque valeur n’apparaît qu’une fois par rangée.`,
            ),
            [...twice]
              .filter((j) => j !== dup && Math.floor(j / n) === Math.floor(dup / n) && vals[j] === vals[dup])
              .map((j) => cellEls[j]),
          );
        const pos = placed();
        for (let k = 0; k < clues.length; k++) {
          if (clueState(k, pos) !== -1) continue;
          const items = clueItems(clues[k]);
          const c = wrongs.find((i) => items.includes(Math.floor(i / n) * n + vals[i]));
          if (c !== undefined)
            return fix(
              c,
              L(
                `With ${word(c)} in house ${(c % n) + 1}, this clue no longer holds.`,
                `Avec ${word(c)} dans la maison ${(c % n) + 1}, cet indice n’est plus respecté.`,
              ),
              [clueEls[k]],
            );
        }
        const i = wrongs[0];
        return fix(
          i,
          L(
            `${cap(word(i))} in house ${(i % n) + 1} breaks no clue yet, but it leads to a dead end.`,
            `${cap(word(i))} dans la maison ${(i % n) + 1} ne brise encore aucun indice, mais mène à une impasse.`,
          ),
        );
      }
      for (let i = 0; i < size; i++) {
        if (vals[i] >= 0 || !xs[i]) continue;
        const g = Math.floor(i / n);
        const v = groups[g].vals.findIndex((_, x) => right(i, x));
        if (v < 0 || !(xs[i] & (1 << v))) continue;
        return {
          kind: 'fix',
          text: L(
            `You ruled out ${wordOf(g * n + v)} for house ${(i % n) + 1}, but it belongs there: that ✗ leads to a dead end.`,
            `Vous avez exclu ${wordOf(g * n + v)} de la maison ${(i % n) + 1}, mais c’est sa place : ce ✗ mène à une impasse.`,
          ),
          at: [cellEls[i]],
          action: L('Remove the ✗', 'Enlever le ✗'),
          play: () => {
            const was = mark;
            select(i);
            if (!mark) toggleMark();
            if (xs[i] & (1 << v)) press(v);
            if (mark !== was) toggleMark();
          },
        };
      }
      return null;
    };
    const hint = (): Hint | null => {
      if (done) return null;
      const fix = check();
      if (fix) return fix;
      // A row with a single gap.
      const last = newFact([]);
      if (last)
        return hintFor(
          last,
          L(
            `Every value appears once per row, and house ${last.p + 1} is the last gap in this one: it gets ${wordOf(last.it)}.`,
            `Chaque valeur apparaît une fois par rangée : il ne reste que ${wordOf(last.it)} pour la maison ${last.p + 1}.`,
          ),
          [],
        );
      // One clue on its own, with what's already placed.
      for (let k = 0; k < clues.length; k++) {
        const f = newFact([clues[k]]);
        if (!f) continue;
        const cl = clues[k];
        const w = wordOf(f.it),
          p = f.p + 1;
        let mate = cl.t !== 'same' ? -1 : cl.a === f.it ? cl.b : cl.b === f.it ? cl.a : -1;
        if (mate >= 0 && vals[Math.floor(mate / n) * n + f.p] !== mate % n) mate = -1;
        const text =
          cl.t === 'at' && cl.a === f.it
            ? L(`This clue puts ${w} in house ${p}.`, `Cet indice place ${w} dans la maison ${p}.`)
            : mate >= 0
              ? L(
                  `This clue pairs ${w} with ${wordOf(mate)}, already in house ${p}.`,
                  `Cet indice associe ${w} ${aFr(wordOf(mate))}, déjà dans la maison ${p}.`,
                )
              : L(
                  `With what’s already placed, this clue leaves only house ${p} for ${w}.`,
                  `Avec ce qui est déjà placé, cet indice ne laisse que la maison ${p} pour ${w}.`,
                );
        return hintFor(f, text, [clueEls[k]]);
      }
      // Several clues together.
      const f = newFact(clues);
      if (!f) return null;
      const why = clues.flatMap((cl, k) => (clueItems(cl).includes(f.it) ? [clueEls[k]] : []));
      return hintFor(
        f,
        L(
          `Rule out the houses each clue forbids: combined, they leave only house ${f.p + 1} for ${wordOf(f.it)}.`,
          `Excluez les maisons que chaque indice interdit : ensemble, ils ne laissent que la maison ${f.p + 1} pour ${wordOf(f.it)}.`,
        ),
        why,
      );
    };

    const move = (dr: number, dc: number) => {
      const r = Math.min(K - 1, Math.max(0, Math.floor(sel / n) + dr)),
        c = Math.min(n - 1, Math.max(0, (sel % n) + dc));
      select(r * n + c);
    };

    return {
      snapshot: () => ({ vals, xs, struck, sel, mark }),
      hint,
      check,
      onKey(e) {
        const k = Number(e.key);
        if (k >= 1 && k <= n) {
          press(k - 1);
          return true;
        }
        if (e.key === 'x' || e.key === 'X') {
          toggleMark();
          return true;
        }
        if (e.key === 'Backspace' || e.key === 'Delete') {
          if (vals[sel] >= 0 && !done) place(sel, vals[sel]);
          return true;
        }
        const mv: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
        if (mv[e.key]) {
          move(...mv[e.key]);
          return true;
        }
        return false;
      },
    };
  },
};
