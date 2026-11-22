import { L, P } from '../../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../../core/types';
import { board, h, shake } from '../../ui/dom';
import './style.css';

export const memory: PuzzleDef = {
  id: 'memory',
  get name() {
    return L('Memory', 'Mémoire');
  },
  category: 'memory',
  get rules() {
    return L('Memorise the lit tiles, then tap them. Three lives.', 'Retenez les cases allumées, puis touchez-les. Trois vies.');
  },
  help: () => ({
    goal: L('Remember which tiles light up, then find them all again.', 'Retenez quelles cases s’allument, puis retrouvez-les toutes.'),
    steps: [
      L('When the game appears, some tiles light up for a moment.', 'Quand le jeu s’affiche, quelques cases s’allument un instant.'),
      L('Once they go dark, tap every tile that was lit.', 'Une fois éteintes, touchez toutes les cases qui étaient allumées.'),
      L(
        'A wrong tile is marked and costs one of your three lives (the hearts at the top).',
        'Une mauvaise case est marquée et vous coûte une de vos trois vies (les cœurs en haut).',
      ),
      L(
        'Lose all three and the tiles you missed are shown. Higher levels mean a bigger grid and more tiles.',
        'Si vous les perdez toutes, les cases manquées sont révélées. Plus le niveau monte, plus la grille et le nombre de cases grandissent.',
      ),
    ],
    tips: [
      L(
        'See the lit tiles as a shape or pattern instead of remembering them one by one.',
        'Voyez les cases allumées comme une forme plutôt que de les retenir une par une.',
      ),
      L('Tap the ones you’re sure of first.', 'Touchez d’abord celles dont vous êtes sûr.'),
    ],
  }),
  par: (d) => byLevel(d, [8, 10, 14, 18, 24]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const n = byLevel(d, [3, 4, 4, 5, 6]);
    const k = byLevel(d, [3, 5, 6, 8, 11]);
    const showMs = byLevel(d, [1400, 1500, 1500, 1800, 2200]);
    const targets = new Set(rng.shuffle([...Array(n * n).keys()]).slice(0, k));
    const found = new Set<number>();
    let lives = 3;
    let phase: 'wait' | 'show' | 'play' | 'over' = 'wait';
    let timer = 0;

    const grid = board(n);
    const cells = Array.from({ length: n * n }, (_, i) => {
      const el = h('button', { type: 'button', class: 'cell', onclick: () => tap(i) });
      grid.append(el);
      return el;
    });
    const status = () => {
      ctx.lives(lives, 3);
      ctx.status(
        phase === 'play'
          ? P(k - found.size, ['tile to find', 'tiles to find'], ['case à trouver', 'cases à trouver'])
          : phase === 'show'
            ? L('Remember…', 'Mémorisez…')
            : L('Get ready', 'Préparez-vous'),
      );
    };
    const reveal = (on: boolean) => targets.forEach((i) => cells[i].classList.toggle('on', on));

    const start = () => {
      if (phase !== 'wait') return;
      phase = 'show';
      status();
      timer = window.setTimeout(() => {
        reveal(true);
        timer = window.setTimeout(() => {
          reveal(false);
          phase = 'play';
          status();
        }, showMs);
      }, 500);
    };
    const tap = (i: number) => {
      if (phase !== 'play' || found.has(i) || cells[i].classList.contains('miss')) return;
      ctx.touch();
      if (targets.has(i)) {
        found.add(i);
        cells[i].classList.add('on');
        status();
        if (found.size === k) {
          phase = 'over';
          ctx.solved();
        }
      } else {
        lives--;
        ctx.mistake();
        cells[i].classList.add('miss');
        status();
        if (lives > 0) shake(grid);
        if (lives === 0) {
          phase = 'over';
          targets.forEach((t) => !found.has(t) && cells[t].classList.add('hint'));
          ctx.failed();
        }
      }
    };
    /** Guide: skip the rest of the showing (as if the player had memorised it) and start tapping. */
    const skipShow = () => {
      if (phase !== 'wait' && phase !== 'show') return;
      clearTimeout(timer);
      reveal(false);
      phase = 'play';
      status();
    };
    const rc = (i: number) => [Math.floor(i / n) + 1, (i % n) + 1];
    const touching = (a: number, b: number) => Math.abs(Math.floor(a / n) - Math.floor(b / n)) <= 1 && Math.abs((a % n) - (b % n)) <= 1;
    /** Guide: watch the lit tiles, then tap them back, using the shape built so far. */
    const hint = (): Hint | null => {
      if (phase === 'over') return null;
      const lit = [...targets].sort((a, b) => a - b);
      if (phase !== 'play')
        return {
          text: L(
            `Watch: ${k} tiles light up for a moment. Remember them as one shape rather than one by one.`,
            `Regardez : ${k} cases s’allument un instant. Retenez-les comme une seule forme plutôt qu’une par une.`,
          ),
          at: lit.map((i) => cells[i]),
          play: skipShow,
        };
      const left = lit.filter((i) => !found.has(i));
      if (!left.length) return null;
      const got = [...found].map((i) => cells[i]);
      if (!found.size) {
        const [r, c] = rc(left[0]);
        return {
          text: L(
            `The tiles went dark. Tap one you’re sure of, like the one in row ${r}, column ${c}.`,
            `Les cases se sont éteintes. Touchez-en une dont vous êtes sûr, comme celle de la rangée ${r}, colonne ${c}.`,
          ),
          at: [cells[left[0]]],
          play: () => tap(left[0]),
        };
      }
      if (left.length === 1)
        return {
          text: L(
            'One tile left: it completes the shape you remembered. Tap it to finish.',
            'Il en reste une : elle complète la forme mémorisée. Touchez-la pour terminer.',
          ),
          why: got,
          at: [cells[left[0]]],
          play: () => tap(left[0]),
        };
      const near = left.find((i) => [...found].some((f) => touching(f, i)));
      if (near != null)
        return {
          text: L(
            'Right next to the tile you found, another one was lit: follow the shape. A wrong tap would cost a life.',
            'Juste à côté de la case trouvée, une autre était allumée : suivez la forme. Une erreur vous coûterait une vie.',
          ),
          why: got,
          at: [cells[near]],
          play: () => tap(near),
        };
      const [r] = rc(left[0]);
      return {
        text: L(
          `Another lit tile was in row ${r}, apart from the others. Tap it.`,
          `Une autre case allumée était dans la rangée ${r}, à l’écart des autres. Touchez-la.`,
        ),
        why: got,
        at: [cells[left[0]]],
        play: () => tap(left[0]),
      };
    };
    root.append(grid);
    status();
    return {
      activate: start,
      hint,
      destroy: () => clearTimeout(timer),
    };
  },
};
