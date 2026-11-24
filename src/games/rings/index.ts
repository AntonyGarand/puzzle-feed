import { L, P } from '../../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../../core/types';
import { h, PALETTE, restartBtn, shake } from '../../ui/dom';
import { apply, bestMoves, biggestOut, code, genRings, legal, PEGS, towerCost, towerMove, type Move, type Pos } from './gen';
import './style.css';

/** "the left peg" / "la tige de gauche". */
const pegName = (p: number) => L(`the ${['left', 'middle', 'right'][p]} peg`, `la tige ${['de gauche', 'du milieu', 'de droite'][p]}`);

export const rings: PuzzleDef = {
  id: 'rings',
  get name() {
    return L('Rings', 'Anneaux');
  },
  category: 'moves',
  undo: true,
  get rules() {
    return L('Move rings one at a time, never big on small.', 'Déplacez les anneaux un à un, jamais un gros sur un petit.');
  },
  help: () => ({
    goal: L(
      'Move the rings so the three pegs match the goal picture above the board.',
      'Déplacez les anneaux pour que les trois tiges correspondent à l’image du but, au-dessus du plateau.',
    ),
    steps: [
      L('Only the top ring of a peg can move, one ring at a time.', 'Seul l’anneau du dessus d’une tige peut bouger, un anneau à la fois.'),
      L(
        'A ring can go on an empty peg or on a bigger ring, never on a smaller one. Rings are numbered by size.',
        'Un anneau peut aller sur une tige vide ou sur un anneau plus gros, jamais sur un plus petit. Les anneaux sont numérotés selon leur taille.',
      ),
      L(
        'Tap a peg to lift its top ring, then tap the peg where it goes. You can also drag from one peg to another, or press 1, 2 and 3.',
        'Touchez une tige pour soulever son anneau du dessus, puis touchez la tige où il va. Vous pouvez aussi glisser d’une tige à l’autre, ou appuyer sur 1, 2 et 3.',
      ),
      L(
        'The footer counts your moves and shows the fewest possible. Undo takes a move back; Restart (R) puts every ring back.',
        'Le bas de la carte compte vos coups et indique le minimum possible. « Annuler » reprend un coup; « Repartir » (R) remet tous les anneaux.',
      ),
    ],
    tips: [
      L(
        'Place the biggest misplaced ring first: the smaller ones must all gather on the third peg to let it through.',
        'Placez d’abord le plus gros anneau mal placé : les plus petits doivent tous se regrouper sur la troisième tige pour le laisser passer.',
      ),
      L(
        'To stack a tower, the smallest ring moves every other turn, always in the same direction around the pegs.',
        'Pour empiler une tour, le plus petit anneau bouge un coup sur deux, toujours dans le même sens autour des tiges.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [25, 50, 80, 150, 260]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const R = genRings(rng, d);
    const { n, start, goal, dist } = R;
    const best = dist[code(start)];
    let pos: Pos = start.slice();
    let count = 0;
    let sel = -1;
    let over = false;
    let justPicked = false;

    const ringEl = (i: number) =>
      h('span', { class: 'ring', style: `--w:${(i + 1) / n};--c:${PALETTE[i % PALETTE.length]}`, 'data-r': i }, String(i + 1));
    const stackOf = (p: Pos, peg: number) => p.flatMap((q, i) => (q === peg ? [i] : []));

    // Goal picture.
    const mini = h('div', { class: 'rings-row rings-mini', 'aria-hidden': 'true' });
    for (let peg = 0; peg < PEGS; peg++)
      mini.append(h('div', { class: 'peg' }, h('div', { class: 'stack' }, ...stackOf(goal, peg).map(ringEl))));
    const goalText =
      L('Goal: ', 'But : ') +
      [0, 1, 2]
        .map(
          (peg) =>
            stackOf(goal, peg)
              .map((i) => i + 1)
              .join(' ') || '–',
        )
        .join(' | ');
    const goalBox = h(
      'div',
      { class: 'rings-goal', role: 'img', 'aria-label': goalText, style: `--n:${n}` },
      h('span', { class: 'label' }, L('Goal', 'But')),
      mini,
    );

    // Playing pegs.
    const stage = h('div', { class: 'rings-row rings-pegs', style: `--n:${n}` });
    const stacks: HTMLElement[] = [];
    const pegs = Array.from({ length: PEGS }, (_, peg) => {
      const stack = h('div', { class: 'stack' });
      stacks.push(stack);
      const el = h('button', { class: 'peg', type: 'button', 'data-i': peg, onclick: () => tap(peg) }, stack);
      stage.append(el);
      return el;
    });
    const ringEls: HTMLElement[] = [];

    const render = () => {
      pegs.forEach((el, peg) => {
        const here = stackOf(pos, peg);
        stacks[peg].replaceChildren(
          ...here.map((i) => {
            const r = ringEl(i);
            ringEls[i] = r;
            if (peg === sel && i === here[0]) r.classList.add('up');
            return r;
          }),
        );
        const can = sel >= 0 && !!legal(pos, sel, peg);
        el.className = `peg${peg === sel ? ' sel' : ''}${can ? ' hint' : ''}`;
        el.setAttribute(
          'aria-label',
          `${pegName(peg)}${L(': ', ' : ')}${here.length ? P(here.length, ['ring', 'rings'], ['anneau', 'anneaux']) + ' ' + here.map((i) => i + 1).join(', ') : L('empty', 'vide')}`.replace(
            /^./,
            (c) => c.toUpperCase(),
          ),
        );
      });
      ctx.status(`${P(count, ['move', 'moves'], ['coup', 'coups'])} · ${L('best', 'minimum')} ${best}`);
    };

    const play = (m: Move) => {
      pos = apply(pos, m);
      count++;
      sel = -1;
      render();
      if (code(pos) === code(goal)) {
        over = true;
        ctx.solved();
      }
    };

    const tap = (peg: number) => {
      if (over) return;
      if (justPicked && peg === sel) {
        justPicked = false;
        return;
      }
      justPicked = false;
      ctx.touch();
      if (sel < 0) {
        if (pos.includes(peg)) sel = peg;
        else shake(pegs[peg]);
      } else if (peg === sel) sel = -1;
      else {
        const m = legal(pos, sel, peg);
        if (m) return play(m);
        shake(ringEls[pos.indexOf(sel)] ?? pegs[peg]);
        sel = -1;
      }
      render();
    };

    // Drag: press a peg (its top ring lifts), release over another peg.
    stage.style.touchAction = 'none';
    stage.addEventListener('pointerdown', (e) => {
      if (over) return;
      const el = (e.target as Element).closest<HTMLElement>('[data-i]');
      const peg = el ? Number(el.dataset['i']) : -1;
      if (peg < 0 || peg === sel || pos.indexOf(peg) < 0) return;
      ctx.touch();
      sel = peg;
      justPicked = true;
      render();
    });
    stage.addEventListener('pointerup', (e) => {
      if (over || sel < 0) return;
      const el = document.elementFromPoint?.(e.clientX, e.clientY)?.closest<HTMLElement>('[data-i]');
      const peg = el && stage.contains(el) ? Number(el.dataset['i']) : -1;
      if (peg < 0 || peg === sel) return;
      justPicked = false;
      tap(peg);
    });

    const restart = () => {
      if (over) return;
      pos = start.slice();
      count = 0;
      sel = -1;
      render();
    };
    ctx.controls(restartBtn(restart));

    const sv = ctx.saved as { pos?: unknown; moves?: unknown; sel?: unknown } | undefined;
    if (Array.isArray(sv?.pos) && sv.pos.length === n && sv.pos.every((p) => Number.isInteger(p) && p >= 0 && p < PEGS)) {
      pos = (sv.pos as number[]).slice();
      if (Number.isInteger(sv.moves) && (sv.moves as number) >= 0) count = sv.moves as number;
      if (Number.isInteger(sv.sel) && pos.indexOf(sv.sel as number) >= 0) sel = sv.sel as number;
      if (code(pos) === code(goal)) over = true;
    }

    // ---- Guide ----
    const hint = (): Hint | null => {
      if (over) return null;
      const left = dist[code(pos)];
      const big = biggestOut(pos, goal);
      const to = goal[big];
      const park = PEGS - pos[big] - to;
      const rest = pos.map((p, i) => (i < big ? park : i === big ? to : p));
      const straight = towerCost(pos, big - 1, park) + 1 + dist[code(rest)] === left;
      const opts = bestMoves(pos, dist);
      const tower = towerMove(pos, big - 1, park) ?? { ring: big, from: pos[big], to };
      const m = straight
        ? (opts.find((o) => o.ring === tower.ring && o.to === tower.to) ?? opts[0])
        : (opts.find((o) => o.ring === big) ?? opts[0]);
      const r = m.ring + 1,
        B = big + 1;
      let text: string;
      if (straight && m.ring === big)
        text = L(
          `Ring ${B} is the biggest ring not on its goal peg, and its way is clear: move it to ${pegName(to)}.`,
          `L’anneau ${B} est le plus gros qui n’est pas sur sa tige du but, et la voie est libre : déplacez-le sur ${pegName(to)}.`,
        );
      else if (straight) {
        // Which bigger ring is this move clearing the way for (one level up the recursion)?
        let need = park,
          k = big - 1,
          up = -1,
          upTo = -1;
        for (;;) {
          let j = k;
          while (j >= 0 && pos[j] === need) j--;
          if (j < 0 || j === m.ring) break;
          up = j;
          upTo = need;
          need = PEGS - pos[j] - need;
          k = j - 1;
        }
        const why =
          up >= 0 && m.ring === tower.ring && m.to === tower.to
            ? L(
                ` Ring ${up + 1} must get to ${pegName(upTo)} before that, so ring ${r} steps aside to ${pegName(m.to)}.`,
                ` L’anneau ${up + 1} doit d’abord aller sur ${pegName(upTo)}, alors l’anneau ${r} s’écarte sur ${pegName(m.to)}.`,
              )
            : L(` Next: ring ${r} to ${pegName(m.to)}.`, ` Ensuite : l’anneau ${r} sur ${pegName(m.to)}.`);
        text =
          L(
            `Ring ${B} is the biggest ring not on its goal peg. To reach ${pegName(to)}, every smaller ring must first stack on ${pegName(park)}.`,
            `L’anneau ${B} est le plus gros qui n’est pas sur sa tige du but. Pour qu’il atteigne ${pegName(to)}, tous les plus petits doivent d’abord s’empiler sur ${pegName(park)}.`,
          ) + why;
      } else
        text = L(
          `Ring ${B} must end on ${pegName(to)}, but here the shortest way is a detour through ${pegName(park)}: ${P(left, ['move', 'moves'], ['coup', 'coups'])} left at best. Next: ring ${r} to ${pegName(m.to)}.`,
          `L’anneau ${B} doit finir sur ${pegName(to)}, mais ici le plus court est un détour par ${pegName(park)} : ${P(left, ['move', 'moves'], ['coup', 'coups'])} au mieux. Ensuite : l’anneau ${r} sur ${pegName(m.to)}.`,
        );
      return {
        text,
        why: [ringEls[big], ringEls[m.ring]].filter((el, i, a) => el && a.indexOf(el) === i),
        at: [pegs[m.to]],
        play: () => {
          sel = -1;
          justPicked = false;
          tap(m.from);
          tap(m.to);
        },
      };
    };

    root.append(goalBox, stage);
    render();
    return {
      snapshot: () => ({ pos: pos.slice(), moves: count, sel }),
      hint,
      onKey(e) {
        const k = e.key.toLowerCase();
        if (k === 'r') restart();
        else if (k === '1' || k === '2' || k === '3') tap(Number(k) - 1);
        else if (k === 'escape' && sel >= 0) {
          sel = -1;
          render();
        } else return false;
        return true;
      },
    };
  },
};
