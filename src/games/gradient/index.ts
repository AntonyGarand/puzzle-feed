import { L, P } from '../../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../../core/types';
import { board, h, restartBtn, shake } from '../../ui/dom';
import { generate, home, isSolved, validTiles } from './gen';
import './style.css';

/** How far (px) a press must travel before it becomes a drag instead of a tap. */
const DRAG_PX = 8;

export const gradient: PuzzleDef = {
  id: 'gradient',
  get name() {
    return L('Gradient', 'Dégradé');
  },
  category: 'memory',
  get rules() {
    return L('Swap tiles until the colours blend smoothly.', 'Échangez les tuiles pour que les couleurs se fondent.');
  },
  help: () => ({
    goal: L(
      'Put every tile back in its place so the colours flow smoothly from corner to corner.',
      'Remettez chaque tuile à sa place pour que les couleurs passent doucement d’un coin à l’autre.',
    ),
    steps: [
      L(
        'Each corner has its own colour, and every tile is a blend of the corners around it.',
        'Chaque coin a sa couleur, et chaque tuile est un mélange des coins qui l’entourent.',
      ),
      L(
        'Tiles with a dot are pinned: they’re already in place and never move.',
        'Les tuiles marquées d’un point sont fixées : elles sont déjà à leur place et ne bougent pas.',
      ),
      L(
        'Tap a tile, then another one, to swap them. You can also drag a tile onto another.',
        'Touchez une tuile, puis une autre, pour les échanger. Vous pouvez aussi glisser une tuile sur une autre.',
      ),
      L(
        'Undo takes back a swap, Restart (or R) goes back to the start. Higher levels mean more tiles, fewer dots and closer colours.',
        'Annuler reprend un échange, Repartir (ou R) revient au départ. Plus le niveau monte, plus il y a de tuiles, moins de points et des couleurs proches.',
      ),
    ],
    tips: [
      L(
        'Start along the edges: each edge tile is a blend of just two corners.',
        'Commencez par les bords : chaque tuile du bord ne mélange que deux coins.',
      ),
      L(
        'Compare lightness first, then hue: squint if two tiles look alike.',
        'Comparez d’abord la clarté, puis la teinte : plissez les yeux si deux tuiles se ressemblent.',
      ),
    ],
  }),
  undo: true,
  par: (d) => byLevel(d, [30, 60, 100, 150, 240]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const g = generate(rng, d);
    const { cols, rows, colors, pinned } = g;
    const n = cols * rows;
    const sv = ctx.saved as { tiles?: unknown; moves?: unknown; sel?: unknown } | undefined;
    let tiles = validTiles(sv?.tiles, g) ? [...sv.tiles] : [...g.start];
    let moves = typeof sv?.moves === 'number' && sv.moves >= 0 ? Math.floor(sv.moves) : 0;
    let sel = typeof sv?.sel === 'number' && sv.sel >= 0 && sv.sel < n && !pinned[sv.sel] ? sv.sel : -1;
    let done = isSolved(tiles);

    const grid = board(cols, rows, 'gradient');
    const cells = Array.from({ length: n }, (_, i) => {
      const r = Math.floor(i / cols) + 1;
      const c = (i % cols) + 1;
      const el = h('button', {
        type: 'button',
        class: pinned[i] ? 'cell given pin' : 'cell',
        'aria-label': pinned[i]
          ? L(`Row ${r}, column ${c}, pinned`, `Rangée ${r}, colonne ${c}, fixée`)
          : L(`Row ${r}, column ${c}`, `Rangée ${r}, colonne ${c}`),
        onclick: () => {
          if (dragged) dragged = false;
          else tap(i);
        },
      });
      grid.append(el);
      return el;
    });

    const render = () => {
      cells.forEach((el, i) => {
        el.style.background = colors[tiles[i]];
        el.classList.toggle('sel', i === sel);
        el.setAttribute('aria-pressed', String(i === sel));
      });
      if (done) return;
      ctx.status(
        moves
          ? P(moves, ['swap', 'swaps'], ['échange', 'échanges'])
          : L('Tap two tiles to swap them', 'Touchez deux tuiles pour les échanger'),
      );
    };

    const swap = (a: number, b: number) => {
      [tiles[a], tiles[b]] = [tiles[b], tiles[a]];
      moves++;
      sel = -1;
      done = isSolved(tiles);
      render();
      if (done) ctx.solved();
    };

    const tap = (i: number) => {
      if (done) return;
      ctx.touch();
      if (pinned[i]) {
        shake(cells[i]);
        return;
      }
      if (sel < 0) sel = i;
      else if (sel === i) sel = -1;
      else return swap(sel, i);
      render();
    };

    const restart = () => {
      if (done) return;
      ctx.touch();
      tiles = [...g.start];
      moves = 0;
      sel = -1;
      render();
    };

    // Drag a tile onto another to swap them. A press that doesn't travel stays a tap (the click).
    let drag: { from: number; x: number; y: number; id: number; over: number } | null = null;
    let dragged = false;
    const cellAt = (x: number, y: number) => {
      const el = document.elementFromPoint?.(x, y)?.closest('.cell');
      return el ? cells.indexOf(el as HTMLButtonElement) : -1;
    };
    const dropMark = (i: number) => cells.forEach((el, k) => el.classList.toggle('drop', k === i));
    const endDrag = () => {
      if (!drag) return;
      const el = cells[drag.from];
      el.classList.remove('lift');
      el.style.transform = '';
      dropMark(-1);
      drag = null;
    };
    grid.addEventListener('pointerdown', (e) => {
      const i = cells.indexOf((e.target as Element).closest('.cell') as HTMLButtonElement);
      if (done || i < 0 || pinned[i] || e.button > 0) return;
      drag = { from: i, x: e.clientX, y: e.clientY, id: e.pointerId, over: -1 };
      dragged = false;
    });
    grid.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      const el = cells[drag.from];
      if (!el.classList.contains('lift')) {
        if (Math.hypot(dx, dy) < DRAG_PX) return;
        el.classList.add('lift');
        grid.setPointerCapture?.(e.pointerId);
      }
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      const over = cellAt(e.clientX, e.clientY);
      drag.over = over >= 0 && over !== drag.from && !pinned[over] ? over : -1;
      dropMark(drag.over);
    });
    grid.addEventListener('pointerup', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const { from } = drag;
      const lifted = cells[from].classList.contains('lift');
      const over = cellAt(e.clientX, e.clientY);
      endDrag();
      if (!lifted) return;
      dragged = true; // swallow the click that follows this pointerup
      setTimeout(() => (dragged = false), 0);
      ctx.touch();
      if (over >= 0 && over !== from && !pinned[over]) swap(from, over);
      else if (over >= 0 && pinned[over]) shake(cells[over]);
    });
    grid.addEventListener('pointercancel', endDrag);

    /** Guide: fill the misplaced spot that has the most settled neighbours to compare with. */
    const hint = (): Hint | null => {
      if (done) return null;
      const settled = (i: number) => pinned[i] || home(tiles, i);
      const around = (i: number) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        return [
          [r - 1, c],
          [r + 1, c],
          [r, c - 1],
          [r, c + 1],
        ]
          .filter(([y, x]) => y >= 0 && y < rows && x >= 0 && x < cols)
          .map(([y, x]) => y * cols + x);
      };
      let best = -1;
      let bestScore = -1;
      tiles.forEach((t, i) => {
        if (t === i) return;
        const score = around(i).filter(settled).length;
        if (score > bestScore) [best, bestScore] = [i, score];
      });
      if (best < 0) return null;
      const p = best;
      const q = tiles.indexOf(p);
      const r = Math.floor(p / cols);
      const c = p % cols;
      const ok = (y: number, x: number) => y >= 0 && y < rows && x >= 0 && x < cols && settled(y * cols + x);
      const [up, down, left, right] = [ok(r - 1, c), ok(r + 1, c), ok(r, c - 1), ok(r, c + 1)];
      const spot = L(`Row ${r + 1}, column ${c + 1}`, `La case rangée ${r + 1}, colonne ${c + 1}`);
      const text =
        left && right
          ? L(
              `${spot} sits between two tiles already in place, left and right: its colour is halfway between theirs. This tile is that colour.`,
              `${spot} est entre deux tuiles déjà en place, à gauche et à droite : sa couleur est à mi-chemin des leurs. Cette tuile a cette couleur.`,
            )
          : up && down
            ? L(
                `${spot} sits between two tiles already in place, above and below: its colour is halfway between theirs. This tile is that colour.`,
                `${spot} est entre deux tuiles déjà en place, en haut et en bas : sa couleur est à mi-chemin des leurs. Cette tuile a cette couleur.`,
              )
            : (up || down) && (left || right)
              ? L(
                  `${spot} takes after the tile ${up ? 'above' : 'below'} it and the one on its ${left ? 'left' : 'right'}. This tile mixes both: swap it in.`,
                  `${spot} ressemble à la tuile ${up ? 'au-dessus' : 'en dessous'} et à celle de ${left ? 'gauche' : 'droite'}. Cette tuile mélange les deux : échangez-la.`,
                )
              : up || down || left || right
                ? L(
                    `${spot} is one small step from the tile ${up ? 'above it' : down ? 'below it' : left ? 'on its left' : 'on its right'}, which is in place. This tile is the closest colour: swap it in.`,
                    `${spot} est à un petit pas de la tuile ${up ? 'au-dessus' : down ? 'en dessous' : left ? 'de gauche' : 'de droite'}, déjà en place. Cette tuile a la couleur la plus proche : échangez-la.`,
                  )
                : L(
                    `${spot} blends the corners around it: this tile has that mix. Swap it in.`,
                    `${spot} mélange les coins autour d’elle : cette tuile a ce mélange. Échangez-la.`,
                  );
      const why = around(p)
        .filter(settled)
        .map((i) => cells[i]);
      const play = () => {
        if (sel >= 0 && sel !== q) tap(sel);
        if (sel !== q) tap(q);
        tap(p);
      };
      return {
        text,
        why,
        at: [cells[q], cells[p]],
        play,
      };
    };

    root.append(grid);
    ctx.controls(restartBtn(restart));
    render();
    return {
      hint,
      snapshot: () => ({ tiles: [...tiles], moves, sel }),
      onKey(e) {
        const k = e.key.toLowerCase();
        if (k === 'r') restart();
        else if (k === 'escape' && sel >= 0) {
          sel = -1;
          render();
        } else return false;
        return true;
      },
      destroy: endDrag,
    };
  },
};
