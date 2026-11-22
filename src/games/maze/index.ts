import { genMaze } from './gen';
import { L, P } from '../../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../../core/types';
import './style.css';
import { h, shake } from '../../ui/dom';

// Passage bits
const N = 1,
  E = 2,
  S = 4,
  W = 8;
const DIRS = [
  { bit: N, dr: -1, dc: 0, opp: S },
  { bit: E, dr: 0, dc: 1, opp: W },
  { bit: S, dr: 1, dc: 0, opp: N },
  { bit: W, dr: 0, dc: -1, opp: E },
];

export const maze: PuzzleDef = {
  id: 'maze',
  get name() {
    return L('Maze', 'Labyrinthe');
  },
  category: 'paths',
  get rules() {
    return L('Reach the far corner. Drag, swipe or arrow keys.', 'Atteignez le coin opposé. Glissez, balayez ou flèches.');
  },
  help: () => ({
    goal: L(
      'Lead the dot from the top-left corner to the coloured square in the bottom-right corner.',
      'Menez le point du coin en haut à gauche jusqu’au carré en couleur, en bas à droite.',
    ),
    steps: [
      L('Drag your finger along the corridors: the dot follows it.', 'Glissez le doigt dans les couloirs : le point le suit.'),
      L(
        'Or swipe in a direction: the dot runs until it reaches a junction or a wall.',
        'Ou balayez dans une direction : le point avance jusqu’au prochain embranchement ou mur.',
      ),
      L(
        'Keyboard: arrow keys or W A S D move one step; hold Shift to run.',
        'Clavier : flèches ou W A S D pour un pas; maintenez Maj pour courir.',
      ),
      L(
        'Going back over your trail erases it. Mazes grow from 6×6 to 19×19.',
        'Revenir sur vos pas efface la trace. Les labyrinthes vont de 6×6 à 19×19.',
      ),
    ],
    tips: [
      L('Dead ends are cheap: just back out the way you came.', 'Un cul-de-sac ne coûte rien : revenez simplement sur vos pas.'),
      L(
        'Glance ahead from the goal back toward the start to spot the right branch.',
        'Remontez du but vers le départ du regard pour repérer le bon embranchement.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [10, 18, 30, 45, 70]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const n = byLevel(d, [6, 9, 12, 15, 19]);
    // Branchy growing-tree maze, best of 8 by decision points along the route (see ./gen.ts).
    const open = genMaze(rng, {
      size: n,
      newest: byLevel(d, [0.8, 0.75, 0.7, 0.65, 0.6]),
      braid: byLevel(d, [0, 0, 0.06, 0.1, 0.15]),
      tries: 8,
    });

    const goal = n * n - 1;
    const path = [0];
    const canvas = h('canvas', { class: 'maze' });
    // Invisible per-cell boxes over the canvas, so the guide can point at cells.
    const marks = Array.from({ length: n * n }, () => h('span'));
    const wrap = h('div', { class: 'maze-wrap' }, canvas, h('div', { class: 'maze-marks', style: `--n:${n}` }, ...marks));

    const css = (v: string) => getComputedStyle(canvas).getPropertyValue(v).trim();
    const draw = () => {
      const size = canvas.clientWidth;
      if (!size) return;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(size * dpr)) {
        canvas.width = canvas.height = Math.round(size * dpr);
      }
      const g = canvas.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, size, size);
      const pad = 3;
      const cs = (size - pad * 2) / n;
      const X = (c: number) => pad + c * cs,
        Y = (r: number) => pad + r * cs;
      g.fillStyle = css('--cell');
      g.fillRect(0, 0, size, size);
      // goal
      g.fillStyle = css('--accent');
      g.fillRect(X(n - 1), Y(n - 1), cs, cs);
      // trail
      g.strokeStyle = css('--accent');
      g.lineWidth = Math.max(2, cs * 0.28);
      g.lineCap = g.lineJoin = 'round';
      g.globalAlpha = 0.55;
      g.beginPath();
      path.forEach((i, k) => {
        const x = X(i % n) + cs / 2,
          y = Y(Math.floor(i / n)) + cs / 2;
        if (k) g.lineTo(x, y);
        else g.moveTo(x, y);
      });
      g.stroke();
      g.globalAlpha = 1;
      // walls
      g.strokeStyle = css('--ink');
      g.lineWidth = Math.max(1.5, cs * 0.08);
      g.lineCap = 'square';
      g.beginPath();
      for (let i = 0; i < n * n; i++) {
        const r = Math.floor(i / n),
          c = i % n,
          o = open[i];
        if (!(o & N)) {
          g.moveTo(X(c), Y(r));
          g.lineTo(X(c + 1), Y(r));
        }
        if (!(o & W)) {
          g.moveTo(X(c), Y(r));
          g.lineTo(X(c), Y(r + 1));
        }
        if (r === n - 1 && !(o & S)) {
          g.moveTo(X(c), Y(r + 1));
          g.lineTo(X(c + 1), Y(r + 1));
        }
        if (c === n - 1 && !(o & E)) {
          g.moveTo(X(c + 1), Y(r));
          g.lineTo(X(c + 1), Y(r + 1));
        }
      }
      g.stroke();
      // player
      const p = path[path.length - 1];
      g.fillStyle = css('--accent');
      g.beginPath();
      g.arc(X(p % n) + cs / 2, Y(Math.floor(p / n)) + cs / 2, cs * 0.32, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = css('--ink');
      g.lineWidth = Math.max(1.5, cs * 0.08);
      g.stroke();
    };

    let finished = false;
    const step = (dir: (typeof DIRS)[number]): boolean => {
      if (finished) return false;
      const p = path[path.length - 1];
      if (!(open[p] & dir.bit)) return false;
      const r = Math.floor(p / n) + dir.dr,
        c = (p % n) + dir.dc;
      const j = r * n + c;
      ctx.touch();
      if (path.length > 1 && path[path.length - 2] === j) path.pop();
      else path.push(j);
      if (j === goal) finished = true;
      return true;
    };
    /** Keep moving in one direction until a junction or wall. */
    const run = (dir: (typeof DIRS)[number]) => {
      if (!step(dir)) return bump();
      // `finished` is set inside step().
      // oxlint-disable-next-line no-unmodified-loop-condition
      for (let guard = 0; guard < n * n && !finished; guard++) {
        const p = path[path.length - 1];
        const exits = DIRS.filter((dd) => open[p] & dd.bit);
        if (exits.length !== 2 || !(open[p] & dir.bit)) break;
        step(dir);
      }
    };
    const status = () => ctx.status(P(path.length - 1, ['step', 'steps'], ['pas', 'pas']));
    const after = () => {
      draw();
      status();
      if (finished) ctx.solved();
    };
    /** A step into a wall: refused, so the board shakes. */
    const bump = () => {
      if (!finished) shake(wrap);
    };

    // Pointer: drag along the corridor (moves to adjacent open cells under the finger), or swipe.
    let dragging = false,
      sx = 0,
      sy = 0,
      moved = false;
    const cellAt = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const cs = rect.width / n;
      return { r: Math.floor((e.clientY - rect.top) / cs), c: Math.floor((e.clientX - rect.left) / cs) };
    };
    /** Cell the drag last bumped into a wall at (shake once per cell, not on every pointer move). */
    let bumped = -1;
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      moved = false;
      bumped = -1;
      sx = e.clientX;
      sy = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const { r, c } = cellAt(e);
      // Walk toward the finger one cell at a time (handles fast drags that skip cells).
      let changed = false;
      for (let guard = 0; guard < n * 2; guard++) {
        const p = path[path.length - 1];
        const dr = r - Math.floor(p / n),
          dc = c - (p % n);
        if (!dr && !dc) break;
        const dir = Math.abs(dc) >= Math.abs(dr) ? DIRS[dc > 0 ? 1 : 3] : DIRS[dr > 0 ? 2 : 0];
        if (!step(dir)) {
          const at = r * n + c;
          if (Math.abs(dr) + Math.abs(dc) === 1 && at !== bumped) {
            bumped = at;
            bump();
          }
          break;
        }
        bumped = -1;
        changed = true;
      }
      if (changed) {
        moved = true;
        after();
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!dragging) return;
      dragging = false;
      if (moved) return;
      const dx = e.clientX - sx,
        dy = e.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      const dir = Math.abs(dx) > Math.abs(dy) ? DIRS[dx > 0 ? 1 : 3] : DIRS[dy > 0 ? 2 : 0];
      run(dir);
      after();
    });

    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', draw);
    const themeObs = new MutationObserver(draw);
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-style', 'data-oled'] });
    // v3 = loops only where they make a real detour; paths saved on older mazes don't apply.
    const sv = ctx.saved as { v?: number; path?: number[] } | undefined;
    if (sv?.v === 3 && sv.path?.length && sv.path[0] === 0 && sv.path.every((v) => v >= 0 && v < n * n))
      path.splice(0, path.length, ...sv.path);
    root.append(wrap);
    status();
    requestAnimationFrame(draw);

    // ---- guide ----
    const exitsOf = (i: number) => DIRS.filter((dd) => open[i] & dd.bit);
    const go = (i: number, dd: (typeof DIRS)[number]) => (Math.floor(i / n) + dd.dr) * n + (i % n) + dd.dc;
    const DIR_EN = ['up', 'right', 'down', 'left'];
    const DIR_FR = ['vers le haut', 'vers la droite', 'vers le bas', 'vers la gauche'];
    /** Cells reachable from `from` without passing through `block`. */
    const region = (from: number, block: number) => {
      const seen = new Set([block, from]);
      const q = [from];
      while (q.length) {
        const i = q.shift()!;
        for (const dd of exitsOf(i)) {
          const j = go(i, dd);
          if (!seen.has(j)) {
            seen.add(j);
            q.push(j);
          }
        }
      }
      seen.delete(block);
      return [...seen];
    };
    /** Shortest route from `from` to the goal. */
    const route = (from: number) => {
      const par = new Int32Array(n * n).fill(-1);
      par[from] = from;
      const q = [from];
      while (q.length) {
        const i = q.shift()!;
        if (i === goal) break;
        for (const dd of exitsOf(i)) {
          const j = go(i, dd);
          if (par[j] < 0) {
            par[j] = i;
            q.push(j);
          }
        }
      }
      const out = [goal];
      while (out[out.length - 1] !== from) out.push(par[out[out.length - 1]]);
      return out.reverse();
    };
    let lastRule = '';
    const hint = (): Hint | null => {
      if (finished) return null;
      const p = path[path.length - 1];
      const prev = path.length > 1 ? path[path.length - 2] : -1;
      const r = route(p);
      // Follow the route to the next fork (or the goal).
      const seg: number[] = [];
      for (let k = 1; k < r.length; k++) {
        seg.push(r[k]);
        if (exitsOf(r[k]).length >= 3) break;
      }
      const dirOf = (a: number, b: number) => DIRS.findIndex((dd) => go(a, dd) === b);
      const play = () => {
        let at = p;
        for (const j of seg) {
          step(DIRS[dirOf(at, j)]);
          at = j;
        }
        after();
      };
      const last = seg[seg.length - 1];
      const at = [marks[last]];
      const d0 = dirOf(p, seg[0]);
      if (seg[0] === prev)
        return {
          text: L(
            'Dead end: walk back over your trail (it erases itself) to the last fork.',
            'Cul-de-sac : revenez sur vos pas (la trace s’efface) jusqu’au dernier embranchement.',
          ),
          why: [marks[p]],
          at,
          play,
        };
      const others = exitsOf(p)
        .map((dd) => go(p, dd))
        .filter((j) => j !== prev && j !== seg[0]);
      if (!others.length) {
        const toGoal = last === goal;
        return {
          text: toGoal
            ? L('Last stretch: no more forks between you and the goal.', 'Dernier bout : plus aucun embranchement d’ici au but.')
            : path.length === 1
              ? L(
                  'No choice yet: follow the only corridor to the first fork. A swipe makes the dot run on its own.',
                  'Pas encore de choix : suivez le seul couloir jusqu’au premier embranchement. Un balayage fait courir le point.',
                )
              : L(
                  'Only one way on here: follow the corridor to the next fork.',
                  'Un seul chemin ici : suivez le couloir jusqu’au prochain embranchement.',
                ),
          why: [marks[p]],
          at,
          play,
        };
      }
      // A fork: the other branches lead nowhere.
      const dead = others.map((j) => region(j, p)).sort((a, b) => a.length - b.length);
      const wrong = others.map((j) => dirOf(p, j));
      const small = dead[dead.length - 1].length <= 4;
      lastRule = small && lastRule !== 'dead' ? 'dead' : 'trace';
      if (lastRule === 'dead') {
        const cells = dead.flat();
        return {
          text:
            others.length === 1
              ? L(
                  `The branch going ${DIR_EN[wrong[0]]} stops after ${cells.length} cell${cells.length > 1 ? 's' : ''}: a dead end. Go ${DIR_EN[d0]}.`,
                  `La branche ${DIR_FR[wrong[0]]} s’arrête après ${cells.length} case${cells.length > 1 ? 's' : ''} : un cul-de-sac. Allez ${DIR_FR[d0]}.`,
                )
              : L(
                  `Every other branch here is a short dead end, so go ${DIR_EN[d0]}.`,
                  `Les autres branches sont de courts culs-de-sac : allez ${DIR_FR[d0]}.`,
                ),
          why: cells.map((i) => marks[i]),
          at,
          play,
        };
      }
      return {
        text: L(
          `Trace back from the goal: its route reaches this fork by the branch going ${DIR_EN[d0]}. The other way only leads to dead ends.`,
          `Remontez depuis le but : son chemin arrive à cet embranchement par la branche ${DIR_FR[d0]}. L’autre ne mène qu’à des culs-de-sac.`,
        ),
        why: [marks[goal]],
        at,
        play,
      };
    };

    return {
      hint,
      snapshot: () => ({ v: 3, path }),
      onKey(e) {
        const map: Record<string, number> = { ArrowUp: 0, w: 0, ArrowRight: 1, d: 1, ArrowDown: 2, s: 2, ArrowLeft: 3, a: 3 };
        const k = map[e.key];
        if (k == null) return false;
        if (e.shiftKey) run(DIRS[k]);
        else if (!step(DIRS[k])) bump();
        after();
        return true;
      },
      destroy() {
        ro.disconnect();
        themeObs.disconnect();
        mq.removeEventListener('change', draw);
      },
    };
  },
};
