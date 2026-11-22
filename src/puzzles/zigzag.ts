// Cover the grid with twisting lines. Inspired by a paper-puzzle genre from Arvi Teikari's (Hempuli)
// collections; this implementation and every puzzle are generated here.
import { L } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, h, PALETTE, s } from '../core/ui';
import { adjacent, capture, cellAt, pts, stepsToward } from './pathkit/grid';
import { genZigzag, numberLines, twistError } from './pathkit/zigzag-gen';
import './zigzag.css';

export const zigzag: PuzzleDef = {
  id: 'zigzag',
  get name() {
    return L('Zigzag', 'Zigzags');
  },
  category: 'paths',
  undo: true,
  offByDefault: true,
  get rules() {
    return L('Fill the grid with wiggly lines as long as their numbers.', 'Couvrez tout de lignes sinueuses longues comme leur nombre.');
  },
  help: () => ({
    goal: L(
      'Draw one line from every number so that the lines cover every cell. Each line is exactly as many cells long as its number.',
      'Tracez une ligne à partir de chaque nombre pour que les lignes couvrent toutes les cases. Chaque ligne compte exactement autant de cases que son nombre.',
    ),
    steps: [
      L(
        'A line starts on its number, counts that cell, and never passes over another number or another line.',
        'Une ligne part de son nombre, compte cette case et ne passe jamais sur un autre nombre ni sur une autre ligne.',
      ),
      L(
        'Lines keep wiggling: a line never goes straight through two cells in a row.',
        'Les lignes ondulent sans cesse : une ligne ne traverse jamais deux cases de suite en ligne droite.',
      ),
      L(
        'A line never turns the same way in two cells in a row (no tight U-turns); left then right is fine.',
        'Une ligne ne tourne jamais du même côté dans deux cases de suite (pas de demi-tour serré); gauche puis droite, ça va.',
      ),
      L(
        'Drag from a number to draw its line. Drag back to shorten it, grab it in the middle to redraw from there, or tap the number to clear it.',
        'Glissez à partir d’un nombre pour tracer sa ligne. Revenez en arrière pour la raccourcir, reprenez-la au milieu pour la retracer, ou touchez le nombre pour l’effacer.',
      ),
      L(
        'Drawing over another line cuts it. A cell that breaks a rule turns red.',
        'Tracer par-dessus une autre ligne la coupe. Une case qui brise une règle devient rouge.',
      ),
    ],
    tips: [
      L(
        'Small numbers in corners have very few shapes: draw them first.',
        'Les petits nombres dans les coins ont très peu de formes possibles : tracez-les en premier.',
      ),
      L('Look for empty cells that only one number can still reach.', 'Cherchez les cases vides qu’un seul nombre peut encore atteindre.'),
    ],
  }),
  par: (d) => byLevel(d, [40, 70, 120, 180, 280]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const n = byLevel(d, [5, 6, 7, 7, 8]);
    const maxLen = byLevel(d, [5, 6, 7, 9, 10]);
    const { clue, lines: sol } = genZigzag(n, n, maxLen, rng);
    const N = n * n;
    const nums = sol.map((p) => p[0]);
    const k = nums.length;
    const numAt = new Int16Array(N).fill(-1);
    nums.forEach((c, j) => (numAt[c] = j));

    const paths: number[][] = nums.map(() => []);
    const owner = new Int16Array(N);
    const recompute = () => {
      owner.fill(-1);
      paths.forEach((p, j) => p.forEach((i) => (owner[i] = j)));
    };
    const complete = (j: number) => paths[j].length === clue[nums[j]] && twistError(paths[j], n) < 0;

    const grid = board(n, n, 'zz-grid');
    const cells = Array.from({ length: N }, (_, i) => {
      const el = h('div', { class: 'cell', 'data-i': i }, numAt[i] >= 0 ? h('span', { class: 'zz-n' }, clue[i]) : null);
      grid.append(el);
      return el;
    });
    const svg = s('svg', { class: 'zz-lines', viewBox: `0 0 ${n} ${n}`, 'aria-hidden': 'true' });
    const polys = nums.map((_, j) => s('polyline', { style: `stroke:${PALETTE[j % 8]}` }));
    svg.append(...polys);
    grid.append(svg);

    let finished = false;
    let active = -1;
    const render = () => {
      recompute();
      const bad = new Set<number>();
      paths.forEach((p) => {
        const e = twistError(p, n);
        if (e >= 0) bad.add(p[e]);
      });
      let filled = 0,
        linked = 0;
      for (let j = 0; j < k; j++) if (complete(j)) linked++;
      cells.forEach((el, i) => {
        const o = owner[i] >= 0 ? owner[i] : numAt[i];
        let cls = 'cell';
        if (owner[i] >= 0) {
          cls += ' on';
          filled++;
        }
        if (numAt[i] >= 0) cls += ' num' + (complete(numAt[i]) ? ' done' : '');
        if (bad.has(i)) cls += ' err';
        if (el.className !== cls) el.className = cls;
        const st = o >= 0 ? `--c:${PALETTE[o % 8]}` : '';
        if ((el.getAttribute('style') ?? '') !== st) el.setAttribute('style', st);
      });
      polys.forEach((l, j) => l.setAttribute('points', pts(paths[j], n)));
      const pct = Math.round((filled / N) * 100);
      ctx.status(L(`${linked}/${k} lines · ${pct}% filled`, `${linked}/${k} lignes · ${pct} % rempli`));
      return linked === k && filled === N;
    };
    const check = () => {
      if (render() && !finished) {
        finished = true;
        active = -1;
        ctx.solved();
      }
    };

    // ---- drawing ----
    const tryAdd = (j: number, x: number): boolean => {
      const p = paths[j];
      if (numAt[x] >= 0 || p.length >= clue[nums[j]] || !adjacent(p[p.length - 1], x, n)) return false;
      const o = owner[x];
      if (o >= 0 && o !== j) paths[o].length = paths[o].indexOf(x); // cut the other line
      p.push(x);
      owner[x] = j;
      return true;
    };
    const dragTo = (x: number) => {
      if (active < 0 || x < 0) return;
      const p = paths[active];
      for (let guard = 0; guard < N; guard++) {
        const last = p[p.length - 1];
        if (x === last) break;
        const at = p.indexOf(x);
        if (at >= 0) {
          p.length = at + 1; // retract
          recompute();
          break;
        }
        if (!stepsToward(last, x, n).some((y) => tryAdd(active, y))) break;
        recompute();
      }
      check();
    };
    const start = (i: number) => {
      if (finished || i < 0) return false;
      if (numAt[i] >= 0) {
        const j = numAt[i];
        paths[j] = [i];
        active = j;
      } else if (owner[i] >= 0) {
        const j = owner[i];
        paths[j].length = paths[j].indexOf(i) + 1;
        active = j;
      } else return false;
      ctx.touch();
      check();
      return true;
    };
    grid.addEventListener('pointerdown', (e) => {
      if (start(cellAt(grid, n, n, e.clientX, e.clientY))) {
        capture(grid, e.pointerId);
        e.preventDefault();
      }
    });
    grid.addEventListener('pointermove', (e) => {
      if (active >= 0) dragTo(cellAt(grid, n, n, e.clientX, e.clientY));
    });
    const end = () => {
      active = -1;
    };
    grid.addEventListener('pointerup', end);
    grid.addEventListener('pointercancel', end);

    // ---- resume ----
    const sv = ctx.saved as { paths?: unknown } | undefined;
    if (Array.isArray(sv?.paths) && sv.paths.length === k) {
      const used = new Set<number>();
      sv.paths.forEach((p, j) => {
        if (!Array.isArray(p) || !p.length || p[0] !== nums[j] || p.length > clue[nums[j]]) return;
        const ok = p.every(
          (v, t) =>
            Number.isInteger(v) &&
            v >= 0 &&
            v < N &&
            !used.has(v) &&
            (t === 0 ? true : numAt[v] < 0 && adjacent(p[t - 1], v, n)) &&
            p.indexOf(v) === t,
        );
        if (!ok) return;
        p.forEach((v: number) => used.add(v));
        paths[j] = [...p];
      });
    }
    root.append(grid);
    render();

    // ---- guide: forced lines and starts, cells only one number reaches ----
    const all = nums.map((c) => numberLines(n, n, clue, c));
    let lastRule = '';
    let taught = false;
    const el = (i: number) => cells[i];
    const teach = (h0: Hint): Hint => {
      if (taught) return h0;
      taught = true;
      return { ...h0, text: h0.text + L(' Drag from the number to draw.', ' Glissez à partir du nombre pour tracer.') };
    };
    /** Press on the line's end (or its number), then drag through `more`. */
    const draw = (j: number, more: number[]) => () => {
      const p = paths[j];
      start(p.length ? p[p.length - 1] : nums[j]);
      for (const x of more) dragTo(x);
      active = -1;
    };
    const hint = (): Hint | null => {
      if (finished) return null;
      // A drawn line that strays from the solution: cut it back.
      for (let j = 0; j < k; j++) {
        const p = paths[j];
        let m = 0;
        while (m < p.length && p[m] === sol[j][m]) m++;
        if (m < p.length)
          return {
            text: L(
              'This line leads to a dead end: the other lines can’t all fit around it. Press where it went wrong to cut it back.',
              'Cette ligne mène à une impasse : les autres lignes ne peuvent pas toutes entrer autour. Appuyez là où elle dévie pour la couper.',
            ),
            why: p.slice(m).map(el),
            at: [el(p[Math.max(0, m - 1)])],
            play: () => {
              start(p[Math.max(0, m - 1)]);
              active = -1;
            },
          };
      }
      // Lines each unfinished number could still take, given what is drawn.
      const open: { j: number; opts: number[][]; done: number }[] = [];
      for (let j = 0; j < k; j++) {
        if (complete(j)) continue;
        const p = paths[j];
        const opts = all[j].filter((q) => p.every((x, t) => q[t] === x) && q.every((x, t) => t < p.length || owner[x] < 0));
        open.push({ j, opts, done: Math.max(1, p.length) });
      }
      // Drop options that would leave some empty cell that no other number can still reach.
      const mark = new Int32Array(N);
      let stamp = 0;
      for (const o of open)
        o.opts = o.opts.filter((q) => {
          stamp++;
          for (const x of q) mark[x] = stamp;
          for (let x = 0; x < N; x++) {
            if (owner[x] >= 0 || numAt[x] >= 0 || mark[x] === stamp) continue;
            const ok = open.some((r) => r.j !== o.j && r.opts.some((w) => w.includes(x) && !w.some((y) => mark[y] === stamp)));
            if (!ok) return false;
          }
          return true;
        });
      /** Cells (after the drawn part) that every option shares, in order. */
      const common = (opts: number[][], from: number) => {
        const out: number[] = [];
        for (let t = from; opts.length && t < opts[0].length; t++) {
          if (!opts.every((q) => q[t] === opts[0][t])) break;
          out.push(opts[0][t]);
        }
        return out;
      };
      const rules: Record<string, () => Hint | null> = {
        only: () => {
          for (const o of open) {
            if (o.opts.length !== 1) continue;
            const c = clue[nums[o.j]];
            return {
              text: L(
                `This ${c} has just one possible line left: every other ${c}-cell zigzag hits the edge, a number or another line, or cuts off a cell no other number can reach.`,
                `Ce ${c} n’a plus qu’une ligne possible : tout autre zigzag de ${c} cases touche le bord, un nombre ou une autre ligne, ou isole une case qu’aucun autre nombre n’atteint.`,
              ),
              why: [el(nums[o.j])],
              at: o.opts[0].slice(o.done).map(el),
              play: draw(o.j, o.opts[0].slice(o.done)),
            };
          }
          return null;
        },
        start: () => {
          for (const o of open) {
            const run = common(o.opts, o.done);
            if (!run.length || o.opts.length < 2) continue;
            const c = clue[nums[o.j]];
            return {
              text: L(
                `This ${c} can still draw ${o.opts.length} lines, but they all ${paths[o.j].length > 1 ? 'continue' : 'start'} the same way.`,
                `Ce ${c} peut encore tracer ${o.opts.length} lignes, mais elles ${paths[o.j].length > 1 ? 'continuent' : 'commencent'} toutes de la même façon.`,
              ),
              why: [el(nums[o.j])],
              at: run.map(el),
              play: draw(o.j, run),
            };
          }
          return null;
        },
        reach: () => {
          for (let x = 0; x < N; x++) {
            if (owner[x] >= 0 || numAt[x] >= 0) continue;
            const by = open.filter((o) => o.opts.some((q) => q.includes(x)));
            if (by.length !== 1) continue;
            const o = by[0];
            const opts = o.opts.filter((q) => q.includes(x));
            const run = common(opts, o.done);
            if (!run.length) continue;
            const c = clue[nums[o.j]];
            return {
              text: L(
                `Only this ${c} can reach the marked cell, so its line must cover it. ${opts.length > 1 ? 'Every way to get there starts like this.' : 'Only one line does.'}`,
                `Seul ce ${c} peut atteindre la case indiquée : sa ligne doit la couvrir. ${opts.length > 1 ? 'Toutes les façons d’y arriver commencent ainsi.' : 'Une seule ligne le fait.'}`,
              ),
              why: [el(nums[o.j]), el(x)],
              at: run.map(el),
              play: draw(o.j, run),
            };
          }
          return null;
        },
      };
      const order = ['only', 'start', 'reach'];
      for (const r of [...order.filter((o) => o !== lastRule), lastRule]) {
        const found = rules[r]?.();
        if (found) {
          lastRule = r;
          return teach(found);
        }
      }
      lastRule = '';
      // Nothing forced: the number with the fewest options, drawn as in the solution.
      const o = open.filter((q) => q.opts.length).sort((a, b) => a.opts.length - b.opts.length)[0];
      if (!o) return null;
      const rest = sol[o.j].slice(o.done);
      if (!rest.length) return null;
      const c = clue[nums[o.j]];
      return teach({
        text: L(
          `This ${c} has ${o.opts.length} possible lines. Only this one leaves room for every other number to cover the grid.`,
          `Ce ${c} a ${o.opts.length} lignes possibles. Seule celle-ci laisse assez de place aux autres nombres pour couvrir la grille.`,
        ),
        why: [el(nums[o.j])],
        at: rest.map(el),
        play: draw(o.j, rest),
      });
    };

    return { hint, snapshot: () => ({ paths }) };
  },
};
