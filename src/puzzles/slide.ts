import { L, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, h } from '../core/ui';
import { planSlide } from './movekit/slide-hint';

export const slide: PuzzleDef = {
  id: 'slide',
  get name() {
    return L('Slide', 'Taquin');
  },
  category: 'moves',
  get rules() {
    return L('Slide the tiles back into order.', 'Glissez les tuiles pour les remettre en ordre.');
  },
  help: () => ({
    goal: L(
      'Put the numbered tiles back in order, 1 at the top left, with the gap in the bottom-right corner.',
      'Remettez les tuiles numérotées en ordre, le 1 en haut à gauche et le trou en bas à droite.',
    ),
    steps: [
      L(
        'Tap a tile in the same row or column as the gap: it slides into the gap, along with any tiles in between.',
        'Touchez une tuile sur la même rangée ou colonne que le trou : elle glisse vers le trou, avec les tuiles entre les deux.',
      ),
      L(
        'Or drag that tile toward the gap and let go past a third of a square. Let go sooner to cancel.',
        'Ou faites glisser cette tuile vers le trou et relâchez après un tiers de case. Relâchez avant pour annuler.',
      ),
      L('Tiles that are already in their home spot are highlighted.', 'Les tuiles déjà à leur place sont mises en couleur.'),
      L(
        'Keyboard: an arrow key slides the tile next to the gap in that direction.',
        'Clavier : une flèche fait glisser dans cette direction la tuile voisine du trou.',
      ),
    ],
    tips: [
      L(
        'Solve the top row first, then the left column, then repeat on the smaller square that’s left.',
        'Placez d’abord la rangée du haut, puis la colonne de gauche, et recommencez sur le carré restant.',
      ),
      L(
        'Place the last two tiles of a row together: line them up below their spots, then swing them in.',
        'Placez les deux dernières tuiles d’une rangée ensemble : alignez-les sous leur place, puis faites-les entrer.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [20, 45, 90, 150, 240]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const n = byLevel(d, [3, 3, 3, 4, 4]);
    const shuffles = byLevel(d, [10, 25, 80, 50, 160]);
    const tiles = Array.from({ length: n * n }, (_, i) => (i + 1) % (n * n)); // 0 = gap
    let gap = n * n - 1;
    let moves = 0;

    const neighbours = (i: number) => {
      const r = Math.floor(i / n),
        c = i % n,
        out: number[] = [];
      if (r > 0) out.push(i - n);
      if (r < n - 1) out.push(i + n);
      if (c > 0) out.push(i - 1);
      if (c < n - 1) out.push(i + 1);
      return out;
    };
    const solved = () => tiles.every((t, i) => t === (i + 1) % (n * n));
    do {
      let prev = -1;
      for (let k = 0; k < shuffles; k++) {
        const opts = neighbours(gap).filter((x) => x !== prev);
        const x = rng.pick(opts);
        [tiles[gap], tiles[x]] = [tiles[x], tiles[gap]];
        prev = gap;
        gap = x;
      }
    } while (solved());

    const grid = board(n);
    const cells = tiles.map((_, i) => {
      const el = h('button', { type: 'button', class: 'cell tile', onclick: () => tap(i) });
      grid.append(el);
      return el;
    });
    const render = () => {
      cells.forEach((el, i) => {
        el.textContent = tiles[i] ? String(tiles[i]) : '';
        el.classList.toggle('gap', tiles[i] === 0);
        el.classList.toggle('home', tiles[i] !== 0 && tiles[i] === i + 1);
      });
      ctx.status(P(moves, ['move', 'moves'], ['coup', 'coups']));
    };
    /** Step from the gap toward tile `i` (±1 or ±n), or 0 if `i` isn't in line with the gap. */
    const towards = (i: number) => {
      const gr = Math.floor(gap / n),
        gc = gap % n,
        r = Math.floor(i / n),
        c = i % n;
      if (i === gap || (gr !== r && gc !== c)) return 0;
      return gr === r ? (c > gc ? 1 : -1) : r > gr ? n : -n;
    };
    /** Distance between neighbouring cells, in px. */
    const pitch = () => cells[1].getBoundingClientRect().left - cells[0].getBoundingClientRect().left;
    const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
    const shift = (delta: number, px: number) => {
      const dx = Math.abs(delta) === 1 ? Math.sign(delta) * px : 0;
      const dy = Math.abs(delta) === 1 ? 0 : Math.sign(delta) * px;
      return `${dx}px ${dy}px`;
    };
    /** Glide back to rest from an offset (Web Animations: leaves no inline style behind, so resume matches). */
    const glide = (el: HTMLElement, from: string, ms: number) => {
      el.style.translate = '';
      if (!calm() && typeof el.animate === 'function')
        el.animate([{ translate: from }, { translate: '0 0' }], { duration: ms, easing: 'ease-out' });
    };

    /** Slide every tile between `i` and the gap (same row or column) one step. `dragged` px are already done. */
    const tap = (i: number, dragged = 0) => {
      const delta = towards(i);
      if (!delta) return;
      ctx.touch();
      const landed: number[] = [];
      while (gap !== i) {
        const nx = gap + delta;
        tiles[gap] = tiles[nx];
        tiles[nx] = 0;
        landed.push(gap);
        gap = nx;
        moves++;
      }
      render();
      // Each moved tile glides in from where it was (or from where the finger left it).
      cells.forEach((el) => (el.style.translate = ''));
      const step = pitch();
      for (const j of landed) glide(cells[j], shift(delta, Math.max(0, step - dragged)), 140);
      if (solved()) ctx.solved();
    };

    // Tap or drag a tile in line with the gap; the tiles in between come along. A drag slides past a third
    // of a cell. The grid captures the pointer, so the tile never gets the click: taps are handled on pointerup.
    let drag: { id: number; i: number; delta: number; run: number[]; x: number; y: number; px: number } | null = null;
    let dragged = false;
    /** When the last captured gesture ended; the click that follows it is swallowed. */
    let ended = -1e9;
    grid.addEventListener('pointerdown', (e) => {
      const t = (e.target as Element).closest('.tile');
      const i = t ? cells.indexOf(t as HTMLButtonElement) : -1;
      if (drag || i < 0 || e.button > 0) return;
      dragged = false;
      const delta = towards(i);
      if (!delta) return;
      const run: number[] = [];
      for (let k = gap + delta; ; k += delta) {
        run.push(k);
        if (k === i) break;
      }
      drag = { id: e.pointerId, i, delta, run, x: e.clientX, y: e.clientY, px: 0 };
      grid.setPointerCapture?.(e.pointerId);
    });
    grid.addEventListener('pointermove', (e) => {
      if (drag?.id !== e.pointerId) return;
      const dx = e.clientX - drag.x,
        dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 6) dragged = true;
      // Tiles move toward the gap, i.e. opposite to `delta`.
      const along = Math.abs(drag.delta) === 1 ? -Math.sign(drag.delta) * dx : -Math.sign(drag.delta) * dy;
      drag.px = Math.max(0, Math.min(pitch(), along));
      for (const k of drag.run) cells[k].style.translate = drag.px ? shift(-drag.delta, drag.px) : '';
    });
    const endDrag = (e: PointerEvent, commit: boolean) => {
      if (drag?.id !== e.pointerId) return;
      const d0 = drag;
      drag = null;
      ended = e.timeStamp;
      if (commit && !dragged) {
        for (const k of d0.run) cells[k].style.translate = '';
        tap(d0.i);
      } else if (commit && d0.px > pitch() / 3) tap(d0.i, d0.px);
      else for (const k of d0.run) glide(cells[k], shift(-d0.delta, d0.px), 120);
    };
    grid.addEventListener('pointerup', (e) => endDrag(e, true));
    grid.addEventListener('pointercancel', (e) => endDrag(e, false));
    // The click that ends a tap or drag was already handled on pointerup (keyboard clicks still go through).
    grid.addEventListener(
      'click',
      (e) => {
        if (e.timeStamp - ended > 600) return;
        ended = -1e9;
        e.stopPropagation();
      },
      true,
    );
    const sv = ctx.saved as { tiles?: number[]; moves?: number } | undefined;
    if (sv?.tiles?.length === tiles.length && [...sv.tiles].sort((a, b) => a - b).every((t, i) => t === i)) {
      tiles.splice(0, tiles.length, ...sv.tiles);
      gap = tiles.indexOf(0);
      moves = sv.moves ?? 0;
    }
    /**
     * The guide's route, kept while the player follows it (`keys[k]` is the board before step `k`): big
     * boards get a quick but not always shortest route, so re-planning after every slide could wander.
     */
    let plan: { path: number[]; keys: string[] } | null = null;
    const route = () => {
      const k = plan ? plan.keys.indexOf(tiles.join(',')) : -1;
      if (plan && k >= 0) return plan.path.slice(k);
      const path = planSlide(tiles, n);
      if (!path) return (plan = null);
      const sim = tiles.slice();
      const keys: string[] = [];
      for (const x of path) {
        keys.push(sim.join(','));
        const g = sim.indexOf(0);
        sim[g] = sim[x];
        sim[x] = 0;
      }
      plan = { path, keys };
      return path;
    };
    /**
     * Guide: follow a shortest solution (a quick one on big boards), one tap at a time (a run of tiles in
     * line slides together). No check(): every position can still be solved, so there is no mistake to fix.
     */
    const hint = (): Hint | null => {
      if (solved()) return null;
      const path = route();
      if (!path?.length) return null;
      // Simulate the solution to see where tiles land.
      const sim = tiles.slice();
      let g = gap;
      const lands: { t: number; at: number; from: number }[] = [];
      for (const x of path) {
        lands.push({ t: sim[x], at: g, from: x });
        sim[g] = sim[x];
        sim[x] = 0;
        g = x;
      }
      const delta = path[0] - gap;
      let k = 1;
      while (k < path.length && path[k] - path[k - 1] === delta) k++;
      const run = lands.slice(0, k);
      const far = path[k - 1];
      const home = run.filter((m) => m.t === m.at + 1).map((m) => m.t);
      const last = k === path.length;
      const list = (ts: number[]) =>
        ts.length < 2 ? String(ts[0]) : `${ts.slice(0, -1).join(', ')} ${L('and', 'et')} ${ts[ts.length - 1]}`;
      let text: string;
      if (last)
        text = L(
          `Last slide: ${list(run.map((m) => m.t))} ${k === 1 ? 'goes' : 'go'} home and every tile is in order.`,
          `Dernier glissement : ${k === 1 ? 'le' : 'les tuiles'} ${list(run.map((m) => m.t))} ${k === 1 ? 'retrouve sa' : 'retrouvent leur'} place et tout est en ordre.`,
        );
      else if (k > 1)
        text = L(
          `Tiles ${list(run.map((m) => m.t))} are in line with the gap: tap ${tiles[far]} and ${k === 2 ? 'both' : 'they all'} slide together${home.length ? `, bringing ${list(home)} home` : ''}.`,
          `Les tuiles ${list(run.map((m) => m.t))} sont alignées avec le trou : touchez le ${tiles[far]} et ${k === 2 ? 'les deux' : 'elles'} glissent ensemble${home.length ? `, ce qui met en place ${home.length === 1 ? 'le' : 'les tuiles'} ${list(home)}` : ''}.`,
        );
      else if (home.length)
        text = L(
          `${home[0]} belongs right where the gap is: slide it in. A tile in its home spot lights up.`,
          `Le ${home[0]} va exactement à la place du trou : glissez-le. Une tuile bien placée s’allume.`,
        );
      else {
        const next = lands.slice(1).find((m) => m.t === m.at + 1);
        text = next
          ? L(
              `Slide ${run[0].t} into the gap to move the gap around toward ${next.t}, which still has to get home.`,
              `Glissez le ${run[0].t} dans le trou pour amener le trou vers le ${next.t}, qui doit encore regagner sa place.`,
            )
          : L(`Slide ${run[0].t} into the gap to make room.`, `Glissez le ${run[0].t} dans le trou pour faire de la place.`);
      }
      if (moves === 0 && !last)
        text = `${L('Tap a tile in line with the gap to slide it.', 'Touchez une tuile alignée avec le trou pour la glisser.')} ${text}`;
      return { text, why: run.map((m) => cells[m.from]), at: [cells[gap]], play: () => tap(far) };
    };
    root.append(grid);
    render();
    return {
      snapshot: () => ({ tiles, moves }),
      hint,
      onKey(e) {
        const gr = Math.floor(gap / n),
          gc = gap % n;
        // Arrow = direction the tile moves; so the tile on the opposite side of the gap moves in.
        const m: Record<string, [number, number]> = { ArrowLeft: [0, 1], ArrowRight: [0, -1], ArrowUp: [1, 0], ArrowDown: [-1, 0] };
        const v = m[e.key];
        if (!v) return false;
        const r = gr + v[0],
          c = gc + v[1];
        if (r >= 0 && r < n && c >= 0 && c < n) tap(r * n + c);
        return true;
      },
    };
  },
};
