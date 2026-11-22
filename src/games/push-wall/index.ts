import { L } from '../../core/i18n';
import { byLevel, type PuzzleDef } from '../../core/types';
import { playPush } from '../../kits/push/game';
import { generate } from '../../kits/push/gen';

export const pushWall: PuzzleDef = {
  id: 'push-wall',
  offByDefault: true,
  get name() {
    return L('Wall Rush', 'Mur en marche');
  },
  category: 'moves',
  get rules() {
    return L('Get crates home before the wall catches them.', 'Rangez les caisses avant que le mur les rattrape.');
  },
  help: () => ({
    goal: L(
      'Push every crate onto a target square before the advancing wall reaches you or a crate.',
      'Poussez chaque caisse sur une case cible avant que le mur qui avance vous rattrape, vous ou une caisse.',
    ),
    steps: [
      L(
        'Walk into a crate to push it one square, if the square behind it is free.',
        'Avancez contre une caisse pour la pousser d’une case, si la case derrière est libre.',
      ),
      L(
        'Every step counts. After a set number of moves, the wall on the left swallows one more column. The counter above the board shows how many moves are left.',
        'Chaque pas compte. Après un certain nombre de coups, le mur de gauche avale une colonne de plus. Le compteur au-dessus du plateau indique les coups restants.',
      ),
      L(
        'If the wall catches you or a crate, undo a few moves and try a faster route.',
        'Si le mur vous rattrape, vous ou une caisse, annulez quelques coups et essayez un trajet plus rapide.',
      ),
      L(
        'Drag your ball to trace a path, tap a square to walk there, swipe, or use the arrows, the arrow keys or WASD. Undo (Z), Restart (R).',
        'Glissez votre bille pour tracer un chemin, touchez une case pour y aller, balayez, ou utilisez les flèches, les touches fléchées ou WASD. Annuler (Z), Repartir (R).',
      ),
    ],
    tips: [
      L('Deal with the crates closest to the wall first.', 'Occupez-vous d’abord des caisses les plus près du mur.'),
      L('Undo also turns back the wall, so experiment freely.', 'Annuler fait aussi reculer le mur : expérimentez sans crainte.'),
    ],
  }),
  par: (d) => byLevel(d, [30, 50, 80, 130, 190]),
  create(ctx) {
    const d = ctx.difficulty;
    const [w, h] = byLevel<[number, number]>(d, [
      [7, 5],
      [8, 5],
      [8, 6],
      [9, 6],
      [10, 6],
    ]);
    // The room is built against a faster wall than the one you play with on most levels, which leaves slack.
    const genEvery = byLevel(d, [4, 5, 4, 5, 4]);
    const every = byLevel(d, [5, 6, 5, 5, 4]);
    const lead = 1;
    const level = generate(
      ctx.rng,
      { wrap: false, ice: false, counted: false, every: genEvery, lead },
      {
        w,
        h,
        boxes: byLevel(d, [1, 2, 2, 3, 3]),
        wallP: 0.15,
        minPush: byLevel(d, [5, 8, 9, 10, 12]),
        nodes: byLevel(d, [20000, 30000, 40000, 40000, 40000]),
        work: byLevel(d, [80000, 120000, 150000, 150000, 150000]),
        startCols: byLevel(d, [3, 4, 4, 5, 5]),
      },
    );
    return playPush(ctx, level, { wrap: false, ice: false, counted: false, every, lead }, 'wall');
  },
};
