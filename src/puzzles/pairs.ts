import { L, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, h, PALETTE, s, shake } from '../core/ui';
import { shape, SHAPE_EN, SHAPE_EN_PL, SHAPE_FR, SHAPE_FR_ART, SHAPE_FR_PL, SHAPES } from './shapekit/shapes';
import { int, isIntArr } from './movekit/kit';
import './pairs.css';

const symbol = (id: number) =>
  s('svg', { viewBox: '0 0 100 100', class: 'sym', 'aria-hidden': 'true' }, shape(id % SHAPES, PALETTE[Math.floor(id / SHAPES)]));

export const pairs: PuzzleDef = {
  id: 'pairs',
  get name() {
    return L('Pairs', 'Paires');
  },
  category: 'memory',
  get rules() {
    return L('Flip two cards at a time. Match every pair.', 'Retournez deux cartes à la fois. Formez toutes les paires.');
  },
  help: () => ({
    goal: L('Find every matching pair of symbols hidden under the cards.', 'Trouvez toutes les paires de symboles cachés sous les cartes.'),
    steps: [
      L('Tap a card to flip it, then tap a second one.', 'Touchez une carte pour la retourner, puis une deuxième.'),
      L('If the two symbols match, the pair stays face up.', 'Si les deux symboles sont identiques, la paire reste visible.'),
      L(
        'If not, the cards shake and flip back after a moment (or as soon as you tap another card).',
        'Sinon, les cartes tremblent et se retournent après un instant (ou dès que vous touchez une autre carte).',
      ),
      L(
        'Each pair of flips is one try, shown at the bottom. A miss only counts as a ✕ mistake when you could have known: the match of your first card was already seen, or your second card was one you’d already seen.',
        'Chaque paire de cartes retournées compte pour un essai, affiché en bas. Une paire ratée ne compte comme erreur ✕ que si vous pouviez le savoir : la jumelle de votre première carte avait déjà été vue, ou votre deuxième carte était déjà connue.',
      ),
      L(
        'On Master you have 40 tries; once fewer tries are left than pairs to find, the game is lost.',
        'En Maître, vous avez 40 essais; dès qu’il reste moins d’essais que de paires à trouver, la partie est perdue.',
      ),
    ],
    tips: [
      L(
        'Flip unknown cards first and remember where each symbol was.',
        'Retournez d’abord les cartes inconnues et retenez l’emplacement de chaque symbole.',
      ),
      L(
        'On harder levels, symbols differ only by colour or shape: look closely.',
        'Aux niveaux plus difficiles, les symboles ne diffèrent que par la couleur ou la forme : regardez bien.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [25, 45, 70, 120, 170]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const [cols, rows] = byLevel<[number, number]>(d, [
      [4, 3],
      [4, 4],
      [5, 4],
      [6, 5],
      [6, 6],
    ]);
    const n = cols * rows;
    const np = n / 2;
    const limit = byLevel(d, [0, 0, 0, 0, 40]);

    // Symbols: easy levels use clearly different shapes and colours; harder ones mix similar ones.
    let syms: number[];
    if (np <= SHAPES && d <= 2) {
      const sh = rng.shuffle([...Array(SHAPES).keys()]);
      const co = rng.shuffle([...Array(8).keys()]);
      syms = Array.from({ length: np }, (_, i) => co[i % 8] * SHAPES + sh[i]);
    } else {
      syms = rng.shuffle([...Array(SHAPES * 8).keys()]).slice(0, np);
    }
    const deck = rng.shuffle([...syms, ...syms]);

    let matched = new Array<boolean>(n).fill(false);
    let seen = new Array<boolean>(n).fill(false);
    let open: number[] = [];
    let tries = 0;
    let over = false;

    const sv = ctx.saved as { m?: unknown; seen?: unknown; open?: unknown; tries?: unknown } | undefined;
    const bits = (v: unknown) => (isIntArr(v, n) ? v.map((x) => x === 1) : null);
    const m0 = bits(sv?.m),
      s0 = bits(sv?.seen);
    if (m0 && s0) {
      matched = m0;
      seen = s0;
      if (isIntArr(sv?.open) && sv.open.length <= 2 && sv.open.every((i) => i >= 0 && i < n && !matched[i])) open = [...new Set(sv.open)];
      tries = Math.max(0, int(sv?.tries, 0));
    }

    const grid = board(cols, rows, 'pairs-grid');
    // Each card is a 3D flipper: the back (pattern) and the face (symbol) share one box, back to back.
    // Flipping is a CSS transition on `.up`, so the resumed view is the same markup without any animation.
    const els = deck.map((v, i) => {
      const el = h(
        'button',
        { type: 'button', class: 'cell pc', 'aria-label': L(`card ${i + 1}`, `carte ${i + 1}`), onclick: () => tap(i) },
        h('span', { class: 'pc-in' }, h('span', { class: 'pc-back' }), h('span', { class: 'pc-face' }, symbol(v))),
      );
      grid.append(el);
      return el;
    });
    const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    /** Web Animations on the individual `scale`/`translate` properties: never touch class/style, so resume views match. */
    const fx = (el: HTMLElement, frames: Keyframe[], ms: number, delay = 0) => {
      if (calm() || typeof el.animate !== 'function') return;
      try {
        el.animate(frames, { duration: ms, delay, easing: 'ease-out' });
      } catch {
        /* ignore */
      }
    };
    /** A mismatched pair stays face up for a moment, then flips back on its own (or on the next tap). */
    let hideTimer = 0;
    const render = () => {
      els.forEach((el, i) => {
        const up = matched[i] || open.includes(i) || over;
        el.className = `cell pc ${up ? 'up' : ''} ${matched[i] ? 'on' : ''} ${over && !matched[i] ? 'miss' : ''}`
          .replace(/\s+/g, ' ')
          .trim();
        el.setAttribute('aria-pressed', String(up));
      });
      const found = matched.filter(Boolean).length / 2;
      const left = limit - tries;
      ctx.status(
        `${L('Pairs', 'Paires')} ${found}/${np} · ${
          limit
            ? L(`${left} ${left === 1 ? 'try' : 'tries'} left`, `${left} ${left < 2 ? 'essai restant' : 'essais restants'}`)
            : P(tries, ['try', 'tries'], ['essai', 'essais'])
        }`,
      );
    };

    /**
     * A miss only counts as a mistake when you could have known better: the first card's partner was
     * already seen somewhere, or the second card was one you'd already seen (so it couldn't match).
     * Checked before this try marks `b` as seen; `a` was marked on the first flip, its partner wasn't.
     */
    const avoidable = (a: number, b: number) => {
      const partner = deck.findIndex((v, k) => k !== a && v === deck[a]);
      return seen[partner] || seen[b];
    };

    const tap = (i: number) => {
      if (over || matched[i]) return;
      clearTimeout(hideTimer);
      if (open.length === 2) {
        const was = open;
        open = [];
        if (was.includes(i)) {
          render();
          return;
        }
      }
      if (open.includes(i)) return;
      ctx.touch();
      open.push(i);
      if (open.length === 2) {
        const [a, b] = open;
        tries++;
        const hit = deck[a] === deck[b];
        if (hit) {
          matched[a] = matched[b] = true;
          open = [];
        } else if (avoidable(a, b)) {
          ctx.mistake();
        }
        seen[a] = seen[b] = true;
        render();
        if (hit) {
          // Let the second card finish turning, then the pair pops and settles.
          fx(els[a], POP, 360, 260);
          fx(els[b], POP, 360, 260);
        } else {
          fx(els[a], SHAKE, 380, 300);
          fx(els[b], SHAKE, 380, 300);
          hideTimer = window.setTimeout(() => {
            if (open.length === 2 && open[0] === a && open[1] === b) {
              open = [];
              render();
            }
          }, 1300);
        }
        if (matched.every(Boolean)) {
          over = true;
          ctx.solved();
          return;
        }
        if (limit && limit - tries < np - matched.filter(Boolean).length / 2) {
          over = true;
          open = [];
          render();
          shake(grid);
          ctx.failed();
        }
        return;
      }
      seen[i] = true;
      render();
    };

    /**
     * Guide: play like a careful player who remembers every card the demo has flipped (`seen`), never
     * peeking at unseen ones: match known pairs, otherwise flip a new card, and never waste a flip on a known one.
     */
    const named = (v: number) => syms.filter((x) => x % SHAPES === v % SHAPES).length === 1;
    const one = (v: number) => (named(v) ? L(SHAPE_EN[v % SHAPES], SHAPE_FR[v % SHAPES]) : L('symbol', 'symbole'));
    const both = (v: number) => (named(v) ? L(SHAPE_EN_PL[v % SHAPES], SHAPE_FR_PL[v % SHAPES]) : L('symbols', 'symboles'));
    const hint = (): Hint | null => {
      if (over) return null;
      const unseen = (skip: number) => els.findIndex((_, i) => !seen[i] && !matched[i] && i !== skip);
      if (open.length === 1) {
        const a = open[0];
        const partner = deck.findIndex((v, k) => k !== a && v === deck[a]);
        if (seen[partner])
          return {
            text: L(
              `You’ve already seen the other ${one(deck[a])} right here. Flip it to make the pair.`,
              `Vous avez déjà vu l’autre ${one(deck[a])} juste ici. Retournez-la pour former la paire.`,
            ),
            why: [els[a]],
            at: [els[partner]],
            play: () => tap(partner),
          };
        const b = unseen(a);
        if (b < 0) return null;
        return {
          text: L(
            `No other ${one(deck[a])} seen yet, so flip a new card. A card you’ve already seen can’t match: that miss would count as a mistake.`,
            `Vous n’avez pas encore vu l’autre ${one(deck[a])} : retournez une nouvelle carte. Une carte déjà vue ne peut pas correspondre, et ce serait une erreur.`,
          ),
          why: [els[a]],
          at: [els[b]],
          play: () => tap(b),
        };
      }
      // A pair whose two cards have both been seen: match it from memory.
      for (let i = 0; i < n; i++) {
        if (!seen[i] || matched[i]) continue;
        const j = deck.findIndex((v, k) => k > i && v === deck[i] && seen[k] && !matched[k]);
        if (j < 0) continue;
        return {
          text: L(
            `You’ve seen both ${both(deck[i])}: remember where they were and flip them one after the other.`,
            `Vous avez vu les deux ${both(deck[i])} : rappelez-vous leur place et retournez-les l’une après l’autre.`,
          ),
          at: [els[i], els[j]],
          play: () => {
            tap(i);
            tap(j);
          },
        };
      }
      const a = unseen(-1);
      if (a < 0) return null;
      if (open.length === 2) {
        const [x, y] = open;
        return {
          text: L(
            `No match: ${named(deck[x]) && named(deck[y]) ? `the ${one(deck[x])} and the ${one(deck[y])}` : 'both cards'} flip back, but remember where they are. Now flip a new card.`,
            `Pas de paire : ${named(deck[x]) && named(deck[y]) ? `${SHAPE_FR_ART[deck[x] % SHAPES]} et ${SHAPE_FR_ART[deck[y] % SHAPES]} se retournent` : 'les deux cartes se retournent'}, mais retenez leur place. Retournez maintenant une nouvelle carte.`,
          ),
          why: [els[x], els[y]],
          at: [els[a]],
          play: () => tap(a),
        };
      }
      return {
        text: tries
          ? L('Flip a card you haven’t seen yet and remember its symbol.', 'Retournez une carte encore jamais vue et retenez son symbole.')
          : L(
              'Tap a card to flip it. You know nothing yet, so any card will do: just remember what you see.',
              'Touchez une carte pour la retourner. Vous ne savez rien encore, donc n’importe laquelle fait l’affaire : retenez ce que vous voyez.',
            ),
        at: [els[a]],
        play: () => tap(a),
      };
    };

    root.append(grid);
    render();
    return {
      snapshot: () => ({ m: matched.map(Number), seen: seen.map(Number), open, tries }),
      hint,
      destroy: () => clearTimeout(hideTimer),
    };
  },
};

const POP: Keyframe[] = [{ scale: '1' }, { scale: '1.12', offset: 0.4 }, { scale: '0.97', offset: 0.75 }, { scale: '1' }];
const SHAKE: Keyframe[] = [
  { translate: '0' },
  { translate: '-7px' },
  { translate: '6px' },
  { translate: '-4px' },
  { translate: '2px' },
  { translate: '0' },
];
