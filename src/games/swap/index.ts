import { L, P } from '../../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../../core/types';
import { board, h, PALETTE, restartBtn, shake } from '../../ui/dom';
import { mark, setMark } from '../../ui/symbols';
import { anim, GROW, keyDir, type Dir } from '../../kits/move/kit';
import { adjacent, bestMove, createLevel, lineScore, play, restore, type Preview, type State } from './rules';
import './style.css';

/** Palette slot per gem colour (most distinct first: orange, blue, green, yellow, purple, pink, cyan). */
const TONES = [0, 1, 2, 3, 4, 6, 5];
/** Colour names for the guide and labels, matching TONES (French: feminine, for « gemme »). */
const NAMES_EN = ['orange', 'blue', 'green', 'yellow', 'purple', 'pink', 'cyan'];
const NAME_FR = ['orange', 'bleue', 'verte', 'jaune', 'violette', 'rose', 'cyan'];
const NAMES_FR = ['orange', 'bleues', 'vertes', 'jaunes', 'violettes', 'roses', 'cyan'];
/** The symbol each colour carries (see src/ui/symbols.ts), for screen readers. */
const SHAPES_EN = ['triangle', 'square', 'circle', 'star', 'diamond', 'heart', 'cross'];
const SHAPES_FR = ['triangle', 'carré', 'cercle', 'étoile', 'losange', 'cœur', 'croix'];
const DIR_EN = ['up', 'right', 'down', 'left'];
const DIR_FR = ['vers le haut', 'vers la droite', 'vers le bas', 'vers la gauche'];

