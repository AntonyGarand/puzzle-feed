import { L } from '../core/i18n';
import { byLevel, type PuzzleDef } from '../core/types';
import type { Rules } from './pushkit/engine';
import { playPush } from './pushkit/game';
import { generate } from './pushkit/gen';

const RULES: Rules = { wrap: true, ice: false, counted: false, every: 0, lead: 0 };

export const pushWrap: PuzzleDef = {
  id: 'push-wrap',
  offByDefault: true,
  get name() {
    return L('Wrap Push', 'Poussée sans bords');
  },
  category: 'moves',
  get rules() {
    return L('Push crates onto targets. The edges wrap around.', 'Poussez les caisses sur les cibles. Les bords se rejoignent.');
  },
  help: () => ({
    goal: L(
      'Push every crate onto a target square. The board has no edges: leave one side and you come back on the other.',
      'Poussez chaque caisse sur une case cible. Le plateau n’a pas de bords : sortez d’un côté et vous revenez de l’autre.',
    ),
    steps: [
      L(
        'Walk into a crate to push it one square, if the square behind it is free.',
        'Avancez contre une caisse pour la pousser d’une case, si la case derrière est libre.',
      ),
      L(
        'Going off an edge brings you (or the crate) back in on the opposite side. The faded ring around the board shows what’s over there.',
        'En sortant d’un bord, vous (ou la caisse) revenez par le côté opposé. L’anneau pâle autour du plateau montre ce qui s’y trouve.',
      ),
      L(
        'Drag your ball to trace a path, tap a square to walk there, swipe, or use the arrows, the arrow keys or WASD.',
        'Glissez votre bille pour tracer un chemin, touchez une case pour y aller, balayez, ou utilisez les flèches à l’écran, les touches fléchées ou WASD.',
      ),
      L('Undo (Z) takes back a move; Restart (R) resets the room.', 'Annuler (Z) reprend un coup; Repartir (R) remet tout à zéro.'),
    ],
    tips: [
      L(
        'A crate against the edge isn’t stuck: push it through to the other side.',
        'Une caisse contre le bord n’est pas coincée : poussez-la de l’autre côté.',
      ),
      L('The shortest way to a target may go across an edge.', 'Le plus court chemin vers une cible passe parfois par un bord.'),
    ],
  }),
  par: (d) => byLevel(d, [30, 55, 95, 150, 220]),
  create(ctx) {
    const d = ctx.difficulty;
    const [w, h] = byLevel<[number, number]>(d, [
      [5, 5],
      [6, 5],
      [6, 6],
      [7, 6],
      [7, 7],
    ]);
    const level = generate(ctx.rng, RULES, {
      w,
      h,
      boxes: byLevel(d, [1, 2, 2, 3, 3]),
      wallP: 0.3,
      minPush: byLevel(d, [4, 6, 8, 10, 12]),
      nodes: byLevel(d, [20000, 30000, 40000, 40000, 40000]),
      work: byLevel(d, [80000, 120000, 150000, 150000, 150000]),
      wantWrap: true,
    });
    return playPush(ctx, level, RULES, 'wrap');
  },
};
