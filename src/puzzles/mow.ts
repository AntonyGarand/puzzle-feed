import { L, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, btn, h, shake } from '../core/ui';
import { nb4, nb8 } from './logickit/kit';
import { explain, explainCount } from './sweepkit/explain';
import { cellOf, gridPress } from './sweepkit/press';
import { genField, pair, single, type Con, type Deduction } from './sweepkit/solve';
import './sweepkit/kit.css';
import './mow.css';

const KEYS: Record<string, number> = { ArrowUp: 0, w: 0, ArrowRight: 1, d: 1, ArrowDown: 2, s: 2, ArrowLeft: 3, a: 3 };

export const mow: PuzzleDef = {
  id: 'mow',
  offByDefault: true,
  get name() {
    return L('Minefield Mower', 'Tondeuse minée');
  },
  category: 'logic',
  get rules() {
    return L('Mow every safe tile. Numbers count mines around.', 'Tondez chaque case sûre. Un chiffre = mines autour.');
  },
  help: () => ({
    goal: L(
      'Drive the mower over every tile that doesn’t hide a mine. Each tile you mow shows how many mines touch it.',
      'Passez la tondeuse sur toutes les cases qui ne cachent pas de mine. Chaque case tondue indique combien de mines la touchent.',
    ),
    steps: [
      L(
        'The mower starts in a safe corner and moves one tile at a time, up, down, left or right. It can only enter new grass next to mown grass.',
        'La tondeuse part d’un coin sûr et avance d’une case à la fois, en haut, en bas, à gauche ou à droite. Elle n’entre dans l’herbe que près d’une case tondue.',
      ),
      L(
        'A number counts the mines in the 8 tiles around it. Driving onto a mine costs a life; with none left, the game is over.',
        'Un chiffre compte les mines dans les 8 cases autour. Rouler sur une mine coûte une vie; sans vie, la partie est finie.',
      ),
      L(
        'Tap grass next to the lawn to mow it: the mower drives there over mown tiles. Swipe or use the arrow keys to move one step.',
        'Touchez de l’herbe près de la pelouse pour la tondre : la tondeuse s’y rend par les cases tondues. Balayez ou utilisez les flèches pour un pas.',
      ),
      L(
        'Long-press (or right-click) grass to flag a mine, or turn on Flag mode so taps plant flags. The mower never drives onto a flag.',
        'Appuyez longuement (ou clic droit) sur l’herbe pour marquer une mine, ou activez le mode Drapeau. La tondeuse ne roule jamais sur un drapeau.',
      ),
    ],
    tips: [
      L(
        'A 0 means all 8 tiles around it are safe: mow them first.',
        'Un 0 veut dire que les 8 cases autour sont sûres : tondez-les d’abord.',
      ),
      L(
        'Flag what you’re sure of; the lawn always grows by logic alone, no guessing needed.',
        'Marquez ce dont vous êtes sûr : la pelouse avance toujours par logique, sans deviner.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [40, 70, 110, 150, 200]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const cols = byLevel(d, [6, 7, 8, 8, 9]);
    const rows = byLevel(d, [6, 7, 8, 9, 10]);
    const maxLives = byLevel(d, [3, 2, 2, 1, 1]);
    const N = cols * rows;
    const nbs = Array.from({ length: N }, (_, i) => nb8(i, cols, rows));
    const orth = Array.from({ length: N }, (_, i) => nb4(i, cols, rows));
    const start = rng.pick([0, cols - 1, N - cols, N - 1]);
    const lawnNext = (i: number, mown: boolean[]) => i === start || orth[i].some((j) => mown[j]);
    const { mine, count } = genField(nbs, byLevel(d, [6, 9, 13, 16, 20]), start, new Set([start, ...nbs[start]]), rng, lawnNext);
    const total = mine.filter(Boolean).length;

    const mown = new Array<boolean>(N).fill(false);
    const flag = new Array<boolean>(N).fill(false);
    const boom = new Array<boolean>(N).fill(false);
    mown[start] = true;
    let pos = start;
    let lives = maxLives;
    let flagMode = false;
    let over: 'won' | 'lost' | null = null;

    const grid = board(cols, rows, 'sw-board mw-board');
    const cells = Array.from({ length: N }, (_, i) => {
      const el = h('button', { type: 'button', class: 'cell', 'data-i': i, onclick: () => tap(i) });
      grid.append(el);
      return el;
    });
    const modeBtn = btn(L('Flag mode', 'Mode drapeau'), () => setMode(!flagMode), 'ghost');

    const render = () => {
      cells.forEach((el, i) => {
        const band = Math.floor(i / cols) % 2 ? ' band' : '';
        let cls = `cell${band}`;
        let txt = '';
        if (mown[i]) {
          cls += ` open m${count[i]}`;
          if (count[i]) txt = String(count[i]);
          if (i === pos && over !== 'won') cls += ' me';
        } else if (boom[i]) cls += ' mine err';
        else if (over === 'lost' && mine[i]) cls += ' mine';
        else if (flag[i]) cls += over === 'lost' && !mine[i] ? ' x' : ' flag';
        else cls += ' grass';
        el.className = cls;
        if (el.textContent !== txt) el.textContent = txt;
      });
      modeBtn.className = `btn ${flagMode ? 'primary' : 'ghost'}`;
      modeBtn.setAttribute('aria-pressed', String(flagMode));
      const known = flag.filter(Boolean).length + boom.filter(Boolean).length;
      ctx.status(
        `${'♥'.repeat(Math.max(0, lives))} · ${P(total - known, ['mine left', 'mines left'], ['mine restante', 'mines restantes'])}`,
      );
    };

    const setMode = (on: boolean) => {
      flagMode = on;
      render();
    };

    const toggleFlag = (i: number) => {
      if (over || mown[i] || boom[i]) return;
      ctx.touch();
      flag[i] = !flag[i];
      render();
    };

    /** Drive from the lawn onto tile `i` (an orthogonal neighbour of mown `from`). */
    const enter = (from: number, i: number) => {
      pos = from;
      if (mine[i]) {
        boom[i] = true;
        flag[i] = false;
        lives--;
        ctx.mistake();
        shake(grid);
        if (lives <= 0) {
          over = 'lost';
          render();
          ctx.failed();
          return;
        }
        render();
        return;
      }
      mown[i] = true;
      flag[i] = false;
      pos = i;
      if (mown.filter(Boolean).length === N - total) {
        over = 'won';
        mine.forEach((m, k) => (flag[k] = m));
        render();
        ctx.solved();
        return;
      }
      render();
    };

    /** A tap on tile `i`: drive over the lawn, mow a neighbouring tile, or (flag mode) flag it. */
    const go = (i: number) => {
      if (over) return;
      ctx.touch();
      if (flagMode && !mown[i]) return toggleFlag(i);
      if (i === pos) return;
      if (mown[i]) {
        pos = i;
        render();
        return;
      }
      const from = orth[i].includes(pos) ? pos : orth[i].find((j) => mown[j]);
      if (flag[i] || boom[i] || from == null) return shake(grid);
      enter(from, i);
    };

    /** One step in a direction (0 up, 1 right, 2 down, 3 left). */
    const move = (dir: number) => {
      if (over) return;
      const r = Math.floor(pos / cols) + [-1, 0, 1, 0][dir],
        c = (pos % cols) + [0, 1, 0, -1][dir];
      if (r < 0 || c < 0 || r >= rows || c >= cols) return shake(grid);
      const i = r * cols + c;
      ctx.touch();
      if (mown[i]) {
        pos = i;
        render();
      } else if (flag[i] || boom[i]) shake(grid);
      else enter(pos, i);
    };

    const press = gridPress(grid, cells, { canFlag: (i) => !over && !mown[i] && !boom[i], flag: toggleFlag, swipe: move });
    const tap = (i: number) => {
      if (press.swallow()) return;
      go(i);
    };

    const sv = ctx.saved as { pos?: unknown; mown?: unknown; flag?: unknown; boom?: unknown; mode?: unknown } | undefined;
    if (sv && typeof sv === 'object') {
      const idx = (v: unknown) => (Array.isArray(v) ? v.filter((k): k is number => Number.isInteger(k) && k >= 0 && k < N) : []);
      for (const k of idx(sv.mown)) if (!mine[k]) mown[k] = true;
      for (const k of idx(sv.boom)) if (mine[k]) boom[k] = true;
      for (const k of idx(sv.flag)) if (!mown[k] && !boom[k]) flag[k] = true;
      lives = Math.max(1, maxLives - boom.filter(Boolean).length);
      if (typeof sv.pos === 'number' && mown[sv.pos]) pos = sv.pos;
      flagMode = sv.mode === true;
    }
    root.append(grid);
    ctx.controls(modeBtn);
    render();

    let lastRule = -1;
    const hint = (): Hint | null => {
      if (over) return null;
      const els = (ix: number[]) => ix.map((j) => cells[j]);
      const reach = (j: number) => !mown[j] && orth[j].some((k) => mown[k]);
      const known = (j: number) => flag[j] || boom[j];
      const act: [string, string] = ['mow', 'Tondez'];
      const mowAll = (ix: number[]) => () => {
        if (flagMode) setMode(false);
        for (let again = true; again;) {
          again = false;
          for (const j of ix)
            if (!over && reach(j) && !flag[j]) {
              go(j);
              again = true;
            }
        }
      };
      const flagAll = (ix: number[]) => () => ix.forEach((j) => !flag[j] && toggleFlag(j));
      // Safe tiles out of the mower's reach are remembered (vsafe) while looking for a move it can make.
      const vsafe = new Set<number>();
      for (let guard = 0; guard < N; guard++) {
        const cons: Con[] = [];
        for (let i = 0; i < N; i++) {
          if (!mown[i]) continue;
          const cs = nbs[i].filter((j) => !mown[j] && !known(j) && !vsafe.has(j));
          if (cs.length) cons.push({ at: i, cells: cs, m: count[i] - nbs[i].filter(known).length });
        }
        const ok = (dd: Deduction) => dd.mine || dd.cells.some(reach);
        const rules = [() => single(cons, true, ok), () => single(cons, false, ok), () => pair(cons, ok)];
        let found: Deduction | null = null;
        for (const k of [0, 1, 2].filter((r) => r !== lastRule).concat(lastRule < 0 ? [] : [lastRule])) {
          found = rules[k]();
          if (found) {
            lastRule = k;
            break;
          }
        }
        if (found) {
          const dd = found;
          return {
            text: explain(
              dd,
              (i) => [String(count[i]), String(count[i])],
              (i) => nbs[i].filter(known).length,
              act,
            ),
            why: els([dd.a.at, ...(dd.b ? [dd.b.at] : []), ...(dd.shared ?? [])]),
            at: els(dd.cells),
            play: dd.mine ? flagAll(dd.cells) : mowAll(dd.cells),
          };
        }
        const far = single(cons, false) ?? pair(cons, (dd) => !dd.mine);
        if (!far) break;
        far.cells.forEach((j) => vsafe.add(j));
      }
      const unknown = [...Array(N).keys()].filter((i) => !mown[i] && !known(i));
      const left = total - flag.filter(Boolean).length - boom.filter(Boolean).length;
      if (unknown.length && (left === 0 || left === unknown.length))
        return {
          text: explainCount(left === 0, unknown.length, act),
          at: els(unknown),
          play: left === 0 ? mowAll(unknown) : flagAll(unknown),
        };
      return null;
    };

    const list = (a: boolean[]) => a.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    return {
      snapshot: () => ({ pos, mown: list(mown), flag: list(flag), boom: list(boom), mode: flagMode }),
      hint,
      onKey(e) {
        const dir = KEYS[e.key];
        if (dir != null) {
          move(dir);
          return true;
        }
        if (e.key !== 'f' && e.key !== 'F') return false;
        const i = cellOf(grid, document.activeElement);
        if (i >= 0) toggleFlag(i);
        return i >= 0;
      },
      destroy: press.cancel,
    };
  },
};
