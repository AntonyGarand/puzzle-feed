import { L } from '../core/i18n';
import { byLevel, type PuzzleDef } from '../core/types';
import type { Rules } from './pushkit/engine';
import { playPush } from './pushkit/game';
import { generate } from './pushkit/gen';

const RULES: Rules = { wrap: false, ice: true, counted: false, every: 0, lead: 0 };

export const pushIce: PuzzleDef = {
  id: 'push-ice',
  offByDefault: true,
  get name() {
    return L('Ice Push', 'Poussée sur glace');
  },
  category: 'moves',
  get rules() {
    return L('Crates slide on ice until they hit something.', 'Sur la glace, les caisses glissent jusqu’à un obstacle.');
  },
  help: () => ({
    goal: L('Push every crate onto a target square. The floor is ice!', 'Poussez chaque caisse sur une case cible. Le sol est glacé!'),
    steps: [
      L(
        'Walk into a crate to push it. On ice it keeps sliding until it hits a wall or another crate.',
        'Avancez contre une caisse pour la pousser. Sur la glace, elle glisse jusqu’à frapper un mur ou une autre caisse.',
      ),
      L(
        'You walk normally: only the crates slide. You can’t pull them.',
        'Vous marchez normalement : seules les caisses glissent. Impossible de les tirer.',
      ),
      L(
        'Drag your ball to trace a path, tap a square to walk there, swipe, or use the arrows, the arrow keys or WASD.',
        'Glissez votre bille pour tracer un chemin, touchez une case pour y aller, balayez, ou utilisez les flèches à l’écran, les touches fléchées ou WASD.',
      ),
      L('Undo (Z) takes back a move; Restart (R) resets the room.', 'Annuler (Z) reprend un coup; Repartir (R) remet tout à zéro.'),
    ],
    tips: [
      L(
        'A crate only stops against something: use walls and other crates as stoppers.',
        'Une caisse s’arrête seulement contre un obstacle : servez-vous des murs et des autres caisses comme butées.',
      ),
      L(
        'Place a stopper crate first, then slide the next one against it.',
        'Placez d’abord une caisse butée, puis faites glisser la suivante contre elle.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [25, 45, 80, 130, 200]),
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
      boxes: byLevel(d, [1, 2, 2, 3, 3]),
      wallP: 0.2,
      minPush: byLevel(d, [2, 4, 5, 7, 9]),
      nodes: byLevel(d, [20000, 30000, 40000, 40000, 40000]),
      work: byLevel(d, [80000, 120000, 150000, 150000, 150000]),
    });
    return playPush(ctx, level, RULES, 'ice');
  },
};
