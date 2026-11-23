import { L, P } from '../../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../../core/types';
import { arrowIcon, board, h, pad, restartBtn, shake, undoBtn } from '../../ui/dom';
import { anim } from '../../kits/move/kit';
import { DIRS8, MINE, ROCK, genGems, slide, solveGems } from './gen';
import { capture, cellAt } from '../../kits/path/grid';
import './style.css';

/** Directions are DIRS8 indices: 0 ↑, 1 ↗, 2 →, 3 ↘, 4 ↓, 5 ↙, 6 ←, 7 ↖. */
const KEYS: Record<string, number> = {
  ArrowUp: 0,
  w: 0,
  W: 0,
  '8': 0,
  e: 1,
  E: 1,
  '9': 1,
  PageUp: 1,
  ArrowRight: 2,
  d: 2,
  D: 2,
  '6': 2,
  c: 3,
  C: 3,
  '3': 3,
  PageDown: 3,
  ArrowDown: 4,
  s: 4,
  S: 4,
  '2': 4,
  z: 5,
  Z: 5,
  '1': 5,
  End: 5,
  ArrowLeft: 6,
  a: 6,
  A: 6,
  '4': 6,
  q: 7,
  Q: 7,
  '7': 7,
  Home: 7,
};
/** Pad layout, row by row; -1 is the centre (move counter). */
const PAD = [7, 0, 1, 6, -1, 2, 5, 4, 3];
const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
const DIR_EN = ['up', 'up-right', 'right', 'down-right', 'down', 'down-left', 'left', 'up-left'];
const DIR_FR = [
  'vers le haut',
  'en haut à droite',
  'vers la droite',
  'en bas à droite',
  'vers le bas',
  'en bas à gauche',
  'vers la gauche',
  'en haut à gauche',
];
const LIVES = 3;

