import { L, P } from '../../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../../core/types';
import { board, h, PALETTE, restartBtn, shake, undoBtn } from '../../ui/dom';
import { mark, setMark } from '../../ui/symbols';
import { anim } from '../../kits/move/kit';
import {
  collapseSolver,
  genCollapse,
  groupAt,
  groupList,
  hasMove,
  removeCells,
  stranded,
  type CollapseVerdict,
  type Cols,
} from './gen';
import './style.css';

/** Palette slots used for the blocks (well apart from each other in both themes). */
const TONES = [0, 1, 2, 4, 6];
/** Colour names for the guide, matching TONES (French: masculine plural, for « blocs »). */
const NAMES_EN = ['orange', 'blue', 'green', 'purple', 'pink'];
const NAMES_FR = ['orange', 'bleus', 'verts', 'violets', 'roses'];

export const collapse: PuzzleDef = {
  id: 'collapse',
  get name() {
    return L('Collapse', 'Avalanche');
  },
  category: 'moves',
  get rules() {
    return L('Tap groups of 2+ same-colour blocks to clear the board.', 'Touchez les groupes de 2+ blocs pareils : videz la grille.');
  },
  help: () => ({
    goal: L(
      'Clear the board by removing groups of touching blocks of the same colour. On Easy and Medium, leaving a few blocks is enough; from Hard on, every block must go.',
      'Videz la grille en retirant les groupes de blocs voisins de la même couleur. En Facile et Moyen, il suffit de laisser peu de blocs; dès Difficile, il faut tout retirer.',
    ),
    steps: [
      L(
        'Tap a block that touches at least one block of its colour (up, down, left or right): the whole group disappears.',
        'Touchez un bloc qui touche au moins un bloc de sa couleur (en haut, en bas, à gauche ou à droite) : tout le groupe disparaît.',
      ),
      L(
        'Blocks above fall into the gaps, and empty columns close up to the left.',
        'Les blocs au-dessus tombent dans les trous, et les colonnes vides se referment vers la gauche.',
      ),
      L(
        'A group of n blocks scores (n − 2)²: bigger groups are worth much more.',
        'Un groupe de n blocs vaut (n − 2)² points : les gros groupes rapportent beaucoup plus.',
      ),
      L(
        'When no group is left, you win if the blocks left meet the goal shown below the board; otherwise undo. Undo (Z) takes back a move; Restart (R) starts over.',
        'Quand il ne reste plus de groupe, vous gagnez si les blocs restants respectent l’objectif affiché sous la grille; sinon, annulez. Annuler (Z) reprend un coup; Repartir (R) recommence.',
      ),
    ],
    tips: [
      L(
        'Look for lone blocks first and plan how to bring a partner next to them.',
        'Repérez d’abord les blocs isolés et prévoyez comment leur amener un partenaire.',
      ),
      L(
        'Removing a group under another can merge two groups of the same colour into a bigger one.',
        'Retirer un groupe sous un autre peut réunir deux groupes de même couleur en un plus gros.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [40, 70, 120, 180, 260]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const W = byLevel(d, [6, 7, 8, 9, 10]);
    const H = W;
    const k = byLevel(d, [3, 3, 4, 4, 5]);
    const target = byLevel(d, [6, 2, 0, 0, 0]);
    const gen = genCollapse(rng, W, H, k);
    const start: Cols = gen.cols;
    // Block identities, so moves can animate each block from where it was.
    let nextId = 0;
    const startIds = start.map((col) => col.map(() => nextId++));

    let cols: Cols = [];
    let ids: number[][] = [];
    let score = 0;
    const moves: number[] = [];
    let over = false;

    const grid = board(W, H, 'collapse-grid');
    const cells = Array.from({ length: W * H }, (_, i) => {
      const el = h('div', { class: 'cell', 'data-i': i, onclick: () => tapCell(i) }, mark(-1));
      grid.append(el);
      return el;
    });
    const goalEl = h('div', { class: 'collapse-goal' });
    const at = (i: number): [number, number] => [i % W, H - 1 - Math.floor(i / W)];
    const left = () => cols.reduce((a, col) => a + col.length, 0);

    const render = () => {
      cells.forEach((el, i) => {
        const [x, y] = at(i);
        const c = cols[x]?.[y];
        if (c == null) {
          el.className = 'cell empty';
          el.removeAttribute('style');
          setMark(el.firstElementChild as HTMLElement, -1);
        } else {
          el.className = 'cell block';
          el.setAttribute('style', `--c:${PALETTE[TONES[c]]}`);
          setMark(el.firstElementChild as HTMLElement, TONES[c]);
        }
      });
      const n = left();
      goalEl.textContent =
        target > 0
          ? L(`Goal: ${target} blocks or fewer left`, `Objectif : ${target} blocs ou moins restants`)
          : L('Goal: clear every block', 'Objectif : retirer tous les blocs');
      goalEl.classList.toggle('met', n <= target);
      const tail = over
        ? ''
        : !hasMove(cols) && n > target
          ? L(' · no groups left · undo', ' · plus aucun groupe · annulez')
          : stranded(cols) > target
            ? L(' · goal out of reach · undo', ' · objectif hors d’atteinte · annulez')
            : '';
      ctx.status(
        `${L(`Score ${score}`, `Pointage ${score}`)} · ${P(n, ['block left', 'blocks left'], ['bloc restant', 'blocs restants'])}${tail}`,
      );
    };

    /** Apply a move (display cell index); returns the removed group or null if illegal. */
    const apply = (i: number) => {
      const [x, y] = at(i);
      const grp = groupAt(cols, x, y);
      if (grp.length < 2) return null;
      const gone = new Set(grp.map(([a, b]) => `${a},${b}`));
      ids = ids.map((col, a) => col.filter((_, b) => !gone.has(`${a},${b}`))).filter((col) => col.length);
      cols = removeCells(cols, grp);
      score += (grp.length - 2) ** 2;
      moves.push(i);
      return grp;
    };
    const reset = () => {
      cols = start.map((col) => col.slice());
      ids = startIds.map((col) => col.slice());
      score = 0;
      moves.length = 0;
    };

    const finish = () => {
      if (hasMove(cols)) return;
      if (left() <= target) {
        over = true;
        ctx.solved();
      } else shake(grid); // dead end: the status says so, Undo backs out
    };

    const tapCell = (i: number) => {
      if (over) return;
      const before = new Map<number, [number, number]>();
      ids.forEach((col, x) => col.forEach((id, y) => before.set(id, [x, y])));
      const grp = apply(i);
      if (!grp) {
        if (cols[at(i)[0]]?.[at(i)[1]] != null) shake(cells[i]);
        return;
      }
      ctx.touch();
      clearHover();
      render();
      // Each block slides from its old slot to its new one.
      const px = cells[1].offsetLeft - cells[0].offsetLeft,
        py = cells[W].offsetTop - cells[0].offsetTop;
      ids.forEach((col, x) =>
        col.forEach((id, y) => {
          const [ox, oy] = before.get(id)!;
          if (ox === x && oy === y) return;
          const el = cells[(H - 1 - y) * W + x];
          anim(
            el,
            [{ transform: `translate(${(ox - x) * px}px, ${(y - oy) * py}px)` }, { transform: 'none' }],
            120 + 40 * Math.max(oy - y, ox - x),
          );
        }),
      );
      finish();
    };

    // Mouse hover previews the group under the pointer.
    let hovered: HTMLElement[] = [];
    const clearHover = () => {
      for (const el of hovered) el.classList.remove('same');
      hovered = [];
    };
    grid.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || over) return;
      const el = (e.target as Element).closest<HTMLElement>('[data-i]');
      clearHover();
      if (!el) return;
      const [x, y] = at(Number(el.dataset['i']));
      const grp = groupAt(cols, x, y);
      if (grp.length < 2) return;
      hovered = grp.map(([a, b]) => cells[(H - 1 - b) * W + a]);
      for (const c of hovered) c.classList.add('same');
    });
    grid.addEventListener('pointerleave', clearHover);

    /** Move lists wiped by Restart, so Undo can bring them back. */
    const restarts: number[][] = [];
    const undo = () => {
      if (over) return;
      if (!moves.length && !restarts.length) return;
      const keep = moves.length ? moves.slice(0, -1) : restarts.pop()!;
      reset();
      for (const m of keep) apply(m);
      clearHover();
      render();
    };
    const restart = () => {
      if (over || !moves.length) return;
      restarts.push(moves.slice());
      reset();
      clearHover();
      render();
    };
    ctx.controls(undoBtn(undo), restartBtn(restart));

    reset();
    const sv = ctx.saved as { moves?: unknown } | undefined;
    if (Array.isArray(sv?.moves)) for (const m of sv.moves) if (!Number.isInteger(m) || !apply(m as number)) break;
    // ---- Guide ----
    const disp = ([x, y]: [number, number]) => (H - 1 - y) * W + x;
    /** Group label per block id, and each label's size and colour. */
    const label = (cs: Cols, is: number[][]) => {
      const of = new Map<number, number>();
      const size: number[] = [];
      cs.forEach((col, x) =>
        col.forEach((_, y) => {
          if (of.has(is[x][y])) return;
          const g = groupAt(cs, x, y);
          for (const [a, b] of g) of.set(is[a][b], size.length);
          size.push(g.length);
        }),
      );
      return { of, size };
    };
    /** Display cell of a block id in the current board. */
    const cellOf = (id: number) => {
      for (let x = 0; x < ids.length; x++) {
        const y = ids[x].indexOf(id);
        if (y >= 0) return cells[disp([x, y])];
      }
      return null;
    };
    /** Solver with memory across calls; the verdict is kept until the board changes. */
    const solver = collapseSolver(target);
    let memo: { key: string; v: CollapseVerdict } | null = null;
    const verdict = () => {
      // An unsure verdict is worth retrying once more dead ends are known (after an undo, say).
      const key = `${moves.join(',')}:${solver.learned()}`;
      if (memo?.key !== key) {
        const onPlan = moves.every((m, t) => gen.solution[t] && disp(gen.solution[t]) === m);
        memo = { key, v: solver.solve(cols, 2500, onPlan ? gen.solution.slice(moves.length) : []) };
      }
      return memo.v;
    };
    /** Dead end: the board can no longer get down to the goal. `play()` undoes the last move. */
    const check = (): Hint | null => {
      if (over || !moves.length || verdict().status !== 'dead') return null;
      const count = new Map<number, number>();
      for (const col of cols) for (const c of col) count.set(c, (count.get(c) ?? 0) + 1);
      const lone = [...count].filter(([, v]) => v === 1).map(([c]) => c);
      const why: Element[] = [];
      cols.forEach((col, x) => col.forEach((c, y) => lone.includes(c) && why.push(cells[disp([x, y])])));
      const goalEn = target ? `${target} blocks or fewer` : 'an empty board',
        goalFr = target ? `${target} blocs ou moins` : 'une grille vide';
      return {
        kind: 'stuck',
        text:
          lone.length > target
            ? L(
                `${lone.length === 1 ? `Only one ${NAMES_EN[lone[0]]} block is left: it can never join a group` : `${lone.length} colours have a single block left: none of them can ever join a group`}, so you can’t reach ${goalEn}. Undo.`,
                `${lone.length === 1 ? `Il ne reste qu’un bloc ${NAMES_FR[lone[0]].replace(/s$/, '')} : il ne pourra jamais former de groupe` : `${lone.length} couleurs n’ont plus qu’un seul bloc : aucun ne pourra former de groupe`}, et ${goalFr} est hors d’atteinte. Annulez.`,
              )
            : L(
                `No order of moves gets this board down to ${goalEn} any more: some blocks will always be left apart from their colour. Undo.`,
                `Plus aucun ordre de coups ne mène à ${goalFr} : des blocs resteront toujours séparés de leur couleur. Annulez.`,
              ),
        why,
        at: [cells[moves[moves.length - 1]]],
        action: L('Undo', 'Annuler'),
        play: undo,
      };
    };
    let lastKind = '';
    const hint = (): Hint | null => {
      if (over) return null;
      const v = verdict();
      if (v.status === 'capped' && moves.length)
        // Too tangled to check quickly: step back toward a position with a known way to clear it.
        return {
          text: L(
            `There’s no way to clear this board that can be checked from here${target ? ` down to ${target} blocks` : ''}. Undo: earlier positions have a sure way through.`,
            `Aucune façon de vider cette grille${target ? ` jusqu’à ${target} blocs` : ''} ne peut être vérifiée d’ici. Annulez : les positions précédentes ont un chemin sûr.`,
          ),
          at: [cells[moves[moves.length - 1]]],
          action: L('Undo', 'Annuler'),
          play: undo,
        };
      let pick: [number, number] | undefined = v.status === 'win' && v.next ? v.next : undefined;
      if (!pick || groupAt(cols, pick[0], pick[1]).length < 2) {
        // No proven plan (the search gave up, or the goal is already met): the biggest group that
        // isn't known to lead into a dead end.
        const all = groupList(cols).reverse();
        pick = (all.find((g) => !solver.known(removeCells(cols, g)) && stranded(removeCells(cols, g)) <= target) ?? all[0])?.[0];
      }
      if (!pick) return null;
      const grp = groupAt(cols, pick[0], pick[1]);
      const c = cols[pick[0]][pick[1]];
      const sz = grp.length;
      const en = NAMES_EN[c],
        fr = NAMES_FR[c];
      const gone = new Set(grp.map(([a, b]) => `${a},${b}`));
      const nextCols = removeCells(cols, grp);
      const nextIds = ids.map((col, a) => col.filter((_, b) => !gone.has(`${a},${b}`))).filter((col) => col.length);
      const before = label(cols, ids),
        after = label(nextCols, nextIds);
      // Groups that join after the fall: one new group fed by two or more old ones.
      const feeders = new Map<number, Set<number>>();
      for (const col of nextIds)
        for (const id of col) {
          const nl = after.of.get(id)!;
          if (!feeders.has(nl)) feeders.set(nl, new Set());
          feeders.get(nl)!.add(before.of.get(id)!);
        }
      const joined = [...feeders.entries()].filter(([, olds]) => olds.size > 1);
      const joinIds = joined.length ? nextIds.flat().filter((id) => after.of.get(id) === joined[0][0]) : [];
      const lone = joined.length ? [...joined[0][1]].some((o) => before.size[o] === 1) : false;
      const joinSize = joined.length ? after.size[joined[0][0]] : 0;
      const jc = joinIds.length ? nextCols.flat()[nextIds.flat().indexOf(joinIds[0])] : 0;
      const wholeCol = cols.some((col, x) => col.every((_, y) => gone.has(`${x},${y}`)) && x < cols.length - 1);
      const pts = (sz - 2) ** 2;
      const ring = grp.map((p) => cells[disp(p)]);
      const tap = disp(pick);
      const kinds: { kind: string; text: string; why?: Element[] }[] = [];
      if (!moves.length)
        kinds.push({
          kind: 'start',
          text: L(
            `Tap any block that touches one of its colour: this group of ${sz} ${en} blocks disappears, and the blocks above fall into the gap.`,
            `Touchez un bloc qui touche un bloc de sa couleur : ce groupe de ${sz} blocs ${fr} disparaît, et les blocs au-dessus tombent dans le trou.`,
          ),
        });
      if (joined.length) {
        const why = joinIds.map(cellOf).filter((e) => e != null) as Element[];
        kinds.push(
          lone
            ? {
                kind: 'lone',
                text: L(
                  `A lone block can never be removed by itself. Clear these ${sz} ${en} blocks and a lone ${NAMES_EN[jc]} block lands next to its colour: a group of ${joinSize}.`,
                  `Un bloc isolé ne peut jamais partir seul. Retirez ces ${sz} blocs ${fr} et un bloc ${NAMES_FR[jc].replace(/s$/, '')} isolé rejoint sa couleur : un groupe de ${joinSize}.`,
                ),
                why,
              }
            : {
                kind: 'join',
                text: L(
                  `Clear these ${sz} ${en} blocks first: the blocks above them drop, and the outlined ${NAMES_EN[jc]} blocks join up into one group of ${joinSize}.`,
                  `Retirez d’abord ces ${sz} blocs ${fr} : les blocs au-dessus descendent, et les blocs ${NAMES_FR[jc]} encadrés se rejoignent en un seul groupe de ${joinSize}.`,
                ),
                why,
              },
        );
      }
      if (wholeCol)
        kinds.push({
          kind: 'col',
          text: L(
            `This ${en} group fills a whole column. Clear it and the columns to its right slide left to close the gap.`,
            `Ce groupe ${fr.replace(/s$/, '')} remplit toute une colonne. Retirez-le et les colonnes à sa droite glissent vers la gauche.`,
          ),
        });
      if (sz >= 4)
        kinds.push({
          kind: 'big',
          text: L(
            `Big groups pay off: these ${sz} ${en} blocks score (${sz} − 2)² = ${pts} points.`,
            `Les gros groupes rapportent : ces ${sz} blocs ${fr} valent (${sz} − 2)² = ${pts} points.`,
          ),
        });
      kinds.push({
        kind: 'plain',
        text: L(
          `Clear these ${sz} ${en} blocks: every block removed brings you closer to the goal${target ? ` of ${target} or fewer` : ''}, and the blocks above fall into new spots.`,
          `Retirez ces ${sz} blocs ${fr} : chaque bloc retiré vous rapproche de l’objectif${target ? ` (${target} ou moins)` : ''}, et les blocs au-dessus tombent à de nouvelles places.`,
        ),
      });
      const say = kinds.find((x) => x.kind !== lastKind) ?? kinds[0];
      lastKind = say.kind;
      return { text: say.text, why: say.why, at: ring, play: () => tapCell(tap) };
    };

    root.append(grid, goalEl);
    render();
    return {
      snapshot: () => ({ moves }),
      check,
      hint,
      onKey(e) {
        const key = e.key.toLowerCase();
        if (key === 'z' || key === 'backspace') undo();
        else if (key === 'r') restart();
        else return false;
        return true;
      },
    };
  },
};
