import { L } from '../../core/i18n';
import { byLevel, type PuzzleDef } from '../../core/types';
import type { Rules } from '../../kits/push/engine';
import { playPush } from '../../kits/push/game';
import { generate } from '../../kits/push/gen';

const RULES: Rules = { wrap: false, ice: false, counted: true, every: 0, lead: 0 };

export const pushCount: PuzzleDef = {
  id: 'push-count',
  offByDefault: true,
  get name() {
    return L('Counted Push', 'Poussées comptées');
  },
  category: 'moves',
  get rules() {
    return L('Each crate shows how many pushes it has left.', 'Chaque caisse indique combien de poussées il lui reste.');
  },
  help: () => ({
    goal: L(
      'Push every crate onto a target square without running out of pushes.',
      'Poussez chaque caisse sur une case cible sans épuiser ses poussées.',
    ),
    steps: [
      L(
        'Walk into a crate to push it one square, if the square behind it is free.',
        'Avancez contre une caisse pour la pousser d’une case, si la case derrière est libre.',
      ),
      L(
        'The number on a crate is how many more times it can be pushed. At 0 it’s stuck for good.',
        'Le chiffre sur une caisse indique combien de fois on peut encore la pousser. À 0, elle ne bouge plus.',
      ),
      L(
        'Drag your ball to trace a path, tap a square to walk there, swipe, or use the arrows, the arrow keys or WASD.',
        'Glissez votre bille pour tracer un chemin, touchez une case pour y aller, balayez, ou utilisez les flèches à l’écran, les touches fléchées ou WASD.',
      ),
      L('Undo (Z) takes back a move; Restart (R) resets the room.', 'Annuler (Z) reprend un coup; Repartir (R) remet tout à zéro.'),
    ],
    tips: [
      L(
        'Count the squares between a crate and its target: that’s the fewest pushes it needs.',
        'Comptez les cases entre une caisse et sa cible : c’est le minimum de poussées nécessaires.',
      ),
      L(
        'A crate with exactly enough pushes must go straight to a target, with no detours.',
        'Une caisse qui a juste assez de poussées doit aller droit vers une cible, sans détour.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [30, 55, 95, 145, 220]),
  create(ctx) {
    const d = ctx.difficulty;
    const [w, h] = byLevel<[number, number]>(d, [
      [6, 6],
      [7, 6],
      [7, 7],
      [8, 7],
      [8, 8],
    ]);
    const level = generate(ctx.rng, RULES, {
      w,
      h,
      boxes: byLevel(d, [2, 2, 3, 3, 3]),
      wallP: 0.22,
      minPush: byLevel(d, [5, 8, 10, 12, 13]),
      nodes: byLevel(d, [20000, 30000, 40000, 40000, 40000]),
      work: byLevel(d, [80000, 120000, 150000, 150000, 150000]),
      // Easy leaves one spare push per crate; from Medium on, every push counts.
      slack: d === 1 ? 1 : 0,
    });
    return playPush(ctx, level, RULES, 'count');
  },
};
