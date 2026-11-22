import { L } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, btn, h, PALETTE, s } from '../core/ui';
import { genConnect } from './pathkit/connect-gen';
import { adjacent, capture, cellAt, nbrs, pts, stepsToward } from './pathkit/grid';
import './connect.css';

export const connect: PuzzleDef = {
  id: 'connect',
  get name() {
    return L('Connect', 'Relier');
  },
  category: 'paths',
  undo: true,
  get rules() {
    return L('Link same-colour dots. Fill every cell. No U-turns.', 'Reliez les couleurs. Remplissez tout, sans demi-tour.');
  },
  help: () => ({
    goal: L(
      'Join each pair of same-colour dots with a path, and fill every cell of the grid. Paths can’t cross, and a path can never run alongside itself.',
      'Reliez chaque paire de points de même couleur par un chemin et remplissez toutes les cases. Les chemins ne se croisent pas, et un chemin ne peut jamais longer sa propre trace.',
    ),
    steps: [
      L(
        'Drag from a dot to draw a path; it follows your finger from cell to cell.',
        'Glissez à partir d’un point pour tracer un chemin : il suit votre doigt de case en case.',
      ),
      L('Reach the other dot of the same colour to link the pair.', 'Rejoignez l’autre point de la même couleur pour relier la paire.'),
      L(
        'Drag back along a path to shorten it, or grab it in the middle to redraw from there.',
        'Revenez sur un chemin pour le raccourcir, ou reprenez-le au milieu pour le retracer à partir de là.',
      ),
      L('Drawing over another colour cuts that path.', 'Tracer par-dessus une autre couleur coupe ce chemin.'),
      L(
        'No U-turns: a path can’t run next to a cell it already went through, so you can’t fold one colour back and forth to fill a gap. You can still draw it, but the offending cells get an X until you fix them.',
        'Pas de demi-tour : un chemin ne peut pas passer à côté d’une case qu’il a déjà traversée. Impossible donc de replier une couleur en zigzag pour combler un trou. Le tracé reste possible, mais les cases fautives sont marquées d’un X tant qu’elles ne sont pas corrigées.',
      ),
      L('Clear erases every path.', 'Effacer supprime tous les chemins.'),
    ],
    tips: [
      L(
        'Start with dots on the edges or close together; paths along the walls rarely get in the way.',
        'Commencez par les points en bordure ou proches l’un de l’autre : les chemins le long des bords gênent rarement.',
      ),
      L(
        'Every cell must be used, but a path can’t double back on itself: an empty pocket has to be filled by the colours around it.',
        'Toutes les cases doivent servir, mais un chemin ne peut pas revenir sur lui-même : une poche vide doit être remplie par les couleurs voisines.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [30, 50, 80, 120, 180]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const { n, paths: sol } = genConnect(rng, d);
    const N = n * n;
    const k = sol.length;
    const dot = new Int8Array(N).fill(-1);
    sol.forEach((p, c) => {
      dot[p[0]] = c;
      dot[p[p.length - 1]] = c;
    });

    const paths: number[][] = sol.map(() => []);
    const owner = new Int8Array(N);
    const recompute = () => {
      owner.fill(-1);
      paths.forEach((p, c) => p.forEach((i) => (owner[i] = c)));
    };
    const complete = (c: number) => {
      const p = paths[c];
      return p.length > 1 && dot[p[0]] === c && dot[p[p.length - 1]] === c && p[0] !== p[p.length - 1];
    };

    const grid = board(n, n, 'connect-grid');
    const cells = Array.from({ length: N }, (_, i) => {
      const el = h('div', { class: 'cell', 'data-i': i });
      grid.append(el);
      return el;
    });
    const svg = s('svg', { class: 'connect-lines', viewBox: `0 0 ${n} ${n}`, 'aria-hidden': 'true' });
    const lines = sol.map((_, c) => s('polyline', { style: `stroke:${PALETTE[c]}` }));
    svg.append(...lines);
    sol.forEach((p, c) => {
      for (const i of [p[0], p[p.length - 1]]) {
        svg.append(s('circle', { cx: (i % n) + 0.5, cy: Math.floor(i / n) + 0.5, r: 0.3, style: `fill:${PALETTE[c]}` }));
      }
    });
    // X marks on cells where a line runs alongside itself; drawn over the lines.
    const marks = s('g', { class: 'connect-bad' });
    svg.append(marks);
    grid.append(svg);

    /** Cells that step next to an earlier cell of their own line (the U-turn), not counting the cell just before. */
    const badCells = () => {
      const bad: number[] = [];
      paths.forEach((p, c) =>
        p.forEach((v, i) => {
          if (nbrs(v, n, n).some((x) => owner[x] === c && p.indexOf(x) < i - 1)) bad.push(v);
        }),
      );
      return bad;
    };

    let finished = false;
    const render = () => {
      recompute();
      let filled = 0;
      cells.forEach((el, i) => {
        const c = owner[i] >= 0 ? owner[i] : dot[i];
        el.className = `cell${owner[i] >= 0 ? ' on' : ''}${dot[i] >= 0 ? ' dot' : ''}`;
        if (c >= 0) el.setAttribute('style', `--c:${PALETTE[c]}`);
        else el.removeAttribute('style');
        if (owner[i] >= 0) filled++;
      });
      lines.forEach((l, c) => l.setAttribute('points', pts(paths[c], n)));
      const bad = badCells();
      marks.replaceChildren(
        ...bad.map((i) => {
          const x = i % n,
            y = Math.floor(i / n);
          return s('path', { d: `M${x + 0.28} ${y + 0.28}L${x + 0.72} ${y + 0.72}M${x + 0.72} ${y + 0.28}L${x + 0.28} ${y + 0.72}` });
        }),
      );
      const linked = paths.filter((_, c) => complete(c)).length;
      const pct = Math.round((filled / N) * 100);
      ctx.status(L(`${linked}/${k} linked · ${pct}% filled`, `${linked}/${k} reliées · ${pct} % rempli`));
      return linked === k && filled === N && !bad.length;
    };
    const check = () => {
      if (render() && !finished) {
        finished = true;
        active = -1;
        ctx.solved();
      }
    };

    // ---- drawing ----
    let active = -1;
    /** Would stepping onto `j` put line `c` beside one of its own earlier cells (a U-turn)? Allowed, but marked with an X. */
    const doublesBack = (c: number, j: number) => {
      const p = paths[c];
      return nbrs(j, n, n).some((x) => owner[x] === c && x !== p[p.length - 1]);
    };
    const tryAdd = (c: number, j: number): boolean => {
      const p = paths[c];
      if (complete(c)) return false;
      if (dot[j] >= 0 && dot[j] !== c) return false;
      if (!adjacent(p[p.length - 1], j, n)) return false;
      const o = owner[j];
      if (o >= 0 && o !== c) {
        // cut the other colour's path just before this cell
        paths[o].length = paths[o].indexOf(j);
      }
      p.push(j);
      owner[j] = c;
      return true;
    };
    const dragTo = (j: number) => {
      if (active < 0 || j < 0) return;
      const p = paths[active];
      for (let guard = 0; guard < N; guard++) {
        const last = p[p.length - 1];
        if (j === last) break;
        const at = p.indexOf(j);
        if (at >= 0) {
          p.length = at + 1; // retract
          recompute();
          break;
        }
        // Prefer a step that keeps the line legal; a U-turn is still allowed, just marked.
        const steps = stepsToward(last, j, n).sort((a, b) => +doublesBack(active, a) - +doublesBack(active, b));
        if (!steps.some((x) => tryAdd(active, x))) break;
        recompute();
      }
      check();
    };
    const start = (i: number) => {
      if (finished || i < 0) return false;
      if (dot[i] >= 0) {
        const c = dot[i];
        paths[c] = [i];
        active = c;
      } else if (owner[i] >= 0) {
        const c = owner[i];
        paths[c].length = paths[c].indexOf(i) + 1;
        active = c;
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

    ctx.controls(
      btn(
        L('Clear', 'Effacer'),
        () => {
          if (finished) return;
          paths.forEach((p) => (p.length = 0));
          render();
        },
        'ghost',
      ),
    );

    // ---- resume ----
    const sv = ctx.saved as { paths?: unknown } | undefined;
    if (Array.isArray(sv?.paths) && sv.paths.length === k) {
      const used = new Set<number>();
      sv.paths.forEach((p, c) => {
        if (!Array.isArray(p) || !p.length || dot[p[0]] !== c) return;
        const ok = p.every(
          (v, i) =>
            Number.isInteger(v) &&
            v >= 0 &&
            v < N &&
            !used.has(v) &&
            (i === 0 || adjacent(p[i - 1], v, n)) &&
            (i === 0 || dot[v] < 0 || (dot[v] === c && i === p.length - 1)),
        );
        if (!ok) return;
        p.forEach((v: number) => used.add(v));
        paths[c] = [...p];
      });
    }
    root.append(grid);
    render();

    // ---- guide: forced moves first, then short links along the edge ----
    let lastRule = '';
    const hint = (): Hint | null => {
      if (finished) return null;
      const el = (i: number) => cells[i];
      // Each colour's solution, oriented from the dot its drawn line starts at.
      const route = (c: number) => (paths[c].length && paths[c][0] !== sol[c][0] ? [...sol[c]].reverse() : sol[c]);
      // A drawn line that strays from the solution: cut it back.
      for (let c = 0; c < k; c++) {
        const p = paths[c],
          r = route(c);
        let m = 0;
        while (m < p.length && p[m] === r[m]) m++;
        if (m < p.length)
          return {
            text: L(
              'This line blocks the others. Press on it where it should turn to cut it back.',
              'Cette ligne bloque les autres. Appuyez à l’endroit où elle devrait tourner pour la couper.',
            ),
            why: p.slice(m).map(el),
            at: [el(r[Math.max(0, m - 1)])],
            play: () => {
              start(r[Math.max(0, m - 1)]);
              active = -1;
            },
          };
      }
      const free = (i: number) => owner[i] < 0 && dot[i] < 0;
      const open = (c: number, head: number, target: number) =>
        nbrs(head, n, n).filter((j) => (free(j) || j === target) && !doublesBack(c, j));
      /** Press on `from` (a dot or a line end), then drag through `more`. */
      const draw = (from: number, more: number[]) => () => {
        start(from);
        for (const j of more) dragTo(j);
        active = -1;
      };
      type Opt = { c: number; head: number; target: number; r: number[]; rest: number[] };
      const opts: Opt[] = [];
      for (let c = 0; c < k; c++) {
        if (complete(c)) continue;
        if (paths[c].length) {
          const r = route(c);
          const head = paths[c][paths[c].length - 1];
          opts.push({ c, head, target: r[r.length - 1], r, rest: r.slice(paths[c].length) });
        } else {
          // Not started: either dot can lead.
          for (const r of [sol[c], [...sol[c]].reverse()]) opts.push({ c, head: r[0], target: r[r.length - 1], r, rest: r.slice(1) });
        }
      }
      const rules: Record<string, () => Hint | null> = {
        touch: () => {
          for (const o of opts)
            if (o.rest.length === 1)
              return {
                text: L(
                  'These two dots of the same colour touch: just join them.',
                  'Ces deux points de même couleur se touchent : reliez-les, tout simplement.',
                ),
                why: [el(o.head)],
                at: [el(o.target)],
                play: draw(o.head, o.rest),
              };
          return null;
        },
        forced: () => {
          for (const o of opts) {
            const choices = open(o.c, o.head, o.target);
            if (choices.length !== 1 || choices[0] !== o.rest[0]) continue;
            // Follow the chain of forced cells.
            const run = [o.rest[0]];
            const taken = new Set([...paths[o.c], o.head, o.rest[0]]);
            for (let t = 1; t < o.rest.length; t++) {
              const at = run[run.length - 1];
              const ch = nbrs(at, n, n).filter(
                (j) => !taken.has(j) && (free(j) || j === o.target) && !nbrs(j, n, n).some((x) => x !== at && taken.has(x)),
              );
              if (ch.length !== 1 || ch[0] !== o.rest[t]) break;
              run.push(o.rest[t]);
              taken.add(o.rest[t]);
            }
            return {
              text: L(
                `This ${paths[o.c].length > 1 ? 'line end' : 'dot'} can only step to one cell (free, and not beside its own line), so the line must go there${run.length > 1 ? ', and on until it gets a choice' : ''}.`,
                `${paths[o.c].length > 1 ? 'Ce bout de ligne' : 'Ce point'} n’a qu’une case où aller (libre, et pas à côté de sa propre ligne) : la ligne doit y passer${run.length > 1 ? ', puis continuer jusqu’à avoir le choix' : ''}.`,
              ),
              why: [el(o.head)],
              at: run.map(el),
              play: draw(o.head, run),
            };
          }
          return null;
        },
        edge: () => {
          // A short link that hugs the border can't get in anyone's way.
          const onEdge = (i: number) => i < n || i >= N - n || i % n === 0 || i % n === n - 1;
          const best = opts.filter((o) => [o.head, ...o.rest].every(onEdge)).sort((x, y) => x.rest.length - y.rest.length)[0];
          if (!best) return null;
          return {
            text: L(
              'Both dots sit on the edge: run the line along the border. Hugging the edge leaves the middle free for the others.',
              'Les deux points sont sur le bord : longez la bordure. Coller au bord laisse le centre libre pour les autres.',
            ),
            why: [el(best.head), el(best.target)],
            at: best.rest.map(el),
            play: draw(best.head, best.rest),
          };
        },
      };
      const order = ['touch', 'forced', 'edge'];
      for (const r of [...order.filter((o) => o !== lastRule), lastRule]) {
        const found = rules[r]?.();
        if (found) {
          lastRule = r;
          return found;
        }
      }
      lastRule = '';
      // Nothing forced: link the closest pair, the way that leaves room for the rest.
      const o = opts.sort((x, y) => x.rest.length - y.rest.length)[0];
      if (o)
        return {
          text: L(
            `Link the closest pair first, along the path that walls off no empty cells. Every cell must end up filled.`,
            `Reliez d’abord la paire la plus proche, sans enfermer de case vide. Toutes les cases doivent être remplies.`,
          ),
          why: [el(o.head), el(o.target)],
          at: o.rest.map(el),
          play: draw(o.head, o.rest),
        };
      return null;
    };

    /**
     * Visible dead ends only (the stored solution isn't the only one): a pair of dots that lines wall
     * apart, or empty cells that no unfinished line can reach. The fix cuts back a line where it left
     * the stored solution, starting with one next to the trouble.
     */
    const checkHint = (): Hint | null => {
      if (finished) return null;
      recompute();
      const free = (i: number) => owner[i] < 0 && dot[i] < 0;
      const comp = new Int32Array(N).fill(-1);
      const regions: number[][] = [];
      for (let i = 0; i < N; i++) {
        if (!free(i) || comp[i] >= 0) continue;
        const reg = [i];
        comp[i] = regions.length;
        for (let t = 0; t < reg.length; t++)
          for (const j of nbrs(reg[t], n, n))
            if (free(j) && comp[j] < 0) {
              comp[j] = regions.length;
              reg.push(j);
            }
        regions.push(reg);
      }
      /** Free regions touching cell i. */
      const touching = (i: number) =>
        new Set(
          nbrs(i, n, n)
            .map((j) => comp[j])
            .filter((x) => x >= 0),
        );
      const route = (c: number) => (paths[c].length && paths[c][0] !== sol[c][0] ? [...sol[c]].reverse() : sol[c]);
      const ends = (c: number) => {
        const r = route(c);
        return { head: paths[c].length ? paths[c][paths[c].length - 1] : r[0], target: r[r.length - 1] };
      };
      let trouble: { cells: number[]; why: number[]; text: string } | null = null;
      for (let c = 0; c < k && !trouble; c++) {
        if (complete(c)) continue;
        const { head, target } = ends(c);
        if (adjacent(head, target, n)) continue;
        const a = touching(head),
          b = touching(target);
        if ([...a].some((x) => b.has(x))) continue;
        trouble = {
          cells: sol[c],
          why: [head, target],
          text: L(
            'These two dots can’t be joined any more: other lines wall them apart.',
            'Ces deux points ne peuvent plus être reliés : d’autres lignes les séparent.',
          ),
        };
      }
      if (!trouble) {
        const open = [...Array(k).keys()].filter((c) => !complete(c)).map(ends);
        const reg = regions.find((_, x) => !open.some((o) => touching(o.head).has(x) && touching(o.target).has(x)));
        if (reg)
          trouble = {
            cells: reg,
            why: reg,
            text: L(
              'No line can reach these empty cells any more, and every cell must be filled.',
              'Aucune ligne ne peut plus atteindre ces cases vides, et toutes les cases doivent être remplies.',
            ),
          };
      }
      if (!trouble) return null;
      // Lines that left the stored solution, closest to the trouble first.
      const near = new Set(trouble.cells.flatMap((i) => [i, ...nbrs(i, n, n)]));
      let pick: { c: number; m: number; score: number } | null = null;
      for (let c = 0; c < k; c++) {
        const p = paths[c],
          r = route(c);
        let m = 0;
        while (m < p.length && p[m] === r[m]) m++;
        if (m >= p.length) continue;
        const score = p.slice(m).filter((i) => near.has(i)).length;
        if (!pick || score > pick.score) pick = { c, m, score };
      }
      if (!pick) return null;
      const { c, m } = pick;
      const back = route(c)[Math.max(0, m - 1)];
      return {
        kind: 'fix',
        text: `${trouble.text} ${L('Cut back this line.', 'Coupez cette ligne.')}`,
        why: trouble.why.map((i) => cells[i]),
        at: paths[c].slice(m).map((i) => cells[i]),
        action: L('Cut it back', 'La couper'),
        play: () => {
          start(back);
          active = -1;
        },
      };
    };

    return {
      hint,
      check: checkHint,
      snapshot: () => ({ paths }),
    };
  },
};
