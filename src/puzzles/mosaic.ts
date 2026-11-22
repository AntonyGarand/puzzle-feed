import { L, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, clearBtn, h, ruleBreaks } from '../core/ui';
import { block, genMosaic } from './gridkit/mosaic';
import './mosaic.css';

export const mosaic: PuzzleDef = {
  id: 'mosaic',
  get name() {
    return L('Mosaic', 'Mosaïque');
  },
  category: 'logic',
  undo: true,
  get rules() {
    return L('Each number counts filled cells in its 3×3 square.', 'Chaque nombre compte les cases pleines de son carré 3×3.');
  },
  help: () => ({
    goal: L(
      'Fill in cells to reveal a picture that agrees with every number.',
      'Remplissez des cases pour révéler une image qui respecte tous les nombres.',
    ),
    steps: [
      L(
        'A number tells how many cells are filled in the 3×3 square around it, counting its own cell.',
        'Un nombre indique combien de cases sont pleines dans le carré 3×3 autour de lui, sa propre case comprise.',
      ),
      L(
        'Tap a cell to fill it, again to mark it ✕ (surely empty), and once more to clear it.',
        'Touchez une case pour la remplir, encore pour la marquer d’un ✕ (vide à coup sûr), puis une autre fois pour l’effacer.',
      ),
      L(
        'Long-press (or right-click) to mark ✕ directly. Drag to repeat your first change over several cells.',
        'Appuyez longuement (ou cliquez droit) pour marquer un ✕ directement. Glissez pour répéter votre premier changement sur plusieurs cases.',
      ),
      L(
        'Keyboard: arrow keys move, Space cycles a cell, X marks it, Delete clears it.',
        'Au clavier : les flèches déplacent, Espace change l’état de la case, X la marque, Suppr l’efface.',
      ),
      L(
        'A number fades once its square is settled and red means too many (or too few left). Clear wipes the board.',
        'Un nombre pâlit quand son carré est réglé; en rouge, il y en a trop (ou plus assez). Effacer vide la grille.',
      ),
    ],
    tips: [
      L(
        'A 0 empties its whole square and a 9 fills it. In a corner, a 4 fills all four cells.',
        'Un 0 vide tout son carré et un 9 le remplit. Dans un coin, un 4 remplit les quatre cases.',
      ),
      L(
        'Compare overlapping squares: the cells they don’t share explain the difference.',
        'Comparez des carrés qui se chevauchent : les cases qu’ils ne partagent pas expliquent la différence.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [40, 70, 110, 170, 280]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const n = byLevel(d, [5, 6, 7, 8, 10]);
    const { clue, sol, unique } = genMosaic(n, byLevel(d, [0.6, 0.45, 0.3, 0.15, 0]), rng);
    const blocks = clue.map((_, i) => block(i, n));

    // 0 empty, 1 filled, 2 marked
    const st = new Array<number>(n * n).fill(0);
    /** Keyboard cursor (-1 until the keyboard is used). */
    let cur = -1;
    let done = false;

    const grid = board(n, n, 'mo-grid');
    const nums: (HTMLSpanElement | null)[] = [];
    const cells = st.map((_, i) => {
      const num = clue[i] >= 0 ? h('span', { class: 'mo-n' }, clue[i]) : null;
      nums.push(num);
      const el = h('div', { class: 'cell', 'data-i': i }, num);
      grid.append(el);
      return el;
    });
    /** Counts a mistake when a filled cell pushes a number over (checked when the stroke ends). */
    const watch = ruleBreaks(grid, ctx.mistake);

    const render = () => {
      let ok = true,
        settled = 0;
      cells.forEach((el, i) => {
        el.classList.toggle('on', st[i] === 1);
        el.classList.toggle('x', st[i] === 2);
        el.classList.toggle('cur', i === cur);
        if (clue[i] < 0) return;
        let on = 0,
          open = 0;
        for (const j of blocks[i]) {
          if (st[j] === 1) on++;
          else if (st[j] === 0) open++;
        }
        el.classList.toggle('done', on === clue[i] && !open);
        if (on === clue[i] && !open) settled++;
        // Too many filled is a broken rule; too few left can come from ✕ marks alone.
        nums[i]!.classList.toggle('err', on > clue[i]);
        nums[i]!.classList.toggle('short', on <= clue[i] && on + open < clue[i]);
        ok &&= on === clue[i];
      });
      ctx.status(`${settled} / ${P(nums.filter(Boolean).length, ['number', 'numbers'], ['nombre', 'nombres'])}`);
      return ok;
    };

    // Long-press (350 ms on the first cell, before the stroke spreads) marks ✕ directly.
    let pressTimer = 0;
    const cancelPress = () => {
      clearTimeout(pressTimer);
      pressTimer = 0;
      for (const el of cells) el.classList.remove('lp');
    };

    // Tap cycles empty → filled → ✕ → empty. Dragging repeats the first cell's change on every cell
    // in the same starting state, so a stroke never overwrites cells of another kind.
    let stroke: { from: number; to: number; first: number; id: number; x: number; y: number; spread: boolean } | null = null;
    const set = (i: number, v: number) => {
      st[i] = v;
      if (render()) {
        done = true;
        stroke = null;
        cancelPress();
        ctx.solved();
      }
    };
    const cellAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const c = el?.closest?.('[data-i]') as HTMLElement | null;
      return c && grid.contains(c) ? Number(c.dataset['i']) : -1;
    };
    grid.addEventListener('contextmenu', (e) => e.preventDefault());
    grid.addEventListener('pointerdown', (e) => {
      if (done || stroke) return;
      const t = (e.target as Element | null)?.closest?.('[data-i]') as HTMLElement | null;
      const i = t && grid.contains(t) ? Number(t.dataset['i']) : cellAt(e.clientX, e.clientY);
      if (i < 0) return;
      e.preventDefault();
      ctx.touch();
      cur = -1;
      const from = st[i];
      const to = e.button === 2 ? (from === 2 ? 0 : 2) : (from + 1) % 3;
      stroke = { from, to, first: i, id: e.pointerId, x: e.clientX, y: e.clientY, spread: false };
      set(i, to);
      // Only an empty cell turned filled can still become ✕ by holding.
      if (done || to !== 1) return;
      cells[i].classList.add('lp');
      pressTimer = window.setTimeout(() => {
        pressTimer = 0;
        cells[i].classList.remove('lp');
        if (!stroke || stroke.spread || done) return;
        stroke.to = 2;
        set(i, 2);
        try {
          navigator.vibrate?.(15);
        } catch {
          /* not allowed */
        }
      }, 350);
    });
    grid.addEventListener('pointermove', (e) => {
      const g = stroke;
      if (!g || e.pointerId !== g.id) return;
      if (pressTimer && Math.hypot(e.clientX - g.x, e.clientY - g.y) > 10) cancelPress();
      const i = cellAt(e.clientX, e.clientY);
      if (i < 0 || i === g.first || st[i] !== g.from) return;
      g.spread = true;
      cancelPress();
      set(i, g.to);
    });
    const end = (e: PointerEvent) => {
      if (stroke && e.pointerId !== stroke.id) return;
      cancelPress();
      if (stroke) watch(stroke.to === 1);
      stroke = null;
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);

    const sv = ctx.saved as { st?: unknown; cur?: unknown } | undefined;
    if (Array.isArray(sv?.st) && sv.st.length === st.length) sv.st.forEach((v, i) => (st[i] = v === 1 || v === 2 ? v : 0));
    const c0 = sv?.cur;
    if (typeof c0 === 'number' && Number.isInteger(c0) && c0 >= -1 && c0 < st.length) cur = c0;
    root.append(grid);
    render();
    watch(false);
    ctx.controls(
      clearBtn(() => {
        if (done || st.every((v) => !v)) return;
        ctx.touch();
        st.fill(0);
        render();
        watch(false);
      }),
    );

    // Guide: a square that is settled or needs everything, then two overlapping squares compared.
    let lastKind = '';
    let taught = false;
    const hint = (): Hint | null => {
      if (done) return null;
      const info = clue
        .map((k, i) => {
          if (k < 0) return null;
          const open = blocks[i].filter((j) => st[j] === 0);
          const on = blocks[i].filter((j) => st[j] === 1).length;
          return { i, k, open, need: k - on };
        })
        .filter((c) => c !== null && c.open.length > 0) as { i: number; k: number; open: number[]; need: number }[];
      const els = (ix: number[]) => ix.map((j) => cells[j]);
      const fill = (ix: number[], v: number) => () => {
        ix.forEach((j) => !done && st[j] !== v && set(j, v));
        watch(v === 1);
      };
      const cands: { kind: string; hint: Hint }[] = [];
      for (const c of info) {
        const size = blocks[c.i].length;
        if (c.need === 0)
          cands.push({
            kind: c.k ? 'none' : 'zero',
            hint: {
              text: c.k
                ? L(
                    `This ${c.k} already has its ${c.k} filled cell${c.k > 1 ? 's' : ''}, so ${c.open.length === 1 ? 'its last open cell is empty: mark it' : 'the rest of its square is empty: mark those cells'} ✕.`,
                    `Ce ${c.k} a déjà ${c.k > 1 ? `ses ${c.k} cases pleines` : 'sa case pleine'} : ${c.open.length === 1 ? 'sa dernière case ouverte est vide, marquez-la' : 'le reste de son carré est vide, marquez ces cases'} d’un ✕.`,
                  )
                : L(
                    'A 0: nothing in its 3×3 square is filled. Tap twice to mark those cells ✕.',
                    'Un 0 : rien n’est plein dans son carré 3×3. Touchez deux fois pour marquer ces cases d’un ✕.',
                  ),
              why: [cells[c.i]],
              at: els(c.open),
              play: fill(c.open, 2),
            },
          });
        else if (c.need === c.open.length)
          cands.push({
            kind: 'all',
            hint: {
              text:
                c.k === 9 && c.open.length === 9
                  ? L('A 9 fills its whole 3×3 square.', 'Un 9 remplit tout son carré 3×3.')
                  : c.k === size && c.open.length === size
                    ? L(
                        `This ${c.k} sits ${size === 4 ? 'in a corner' : 'on the edge'}: its square has only ${size} cells, so all are filled.`,
                        `Ce ${c.k} est ${size === 4 ? 'dans un coin' : 'sur le bord'} : son carré n’a que ${size} cases, elles sont toutes pleines.`,
                      )
                    : L(
                        `This ${c.k} still needs ${c.need} and has exactly ${c.need} open cell${c.need > 1 ? 's' : ''} left: fill ${c.need > 1 ? 'them' : 'it'}.`,
                        `Ce ${c.k} demande encore ${c.need} case${c.need > 1 ? 's' : ''}, et il en reste exactement ${c.need} ouverte${c.need > 1 ? 's' : ''} : remplissez-${c.need > 1 ? 'les' : 'la'}.`,
                      ),
              why: [cells[c.i]],
              at: els(c.open),
              play: fill(c.open, 1),
            },
          });
      }
      if (!cands.length || cands.every((c) => c.kind === lastKind))
        for (const a of info)
          for (const b of info) {
            if (a === b || a.open.length >= b.open.length || !a.open.every((x) => b.open.includes(x))) continue;
            const rest = b.open.filter((x) => !a.open.includes(x));
            const m = b.need - a.need;
            if (m !== 0 && m !== rest.length) continue;
            cands.push({
              kind: 'sub',
              hint: {
                text:
                  m === 0
                    ? L(
                        `The ${a.k} needs ${a.need} more, all inside the square of this ${b.k}, which also needs ${b.need}: its other cells are empty.`,
                        `Le ${a.k} demande encore ${a.need}, toutes dans le carré de ce ${b.k}, qui en demande aussi ${b.need} : ses autres cases sont vides.`,
                      )
                    : L(
                        `The ${a.k} can add at most ${a.need} to this ${b.k}, which needs ${b.need}: its ${rest.length} other open cell${rest.length > 1 ? 's are' : ' is'} filled.`,
                        `Le ${a.k} peut fournir au plus ${a.need} à ce ${b.k}, qui en demande ${b.need} : ${rest.length > 1 ? `ses ${rest.length} autres cases ouvertes sont pleines` : 'son autre case ouverte est pleine'}.`,
                      ),
                why: [cells[a.i], cells[b.i]],
                at: els(rest),
                play: fill(rest, m === 0 ? 2 : 1),
              },
            });
            break;
          }
      const order = ['zero', 'all', 'none', 'sub'];
      cands.sort((x, y) => order.indexOf(x.kind) - order.indexOf(y.kind));
      const pick = cands.find((c) => c.kind !== lastKind) ?? cands[0];
      if (pick) {
        lastKind = pick.kind;
        if (taught || pick.kind === 'zero' || pick.kind === 'none') return pick.hint;
        taught = true;
        return { ...pick.hint, text: pick.hint.text + L(' Tap a cell once to fill it.', ' Touchez une case une fois pour la remplir.') };
      }
      lastKind = '';
      const j = st.findIndex((v, i) => v === 0 && sol[i]);
      if (j < 0) return null;
      return {
        text: L(
          'No single number decides here. Try both options: only a filled cell here agrees with all the numbers around it.',
          'Aucun nombre ne décide seul ici. Essayez les deux options : seule une case pleine ici respecte tous les nombres autour.',
        ),
        why: els(clue.map((k, i) => (k >= 0 && blocks[i].includes(j) ? i : -1)).filter((i) => i >= 0)),
        at: [cells[j]],
        play: fill([j], 1),
      };
    };

    /** A cell that makes a number impossible, else one off the unique picture. */
    const check = (): Hint | null => {
      if (done) return null;
      const wrongAt = (j: number) => (st[j] === 1 && !sol[j]) || (st[j] === 2 && sol[j]);
      const fix = (i: number, text: string, why: number[] = []): Hint => ({
        kind: 'fix',
        text,
        why: why.map((j) => cells[j]),
        at: [cells[i]],
        action: st[i] === 1 ? L('Clear it', 'L’effacer') : L('Clear the ✕', 'Effacer le ✕'),
        play: () => {
          ctx.touch();
          set(i, 0);
          watch(false);
        },
      });
      for (let c = 0; c < n * n; c++) {
        const k = clue[c];
        if (k < 0) continue;
        const on = blocks[c].filter((j) => st[j] === 1).length;
        const room = blocks[c].filter((j) => st[j] !== 2).length;
        if (on > k) {
          const i = blocks[c].find((j) => st[j] === 1 && wrongAt(j));
          if (i !== undefined)
            return fix(
              i,
              L(
                `This ${k} has ${on} filled cells in its square, more than ${k}. This one should be empty.`,
                `Ce ${k} a ${on} cases pleines dans son carré, plus que ${k}. Celle-ci doit être vide.`,
              ),
              [c],
            );
        }
        if (room < k) {
          const i = blocks[c].find((j) => st[j] === 2 && wrongAt(j));
          if (i !== undefined)
            return fix(
              i,
              L(
                `This ${k} can no longer reach ${k}: too many cells in its square are marked ✕. This one should be filled.`,
                `Ce ${k} ne peut plus atteindre ${k} : trop de cases de son carré ont un ✕. Celle-ci doit être pleine.`,
              ),
              [c],
            );
        }
      }
      if (!unique) return null;
      const i = st.findIndex((_, j) => wrongAt(j));
      if (i < 0) return null;
      return fix(
        i,
        st[i] === 1
          ? L(
              'This filled cell breaks no number yet, but it leads to a dead end: it belongs empty. Clear it.',
              'Cette case pleine ne contredit encore aucun nombre, mais elle mène à une impasse : elle doit rester vide. Effacez-la.',
            )
          : L(
              'This ✕ breaks no number yet, but it leads to a dead end: the cell has to be filled. Clear it.',
              'Ce ✕ ne contredit encore aucun nombre, mais il mène à une impasse : la case doit être pleine. Effacez-le.',
            ),
      );
    };

    const DIRS: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    return {
      snapshot: () => ({ st, cur }),
      hint,
      check,
      onKey(e) {
        if (done) return false;
        const dir = DIRS[e.key];
        if (dir) {
          if (cur < 0) cur = 0;
          else {
            const r = Math.min(n - 1, Math.max(0, Math.floor(cur / n) + dir[1]));
            const c = Math.min(n - 1, Math.max(0, (cur % n) + dir[0]));
            cur = r * n + c;
          }
          render();
          return true;
        }
        if (cur < 0) return false;
        const k = e.key.toLowerCase();
        const next =
          k === ' ' || k === 'enter'
            ? (st[cur] + 1) % 3
            : k === 'x'
              ? st[cur] === 2
                ? 0
                : 2
              : k === 'backspace' || k === 'delete'
                ? 0
                : -1;
        if (next < 0) return false;
        ctx.touch();
        set(cur, next);
        watch(next === 1);
        return true;
      },
      destroy() {
        cancelPress();
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
      },
    };
  },
};