export const gems: PuzzleDef = {
  id: 'gems',
  get name() {
    return L('Gems', 'Gemmes');
  },
  category: 'moves',
  get rules() {
    return L('Slide on ice in 8 directions. Grab gems, dodge mines.', 'Glissez en 8 directions : gemmes oui, mines non.');
  },
  help: () => ({
    goal: L(
      'Collect every gem. Your token slides across the ice in any of 8 directions and only stops at a rock or the edge.',
      'Ramassez toutes les gemmes. Votre jeton glisse sur la glace dans 8 directions et ne s’arrête que contre un rocher ou le bord.',
    ),
    steps: [
      L(
        'Slide with the 3×3 pad, by swiping (diagonals too), or by tapping a cell in line with your token: same row, column or diagonal.',
        'Glissez avec le pavé 3×3, en balayant (en diagonale aussi) ou en touchant une case alignée avec votre jeton : même rangée, colonne ou diagonale.',
      ),
      L(
        'Keyboard: arrows or WASD, plus Q E Z C (or numpad 7 9 1 3) for the diagonals. U or Backspace undoes, R restarts.',
        'Clavier : flèches ou WASD, plus Q E Z C (ou 7 9 1 3 du pavé numérique) pour les diagonales. U ou Retour arrière annule, R fait repartir.',
      ),
      L(
        'Every gem you pass over is collected. A diagonal slide can’t squeeze between two rocks touching at their corners.',
        'Chaque gemme croisée est ramassée. Une glissade en diagonale ne passe pas entre deux rochers qui se touchent par le coin.',
      ),
      L(
        'From Medium on, mines lie on the ice. Slide into one and you lose a heart and go back to where that slide began. Lose all 3 hearts and the puzzle fails.',
        'Dès le niveau Moyen, des mines parsèment la glace. Si vous glissez dessus, vous perdez un cœur et revenez au début de cette glissade. Trois cœurs perdus, c’est l’échec.',
      ),
      L(
        'On Expert and Master, moves are limited (shown as 3/12). Undo takes back your last move and Restart puts you back at the start, but neither gives back a lost heart.',
        'En Expert et Maître, les coups sont limités (affichés 3/12). Annuler reprend votre dernier coup et Repartir vous ramène au départ, mais aucun des deux ne rend un cœur perdu.',
      ),
    ],
    tips: [
      L(
        'Rocks are your brakes: work out which rock stops you next to each gem.',
        'Les rochers sont vos freins : repérez celui qui vous arrête près de chaque gemme.',
      ),
      L(
        'A mine only hurts if your slide reaches it: a rock in front of it keeps you safe.',
        'Une mine ne fait mal que si votre glissade l’atteint : un rocher devant vous protège.',
      ),
      L(
        'Sometimes you must move away from a gem to line up the right slide.',
        'Parfois, il faut s’éloigner d’une gemme pour bien s’aligner.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [20, 40, 70, 100, 150]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const B = genGems(rng, d);
    const { n, cell, start, limit } = B;
    const N = n * n;
    const hasMines = cell.includes(MINE);
    const gemIdx = new Map<number, number>();
    B.gems.forEach((g, k) => gemIdx.set(g, k));
    const G = B.gems.length;

    let hist: number[] = [];
    let at = start;
    let got = new Set<number>();
    let boom = 0;
    let hit = -1;
    let finished = false;

    const grid = board(n, n, 'gems-grid');
    const cells = Array.from({ length: N }, () => {
      const el = h('div', { class: 'cell' });
      grid.append(el);
      return el;
    });
    const token = h('div', { class: 'gems-token', style: `--n:${n}` });
    grid.append(token);

    /** Replay the history from the start; drops everything from the first move that no longer applies. */
    const replay = () => {
      at = start;
      got = new Set();
      for (let k = 0; k < hist.length; k++) {
        const s = slide(n, cell, at, hist[k]);
        if (!s.length || cell[s[s.length - 1]] === MINE) {
          hist = hist.slice(0, k);
          break;
        }
        for (const x of s) if (gemIdx.has(x)) got.add(x);
        at = s[s.length - 1];
      }
    };
    const xy = (i: number) => `translate(${(i % n) * 100}%, ${Math.floor(i / n) * 100}%)`;
    const place = (dist: number) => {
      token.style.transitionDuration = `${Math.min(0.32, 0.06 + dist * 0.035)}s`;
      token.style.transform = xy(at);
    };
    const mid = h('div', { class: 'gems-mid' });
    const render = () => {
      cells.forEach((el, i) => {
        const kind = cell[i] === ROCK ? ' rock' : cell[i] === MINE ? ` mine${i === hit ? ' hit' : ''}` : '';
        el.className = `cell${kind}${gemIdx.has(i) && !got.has(i) ? ' gem' : ''}${i === start ? ' home' : ''}`;
      });
      const mv = `${hist.length}${limit ? `/${limit}` : ''}`;
      mid.textContent = mv;
      if (hasMines) ctx.lives(LIVES - boom, LIVES);
      // Dead end (some gem out of reach, or not enough moves left): Undo gets out of it, so just say so.
      const rest = finished || got.size === G ? [] : solveGems(n, cell, at, B.gems, got);
      const stuck =
        rest === null
          ? L(' · a gem is out of reach · undo', ' · une gemme est hors d’atteinte · annulez')
          : limit && hist.length + rest.length > limit
            ? L(' · too few moves left · undo', ' · trop peu de coups restants · annulez')
            : '';
      const moves = limit
        ? P(limit - hist.length, ['move left', 'moves left'], ['coup restant', 'coups restants'])
        : P(hist.length, ['move', 'moves'], ['coup', 'coups']);
      ctx.status(`${L(`${got.size} / ${G} gems`, `${got.size} / ${G} gemmes`)} · ${moves}${stuck}`);
    };

    const move = (dir: number) => {
      if (finished) return;
      const s = slide(n, cell, at, dir);
      if (!s.length) {
        shake(grid);
        return;
      }
      ctx.touch();
      const end = s[s.length - 1];
      if (cell[end] === MINE) {
        // Boom: lose a heart, bounce back to where the slide began. The move isn't counted.
        boom++;
        ctx.mistake();
        anim(token, [{ transform: xy(at) }, { transform: xy(end), offset: 0.45 }, { transform: xy(at) }], 200 + s.length * 50);
        anim(cells[end], [{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }], 260);
        shake(grid);
        if (boom >= LIVES && !ctx.zen) {
          finished = true;
          hit = end;
          render();
          ctx.failed();
          return;
        }
        render();
        return;
      }
      hist.push(dir);
      for (const x of s) if (gemIdx.has(x)) got.add(x);
      at = end;
      place(s.length);
      render();
      if (got.size === G) {
        finished = true;
        ctx.solved();
      } else if (limit && hist.length >= limit) {
        finished = true;
        ctx.failed();
      }
    };

    /** Direction from the token towards cell i if it lies on one of the 8 lines, else -1. */
    const lineTo = (i: number) => {
      const dr = Math.floor(i / n) - Math.floor(at / n),
        dc = (i % n) - (at % n);
      if (!dr && !dc) return -1;
      if (dr && dc && Math.abs(dr) !== Math.abs(dc)) return -1;
      return DIRS8.findIndex(([r, c]) => r === Math.sign(dr) && c === Math.sign(dc));
    };

    // swipe anywhere on the board (8 directions), or tap a cell in line with the token
    let sx = 0,
      sy = 0,
      down = false;
    grid.addEventListener('pointerdown', (e) => {
      down = true;
      sx = e.clientX;
      sy = e.clientY;
      capture(grid, e.pointerId);
      e.preventDefault();
    });
    grid.addEventListener('pointerup', (e) => {
      if (!down) return;
      down = false;
      const dx = e.clientX - sx,
        dy = e.clientY - sy;
      if (Math.hypot(dx, dy) >= 20) {
        const k = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
        move((((k + 2) % 8) + 8) % 8);
        return;
      }
      const i = cellAt(grid, n, n, e.clientX, e.clientY);
      if (i < 0) return;
      const dir = lineTo(i);
      if (dir >= 0) move(dir);
    });
    grid.addEventListener('pointercancel', () => (down = false));

    const keys = pad(
      PAD.filter((v) => v >= 0).map((v) => ({ label: arrowIcon(v * 45), value: String(v), aria: L(DIR_EN[v], DIR_FR[v]) })),
      (v) => move(Number(v)),
    );
    keys.classList.add('gems-pad');
    keys.insertBefore(mid, keys.children[4]);
    /** Histories wiped by Restart, so Undo can bring them back. */
    const restarts: number[][] = [];
    const undo = () => {
      if (finished) return;
      if (hist.length) hist.pop();
      else if (restarts.length) hist = restarts.pop()!;
      else return;
      replay();
      place(1);
      render();
    };
    const restart = () => {
      if (finished || !hist.length) return;
      restarts.push(hist);
      hist = [];
      replay();
      place(1);
      render();
    };
    ctx.controls(undoBtn(undo), restartBtn(restart));

    const sv = ctx.saved as { v?: unknown; hist?: unknown; boom?: unknown } | undefined;
    if (sv?.v === 2 && Array.isArray(sv.hist) && sv.hist.every((v) => Number.isInteger(v) && v >= 0 && v < 8)) {
      hist = (sv.hist as number[]).slice(0, limit ? limit - 1 : undefined);
      replay();
      if (got.size === G) {
        hist.pop();
        replay();
      }
      if (hasMines && Number.isInteger(sv.boom)) boom = Math.max(0, Math.min(LIVES - 1, sv.boom as number));
    }
    /** Shortest safe plan from the current spot and gems, kept until the position changes. */
    let memo: { key: string; p: number[] | null } | null = null;
    const plan = (): number[] | null => {
      const key = `${at}:${[...got].sort((x, y) => x - y).join(',')}`;
      if (memo?.key !== key) memo = { key, p: solveGems(n, cell, at, B.gems, got) };
      return memo.p;
    };
    /** Gems no slide from here can ever pass over (every spot the token can still reach is tried). */
    const unreachable = () => {
      const seen = new Set([at]);
      const q = [at];
      const passed = new Set<number>();
      for (let k = 0; k < q.length; k++)
        for (let dir = 0; dir < 8; dir++) {
          const s = slide(n, cell, q[k], dir);
          if (!s.length || cell[s[s.length - 1]] === MINE) continue;
          for (const x of s) passed.add(x);
          const e = s[s.length - 1];
          if (!seen.has(e)) {
            seen.add(e);
            q.push(e);
          }
        }
      return B.gems.filter((g) => !got.has(g) && !passed.has(g));
    };
    /** Dead ends: a gem out of reach, or more slides needed than moves left. `play()` undoes a move. */
    const check = (): Hint | null => {
      if (finished || got.size === G || !hist.length) return null;
      const p = plan();
      const stuck = (text: string, why: Element[]): Hint => ({
        kind: 'stuck',
        text,
        why,
        at: [token],
        action: L('Undo', 'Annuler'),
        play: undo,
      });
      if (!p) {
        const far = unreachable();
        return stuck(
          far.length
            ? L(
                `From here no slide can ever reach ${far.length === 1 ? 'the outlined gem' : `the ${far.length} outlined gems`}: rocks and mines cut ${far.length === 1 ? 'it' : 'them'} off. Undo a move.`,
                `D’ici, aucune glissade ne peut plus atteindre ${far.length === 1 ? 'la gemme encadrée' : `les ${far.length} gemmes encadrées`} : les rochers et les mines ${far.length === 1 ? 'la coupent' : 'les coupent'} de vous. Annulez un coup.`,
              )
            : L(
                'From here no order of slides picks up every gem left. Undo a move.',
                'D’ici, aucun ordre de glissades ne ramasse toutes les gemmes restantes. Annulez un coup.',
              ),
          far.map((g) => cells[g]),
        );
      }
      if (limit && hist.length + p.length > limit) {
        const left = limit - hist.length;
        const ml = P(left, ['move', 'moves'], ['coup', 'coups']);
        return stuck(
          L(
            `The ${G - got.size} gems left need at least ${p.length} more slides from here, but you only have ${ml} left. Undo a move.`,
            `Les ${G - got.size} gemmes restantes demandent encore au moins ${p.length} glissades d’ici, mais il ne vous reste que ${ml}. Annulez un coup.`,
          ),
          B.gems.filter((g) => !got.has(g)).map((g) => cells[g]),
        );
      }
      return null;
    };
    /** Why the slide stops at `end` going `dir`: a rock, two rocks corner to corner, or the edge. */
    const stopper = (end: number, dir: number): number[] => {
      const [dr, dc] = DIRS8[dir];
      const r = Math.floor(end / n) + dr,
        c = (end % n) + dc;
      if (r < 0 || r >= n || c < 0 || c >= n) return [];
      if (cell[r * n + c] === ROCK) return [r * n + c];
      return [r * n + (end % n), Math.floor(end / n) * n + c];
    };
    const hint = (): Hint | null => {
      if (finished || got.size === G) return null;
      const p = plan();
      if (!p?.length) return null;
      const dir = p[0];
      const s = slide(n, cell, at, dir);
      const end = s[s.length - 1];
      const picks = s.filter((x) => gemIdx.has(x) && !got.has(x));
      const stop = stopper(end, dir);
      const by =
        stop.length === 1 ? L('the rock', 'le rocher') : stop.length ? L('the two rocks', 'les deux rochers') : L('the edge', 'le bord');
      const arrow = `${ARROWS[dir]} (${L(DIR_EN[dir], DIR_FR[dir])})`;
      const leftAfter = G - got.size - picks.length;
      let text: string;
      if (!hist.length && !picks.length)
        text = L(
          `Your token slides until something stops it. Slide ${arrow}: ${by} stops you in a spot that lines up with the gems.`,
          `Votre jeton glisse jusqu’à ce que quelque chose l’arrête. Glissez ${arrow} : ${by} vous arrête à un endroit aligné avec les gemmes.`,
        );
      else if (!hist.length)
        text = L(
          `Your token slides until something stops it. Slide ${arrow}: you pass over ${picks.length === 1 ? 'a gem' : `${picks.length} gems`} and ${by} stops you.`,
          `Votre jeton glisse jusqu’à ce que quelque chose l’arrête. Glissez ${arrow} : vous passez sur ${picks.length === 1 ? 'une gemme' : `${picks.length} gemmes`} et ${by} vous arrête.`,
        );
      else if (!picks.length) {
        const next = p.length > 1 ? ARROWS[p[1]] : '';
        const tempt = [0, 1, 2, 3, 4, 5, 6, 7].some((d2) => {
          const t = slide(n, cell, at, d2);
          return t.length && cell[t[t.length - 1]] !== MINE && t.some((x) => gemIdx.has(x) && !got.has(x));
        });
        text = tempt
          ? L(
              `A gem is within reach, but grabbing it now leaves you badly placed. Go ${arrow} first: ${by} stops you where a ${next} slide carries on.`,
              `Une gemme est à portée, mais la prendre maintenant vous placerait mal. Allez d’abord ${arrow} : ${by} vous arrête là où une glissade ${next} prend le relais.`,
            )
          : L(
              `No gem lines up with your token yet. Go ${arrow} first: ${by} stops you where a ${next} slide reaches the next gem.`,
              `Aucune gemme n’est encore alignée avec votre jeton. Allez d’abord ${arrow} : ${by} vous arrête là où une glissade ${next} atteint la gemme suivante.`,
            );
      } else if (!leftAfter)
        text = L(
          `Last ${picks.length === 1 ? 'gem' : 'gems'}: slide ${arrow} and you pass over ${picks.length === 1 ? 'it' : 'them'}. Gems are picked up anywhere along the slide, not just where you stop.`,
          `${picks.length === 1 ? 'Dernière gemme' : 'Dernières gemmes'} : glissez ${arrow} pour passer dessus. Les gemmes se ramassent tout le long de la glissade, pas seulement à l’arrêt.`,
        );
      else if (dir % 2)
        text = L(
          `Diagonals work too: slide ${arrow} to grab ${picks.length === 1 ? 'the gem' : `${picks.length} gems`}; ${by} stops you.`,
          `Les diagonales comptent aussi : glissez ${arrow} pour prendre ${picks.length === 1 ? 'la gemme' : `${picks.length} gemmes`}; ${by} vous arrête.`,
        );
      else
        text = L(
          `This gem lines up with your token. Slide ${arrow}: you pick it up on the way and ${by} stops you.`,
          `Cette gemme est alignée avec votre jeton. Glissez ${arrow} : vous la ramassez au passage et ${by} vous arrête.`,
        );
      return {
        text,
        // The stopping rock is shown only when it can't pull the arrow backwards past a gem.
        why: [token, ...(picks.some((x) => x !== end) ? [] : stop.map((x) => cells[x]))],
        at: [
          cells[end],
          ...picks.filter((x) => x !== end).map((x) => cells[x]),
          // the matching pad key, so the guide also shows where to press
          ...[...keys.querySelectorAll('button')].filter((b) => b.getAttribute('aria-label') === L(DIR_EN[dir], DIR_FR[dir])),
        ],
        play: () => move(dir),
      };
    };

    root.append(grid, keys);
    place(0);
    render();
    return {
      snapshot: () => ({ v: 2, hist, boom }),
      check,
      hint,
      onKey(e) {
        // Z is the down-left slide here (Q E Z C diagonals), so U undoes instead.
        if (e.key === 'Backspace' || e.key === 'u' || e.key === 'U') {
          undo();
          return true;
        }
        if (e.key === 'r' || e.key === 'R') {
          restart();
          return true;
        }
        const k = KEYS[e.key];
        if (k == null) return false;
        move(k);
        return true;
      },
    };
  },
};
