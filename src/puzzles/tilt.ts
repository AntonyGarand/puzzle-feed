import { L, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, btn, h, pad, shake } from '../core/ui';
import { keyDir, onSwipe, type Dir } from './movekit/kit';
import { BLOCK, fullMask, generate, solve, tilt as tiltBoard, type State } from './tiltkit/engine';
import './tilt.css';

const DIR_EN = ['up', 'right', 'down', 'left'];
const DIR_FR = ['vers le haut', 'vers la droite', 'vers le bas', 'vers la gauche'];
const COL_EN = ['pink', 'blue', 'yellow'];
const COL_FR = ['rose', 'bleue', 'jaune'];

export const tilt: PuzzleDef = {
  id: 'tilt',
  get name() {
    return L('Tilt', 'Bascule');
  },
  category: 'moves',
  offByDefault: true,
  get rules() {
    return L('Tilt the board to drop each marble in its hole.', 'Inclinez le plateau : chaque bille dans son trou.');
  },
  help: () => ({
    goal: L(
      'Tilt the board so every marble drops into a hole of its own colour, before you run out of moves.',
      'Inclinez le plateau pour que chaque bille tombe dans un trou de sa couleur, avant d’épuiser vos coups.',
    ),
    steps: [
      L(
        'Swipe on the board, tap an arrow button or press the arrow keys / WASD: gravity turns that way.',
        'Balayez le plateau, touchez une flèche ou utilisez les touches fléchées / WASD : la gravité bascule de ce côté.',
      ),
      L(
        'Every marble and grey block slides until it hits a wall, the edge or another piece.',
        'Chaque bille et chaque bloc gris glisse jusqu’à un mur, au bord ou à une autre pièce.',
      ),
      L(
        'A marble rolling onto a hole of its colour drops in and plugs it: the hole becomes floor.',
        'Une bille qui roule sur un trou de sa couleur y tombe et le bouche : le trou devient plancher.',
      ),
      L(
        'Blocks and marbles of another colour can’t cross an open hole: they stop in front of it, as at a wall.',
        'Les blocs et les billes d’une autre couleur ne franchissent pas un trou ouvert : ils s’arrêtent devant, comme à un mur.',
      ),
      L(
        'The move limit is the best solution plus a few spares. Undo (Z) takes back a tilt; Restart (R) starts over.',
        'La limite de coups est la meilleure solution plus quelques coups de réserve. Annuler (Z) reprend un coup; Repartir (R) recommence.',
      ),
    ],
    tips: [
      L(
        'Look for a wall, block or other marble that can stop a marble right in line with its hole.',
        'Cherchez un mur, un bloc ou une autre bille qui arrêtera une bille pile dans l’axe de son trou.',
      ),
      L(
        'A hole of another colour is a handy stopper too, until you fill it.',
        'Un trou d’une autre couleur fait aussi un bon butoir, tant qu’il n’est pas bouché.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [20, 45, 80, 120, 180]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const [size, colours, marbles, blocks, walls, lo, hi] = byLevel<[number, number, number, number, number, number, number]>(d, [
      [5, 1, 2, 0, 3, 2, 3],
      [6, 2, 3, 0, 5, 3, 5],
      [6, 2, 4, 1, 6, 5, 7],
      [6, 3, 4, 1, 6, 6, 9],
      [7, 3, 4, 2, 10, 7, 11],
    ]);
    const puz = generate(rng, { size, colours, marbles, blocks, walls, lo, hi, tries: 400, budget: 40000 });
    const { lay, kinds, start } = puz;
    const n = lay.w;
    const full = fullMask(lay);
    const limit = puz.opt + byLevel(d, [3, 3, 2, 2, 2]);

    let st: State = start;
    /** Hole cell each sunk piece fell into (for drawing it there). */
    let sunkAt: number[] = kinds.map(() => -1);
    let history: Dir[] = [];
    let done = false;

    /** Apply one tilt; null if nothing moves. */
    const apply = (dir: Dir) => {
      const r = tiltBoard(lay, kinds, st, dir);
      if (!r.moved) return null;
      st = { pos: r.pos, filled: r.filled };
      r.drops.forEach((cell, i) => (sunkAt[i] = cell));
      return r;
    };
    const replay = (dirs: Dir[]) => {
      st = start;
      sunkAt = kinds.map(() => -1);
      history = [];
      for (const dir of dirs) {
        if (history.length >= limit - 1 || st.filled === full || !apply(dir)) break;
        history.push(dir);
        if (st.filled === full) {
          // A saved game is never finished: drop the winning tilt.
          replay(history.slice(0, -1));
          return;
        }
      }
    };
    const sv = ctx.saved as { h?: unknown } | undefined;
    if (Array.isArray(sv?.h)) replay(sv.h.filter((x): x is Dir => x === 0 || x === 1 || x === 2 || x === 3));

    // Board: floor, walls and holes as cells; pieces float above and slide with CSS transitions.
    const grid = board(n, n, 'tilt-grid');
    const cells = Array.from({ length: n * n }, (_, i) => {
      const el = h('div', { class: 'cell' });
      if (lay.hole[i] >= 0) el.setAttribute('style', `--c:var(--tilt-c${lay.hole[i]})`);
      grid.append(el);
      return el;
    });
    const layer = h('div', { class: 'tilt-layer', 'aria-hidden': 'true' });
    const pieces = kinds.map((k) => {
      const el = h('div', { class: k === BLOCK ? 'tilt-pc bk' : 'tilt-pc mb' });
      if (k !== BLOCK) el.style.setProperty('--c', `var(--tilt-c${k})`);
      layer.append(el);
      return el;
    });
    grid.append(layer);

    const remaining = () => limit - history.length;
    /** Solver result for the current position, kept until it changes (status line, check() and hint()). */
    let memo: { key: string; sol: ReturnType<typeof solve> } | null = null;
    const solveHere = () => {
      const key = `${st.filled}|${st.pos.join(',')}`;
      if (memo?.key !== key) memo = { key, sol: solve(lay, kinds, st, 60000) };
      return memo.sol;
    };
    const render = () => {
      cells.forEach((el, i) => {
        const hi2 = lay.holeIdx[i];
        const cls = ['cell'];
        if (lay.wall[i]) cls.push('wall');
        if (hi2 >= 0) cls.push((st.filled >> hi2) & 1 ? 'hl pl' : 'hl');
        if (st.pos.includes(i)) cls.push('occ');
        el.className = cls.join(' ');
      });
      pieces.forEach((el, i) => {
        const at = st.pos[i] >= 0 ? st.pos[i] : sunkAt[i];
        el.style.setProperty('--x', String(at % n));
        el.style.setProperty('--y', String(Math.floor(at / n)));
        el.classList.toggle('sunk', st.pos[i] < 0);
      });
      if (done) return;
      const left = kinds.filter((k, i) => k !== BLOCK && st.pos[i] >= 0).length;
      const marblesLeft = P(left, ['marble', 'marbles'], ['bille', 'billes']);
      // Warn when the limit can no longer be met, so Undo still saves the game.
      const sol = history.length ? solveHere() : null;
      const stuck = !!sol && sol.dist > remaining();
      const moves = P(remaining(), ['move', 'moves'], ['coup', 'coups']);
      ctx.status(
        stuck
          ? `${marblesLeft} · ${moves}${L(': not enough, undo', ' : insuffisant, annulez')}`
          : `${marblesLeft} · ${P(remaining(), ['move left', 'moves left'], ['coup restant', 'coups restants'])}`,
      );
    };

    const move = (dir: Dir) => {
      if (done) return;
      const r = apply(dir);
      if (!r) {
        shake(grid);
        return;
      }
      ctx.touch();
      history.push(dir);
      if (st.filled === full) {
        done = true;
        render();
        ctx.status(`${L('Solved in', 'Réussi en')} ${P(history.length, ['move', 'moves'], ['coup', 'coups'])}`);
        ctx.solved();
        return;
      }
      if (remaining() <= 0) {
        done = true;
        render();
        shake(grid);
        ctx.status(L('Out of moves', 'Plus de coups'));
        ctx.failed();
        return;
      }
      render();
    };
    const undo = () => {
      if (done || !history.length) return;
      replay(history.slice(0, -1));
      render();
    };
    const reset = () => {
      if (done || !history.length) return;
      replay([]);
      render();
    };

    onSwipe(grid, move);
    const arrows = pad(
      [
        { label: '←', value: '3', aria: L('Tilt left', 'Incliner vers la gauche') },
        { label: '↑', value: '0', aria: L('Tilt up', 'Incliner vers le haut') },
        { label: '↓', value: '2', aria: L('Tilt down', 'Incliner vers le bas') },
        { label: '→', value: '1', aria: L('Tilt right', 'Incliner vers la droite') },
      ],
      (v) => move(Number(v) as Dir),
    );
    arrows.classList.add('tilt-pad');
    ctx.controls(btn(L('Undo', 'Annuler'), undo, 'ghost'), btn(L('Restart', 'Repartir'), reset, 'ghost'));
    root.append(grid, arrows);
    render();

    /** Guide: follow a shortest route, explaining what each tilt achieves. */
    /** Dead ends: no sequence of tilts sinks every marble any more, or not within the moves left. */
    const check = (): Hint | null => {
      if (done || !history.length) return null;
      const sol = solveHere();
      if (!sol || sol.dist <= remaining()) return null;
      const left = kinds.map((_, i) => i).filter((i) => kinds[i] !== BLOCK && st.pos[i] >= 0);
      return {
        kind: 'stuck',
        text:
          sol.dist === Infinity
            ? L(
                'No sequence of tilts can drop every marble in its hole from here: the pieces only ever stop against the same stoppers. Undo.',
                'Plus aucune suite d’inclinaisons ne fait tomber toutes les billes dans leur trou : les pièces s’arrêtent toujours contre les mêmes butoirs. Annulez.',
              )
            : L(
                `Not enough moves: from here it takes at least ${sol.dist} tilts, and you have ${remaining()} left. Undo.`,
                `Pas assez de coups : d’ici, il faut au moins ${sol.dist} inclinaisons, et il vous en reste ${remaining()}. Annulez.`,
              ),
        why: left.map((i) => pieces[i]),
        at: left.map((i) => cells[st.pos[i]]),
        action: L('Undo', 'Annuler'),
        play: undo,
      };
    };
    const hint = (): Hint | null => {
      if (done) return null;
      const sol = solveHere();
      if (!sol || sol.first < 0 || sol.dist > remaining()) return null;
      const dir = sol.first as Dir;
      const r = tiltBoard(lay, kinds, st, dir);
      const way = L(DIR_EN[dir], DIR_FR[dir]);
      const movedIdx = kinds.map((_, i) => i).filter((i) => st.pos[i] >= 0 && r.pos[i] !== st.pos[i]);
      const why = movedIdx.map((i) => pieces[i]);
      const dest = (i: number) => cells[r.pos[i] >= 0 ? r.pos[i] : r.drops.get(i)!];
      const play = () => move(dir);
      if (r.drops.size) {
        const sunk = [...r.drops.keys()];
        const c = kinds[sunk[0]];
        const text =
          sunk.length === 1
            ? L(
                `The ${COL_EN[c]} marble has a clear run to its hole: tilt ${way} and it drops in.`,
                `La bille ${COL_FR[c]} a la voie libre jusqu’à son trou : inclinez ${way} et elle y tombe.`,
              )
            : L(
                `Tilt ${way}: ${sunk.length} marbles roll straight into holes of their colour.`,
                `Inclinez ${way} : ${sunk.length} billes roulent droit dans des trous de leur couleur.`,
              );
        return { text, why: sunk.map((i) => pieces[i]), at: sunk.map((i) => cells[r.drops.get(i)!]), play };
      }
      // A marble that ends this tilt one clear roll away from its hole.
      const next = { pos: r.pos, filled: r.filled };
      const lined = movedIdx.find(
        (i) => kinds[i] !== BLOCK && [0, 1, 2, 3].some((d2) => d2 !== dir && tiltBoard(lay, kinds, next, d2).drops.has(i)),
      );
      if (lined != null) {
        const c = kinds[lined];
        return {
          text: L(
            `Tilt ${way}: the ${COL_EN[c]} marble stops in line with its hole, ready to roll in on the next tilt.`,
            `Inclinez ${way} : la bille ${COL_FR[c]} s’arrête dans l’axe de son trou, prête à y rouler au prochain coup.`,
          ),
          why: [pieces[lined]],
          at: [dest(lined)],
          play,
        };
      }
      const block = movedIdx.find((i) => kinds[i] === BLOCK);
      if (block != null)
        return {
          text: L(
            `Tilt ${way} to move the grey block: it becomes a stopper (or gets out of the way) for the marbles. ${sol.dist} tilts to go.`,
            `Inclinez ${way} pour déplacer le bloc gris : il sert de butoir (ou libère le passage) aux billes. Encore ${sol.dist} coups.`,
          ),
          why: [pieces[block]],
          at: [dest(block)],
          play,
        };
      return {
        text: L(
          `No marble can reach its hole yet. Tilt ${way} to reposition them against new stoppers: ${sol.dist} tilts to go.`,
          `Aucune bille ne peut encore atteindre son trou. Inclinez ${way} pour les replacer contre de nouveaux butoirs : encore ${sol.dist} coups.`,
        ),
        why,
        at: movedIdx.map(dest),
        play,
      };
    };

    return {
      snapshot: () => ({ h: history }),
      check,
      hint,
      onKey(e) {
        const k = keyDir(e);
        if (k != null) {
          move(k);
          return true;
        }
        if (e.key === 'z' || e.key === 'Backspace' || e.key === 'u') {
          undo();
          return true;
        }
        if (e.key === 'r') {
          reset();
          return true;
        }
        return false;
      },
    };
  },
};
