import { L, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, h, s } from '../core/ui';
import { genLightUp, nb4, sightLines } from './gridkit/lightup';
import { tapOrHold } from './gridkit/press';
import './light-up.css';

const bulbSvg = () =>
  s(
    'svg',
    { viewBox: '0 0 100 100', class: 'lu-bulb', 'aria-hidden': 'true' },
    s('path', { d: 'M50 4v8M14 18l6 6M86 18l-6 6M4 46h8M96 46h-8', class: 'rays' }),
    s('circle', { cx: 50, cy: 46, r: 23, class: 'glass' }),
    s('rect', { x: 39, y: 70, width: 22, height: 16, rx: 4, class: 'base' }),
  );

export const lightUp: PuzzleDef = {
  id: 'light-up',
  get name() {
    return L('Light Up', 'Ampoules');
  },
  category: 'logic',
  undo: true,
  get rules() {
    return L('Light every cell. Bulbs never see each other.', 'Éclairez tout. Les ampoules ne se voient jamais.');
  },
  help: () => ({
    goal: L(
      'Place bulbs in the white cells so that every white cell is lit.',
      'Placez des ampoules dans les cases blanches pour que toutes les cases blanches soient éclairées.',
    ),
    steps: [
      L(
        'A bulb lights its own cell and shines along its row and column until a wall (solid cell) stops it.',
        'Une ampoule éclaire sa case et brille le long de sa rangée et de sa colonne jusqu’à un mur (case pleine).',
      ),
      L('Two bulbs may never shine on each other.', 'Deux ampoules ne doivent jamais s’éclairer l’une l’autre.'),
      L(
        'A number on a wall says how many bulbs touch it on its sides (not diagonally).',
        'Un nombre sur un mur indique combien d’ampoules le touchent par un côté (pas en diagonale).',
      ),
      L(
        'Tap a cell for a bulb, again for a dot (surely no bulb), and once more to clear it. Long-press (or right-click) to place a dot directly.',
        'Touchez une case pour une ampoule, encore pour un point (aucune ampoule), et une autre fois pour l’effacer. Appuyez longuement (ou cliquez droit) pour mettre un point directement.',
      ),
      L(
        'Bulbs that see each other turn red. A number fades when it has exactly enough bulbs (a 0 once its sides are dotted).',
        'Les ampoules qui se voient deviennent rouges. Un nombre pâlit quand il a juste assez d’ampoules (un 0, quand ses côtés ont un point).',
      ),
    ],
    tips: [
      L(
        'A 0 means no bulb beside it: dot its neighbours. A 4 means bulbs on all four sides.',
        'Un 0 veut dire aucune ampoule autour : mettez des points à côté. Un 4, des ampoules sur les quatre côtés.',
      ),
      L(
        'A dark cell that only one empty cell can reach must get its bulb from there.',
        'Une case sombre qu’une seule case vide peut atteindre doit recevoir son ampoule de celle-là.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [40, 70, 120, 180, 280]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const n = byLevel(d, [6, 7, 8, 9, 10]);
    const p = genLightUp(n, 0.2, byLevel(d, [0.75, 0.55, 0.35, 0.15, 0]), rng);
    const { black, num } = p;
    const sight = sightLines(n, black);

    // 0 empty, 1 bulb, 2 dot
    const st = new Array<number>(n * n).fill(0);
    const grid = board(n, n, 'lu-grid');
    const cells = st.map((_, i) => {
      const el = black[i]
        ? h('div', { class: 'cell blk', 'data-n': num[i] }, num[i] >= 0 ? num[i] : '')
        : h('button', { type: 'button', class: 'cell', 'data-i': i, 'aria-label': L('Cell', 'Case') }, bulbSvg());
      grid.append(el);
      return el;
    });

    const render = () => {
      let dark = 0,
        ok = true,
        bulbs = 0;
      cells.forEach((el, i) => {
        if (black[i]) {
          if (num[i] < 0) return;
          const k = nb4(i, n).filter((j) => st[j] === 1).length;
          // A 0 only fades once every free side is dotted, so it stays visible as a hint.
          const settled = num[i] > 0 || nb4(i, n).every((j) => black[j] || st[j] === 2);
          el.classList.toggle('done', k === num[i] && settled);
          el.classList.toggle('err', k > num[i]);
          ok &&= k === num[i];
          return;
        }
        const bulb = st[i] === 1;
        const lit = sight[i].some((j) => st[j] === 1);
        const clash = bulb && sight[i].some((j) => j !== i && st[j] === 1);
        if (bulb) bulbs++;
        if (!lit) dark++;
        if (clash) ok = false;
        el.classList.toggle('glow', lit);
        el.classList.toggle('bulb', bulb);
        el.classList.toggle('mark', st[i] === 2);
        el.classList.toggle('err', clash);
      });
      ctx.status(
        dark
          ? L(
              `${P(bulbs, ['bulb', 'bulbs'], ['ampoule', 'ampoules'])} · ${dark} dark`,
              `${P(bulbs, ['bulb', 'bulbs'], ['ampoule', 'ampoules'])} · ${dark} dans le noir`,
            )
          : P(bulbs, ['bulb', 'bulbs'], ['ampoule', 'ampoules']),
      );
      return ok && !dark;
    };

    let done = false;
    const set = (i: number, v: number) => {
      if (done || black[i]) return;
      ctx.touch();
      st[i] = v;
      if (render()) {
        done = true;
        ctx.solved();
      }
    };
    const cleanup = tapOrHold(
      grid,
      (i) => set(i, (st[i] + 1) % 3),
      (i) => set(i, st[i] === 2 ? 0 : 2),
    );

    const sv = ctx.saved as { st?: unknown } | undefined;
    if (Array.isArray(sv?.st) && sv.st.length === st.length) sv.st.forEach((v, i) => (st[i] = !black[i] && (v === 1 || v === 2) ? v : 0));
    root.append(grid);
    render();
    // Guide: numbered walls first, then dark cells with a single possible source.
    let lastKind = '';
    let taught = false;
    const hint = (): Hint | null => {
      if (done) return null;
      const lit = (i: number) => sight[i].some((j) => st[j] === 1);
      const free = (j: number) => !black[j] && st[j] === 0 && !lit(j);
      const cands: { kind: string; hint: Hint }[] = [];
      const fill = (ix: number[], v: number) => () => ix.forEach((j) => st[j] !== v && set(j, v));
      cells.forEach((el, c) => {
        if (!black[c] || num[c] < 0) return;
        const nb = nb4(c, n);
        const bulbs = nb.filter((j) => st[j] === 1).length;
        const open = nb.filter(free);
        if (!open.length) return;
        const k = num[c];
        const at = open.map((j) => cells[j]);
        if (bulbs === k)
          cands.push({
            kind: k ? 'sat' : 'zero',
            hint: {
              text: k
                ? L(
                    `This ${k} already has ${k === 1 ? 'its bulb' : `its ${k} bulbs`}, so no other side can take one: dot ${open.length === 1 ? 'it' : 'them'}.`,
                    `Ce ${k} a déjà ${k === 1 ? 'son ampoule' : `ses ${k} ampoules`} : aucun autre côté ne peut en recevoir, mettez-y un point.`,
                  )
                : L(
                    'A 0 means no bulb touches it. Tap twice to dot its free sides as surely empty.',
                    'Un 0 veut dire qu’aucune ampoule ne le touche. Touchez deux fois pour marquer ses côtés libres d’un point.',
                  ),
              why: [el],
              at,
              play: fill(open, 2),
            },
          });
        else if (bulbs + open.length === k)
          cands.push({
            kind: 'need',
            hint: {
              text: L(
                `This ${k} needs ${k - bulbs === 1 ? 'one more bulb' : `${k - bulbs} more bulbs`} and has exactly ${open.length === 1 ? 'one free side' : `${open.length} free sides`}: put a bulb on ${open.length === 1 ? 'it' : 'each'}.`,
                `Ce ${k} demande encore ${k - bulbs === 1 ? 'une ampoule' : `${k - bulbs} ampoules`} et n’a que ${open.length === 1 ? 'un côté libre' : `${open.length} côtés libres`} : ${open.length === 1 ? 'mettez-y une ampoule' : 'une ampoule sur chacun'}.`,
              ),
              why: [el],
              at,
              play: fill(open, 1),
            },
          });
      });
      for (let i = 0; i < n * n && cands.length < 6; i++) {
        if (black[i] || lit(i)) continue;
        const src = sight[i].filter(free);
        if (src.length !== 1) continue;
        const j = src[0];
        cands.push({
          kind: j === i ? 'self' : 'only',
          hint: {
            text:
              j === i
                ? L(
                    'Every cell that sees this dark cell is dotted or already lit, so it must hold its own bulb.',
                    'Toutes les cases qui voient cette case sombre ont un point ou sont déjà éclairées : elle doit avoir sa propre ampoule.',
                  )
                : L(
                    'This dark cell can only be lit from one place: every other cell in its row and column is dotted or lit.',
                    'Cette case sombre ne peut être éclairée que d’un seul endroit : les autres cases de sa rangée et de sa colonne ont un point ou sont éclairées.',
                  ),
            why: j === i ? sight[i].filter((x) => x !== i).map((x) => cells[x]) : [cells[i]],
            at: [cells[j]],
            play: fill([j], 1),
          },
        });
      }
      const order = ['zero', 'need', 'sat', 'only', 'self'];
      cands.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
      const pick = cands.find((c) => c.kind !== lastKind) ?? cands[0];
      if (pick) {
        lastKind = pick.kind;
        if (taught || pick.kind === 'zero' || pick.kind === 'sat') return pick.hint;
        taught = true;
        return { ...pick.hint, text: pick.hint.text + L(' Tap a cell once for a bulb.', ' Touchez une case une fois pour une ampoule.') };
      }
      lastKind = '';
      const j = p.sol.findIndex((v, i) => v && st[i] !== 1);
      if (j < 0) return null;
      return {
        text: L(
          'No single clue decides here. Try the options: only a bulb in this cell lights the area without two bulbs seeing each other.',
          'Aucun indice ne décide seul ici. Essayez les options : seule une ampoule dans cette case éclaire le coin sans que deux ampoules se voient.',
        ),
        at: [cells[j]],
        play: fill([j], 1),
      };
    };
    /** A mark that breaks a visible rule, else one off the unique solution. */
    const check = (): Hint | null => {
      if (done) return null;
      const sol = p.sol;
      const wrongAt = (j: number) => !black[j] && ((st[j] === 1 && !sol[j]) || (st[j] === 2 && sol[j]));
      const lit = (i: number) => sight[i].some((j) => st[j] === 1);
      const fix = (i: number, text: string, why: number[] = []): Hint => ({
        kind: 'fix',
        text,
        why: why.map((j) => cells[j]),
        at: [cells[i]],
        action: st[i] === 1 ? L('Remove the bulb', 'Retirer l’ampoule') : L('Clear the dot', 'Effacer le point'),
        play: () => st[i] && set(i, 0),
      });
      // Two bulbs shining on each other.
      for (let i = 0; i < n * n; i++) {
        if (black[i] || st[i] !== 1) continue;
        const j = sight[i].find((k) => k !== i && st[k] === 1);
        if (j === undefined) continue;
        const bad = wrongAt(i) ? i : wrongAt(j) ? j : -1;
        if (bad >= 0)
          return fix(
            bad,
            L(
              'These two bulbs shine on each other, which is never allowed. This one has to go.',
              'Ces deux ampoules s’éclairent l’une l’autre, ce qui est interdit. Celle-ci doit partir.',
            ),
            [i, j],
          );
      }
      // A number with too many bulbs, or that can no longer get enough.
      for (let c = 0; c < n * n; c++) {
        if (!black[c] || num[c] < 0) continue;
        const nb = nb4(c, n).filter((j) => !black[j]);
        const k = num[c];
        const bulbs = nb.filter((j) => st[j] === 1);
        if (bulbs.length > k) {
          const i = bulbs.find(wrongAt);
          if (i !== undefined)
            return fix(
              i,
              L(
                `This ${k} touches ${bulbs.length} bulbs, more than ${k}. This bulb is one too many.`,
                `Ce ${k} touche ${bulbs.length} ampoules, plus que ${k}. Cette ampoule est de trop.`,
              ),
              [c],
            );
        }
        const room = nb.filter((j) => st[j] === 1 || (st[j] === 0 && !lit(j))).length;
        if (room < k) {
          // A dot on a side that needs a bulb, or a bulb lighting that side from afar.
          const side = nb.find((j) => sol[j] && st[j] !== 1)!;
          const i = st[side] === 2 ? side : sight[side].find((j) => st[j] === 1 && wrongAt(j));
          if (i !== undefined)
            return fix(
              i,
              st[i] === 2
                ? L(
                    `This ${k} can no longer get ${k} bulbs: too few of its sides are free. This dot is the mistake.`,
                    `Ce ${k} ne peut plus recevoir ${k} ampoules : trop peu de ses côtés sont libres. Ce point est l’erreur.`,
                  )
                : L(
                    `This ${k} can no longer get ${k} bulbs: this bulb lights one of its sides, which needs a bulb itself.`,
                    `Ce ${k} ne peut plus recevoir ${k} ampoules : cette ampoule éclaire un de ses côtés, qui doit en avoir une.`,
                  ),
              [c],
            );
        }
      }
      // A dark cell that nothing can light any more.
      for (let i = 0; i < n * n; i++) {
        if (black[i] || lit(i) || sight[i].some((j) => st[j] === 0 && !lit(j))) continue;
        const src = sight[i].find((j) => sol[j])!;
        const j = st[src] === 2 ? src : sight[src].find((k) => st[k] === 1 && wrongAt(k));
        if (j !== undefined)
          return fix(
            j,
            L(
              'The outlined cell can no longer be lit: every cell that sees it is dotted or lit by another bulb. This mark is the mistake.',
              'La case encadrée ne peut plus être éclairée : toutes les cases qui la voient ont un point ou sont éclairées par une autre ampoule. Cette marque est l’erreur.',
            ),
            [i],
          );
      }
      if (!p.unique) return null;
      const i = st.findIndex((_, j) => wrongAt(j));
      if (i < 0) return null;
      return fix(
        i,
        st[i] === 1
          ? L(
              'This bulb breaks no rule yet, but it leads to a dead end: no bulb goes here. Remove it.',
              'Cette ampoule ne brise encore aucune règle, mais elle mène à une impasse : aucune ampoule ne va ici. Retirez-la.',
            )
          : L(
              'This dot breaks no rule yet, but it leads to a dead end: this cell needs a bulb. Clear it.',
              'Ce point ne brise encore aucune règle, mais il mène à une impasse : cette case doit avoir une ampoule. Effacez-le.',
            ),
      );
    };
    return { snapshot: () => ({ st }), destroy: cleanup, hint, check };
  },
};
