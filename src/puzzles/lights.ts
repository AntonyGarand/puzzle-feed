import { L, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, h, restartBtn, undoBtn } from '../core/ui';
import './lights.css';

export const lights: PuzzleDef = {
  id: 'lights',
  get name() {
    return L('Lights', 'Lumières');
  },
  category: 'logic',
  get rules() {
    return L('A tap flips a tile and its neighbours. Lights out!', 'Une touche inverse la case et ses voisines. Éteignez tout!');
  },
  help: () => ({
    goal: L('Switch off every light on the board.', 'Éteignez toutes les lumières de la grille.'),
    steps: [
      L(
        'Tapping a tile flips it, along with the tiles directly above, below, left and right of it.',
        'Toucher une case l’inverse, ainsi que les cases juste au-dessus, au-dessous, à gauche et à droite.',
      ),
      L(
        'Lit tiles are coloured. You win when none are left.',
        'Les cases allumées sont en couleur. Vous gagnez quand il n’en reste aucune.',
      ),
      L(
        'The status line shows your moves and how many tiles are still lit. Undo (Z) takes back a tap; Restart (R) brings back the starting board.',
        'La ligne d’état affiche vos coups et le nombre de cases encore allumées. Annuler (Z) reprend une touche; Repartir (R) ramène la grille de départ.',
      ),
      L(
        'Higher levels mean bigger boards and more scrambled starts.',
        'Les niveaux supérieurs donnent des grilles plus grandes et plus mélangées.',
      ),
    ],
    tips: [
      L(
        'Tapping the same tile twice cancels out, and the order of taps doesn’t matter.',
        'Toucher deux fois la même case l’annule, et l’ordre des touches n’a pas d’importance.',
      ),
      L(
        'Chase the lights down: clear each row by tapping the tiles just below its lit ones.',
        'Poussez les lumières vers le bas : videz chaque rangée en touchant les cases juste sous ses lumières.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [15, 30, 60, 100, 160]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const n = byLevel(d, [3, 4, 5, 5, 6]);
    const presses = byLevel(d, [2, 4, 6, 9, 13]);
    const on = new Array(n * n).fill(false);
    let moves = 0;

    const toggle = (i: number) => {
      const r = Math.floor(i / n),
        c = i % n;
      for (const [dr, dc] of [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const rr = r + dr,
          cc = c + dc;
        if (rr >= 0 && rr < n && cc >= 0 && cc < n) on[rr * n + cc] = !on[rr * n + cc];
      }
    };
    do {
      on.fill(false);
      for (const i of rng.shuffle([...on.keys()]).slice(0, presses)) toggle(i);
    } while (!on.some(Boolean));

    const grid = board(n);
    const cells = on.map((_, i) => {
      const el = h('button', { type: 'button', class: 'cell', 'aria-label': L(`tile ${i + 1}`, `case ${i + 1}`), onclick: () => press(i) });
      grid.append(el);
      return el;
    });
    const render = () => {
      cells.forEach((el, i) => el.classList.toggle('on', on[i]));
      const lit = on.filter(Boolean).length;
      ctx.status(`${P(moves, ['move', 'moves'], ['coup', 'coups'])} · ${P(lit, ['lit', 'lit'], ['allumée', 'allumées'])}`);
    };
    /** Move history: the tiles a step tapped (taps are their own inverse) and the move count before it. */
    let hist: { t: number[]; m: number }[] = [];
    let done = false;
    const press = (i: number) => {
      if (done) return;
      ctx.touch();
      hist.push({ t: [i], m: moves });
      toggle(i);
      moves++;
      render();
      if (!on.some(Boolean)) {
        done = true;
        ctx.solved();
      }
    };
    const undo = () => {
      const last = done ? undefined : hist.pop();
      if (!last) return;
      ctx.touch();
      last.t.forEach(toggle);
      moves = last.m;
      render();
    };
    /** Back to the starting board: re-tap every tile tapped an odd number of times (undoable). */
    const restart = () => {
      if (done) return;
      const odd = new Set<number>();
      for (const e of hist) for (const i of e.t) if (!odd.delete(i)) odd.add(i);
      if (!odd.size) return;
      ctx.touch();
      hist.push({ t: [...odd], m: moves });
      odd.forEach(toggle);
      moves = 0;
      render();
    };
    const sv = ctx.saved as { on?: unknown; moves?: unknown; hist?: unknown } | undefined;
    if (sv && Array.isArray(sv.on) && sv.on.length === on.length && sv.on.every((v) => typeof v === 'boolean')) {
      sv.on.forEach((v, i) => (on[i] = v));
      const count = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : 0);
      moves = count(sv.moves);
      if (Array.isArray(sv.hist))
        hist = sv.hist
          .filter(
            (e): e is { t: number[]; m: number } =>
              !!e &&
              typeof e === 'object' &&
              Array.isArray((e as { t?: unknown }).t) &&
              (e as { t: unknown[] }).t.every((i) => Number.isInteger(i) && (i as number) >= 0 && (i as number) < on.length),
          )
          .map((e) => ({ t: e.t.slice(), m: count(e.m) }))
          .slice(-500);
    }
    root.append(grid);
    ctx.controls(undoBtn(undo), restartBtn(restart));
    render();
    /** Tile `i` and its up-to-4 neighbours. */
    const cross = (i: number) => {
      const r = Math.floor(i / n),
        c = i % n;
      return [i, r > 0 ? i - n : -1, r < n - 1 ? i + n : -1, c > 0 ? i - 1 : -1, c < n - 1 ? i + 1 : -1].filter((j) => j >= 0);
    };
    /** Fewest taps that clear the board: try every first row, then chase the lights down. */
    const plan = (): number[] => {
      let best: number[] | null = null;
      for (let m = 0; m < 1 << n; m++) {
        const b = on.slice();
        const taps: number[] = [];
        const tap = (i: number) => {
          taps.push(i);
          for (const j of cross(i)) b[j] = !b[j];
        };
        for (let c = 0; c < n; c++) if (m & (1 << c)) tap(c);
        for (let r = 1; r < n; r++) for (let c = 0; c < n; c++) if (b[(r - 1) * n + c]) tap(r * n + c);
        if (!b.some(Boolean) && (!best || taps.length < best.length)) best = taps;
      }
      return best ?? [];
    };
    let lastKind = '';
    const hint = (): Hint | null => {
      if (!on.some(Boolean)) return null;
      const taps = plan();
      if (!taps.length) return null;
      const score = (i: number) => cross(i).reduce((t, j) => t + (on[j] ? 1 : -1), 0);
      const opts = taps.map((i) => {
        const cr = cross(i);
        const litN = cr.filter((j) => on[j]).length;
        const above = Math.floor(i / n) > 0 && on[i - n];
        const kind = litN === cr.length ? 'all' : above ? 'chase' : 'net';
        return { i, cr, litN, kind, s: score(i) };
      });
      opts.sort((a, b) => b.s - a.s);
      const first = moves === 0 && lastKind === '';
      const o = opts.find((x) => x.kind !== lastKind) ?? opts[0];
      lastKind = o.kind;
      const off = o.litN,
        onN = o.cr.length - o.litN;
      const mech = first
        ? L(
            'A tap flips a tile and the ones above, below, left and right. ',
            'Une touche inverse la case et celles au-dessus, au-dessous, à gauche et à droite. ',
          )
        : '';
      const text =
        o.kind === 'all'
          ? L(
              `This tile and all its neighbours are lit: one tap switches all ${off} off.`,
              `Cette case et toutes ses voisines sont allumées : une touche éteint les ${off}.`,
            )
          : o.kind === 'chase'
            ? L(
                'To switch off a light without disturbing the rest of its row, tap the tile just below it.',
                'Pour éteindre une lumière sans déranger le reste de sa rangée, touchez la case juste en dessous.',
              )
            : L(
                `Two taps on the same tile cancel out, so each tile needs one tap at most. This one turns ${off} off and ${onN} on, which the next taps fix.`,
                `Deux touches sur une même case s’annulent : chaque case en demande une au plus. Celle-ci en éteint ${off} et en allume ${onN}, que les suivantes corrigeront.`,
              );
      return {
        text: mech + text,
        why: o.kind === 'chase' ? [cells[o.i - n]] : o.cr.filter((j) => j !== o.i && on[j]).map((j) => cells[j]),
        at: [cells[o.i]],
        play: () => press(o.i),
      };
    };
    return {
      snapshot: () => ({ on, moves, hist }),
      hint,
      onKey(e) {
        if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') {
          undo();
          return true;
        }
        if (e.key === 'r' || e.key === 'R') {
          restart();
          return true;
        }
        return false;
      },
    };
  },
};
