import { L, P } from '../../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../../core/types';
import { board, clearBtn, h, s, shake } from '../../ui/dom';
import { keyDir } from '../../kits/move/kit';
import { adjacent, capture, cellAt, nbrs, pts, stepsToward } from '../../kits/path/grid';
import { finishTrail, genTrail, wallKey } from './gen';
import './style.css';

export const trail: PuzzleDef = {
  id: 'trail',
  get name() {
    return L('Trail', 'Sentier');
  },
  category: 'paths',
  undo: true,
  get rules() {
    return L('One path through every cell, numbers in order.', 'Un chemin par toutes les cases, numéros dans l’ordre.');
  },
  help: () => ({
    goal: L(
      'Draw a single path that visits every cell exactly once and passes the numbered checkpoints in order: it starts on 1 and ends on the highest number.',
      'Tracez un seul chemin qui passe une fois par chaque case et franchit les points numérotés dans l’ordre : il part du 1 et finit sur le plus grand numéro.',
    ),
    steps: [
      L(
        'Drag from 1 (or from the end of your path) through neighbouring cells to extend it.',
        'Glissez à partir du 1 (ou du bout de votre chemin) de case voisine en case voisine pour l’allonger.',
      ),
      L(
        'The path can’t cross itself, and a number can only be entered right after the one before it.',
        'Le chemin ne peut pas se croiser, et on n’entre sur un numéro que juste après le précédent.',
      ),
      L(
        'Thick lines between cells are walls: the path can’t go through them.',
        'Les traits épais entre les cases sont des murs : le chemin ne les traverse pas.',
      ),
      L(
        'Drag back over your path to retract it, or tap any cell of the path to cut it there.',
        'Revenez sur vos pas pour reculer, ou touchez une case du chemin pour le couper à cet endroit.',
      ),
      L(
        'Arrow keys also extend or retract the path. Clear starts over from 1.',
        'Les flèches du clavier allongent ou raccourcissent aussi le chemin. Effacer repart du 1.',
      ),
    ],
    tips: [
      L(
        'Corners and cells boxed in by walls have few ways in: plan how to reach them first.',
        'Les coins et les cases entourées de murs ont peu d’accès : prévoyez d’abord comment les atteindre.',
      ),
      L(
        'Don’t leave a pocket of cells you can’t come back out of.',
        'Ne laissez pas derrière vous un recoin d’où vous ne pourriez plus ressortir.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [30, 50, 70, 110, 170]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const pz = genTrail(rng, d);
    const { n, marks, last } = pz;
    const N = n * n;
    const walls = new Set(pz.walls);
    const start = marks.indexOf(1);
    const end = marks.indexOf(last);
    const path: number[] = [start];

    const grid = board(n, n, 'trail-grid');
    const cells = Array.from({ length: N }, (_, i) => {
      const el = h('div', { class: 'cell', 'data-i': i });
      grid.append(el);
      return el;
    });
    const svg = s('svg', { class: 'trail-svg', viewBox: `0 0 ${n} ${n}`, 'aria-hidden': 'true' });
    for (const key of walls) {
      const a = Math.floor(key / 4096),
        b = key % 4096;
      const r = Math.floor(b / n),
        c = b % n;
      // b is right of or below a
      const seg = b - a === 1 ? { x1: c, y1: r, x2: c, y2: r + 1 } : { x1: c, y1: r, x2: c + 1, y2: r };
      svg.append(s('line', { class: 'wall', ...seg }));
    }
    const under = s('polyline', { class: 'under' });
    const over = s('polyline', { class: 'over' });
    svg.append(under, over);
    const cps: SVGGElement[] = [];
    marks.forEach((m, i) => {
      if (!m) return;
      const g = s(
        'g',
        { class: 'cp' },
        s('circle', { cx: (i % n) + 0.5, cy: Math.floor(i / n) + 0.5, r: 0.31 }),
        s('text', { x: (i % n) + 0.5, y: Math.floor(i / n) + 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, m),
      );
      cps[m] = g;
      svg.append(g);
    });
    grid.append(svg);

    let finished = false;
    let drawing = false;
    const nextMark = () => {
      let mx = 0;
      for (const i of path) mx = Math.max(mx, marks[i]);
      return mx + 1;
    };
    const canEnter = (from: number, j: number) =>
      from !== end && adjacent(from, j, n) && !walls.has(wallKey(from, j)) && !path.includes(j) && (!marks[j] || marks[j] === nextMark());

    const render = () => {
      const on = new Set(path);
      const head = path[path.length - 1];
      cells.forEach((el, i) => (el.className = `cell${on.has(i) ? ' on' : ''}${i === head ? ' head' : ''}`));
      const reached = nextMark() - 1;
      cps.forEach((g, m) => g?.classList.toggle('hit', m <= reached));
      const p = pts(path, n);
      under.setAttribute('points', p);
      over.setAttribute('points', p);
      const len = path.length;
      const missed = N - len;
      ctx.status(
        head === end
          ? missed
            ? `${P(missed, ['cell missed', 'cells missed'], ['case oubliée', 'cases oubliées'])} · ${L('tap an earlier cell to back up', 'touchez une case plus tôt pour reculer')}`
            : L('Done!', 'Terminé!')
          : [head - n, head + 1, head + n, head - 1].some((j) => j >= 0 && j < N && canEnter(head, j))
            ? L(`${len} / ${N} cells · next ${reached + 1}`, `${len} / ${N} cases · prochain ${reached + 1}`)
            : L('Dead end · tap an earlier cell to back up', 'Cul-de-sac · touchez une case plus tôt pour reculer'),
      );
      return head === end && !missed;
    };
    const check0 = () => {
      if (render() && !finished) {
        finished = true;
        drawing = false;
        ctx.solved();
      }
    };

    const dragTo = (j: number) => {
      if (!drawing || j < 0) return;
      for (let guard = 0; guard < N; guard++) {
        const head = path[path.length - 1];
        if (j === head) break;
        const at = path.indexOf(j);
        if (at >= 0) {
          path.length = at + 1;
          break;
        }
        const step = stepsToward(head, j, n).find((x) => canEnter(head, x));
        if (step == null) break;
        path.push(step);
      }
      check0();
    };
    grid.addEventListener('pointerdown', (e) => {
      if (finished) return;
      const i = cellAt(grid, n, n, e.clientX, e.clientY);
      if (i < 0) return;
      const at = path.indexOf(i);
      const head = path[path.length - 1];
      if (at >= 0) path.length = at + 1;
      else if (!canEnter(head, i)) {
        if (adjacent(head, i, n)) shake(grid);
        return;
      }
      ctx.touch();
      drawing = true;
      capture(grid, e.pointerId);
      e.preventDefault();
      dragTo(i);
      check0();
    });
    grid.addEventListener('pointermove', (e) => dragTo(cellAt(grid, n, n, e.clientX, e.clientY)));
    const stop = () => (drawing = false);
    grid.addEventListener('pointerup', stop);
    grid.addEventListener('pointercancel', stop);

    ctx.controls(
      clearBtn(() => {
        if (finished) return;
        path.length = 1;
        render();
      }),
    );

    const sv = ctx.saved as { path?: unknown } | undefined;
    if (Array.isArray(sv?.path) && sv.path[0] === start) {
      const t = sv.path as number[];
      const ok = t.every((v, k) => {
        if (!Number.isInteger(v) || v < 0 || v >= N) return false;
        if (k === 0) return true;
        const good = canEnter(path[k - 1], v);
        if (good) path.push(v);
        return good;
      });
      if (!ok) path.length = 1;
    }
    // ---- Guide ----
    const open = (a: number, b: number) => !walls.has(wallKey(a, b));
    /** Free neighbours of j: unvisited cells reachable without crossing a wall. */
    const freeNb = (j: number, on: Set<number>) => nbrs(j, n, n).filter((x) => !on.has(x) && open(j, x));
    /** Unvisited cells no longer connected to x once the path moves there (`on` includes x). */
    const strandedBy = (x: number, on: Set<number>) => {
      const seen = new Set([x]);
      const st = [x];
      while (st.length)
        for (const y of freeNb(st.pop()!, on))
          if (!seen.has(y)) {
            seen.add(y);
            st.push(y);
          }
      const out: number[] = [];
      for (let i = 0; i < N; i++) if (!on.has(i) && !seen.has(i)) out.push(i);
      return out;
    };
    /** Steps from `from` that respect walls, the path and the number order, and don't end the path early. */
    const options = (from: number, on: Set<number>, next: number) =>
      nbrs(from, n, n).filter(
        (j) => from !== end && open(from, j) && !on.has(j) && (!marks[j] || marks[j] === next) && (j !== end || on.size === N - 1),
      );
    /** Solver results per path, kept across calls (check() then hint(), and cutting back). */
    const solved = new Map<string, number[] | null | undefined>();
    const finishFrom = (pre: number[], budget = 30000) => {
      if (pre.every((x, k) => pz.path[k] === x)) return pz.path;
      const key = pre.join(',');
      if (!solved.has(key)) {
        if (solved.size > 200) solved.clear();
        solved.set(key, finishTrail(pz, pre, budget));
      }
      return solved.get(key);
    };
    /** A full solution continuing the current path; null when proven impossible, undefined if unsure. */
    const solve = () => finishFrom(path);
    /** Why the path can't be finished, when it's visible: cut-off cells, a cell with one way in, the end reached early. */
    const reason = (): { en: string; fr: string; why: number[] } => {
      const on = new Set(path);
      const head = path[path.length - 1];
      if (head === end)
        return {
          en: `The path reached the last number with ${N - path.length === 1 ? 'a cell' : `${N - path.length} cells`} still uncovered, and it must end there.`,
          fr: `Le chemin a atteint le dernier numéro avec encore ${N - path.length === 1 ? 'une case' : `${N - path.length} cases`} à couvrir, et il doit finir là.`,
          why: [...Array(N).keys()].filter((i) => !on.has(i)),
        };
      const cut = strandedBy(head, on);
      if (cut.length)
        return {
          en: `${cut.length === 1 ? 'This cell is' : `These ${cut.length} cells are`} cut off from the end of the path: it can never come back for ${cut.length === 1 ? 'it' : 'them'}.`,
          fr: `${cut.length === 1 ? 'Cette case est coupée' : `Ces ${cut.length} cases sont coupées`} du bout du chemin : il ne pourra plus ${cut.length === 1 ? 'y' : 'y'} revenir.`,
          why: cut,
        };
      for (let y = 0; y < N; y++) {
        if (on.has(y) || y === end) continue;
        const deg = freeNb(y, on).length + (adjacent(head, y, n) && open(head, y) ? 1 : 0);
        if (deg < 2)
          return {
            en: 'This cell has only one way in left, so the path would get stuck in it before the end.',
            fr: 'Cette case n’a plus qu’un seul accès : le chemin y resterait coincé avant la fin.',
            why: [y],
          };
      }
      return {
        en: 'It breaks no rule yet, but no way on covers every cell and passes the numbers in order.',
        fr: 'Il ne brise encore aucune règle, mais aucune suite ne couvre toutes les cases en passant les numéros dans l’ordre.',
        why: [],
      };
    };
    /** A path that can't be finished: cut it back to the longest start that still can (same as tapping that cell). */
    const check = (): Hint | null => {
      if (finished || path.length < 2 || solve() !== null) return null;
      let k = 0;
      while (k + 1 < path.length && pz.path[k + 1] === path[k + 1]) k++;
      // Longest start that still works (a few tries; the generated solution's start always does).
      for (let j = path.length - 2, tries = 0; j > k && tries < 6; j--, tries++) {
        const r = finishFrom(path.slice(0, j + 1), 8000);
        if (r) {
          k = j;
          break;
        }
        if (r === undefined) break;
      }
      const x = reason();
      const head = path[path.length - 1];
      const boxed = head === end || ![head - n, head + 1, head + n, head - 1].some((j) => j >= 0 && j < N && canEnter(head, j));
      return {
        kind: boxed ? 'stuck' : 'fix',
        text: L(
          `This path can’t cover every cell any more. ${x.en} Cut it back here.`,
          `Ce chemin ne peut plus couvrir toutes les cases. ${x.fr} Coupez-le ici.`,
        ),
        why: x.why.map((i) => cells[i]),
        at: [cells[path[k]]],
        action: L('Cut back', 'Couper ici'),
        play: () => {
          path.length = k + 1;
          check0();
        },
      };
    };
    const DIRS_EN = ['up', 'right', 'down', 'left'];
    const DIRS_FR = ['vers le haut', 'vers la droite', 'vers le bas', 'vers la gauche'];
    const way = (a: number, b: number) => {
      const k = b === a - n ? 0 : b === a + 1 ? 1 : b === a + n ? 2 : 3;
      return L(DIRS_EN[k], DIRS_FR[k]);
    };
    /** Same as pressing the arrow keys: extend the path one cell at a time. */
    const extend = (add: number[]) => () => {
      for (const j of add) if (canEnter(path[path.length - 1], j)) path.push(j);
      check0();
    };
    // Index into `rules` (rebuilt on every call, so the closures themselves can't be compared).
    let lastRule = -1;
    const hint = (): Hint | null => {
      if (finished) return null;
      const on = new Set(path);
      const head = path[path.length - 1];
      const next = nextMark();
      const sol = solve();
      if (sol === null) {
        // Off track: cut the path back to the last cell that agrees with the solution.
        let k = 0;
        while (k + 1 < path.length && pz.path[k + 1] === path[k + 1]) k++;
        return {
          text: L(
            'This path can’t cover every cell any more. Tap an earlier cell to cut it back there and try another way.',
            'Ce chemin ne peut plus couvrir toutes les cases. Touchez une case plus tôt pour le couper là et essayez autrement.',
          ),
          at: [cells[path[k]]],
          play: () => {
            path.length = k + 1;
            check0();
          },
        };
      }
      const opts = options(head, on, next);
      const pre = (en: string, fr: string) =>
        path.length === 1
          ? L(`The path starts on 1 and must visit every cell. ${en}`, `Le chemin part du 1 et doit passer par toutes les cases. ${fr}`)
          : L(en, fr);
      const forced = (): Hint | null => {
        if (opts.length !== 1) return null;
        // Follow the chain while each step stays the only way on.
        const add: number[] = [];
        const seen = new Set(on);
        let cur = head,
          nx = next;
        for (;;) {
          const o = options(cur, seen, nx);
          if (o.length !== 1 || add.length >= 4) break;
          add.push(o[0]);
          seen.add(o[0]);
          if (marks[o[0]]) nx++;
          cur = o[0];
        }
        return {
          text: pre(
            `Only one way on from here: walls, the edge or the path itself block every other side. Go ${way(head, add[0])}${add.length > 1 ? ' and keep going while there’s no choice' : ''}.`,
            `Une seule issue d’ici : les murs, le bord ou le chemin lui-même bloquent les autres côtés. Allez ${way(head, add[0])}${add.length > 1 ? ' et continuez tant qu’il n’y a pas de choix' : ''}.`,
          ),
          why: [cells[head]],
          at: add.map((x) => cells[x]),
          play: extend(add),
        };
      };
      const deadEnd = (): Hint | null => {
        for (const j of opts) {
          if (j === end) continue;
          const exits = freeNb(j, on).filter((x) => x !== head);
          if (exits.length > 1) continue;
          return {
            text: pre(
              `This cell has ${exits.length ? 'only one other neighbour it can connect to' : 'no other open neighbour'}. Enter it now, or it can only become a dead end later.`,
              `Cette case n’a ${exits.length ? 'qu’une seule autre voisine accessible' : 'aucune autre voisine accessible'}. Entrez-y maintenant, sinon elle deviendra un cul-de-sac.`,
            ),
            why: [cells[head], ...exits.map((x) => cells[x])],
            at: [cells[j]],
            play: extend([j]),
          };
        }
        return null;
      };
      const split = (): Hint | null => {
        if (opts.length < 2) return null;
        // Why a step fails: it cuts cells off, or leaves a cell with fewer than two ways in.
        const flaw = opts.map((x) => {
          const on2 = new Set([...on, x]);
          const cut = strandedBy(x, on2);
          if (cut.length) return { cut, dead: -1 };
          for (let y = 0; y < N; y++) {
            if (on2.has(y) || y === end) continue;
            const deg = freeNb(y, on2).length + (adjacent(x, y, n) && open(x, y) ? 1 : 0);
            if (deg < 2) return { cut, dead: y };
          }
          return null;
        });
        const good = opts.filter((_, k) => !flaw[k]);
        if (good.length !== 1) return null;
        const k = flaw.findIndex((f) => f);
        const f = flaw[k]!;
        const m = f.cut.length;
        return {
          text:
            f.dead >= 0
              ? pre(
                  `Going ${way(head, opts[k])} would leave this cell with only one way in, so the path would get stuck there. Go ${way(head, good[0])}.`,
                  `Aller ${way(head, opts[k])} laisserait cette case avec un seul accès : le chemin y resterait coincé. Allez ${way(head, good[0])}.`,
                )
              : pre(
                  `Going ${way(head, opts[k])} would cut off ${m === 1 ? 'a cell' : `${m} cells`} from the rest, and the path could never come back for ${m === 1 ? 'it' : 'them'}. Go ${way(head, good[0])}.`,
                  `Aller ${way(head, opts[k])} isolerait ${m === 1 ? 'une case' : `${m} cases`} du reste, et le chemin ne pourrait plus y revenir. Allez ${way(head, good[0])}.`,
                ),
          why: f.dead >= 0 ? [cells[f.dead]] : f.cut.map((x) => cells[x]),
          at: [cells[good[0]]],
          play: extend([good[0]]),
        };
      };
      const checkpoint = (): Hint | null => {
        const j = sol?.[path.length];
        if (j == null || marks[j] !== next || !cps[next]) return null;
        return {
          text: pre(
            `Numbers are passed in order, and ${next} is next. It sits right beside the end of the path: step onto it.`,
            `Les numéros se franchissent dans l’ordre, et le ${next} est le prochain. Il est juste à côté du bout du chemin : avancez dessus.`,
          ),
          why: [cps[next - 1] ?? cells[head]],
          at: [cells[j]],
          play: extend([j]),
        };
      };
      const rules = [forced, deadEnd, split, checkpoint];
      const order = [0, 1, 2, 3].filter((k) => k !== lastRule);
      if (lastRule >= 0) order.push(lastRule);
      for (const k of order) {
        const found = rules[k]();
        if (found) {
          lastRule = k;
          return found;
        }
      }
      lastRule = -1;
      if (!sol) {
        // The search gave up: a step that cuts nothing off, without claiming it's the only one.
        const j = opts.find((x) => !strandedBy(x, new Set([...on, x])).length) ?? opts[0];
        if (j == null) return null;
        return {
          text: pre(
            `Head ${way(head, j)}: it keeps every cell left connected to the end of the path, so the path can still reach them all.`,
            `Allez ${way(head, j)} : toutes les cases qui restent demeurent reliées au bout du chemin, qui peut encore les atteindre.`,
          ),
          why: [cells[head]],
          at: [cells[j]],
          play: extend([j]),
        };
      }
      const j = sol[path.length];
      if (j == null) return null;
      return {
        text: pre(
          `Head ${way(head, j)}. Try the other ways and you’ll find they leave cells the path can’t cover before it reaches ${next} in order.`,
          `Allez ${way(head, j)}. Les autres choix laissent des cases que le chemin ne pourrait plus couvrir en atteignant le ${next} dans l’ordre.`,
        ),
        why: cps[next] ? [cps[next]] : [cells[head]],
        at: [cells[j]],
        play: extend([j]),
      };
    };

    root.append(grid);
    render();
    return {
      snapshot: () => ({ path }),
      check,
      hint,
      onKey(e) {
        const dir = keyDir(e);
        if (dir == null || finished) return false;
        const head = path[path.length - 1];
        const r = Math.floor(head / n) + [-1, 0, 1, 0][dir],
          c = (head % n) + [0, 1, 0, -1][dir];
        if (r < 0 || r >= n || c < 0 || c >= n) return true;
        const j = r * n + c;
        ctx.touch();
        if (path.length > 1 && path[path.length - 2] === j) path.pop();
        else if (canEnter(head, j)) path.push(j);
        else shake(grid);
        check0();
        return true;
      },
    };
  },
};