export const swap: PuzzleDef = {
  id: 'swap',
  get name() {
    return L('Swap', 'Échange');
  },
  category: 'moves',
  get rules() {
    return L('Swap neighbouring gems to line up 3 or more of a kind.', 'Échangez des gemmes voisines pour en aligner 3 pareilles.');
  },
  help: () => ({
    goal: L(
      'Reach the target score before you run out of moves by lining up gems of the same colour.',
      'Atteignez le pointage visé avant d’épuiser vos coups en alignant des gemmes de la même couleur.',
    ),
    steps: [
      L(
        'Swap two neighbouring gems (side by side or one above the other) to line up 3 or more of the same colour, across or down.',
        'Échangez deux gemmes voisines (côte à côte ou l’une au-dessus de l’autre) pour en aligner 3 ou plus de la même couleur, en ligne ou en colonne.',
      ),
      L(
        `Lines clear: 3 gems score ${lineScore(3)}, 4 score ${lineScore(4)}, 5 or more score ${lineScore(5)}. The gems above fall and new ones drop in.`,
        `Les lignes disparaissent : 3 gemmes valent ${lineScore(3)} points, 4 en valent ${lineScore(4)}, 5 ou plus en valent ${lineScore(5)}. Les gemmes au-dessus tombent et de nouvelles arrivent.`,
      ),
      L(
        'Lines made by falling gems clear too, in a cascade: the 2nd wave scores ×2, the 3rd ×3, and so on.',
        'Les lignes formées par les gemmes qui tombent disparaissent aussi, en cascade : la 2e vague vaut ×2, la 3e ×3, et ainsi de suite.',
      ),
      L(
        'A swap that makes no line is refused and costs nothing. Every other swap uses a move; run out before the target and the puzzle is lost.',
        'Un échange qui n’aligne rien est refusé et ne coûte rien. Tout autre échange utilise un coup; s’il n’en reste plus avant l’objectif, la partie est perdue.',
      ),
      L(
        'Tap a gem then its neighbour, or drag a gem onto its neighbour. Keyboard: arrows move the cursor, Space picks a gem, then an arrow swaps it. Restart (R) starts over.',
        'Touchez une gemme puis sa voisine, ou glissez une gemme sur sa voisine. Clavier : les flèches déplacent le curseur, Espace choisit une gemme, puis une flèche l’échange. Repartir (R) recommence.',
      ),
    ],
    tips: [
      L(
        'Swaps low on the board make more gems fall, so cascades are more likely.',
        'Les échanges au bas du plateau font tomber plus de gemmes : les cascades sont plus probables.',
      ),
      L(
        'Look for a swap that makes two lines at once, or a line of 4 or 5.',
        'Cherchez un échange qui forme deux lignes d’un coup, ou une ligne de 4 ou 5.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [50, 70, 100, 120, 150]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const start = createLevel(d, rng);
    const fresh = (): State => ({ ...start, grid: [...start.grid] });
    const resumed = restore(start, ctx.saved);
    let s = resumed ?? fresh();
    const n = s.n;
    let over = false;
    /** Picked gem (-1: none) and keyboard cursor (-1 until the keyboard is used). */
    let sel = -1;
    let cur = -1;
    const sv = ctx.saved as { sel?: unknown; cur?: unknown } | undefined;
    const cell = (v: unknown) => (Number.isInteger(v) && (v as number) >= -1 && (v as number) < n * n ? (v as number) : -1);
    if (resumed && sv) {
      sel = cell(sv.sel);
      cur = cell(sv.cur);
    }

    const grid = board(n, n, 'swap-grid');
    const cells = Array.from({ length: n * n }, (_, i) => {
      const el = h('button', { type: 'button', class: 'cell gem', 'data-i': i, onclick: () => tap(i) }, mark(-1));
      grid.append(el);
      return el;
    });

    const gemName = (v: number) => L(`${NAMES_EN[v]} ${SHAPES_EN[v]}`, `${SHAPES_FR[v]} ${NAME_FR[v]}`);
    const render = () => {
      cells.forEach((el, i) => {
        const v = s.grid[i];
        el.setAttribute('style', `--c:${PALETTE[TONES[v]]}`);
        el.setAttribute('aria-label', gemName(v));
        el.classList.toggle('sel', i === sel);
        el.classList.toggle('cur', i === cur);
        setMark(el.firstElementChild as HTMLElement, TONES[v]);
      });
      if (over) return;
      ctx.status(
        `${L(`${s.score} / ${s.target} points`, `${s.score} / ${s.target} points`)} · ${P(s.moves, ['move left', 'moves left'], ['coup restant', 'coups restants'])}`,
      );
    };

    /** Animate a played move: every gem slides in from where it was, new gems drop in from above. */
    const animate = (from: number[], reshuffled: boolean) => {
      if (reshuffled) {
        for (const el of cells) anim(el, GROW, 260);
        return;
      }
      const px = cells[1].offsetLeft - cells[0].offsetLeft,
        py = cells[n].offsetTop - cells[0].offsetTop;
      const dropIn = Array<number>(n).fill(0);
      from.forEach((f, i) => f < 0 && dropIn[i % n]++);
      from.forEach((f, i) => {
        if (f === i) return;
        const r = Math.floor(i / n),
          c = i % n;
        const [fr, fc] = f < 0 ? [r - dropIn[c], c] : [Math.floor(f / n), f % n];
        const dist = Math.max(Math.abs(r - fr), Math.abs(c - fc));
        anim(cells[i], [{ transform: `translate(${(fc - c) * px}px, ${(fr - r) * py}px)` }, { transform: 'none' }], 140 + 45 * dist);
      });
    };

    /** Swap two gems: refused (shake, free) unless it makes a line. */
    const attempt = (a: number, b: number) => {
      if (over) return;
      ctx.touch();
      sel = -1;
      const res = adjacent(n, a, b) ? play(s, a, b) : null;
      if (!res) {
        render();
        shake(cells[a]);
        if (b >= 0 && b < n * n) shake(cells[b]);
        return;
      }
      if (cur >= 0) cur = b;
      if (res.outcome) over = true;
      render();
      animate(res.from, res.reshuffled);
      if (res.outcome === 'win') ctx.solved();
      else if (res.outcome === 'lose') ctx.failed();
    };

    const tap = (i: number) => {
      if (over) return;
      if (dragged) {
        dragged = false;
        return;
      }
      ctx.touch();
      if (sel >= 0 && sel !== i && adjacent(n, sel, i)) return attempt(sel, i);
      sel = sel === i ? -1 : i;
      if (cur >= 0) cur = i;
      render();
    };

    // Drag a gem onto a neighbour: the swap happens as soon as the pointer has moved far enough.
    let drag: { i: number; x: number; y: number; id: number } | null = null;
    /** A drag just swapped: swallow the click that follows its pointerup. */
    let dragged = false;
    grid.style.touchAction = 'none';
    grid.addEventListener('pointerdown', (e) => {
      const el = (e.target as Element).closest<HTMLElement>('[data-i]');
      dragged = false;
      drag = el && !over ? { i: Number(el.dataset['i']), x: e.clientX, y: e.clientY, id: e.pointerId } : null;
    });
    grid.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x,
        dy = e.clientY - drag.y;
      const size = cells[0].offsetWidth || 40;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < size * 0.4) return;
      const dir: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
      const a = drag.i;
      drag = null;
      dragged = true;
      attempt(a, step(a, dir));
    });
    const endDrag = () => (drag = null);
    grid.addEventListener('pointerup', endDrag);
    grid.addEventListener('pointercancel', endDrag);

    /** The neighbour of `i` in direction `dir`, or -1 off the board. */
    const step = (i: number, dir: Dir) => {
      const r = Math.floor(i / n) + [-1, 0, 1, 0][dir],
        c = (i % n) + [0, 1, 0, -1][dir];
      return r >= 0 && c >= 0 && r < n && c < n ? r * n + c : -1;
    };

    const restart = () => {
      if (over || (s.moves === start.moves && s.score === 0)) return;
      s = fresh();
      sel = -1;
      render();
      for (const el of cells) anim(el, GROW, 220);
    };
    ctx.controls(restartBtn(restart));

    // ---- Guide ----
    /** Which of the two swapped gems moves into the line, and where from. */
    const describe = (p: Preview) => {
      const line = p.lines.reduce((m, l) => (l.length > m.length ? l : m));
      const to = line.includes(p.a) ? p.a : p.b;
      const fromCell = to === p.a ? p.b : p.a;
      const colour = s.grid[fromCell];
      const delta = to - fromCell;
      const dir = delta === -n ? 0 : delta === 1 ? 1 : delta === n ? 2 : 3;
      return { line, to, fromCell, colour, dir };
    };
    let lastKind = '';
    const hint = (): Hint | null => {
      if (over) return null;
      const p = bestMove(s);
      if (!p) return null;
      const { line, to, fromCell, colour, dir } = describe(p);
      const en = NAMES_EN[colour],
        fr = NAMES_FR[colour],
        fr1 = NAME_FR[colour];
      const way = L(DIR_EN[dir], DIR_FR[dir]);
      const others = line.filter((i) => i !== to).map((i) => cells[i]);
      const need = s.target - s.score;
      const kinds: { kind: string; text: string; why: Element[] }[] = [];
      if (s.moves === start.moves && s.score === 0)
        kinds.push({
          kind: 'start',
          text: L(
            `Swap two neighbouring gems to line up 3 of a kind. Move this ${en} gem ${way}: it joins the outlined ${en} gems in a line of ${line.length}.`,
            `Échangez deux gemmes voisines pour en aligner 3 pareilles. Déplacez cette gemme ${fr1} ${way} : elle rejoint les gemmes ${fr} encadrées, une ligne de ${line.length}.`,
          ),
          why: others,
        });
      if (line.length >= 4)
        kinds.push({
          kind: 'long',
          text: L(
            `A line of ${line.length} scores ${lineScore(line.length)} points, much more than a line of 3. Move this ${en} gem ${way} to line up ${line.length} ${en} gems.`,
            `Une ligne de ${line.length} vaut ${lineScore(line.length)} points, bien plus qu’une ligne de 3. Déplacez cette gemme ${fr1} ${way} pour aligner ${line.length} gemmes ${fr}.`,
          ),
          why: others,
        });
      const second = p.lines.find((l) => l !== line);
      if (second) {
        const why = [...others, ...second.filter((i) => i !== p.a && i !== p.b).map((i) => cells[i])];
        const c2 = s.grid[to];
        kinds.push(
          second.includes(fromCell)
            ? {
                kind: 'double',
                text: L(
                  `This swap makes two lines at once: the ${en} gem moving ${way} completes one, and the ${NAMES_EN[c2]} gem it trades places with completes the other.`,
                  `Cet échange forme deux lignes d’un coup : la gemme ${fr1} qui va ${way} en complète une, et la gemme ${NAME_FR[c2]} qui prend sa place complète l’autre.`,
                ),
                why,
              }
            : {
                kind: 'double',
                text: L(
                  `Moving this ${en} gem ${way} puts it where two lines cross: it completes a row and a column of ${en} gems at once, and both score.`,
                  `Déplacée ${way}, cette gemme ${fr1} arrive au croisement de deux lignes : elle complète à la fois une rangée et une colonne de gemmes ${fr}, et les deux comptent.`,
                ),
                why,
              },
        );
      }
      if (p.falls.length)
        kinds.push({
          kind: 'cascade',
          text: L(
            `Look past the first line: once these ${en} gems clear, the gems above fall and more gems line up on their own, a sure cascade worth ${p.points} points in all.`,
            `Voyez plus loin que la première ligne : une fois ces gemmes ${fr} parties, celles du dessus tombent et d’autres s’alignent d’elles-mêmes, une cascade assurée de ${p.points} points en tout.`,
          ),
          why: others,
        });
      if (Math.floor(Math.max(p.a, p.b) / n) >= n - 2 && line.length === 3 && p.lines.length === 1 && !p.falls.length)
        kinds.push({
          kind: 'low',
          text: L(
            `No swap scores more than a line of 3 right now, so play low: moving this ${en} gem ${way} near the bottom makes many gems fall, and the new ones may cascade for free.`,
            `Aucun échange ne rapporte plus qu’une ligne de 3 pour l’instant : jouez bas. Déplacer cette gemme ${fr1} ${way} près du fond fait tomber beaucoup de gemmes, et les nouvelles peuvent cascader.`,
          ),
          why: others,
        });
      kinds.push({
        kind: 'plain',
        text: L(
          `Move this ${en} gem ${way} to line up ${line.length} ${en} gems for ${p.points} points. Still ${need} points to go, with ${P(s.moves, ['move left', 'moves left'], ['coup restant', 'coups restants'])}.`,
          `Déplacez cette gemme ${fr1} ${way} pour aligner ${line.length} gemmes ${fr} : ${p.points} points. Il manque encore ${need} points, avec ${P(s.moves, ['move left', 'moves left'], ['coup restant', 'coups restants'])}.`,
        ),
        why: others,
      });
      const k = kinds.find((x) => x.kind !== lastKind) ?? kinds[0];
      lastKind = k.kind;
      return {
        text: k.text,
        why: k.why,
        at: [cells[fromCell], cells[to]],
        play: () => {
          sel = -1;
          tap(fromCell);
          tap(to);
        },
      };
    };

    root.append(grid);
    render();
    return {
      snapshot: () => ({ grid: s.grid, score: s.score, moves: s.moves, k: s.k, sel, cur }),
      hint,
      onKey(e) {
        if (over) return false;
        const key = e.key.toLowerCase();
        if (key === 'r') {
          restart();
          return true;
        }
        if (key === ' ' || key === 'enter') {
          if (cur < 0) cur = 0;
          tap(cur);
          return true;
        }
        if (key === 'escape' && sel >= 0) {
          sel = -1;
          render();
          return true;
        }
        const dir = keyDir(e);
        if (dir == null) return false;
        if (sel >= 0) {
          attempt(sel, step(sel, dir));
          return true;
        }
        if (cur < 0) cur = 0;
        else {
          const next = step(cur, dir);
          if (next >= 0) cur = next;
        }
        render();
        return true;
      },
    };
  },
};
