import { L, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, h, restartBtn, shake, undoBtn } from '../core/ui';
import { keyboard, keyValue } from './wordkit/keyboard';
import { diff, makeLadder } from './wordkit/ladder';
import { commonOfLength, dictReady, isWord, whenDict } from './wordkit/lexicon';
import './tower.css';

export const tower: PuzzleDef = {
  id: 'tower',
  get name() {
    return L('Tower', 'Tour de mots');
  },
  category: 'words',
  get rules() {
    return L('Climb to the top word, changing one letter per floor.', 'Grimpez jusqu’au mot du sommet, une lettre par étage.');
  },
  localized: true,
  help: () => ({
    goal: L(
      'Climb from the word at the bottom to the word at the top, one floor at a time.',
      'Montez du mot du bas jusqu’au mot du haut, un étage à la fois.',
    ),
    steps: [
      L(
        'Each floor must be a real word that changes exactly one letter of the floor below, without moving the others.',
        'Chaque étage doit être un vrai mot qui change une seule lettre de l’étage du dessous, sans déplacer les autres.',
      ),
      L(
        'Type the word with the keyboard and press Enter. Changed letters are highlighted.',
        'Tapez le mot au clavier (sans accents) et appuyez sur Entrée. Les lettres changées sont mises en évidence.',
      ),
      L(
        'You win as soon as your word is one letter away from the top word.',
        'Vous gagnez dès que votre mot n’est plus qu’à une lettre du mot du sommet.',
      ),
      L(
        'Floors are limited; the footer shows floors used and par, the fewest steps possible. Undo removes your last floor or clears your typing (so does Escape); Restart takes every floor down.',
        'Les étages sont limités; le bas de la carte indique les étages utilisés et le minimum d’étapes possible. « Annuler » retire votre dernier étage ou efface la saisie (Échap aussi); « Repartir » retire tous les étages.',
      ),
    ],
    tips: [
      L(
        'Compare with the top word: change the letters that differ, one at a time.',
        'Comparez avec le mot du sommet : changez une à une les lettres qui diffèrent.',
      ),
      L(
        'Blocked? Take a detour through a letter that is in neither word.',
        'Bloqué? Faites un détour par une lettre qui n’est dans aucun des deux mots.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [45, 70, 110, 150, 220]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const len = byLevel(d, [3, 4, 4, 5, 5]);
    const want = byLevel(d, [3, 3, 5, 4, 6]);
    const slack = byLevel(d, [2, 2, 2, 1, 1]);
    const path = makeLadder(rng, len, want);
    const start = path[0];
    const goal = path[path.length - 1];
    const steps = path.length - 1;
    const floors = steps - 1 + slack; // rungs between start and goal

    const rungs: string[] = [];
    let cur = '';
    let won = false;

    const rows = floors + 2;
    const grid = board(len, rows, 'tw');
    const cells = Array.from({ length: len * rows }, () => {
      const el = h('div', { class: 'cell' });
      grid.append(el);
      return el;
    });
    const kb = keyboard((k) => press(k));
    const last = () => rungs[rungs.length - 1] ?? start;

    const status = (msg?: string) => {
      if (msg) ctx.status(msg);
      else if (!dictReady()) ctx.status(L('loading words…', 'chargement des mots…'));
      else ctx.status(L(`Floor ${rungs.length} / ${floors} · par ${steps} steps`, `Étage ${rungs.length} / ${floors} · min. ${steps}`));
    };

    const paintRow = (r: number, word: string, cls: string, below?: string) => {
      for (let c = 0; c < len; c++) {
        const el = cells[r * len + c];
        el.textContent = word[c] ?? '';
        el.className = `cell ${cls}${below && word[c] && below[c] !== word[c] ? ' tw-chg' : ''}`;
      }
    };
    const render = () => {
      paintRow(0, goal, won ? 'on' : 'tw-goal', won ? last() : undefined);
      for (let j = 0; j < floors; j++) {
        const r = floors - j; // slot j (0 = lowest floor) sits on grid row r
        const below = j === 0 ? start : rungs[j - 1];
        if (j < rungs.length) paintRow(r, rungs[j], 'on', below);
        else if (j === rungs.length && !won) paintRow(r, cur, cur ? 'tw-typed' : 'tw-cur');
        else paintRow(r, '', 'tw-empty');
      }
      paintRow(rows - 1, start, 'tw-base');
    };

    const noFloors = () => L('No floors left · undo', 'Plus d’étages · annulez');
    const win = () => {
      won = true;
      cur = '';
      render();
      ctx.solved();
    };
    const submit = () => {
      if (cur.length < len) {
        shake(grid);
        status(L('Not enough letters', 'Pas assez de lettres'));
        return;
      }
      const prev = last();
      if (cur === goal && diff(prev, goal) === 1) {
        win();
        return;
      }
      const n = diff(prev, cur);
      if (n !== 1) {
        shake(grid); // a rule the game enforces: refused, not a mistake
        status(n === 0 ? L('Change one letter', 'Changez une lettre') : L('Only one letter may change', 'Une seule lettre peut changer'));
        return;
      }
      if (cur === start || rungs.includes(cur)) {
        shake(grid);
        status(L('Already used', 'Déjà utilisé'));
        return;
      }
      const ok = isWord(cur);
      if (ok === null) {
        status(L('loading words…', 'chargement des mots…'));
        return;
      }
      if (!ok) {
        shake(grid);
        ctx.mistake();
        status(L('Not in word list', 'Mot inconnu'));
        return;
      }
      if (rungs.length >= floors) {
        shake(grid);
        status(noFloors());
        return;
      }
      rungs.push(cur);
      beforeRestart = null;
      cur = '';
      if (diff(rungs[rungs.length - 1], goal) === 1) {
        win();
        return;
      }
      render();
      status(rungs.length >= floors ? noFloors() : undefined);
    };

    const press = (k: string) => {
      if (won) return;
      ctx.touch();
      if (k === 'enter') submit();
      else if (k === 'back') {
        cur = cur.slice(0, -1);
        render();
        status();
      } else if (rungs.length < floors && cur.length < len) {
        cur += k;
        render();
      } else shake(grid);
    };
    /** The floors taken down by Restart, so Undo can put them back. */
    let beforeRestart: string[] | null = null;
    const undo = () => {
      if (won || (!rungs.length && !cur && !beforeRestart)) return;
      ctx.touch();
      if (cur) cur = '';
      else if (rungs.length) rungs.pop();
      else {
        rungs.push(...beforeRestart!);
        beforeRestart = null;
      }
      render();
      status(rungs.length >= floors ? noFloors() : undefined);
    };
    const restart = () => {
      if (won || (!rungs.length && !cur)) return;
      ctx.touch();
      if (rungs.length) beforeRestart = [...rungs];
      rungs.length = 0;
      cur = '';
      render();
      status();
    };
    ctx.controls(undoBtn(undo), restartBtn(restart));

    const sv = ctx.saved as { r?: unknown; cur?: unknown } | undefined;
    if (sv && Array.isArray(sv.r)) {
      let prev = start;
      for (const w of sv.r) {
        if (typeof w !== 'string' || w.length !== len || diff(prev, w) !== 1 || w === goal || rungs.length >= floors) break;
        if (diff(w, goal) === 1) break; // would already be solved
        rungs.push(w);
        prev = w;
      }
      if (typeof sv.cur === 'string' && /^[a-z]*$/.test(sv.cur) && rungs.length < floors) cur = sv.cur.slice(0, len);
    }

    root.append(grid, kb.el);
    render();
    status();
    whenDict(() => {
      if (!won) status();
    });
    const up = (x: string) => x.toUpperCase();
    /**
     * Shortest ladder from `w` up to the goal (goal included in `dist`) within `maxD` steps, skipping
     * words already used, through words `ok` accepts. Breadth-first, so it stops early when far.
     */
    const ladder = (w: string, maxD: number, ok: (v: string) => boolean): { next: string; dist: number } | null => {
      if (w === goal) return { next: goal, dist: 0 };
      const used = new Set([start, ...rungs]);
      const prev = new Map<string, string>([[w, '']]);
      let frontier = [w];
      for (let depth = 1; depth <= maxD && frontier.length; depth++) {
        const nx: string[] = [];
        for (const u of frontier)
          for (let i = 0; i < len; i++)
            for (let ch = 97; ch <= 122; ch++) {
              const v = u.slice(0, i) + String.fromCharCode(ch) + u.slice(i + 1);
              if (prev.has(v) || used.has(v) || (v !== goal && !ok(v))) continue;
              prev.set(v, u);
              if (v === goal) {
                let x = v;
                while (prev.get(x) !== w) x = prev.get(x)!;
                return { next: x, dist: depth };
              }
              nx.push(v);
            }
        frontier = nx;
      }
      return null;
    };
    let common: Set<string> | null = null;
    const isCommon = (v: string) => (common ??= new Set(commonOfLength(len))).has(v);
    const isAny = (v: string) => isCommon(v) || isWord(v) === true;
    /** Floors still free above the top word. */
    const floorsLeft = () => floors - rungs.length;
    /** Whether the goal is still reachable from the top word in the floors left (memoised per tower). */
    let memo: { key: string; ok: boolean } | null = null;
    const reachable = () => {
      const key = rungs.join();
      if (memo?.key !== key) memo = { key, ok: !!ladder(last(), floorsLeft() + 1, isAny) };
      return memo.ok;
    };
    const rowCellsOf = (r: number) => cells.slice(r * len, r * len + len);
    /** Dead end: the top word can't reach the goal in the floors left. Or the typing changes two letters. */
    const check = (): Hint | null => {
      if (won || !dictReady()) return null;
      const prev = last();
      if (rungs.length && !reachable()) {
        const n = floorsLeft();
        return {
          kind: 'stuck',
          text: n
            ? L(
                `From ${up(prev)}, no ladder of real words reaches ${up(goal)} in the ${P(n, ['floor', 'floors'], ['étage', 'étages'])} left. Undo this floor.`,
                `À partir de ${up(prev)}, aucune échelle de vrais mots n’atteint ${up(goal)} dans ${n > 1 ? `les ${n} étages restants` : 'le dernier étage'}. Annulez cet étage.`,
              )
            : L(
                `No floors left, and ${up(prev)} is more than one letter away from ${up(goal)}. Undo this floor.`,
                `Plus d’étages, et ${up(prev)} est à plus d’une lettre de ${up(goal)}. Annulez cet étage.`,
              ),
          why: [...rowCellsOf(0)],
          at: rowCellsOf(floors - rungs.length + 1),
          action: L('Undo', 'Annuler'),
          play: () => {
            if (cur) undo();
            undo();
          },
        };
      }
      const changed = [...cur].flatMap((ch, i) => (ch !== prev[i] ? [i] : []));
      if (changed.length > 1) {
        const k = changed[1];
        const r = floors - rungs.length;
        return {
          kind: 'fix',
          text: L(
            `Only one letter may change per floor, and this already changes the ${up(prev[changed[0]])} and the ${up(prev[k])} of ${up(prev)}. Erase back.`,
            `Une seule lettre peut changer par étage, et ceci change déjà le ${up(prev[changed[0]])} et le ${up(prev[k])} de ${up(prev)}. Effacez.`,
          ),
          why: rowCellsOf(r + 1),
          at: [cells[r * len + k]],
          action: L('Erase', 'Effacer'),
          play: () => {
            while (cur.length > k) press('back');
          },
        };
      }
      return null;
    };
    const keyEl = (k: string) =>
      [...kb.el.querySelectorAll<HTMLElement>('.key')].find(
        (b) => b.getAttribute('aria-label') === (k === 'enter' ? L('Enter', 'Entrée') : k),
      )!;
    const rowCells = rowCellsOf;
    const hint = (): Hint | null => {
      if (won) return null;
      const prev = last();
      // Straight steps: put one of the top word's letters in place, if that makes a real word.
      const straight: string[] = [];
      const nonWords: string[] = [];
      for (let i = 0; i < len; i++) {
        if (prev[i] === goal[i]) continue;
        const w = prev.slice(0, i) + goal[i] + prev.slice(i + 1);
        if (w === start || rungs.includes(w)) continue;
        const ok = isWord(w);
        if (ok === false) nonWords.push(up(w));
        // It takes a floor, so it must reach the goal in the floors left after it.
        else if (ok && (diff(w, goal) === 1 || ladder(w, floorsLeft(), isCommon))) straight.push(w);
      }
      const k = path.indexOf(prev);
      const onPath = k >= 0 && path.length - 1 - k <= floorsLeft() + 1 && !rungs.includes(path[k + 1]) ? path[k + 1] : null;
      const planned = onPath ?? (ladder(prev, floorsLeft() + 1, isCommon) ?? ladder(prev, floorsLeft() + 1, isAny))?.next ?? null;
      const target = planned && straight.includes(planned) ? planned : (straight[0] ?? planned);
      if (!target || rungs.length >= floors) return check();
      const r = floors - rungs.length; // grid row being typed
      if (cur && cur !== target)
        return {
          text: L(
            'Clear the typing first: Delete removes one letter at a time.',
            'Effacez d’abord la saisie : Effacer retire une lettre à la fois.',
          ),
          at: [keyEl('back')],
          play: () => {
            for (let n = cur.length; n > 0; n--) press('back');
          },
        };
      const p = [...target].findIndex((ch, i) => ch !== prev[i]);
      const from = up(prev[p]);
      const to = up(target[p]);
      const nth = L(['1st', '2nd', '3rd', '4th', '5th'][p], ['1re', '2e', '3e', '4e', '5e'][p]);
      if (cur === target) {
        const top = diff(target, goal) === 1;
        return {
          text: top
            ? L(
                `${up(target)} is a real word, and it is only one letter away from ${up(goal)}. Press Enter: you reach the top.`,
                `${up(target)} est un vrai mot, à une seule lettre de ${up(goal)}. Appuyez sur Entrée : vous atteignez le sommet.`,
              )
            : L(
                `${up(target)} is a real word that changes only the ${from} of ${up(prev)}. Press Enter to build the floor.`,
                `${up(target)} est un vrai mot qui ne change que le ${from} de ${up(prev)}. Appuyez sur Entrée pour bâtir l’étage.`,
              ),
          why: rowCells(r),
          at: [keyEl('enter')],
          play: () => press('enter'),
        };
      }
      const toward = goal[p] === target[p];
      return {
        text: toward
          ? L(
              `Compare ${up(prev)} with the top word ${up(goal)}: change the ${nth} letter, ${from} → ${to}, to match it. Type ${up(target)}.`,
              `Comparez ${up(prev)} au mot du sommet ${up(goal)} : changez la ${nth} lettre, ${from} → ${to}, comme en haut. Tapez ${up(target)}.`,
            )
          : L(
              `${nonWords.length ? nonWords.join(', ') + (nonWords.length > 1 ? ' are not words' : ' is not a word') : 'No letter of ' + up(goal) + ' fits yet'}, so take a detour: ${from} → ${to} gives ${up(target)}, a real word that leads up.`,
              `${nonWords.length ? nonWords.join(', ') + (nonWords.length > 1 ? ' ne sont pas des mots' : ' n’est pas un mot') : 'Aucune lettre de ' + up(goal) + ' ne convient encore'} : faites un détour, ${from} → ${to} donne ${up(target)}, un vrai mot qui mène plus haut.`,
            ),
        why: toward ? [cells[(r + 1) * len + p], cells[p]] : [cells[(r + 1) * len + p]],
        at: rowCells(r),
        play: () => {
          for (const ch of target) press(ch);
        },
      };
    };

    return {
      check,
      hint,
      snapshot: () => ({ r: rungs, cur }),
      onKey(e) {
        if (e.key === 'Escape') {
          cur = '';
          render();
          return true;
        }
        const v = keyValue(e);
        if (!v) return false;
        press(v);
        return true;
      },
    };
  },
};
