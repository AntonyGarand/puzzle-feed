import { L, P } from '../../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../../core/types';
import { board, clearBtn, h, ruleBreaks } from '../../ui/dom';
import './style.css';

const runs = (line: boolean[]) => {
  const out: number[] = [];
  let k = 0;
  for (const v of line) {
    if (v) k++;
    else if (k) {
      out.push(k);
      k = 0;
    }
  }
  if (k) out.push(k);
  return out;
};
const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Every way to place `clue`'s blocks in a line that agrees with `st` (1 filled, 2 ✕, 0 unknown),
 * folded into "always filled" / "always empty" per cell. Null when nothing fits.
 */
function lineSolve(clue: number[], st: number[]): { fill: boolean[]; empty: boolean[]; ways: number } | null {
  const n = st.length;
  const fill = new Array<boolean>(n).fill(true);
  const empty = new Array<boolean>(n).fill(true);
  const cur = new Array<boolean>(n).fill(false);
  let ways = 0;
  const rec = (b: number, from: number) => {
    if (b === clue.length) {
      for (let i = from; i < n; i++) if (st[i] === 1) return;
      ways++;
      for (let i = 0; i < n; i++) {
        if (!cur[i]) fill[i] = false;
        else empty[i] = false;
      }
      return;
    }
    const len = clue[b];
    for (let s = from; s + len <= n; s++) {
      if (s > from && st[s - 1] === 1) break;
      let ok = true;
      for (let i = s; i < s + len && ok; i++) ok = st[i] !== 2;
      if (!ok || st[s + len] === 1) continue;
      for (let i = s; i < s + len; i++) cur[i] = true;
      rec(b + 1, s + len + 1);
      for (let i = s; i < s + len; i++) cur[i] = false;
    }
  };
  rec(0, 0);
  return ways ? { fill, empty, ways } : null;
}

/**
 * A full picture that fits every clue and agrees with `st` (1 filled, 2 ✕, 0 unknown), by line
 * deductions plus guesses (trying `prefer` first). `capped`: ran out of budget, so null means "don't know".
 */
function solveGrid(n: number, rowClues: number[][], colClues: number[][], st: number[], prefer: boolean[], budget: number) {
  let nodes = 0;
  let capped = false;
  const rec = (g: number[]): boolean[] | null => {
    if (++nodes > budget) {
      capped = true;
      return null;
    }
    for (let changed = true; changed;) {
      changed = false;
      for (const isRow of [true, false])
        for (let k = 0; k < n; k++) {
          const ix = Array.from({ length: n }, (_, j) => (isRow ? k * n + j : j * n + k));
          const line = ix.map((i) => g[i]);
          if (!line.includes(0)) {
            if (!same(runs(line.map((v) => v === 1)), (isRow ? rowClues : colClues)[k])) return null;
            continue;
          }
          const res = lineSolve((isRow ? rowClues : colClues)[k], line);
          if (!res) return null;
          ix.forEach((i, j) => {
            if (g[i]) return;
            if (res.fill[j]) g[i] = 1;
            else if (res.empty[j]) g[i] = 2;
            else return;
            changed = true;
          });
        }
    }
    const i = g.indexOf(0);
    if (i < 0) return g.map((v) => v === 1);
    for (const v of prefer[i] ? [1, 2] : [2, 1]) {
      const h2 = g.slice();
      h2[i] = v;
      const got = rec(h2);
      if (got || capped) return got;
    }
    return null;
  };
  const pic = rec(st.slice());
  return { pic, capped: !pic && capped };
}

export const nonogram: PuzzleDef = {
  id: 'nonogram',
  get name() {
    return L('Nonogram', 'Nonogramme');
  },
  category: 'logic',
  undo: true,
  get rules() {
    return L('Clues are runs of filled tiles. Drag to paint.', 'Les indices donnent les blocs pleins. Glissez pour peindre.');
  },
  help: () => ({
    goal: L(
      'Fill in cells so that every row and column matches its clue numbers.',
      'Remplissez des cases pour que chaque rangée et chaque colonne corresponde à ses indices.',
    ),
    steps: [
      L(
        'Each clue lists, in order, the lengths of the filled blocks in that line, with at least one empty cell between blocks. A 0 means the line is empty.',
        'Chaque indice donne, dans l’ordre, la longueur des blocs pleins de la ligne, séparés par au moins une case vide. Un 0 veut dire que la ligne est vide.',
      ),
      L(
        'Tap a cell to fill it. Tap it again to mark it ✕ (surely empty), and once more to clear it.',
        'Touchez une case pour la remplir. Retouchez-la pour la marquer d’un ✕ (vide à coup sûr), puis encore une fois pour l’effacer.',
      ),
      L(
        'Long-press (or right-click) a cell to mark it ✕ right away. Drag to repeat your first change over several cells.',
        'Appuyez longuement (ou cliquez droit) sur une case pour la marquer d’un ✕ directement. Glissez pour répéter votre premier changement sur plusieurs cases.',
      ),
      L(
        'Keyboard: arrow keys move, Space cycles a cell, X marks it, Delete clears it.',
        'Au clavier : les flèches déplacent, Espace change l’état de la case, X la marque, Suppr l’efface.',
      ),
      L(
        'A clue fades once its line matches, and turns red when its line has too many filled cells. Clear wipes the board.',
        'Un indice pâlit quand sa ligne correspond, et devient rouge quand sa ligne a trop de cases remplies. Effacer vide la grille.',
      ),
    ],
    tips: [
      L(
        'Start with big clues: in a line of 5, a 4 always covers the middle three cells.',
        'Commencez par les gros indices : sur une ligne de 5, un 4 couvre toujours les trois cases du milieu.',
      ),
      L('Mark cells you know are empty with ✕ so you don’t lose track.', 'Marquez d’un ✕ les cases vides pour ne pas vous perdre.'),
    ],
  }),
  par: (d) => byLevel(d, [30, 50, 90, 150, 280]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const n = byLevel(d, [5, 5, 7, 8, 10]);
    const density = byLevel(d, [0.66, 0.56, 0.58, 0.56, 0.56]);
    let sol: boolean[];
    do sol = Array.from({ length: n * n }, () => rng.chance(density));
    while (sol.filter(Boolean).length < n);
    const row = (g: boolean[], r: number) => g.slice(r * n, r * n + n);
    const col = (g: boolean[], c: number) => Array.from({ length: n }, (_, r) => g[r * n + c]);
    const rowClues = Array.from({ length: n }, (_, r) => runs(row(sol, r)));
    const colClues = Array.from({ length: n }, (_, c) => runs(col(sol, c)));

    // 0 empty, 1 filled, 2 marked
    const st = new Array<number>(n * n).fill(0);
    /** Keyboard cursor (-1 until the keyboard is used). */
    let cur = -1;
    let done = false;

    const wrap = h('div', { class: 'nono', style: `--cols:${n}` });
    const colEls = colClues.map((cl) => h('div', { class: 'clue col' }, ...(cl.length ? cl : [0]).map((x) => h('span', null, x))));
    const rowEls = rowClues.map((cl) => h('div', { class: 'clue row' }, ...(cl.length ? cl : [0]).map((x) => h('span', null, x))));
    const grid = board(n, n, 'nono-grid');
    const cells = st.map((_, i) => {
      const el = h('div', { class: 'cell', 'data-i': i });
      grid.append(el);
      return el;
    });
    wrap.append(h('div', { class: 'corner' }), h('div', { class: 'cols' }, ...colEls), h('div', { class: 'rows' }, ...rowEls), grid);
    /** Counts a mistake when filling overloads a line (checked when the stroke ends). */
    const watch = ruleBreaks(wrap, ctx.mistake);
    const clueSum = (cl: number[]) => cl.reduce((a, b) => a + b, 0);

    const render = () => {
      const filled = st.map((v) => v === 1);
      cells.forEach((el, i) => {
        el.classList.toggle('on', st[i] === 1);
        el.classList.toggle('x', st[i] === 2);
        el.classList.toggle('cur', i === cur);
      });
      let ok = true,
        lines = 0;
      const line = (el: HTMLElement, ln: boolean[], clue: number[]) => {
        const m = same(runs(ln), clue);
        el.classList.toggle('done', m);
        el.classList.toggle('err', ln.filter(Boolean).length > clueSum(clue));
        if (m) lines++;
        ok &&= m;
      };
      rowEls.forEach((el, r) => line(el, row(filled, r), rowClues[r]));
      colEls.forEach((el, c) => line(el, col(filled, c), colClues[c]));
      ctx.status(`${lines} / ${P(2 * n, ['line', 'lines'], ['ligne', 'lignes'])}`);
      return ok;
    };

    // Long-press (350 ms on the first cell, before the stroke spreads) marks ✕ directly.
    let pressTimer = 0;
    const cancelPress = () => {
      clearTimeout(pressTimer);
      pressTimer = 0;
      for (const el of cells) el.classList.remove('lp');
    };

    // Tap cycles empty → filled → ✕ → empty. Dragging repeats the first cell's change (from → to) on every
    // cell in the same starting state, so a stroke never overwrites cells of another kind.
    let stroke: { from: number; to: number; first: number; id: number; x: number; y: number; spread: boolean } | null = null;
    const set = (i: number, v: number) => {
      st[i] = v;
      if (render()) {
        done = true;
        stroke = null;
        cancelPress();
        ctx.solved();
      }
    };
    const cellAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const i = el?.dataset['i'];
      return el && grid.contains(el) && i != null ? Number(i) : -1;
    };
    grid.addEventListener('contextmenu', (e) => e.preventDefault());
    grid.addEventListener('pointerdown', (e) => {
      if (done || stroke) return;
      const i = cellAt(e.clientX, e.clientY);
      if (i < 0) return;
      e.preventDefault();
      ctx.touch();
      cur = -1;
      const from = st[i];
      const to = e.button === 2 ? (from === 2 ? 0 : 2) : (from + 1) % 3;
      stroke = { from, to, first: i, id: e.pointerId, x: e.clientX, y: e.clientY, spread: false };
      set(i, to);
      // Only an empty cell turned filled can still become ✕ by holding.
      if (done || to !== 1) return;
      cells[i].classList.add('lp');
      pressTimer = window.setTimeout(() => {
        pressTimer = 0;
        cells[i].classList.remove('lp');
        if (!stroke || stroke.spread || done) return;
        stroke.to = 2;
        set(i, 2);
        try {
          navigator.vibrate?.(15);
        } catch {
          /* not allowed */
        }
      }, 350);
    });
    grid.addEventListener('pointermove', (e) => {
      const g = stroke;
      if (!g || e.pointerId !== g.id) return;
      if (pressTimer && Math.hypot(e.clientX - g.x, e.clientY - g.y) > 10) cancelPress();
      const i = cellAt(e.clientX, e.clientY);
      if (i < 0 || i === g.first || st[i] !== g.from) return;
      g.spread = true;
      cancelPress();
      set(i, g.to);
    });
    const end = (e: PointerEvent) => {
      if (stroke && e.pointerId !== stroke.id) return;
      cancelPress();
      if (stroke) watch(stroke.to === 1);
      stroke = null;
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);

    const sv = ctx.saved as { st?: unknown; cur?: unknown } | undefined;
    if (Array.isArray(sv?.st) && sv.st.length === st.length) sv.st.forEach((v, i) => (st[i] = v === 1 || v === 2 ? v : 0));
    const c0 = sv?.cur;
    if (typeof c0 === 'number' && Number.isInteger(c0) && c0 >= -1 && c0 < st.length) cur = c0;
    root.append(wrap);
    render();
    watch(false);
    ctx.controls(
      clearBtn(() => {
        if (done || st.every((v) => !v)) return;
        ctx.touch();
        st.fill(0);
        render();
        watch(false);
      }),
    );

    /** Cells that disagree with picture `p`: filled where it's empty, or ✕ where it's filled. */
    const wrongFor = (p: boolean[], i: number) => (st[i] === 1 && !p[i]) || (st[i] === 2 && p[i]);
    /** A picture the board can still reach: the stored one when it fits, else one found by search (memoised). */
    let memo: { key: string; pic: boolean[] | null; capped: boolean } | null = null;
    const target = () => {
      if (!st.some((_, i) => wrongFor(sol, i))) return { pic: sol, capped: false };
      const key = st.join('');
      if (memo?.key !== key) memo = { key, ...solveGrid(n, rowClues, colClues, st, sol, 400) };
      return memo;
    };
    const lineName = (isRow: boolean, k: number) =>
      isRow ? L(`Row ${k + 1}`, `La rangée ${k + 1}`) : L(`Column ${k + 1}`, `La colonne ${k + 1}`);
    /** Filled or ✕ cells that a line's clue can't accept, else ones that rule out every picture. */
    const check = (): Hint | null => {
      if (done) return null;
      const fix = (i: number, text: string, why: Element[]): Hint => ({
        kind: 'fix',
        text,
        why,
        at: [cells[i]],
        action: st[i] === 1 ? L('Clear it', 'L’effacer') : L('Remove the ✕', 'Enlever le ✕'),
        play: () => {
          if (!done && st[i]) set(i, 0);
          watch(false);
        },
      });
      for (const isRow of [true, false])
        for (let k = 0; k < n; k++) {
          const ix = Array.from({ length: n }, (_, j) => (isRow ? k * n + j : j * n + k));
          const clue = (isRow ? rowClues : colClues)[k];
          const line = ix.map((i) => st[i]);
          if (lineSolve(clue, line)) continue;
          const i = ix.find((x) => wrongFor(sol, x)) ?? ix.find((x) => st[x])!;
          const name = lineName(isRow, k);
          const cl = clue.length ? clue.join(' ') : '0';
          const over = line.filter((v) => v === 1).length > clue.reduce((a, b) => a + b, 0);
          return fix(
            i,
            over
              ? L(
                  `${name} has more filled cells than its clue ${cl} allows.`,
                  `${name} a plus de cases remplies que son indice ${cl} ne le permet.`,
                )
              : L(
                  `${name}’s filled and ✕ cells can no longer fit its clue ${cl}.`,
                  `Les cases remplies et les ✕ de ${name.toLowerCase()} ne peuvent plus correspondre à son indice ${cl}.`,
                ),
            [(isRow ? rowEls : colEls)[k]],
          );
        }
      const t = target();
      if (t.pic || t.capped) return null;
      const i = st.findIndex((_, x) => wrongFor(sol, x));
      return fix(
        i,
        st[i] === 1
          ? L(
              'This filled cell breaks no clue yet, but it leads to a dead end: no picture fits every clue with it.',
              'Cette case remplie ne brise encore aucun indice, mais elle mène à une impasse : aucune image ne respecte tous les indices avec elle.',
            )
          : L(
              'This ✕ breaks no clue yet, but it leads to a dead end: no picture fits every clue without filling this cell.',
              'Ce ✕ ne brise encore aucun indice, mais il mène à une impasse : aucune image ne respecte tous les indices sans remplir cette case.',
            ),
        [],
      );
    };

    type Kind = 'zero' | 'fit' | 'overlap' | 'done' | 'fill' | 'empty';
    let last: Kind | undefined;
    const used = new Map<Kind, number>();
    /** The next line deduction for the guide, from the clues and the cells already filled or marked. */
    const hint = (): Hint | null => {
      if (done) return null;
      const found: { kind: Kind; row: boolean; k: number; clue: number[]; ix: number[]; v: number; ways: number }[] = [];
      for (const isRow of [true, false])
        for (let k = 0; k < n; k++) {
          const ix = Array.from({ length: n }, (_, j) => (isRow ? k * n + j : j * n + k));
          const clue = (isRow ? rowClues : colClues)[k];
          const line = ix.map((i) => st[i]);
          if (!line.includes(0)) continue;
          const res = lineSolve(clue, line);
          if (!res) continue;
          const blank = line.every((v) => v === 0);
          const fills = ix.filter((_, j) => line[j] === 0 && res.fill[j]);
          const empties = ix.filter((_, j) => line[j] === 0 && res.empty[j]);
          const sum = clue.reduce((a, b) => a + b, 0);
          if (!clue.length) found.push({ kind: 'zero', row: isRow, k, clue, ix: empties, v: 2, ways: res.ways });
          else if (fills.length)
            found.push({
              kind: sum + clue.length - 1 === n ? 'fit' : blank ? 'overlap' : 'fill',
              row: isRow,
              k,
              clue,
              ix: fills,
              v: 1,
              ways: res.ways,
            });
          if (clue.length && empties.length) {
            const complete = line.filter((v) => v === 1).length === sum && empties.length === line.filter((v) => v === 0).length;
            found.push({ kind: complete ? 'done' : 'empty', row: isRow, k, clue, ix: empties, v: 2, ways: res.ways });
          }
        }
      const order: Kind[] = ['zero', 'fit', 'overlap', 'done', 'fill', 'empty'];
      // Simplest rule first, but show rules not seen yet before repeating one.
      const rank = (k: Kind) => ((used.get(k) ?? 0) + (k === last ? 1 : 0)) * order.length + order.indexOf(k);
      found.sort((a, b) => rank(a.kind) - rank(b.kind) || b.ix.length - a.ix.length);
      const f = found[0];
      if (!f) {
        // Nothing a single line decides: lean on the picture's solution, honestly.
        const pic = target().pic ?? sol;
        const i = st.findIndex((v, j) => v === 0 && pic[j]);
        if (i < 0) {
          // Only stray cells left (the search gave up on this board): clear one.
          const w = st.findIndex((_, j) => wrongFor(pic, j));
          if (w < 0) return null;
          return {
            text: L('This cell isn’t part of the picture: clear it.', 'Cette case ne fait pas partie de l’image : effacez-la.'),
            at: [cells[w]],
            play: () => {
              set(w, 0);
              watch(false);
            },
          };
        }
        last = undefined;
        return {
          text: L(
            'No single line decides more right now. This cell belongs to the picture: filling it fits both its row and its column.',
            'Aucune ligne seule n’en dit plus pour l’instant. Cette case fait partie de l’image : la remplir convient à sa rangée comme à sa colonne.',
          ),
          at: [cells[i]],
          play: () => {
            set(i, 1);
            watch();
          },
        };
      }
      last = f.kind;
      used.set(f.kind, (used.get(f.kind) ?? 0) + 1);
      const name = f.row ? L(`Row ${f.k + 1}`, `La rangée ${f.k + 1}`) : L(`Column ${f.k + 1}`, `La colonne ${f.k + 1}`);
      const lower = name.toLowerCase();
      const cl = f.clue.join(' ');
      const many = f.clue.length > 1;
      const them = f.ix.length > 1;
      const text =
        f.kind === 'zero'
          ? L(
              `${name}’s clue is 0: nothing is filled there. Mark it all ✕.`,
              `L’indice de ${lower} est 0 : rien n’y est rempli. Marquez tout d’un ✕.`,
            )
          : f.kind === 'fit'
            ? L(
                `${many ? `The blocks ${cl} with their gaps take` : `The ${cl} takes`} all ${n} cells of ${lower}: no room to slide, so fill ${many ? 'them' : 'it'} in.`,
                `${many ? `Les blocs ${cl} et leurs espaces prennent` : `Le ${cl} prend`} les ${n} cases de ${lower} : aucune marge, remplissez.`,
              )
            : f.kind === 'overlap'
              ? L(
                  `However you slide ${many ? `the blocks ${cl}` : `a block of ${cl}`} along ${lower}, ${them ? 'these cells are' : 'this cell is'} always covered. Fill ${them ? 'them' : 'it'}.`,
                  `Peu importe où glissent ${many ? `les blocs ${cl}` : `les ${cl} cases du bloc`} dans ${lower}, ${them ? 'ces cases sont toujours couvertes' : 'cette case est toujours couverte'}. Remplissez.`,
                )
              : f.kind === 'done'
                ? L(
                    `${name} already shows all of its ${cl}, so its other cells are empty. Tap twice (or long-press) to mark ✕.`,
                    `${name} montre déjà tout son ${cl} : ses autres cases sont vides. Touchez deux fois (ou appuyez longuement) pour un ✕.`,
                  )
                : f.kind === 'fill'
                  ? f.ways === 1
                    ? L(
                        `With what’s already in ${lower}, ${cl} fits only one way, which fills ${them ? 'these cells' : 'this cell'}.`,
                        `Avec ce qui est déjà dans ${lower}, ${cl} ne se place que d’une façon, qui remplit ${them ? 'ces cases' : 'cette case'}.`,
                      )
                    : L(
                        `With what’s already in ${lower}, every way to fit ${cl} fills ${them ? 'these cells' : 'this cell'}.`,
                        `Avec ce qui est déjà dans ${lower}, toutes les façons de placer ${cl} remplissent ${them ? 'ces cases' : 'cette case'}.`,
                      )
                  : L(
                      `With what’s already in ${lower}, no way to fit ${cl} reaches ${them ? 'these cells' : 'this cell'}: mark ✕.`,
                      `Avec ce qui est déjà dans ${lower}, aucune façon de placer ${cl} n’atteint ${them ? 'ces cases' : 'cette case'} : marquez ✕.`,
                    );
      const ix = f.ix;
      return {
        text,
        why: [(f.row ? rowEls : colEls)[f.k]],
        at: ix.map((i) => cells[i]),
        play: () => {
          ix.forEach((i) => !done && st[i] === 0 && set(i, f.v));
          watch(f.v === 1);
        },
      };
    };

    const DIRS: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    return {
      hint,
      check,
      snapshot: () => ({ st, cur }),
      onKey(e) {
        if (done) return false;
        const dir = DIRS[e.key];
        if (dir) {
          if (cur < 0) cur = 0;
          else {
            const r = Math.min(n - 1, Math.max(0, Math.floor(cur / n) + dir[1]));
            const c = Math.min(n - 1, Math.max(0, (cur % n) + dir[0]));
            cur = r * n + c;
          }
          render();
          return true;
        }
        if (cur < 0) return false;
        const next =
          e.key === ' ' || e.key === 'Enter'
            ? (st[cur] + 1) % 3
            : e.key === 'x' || e.key === 'X'
              ? st[cur] === 2
                ? 0
                : 2
              : e.key === 'Backspace' || e.key === 'Delete'
                ? 0
                : -1;
        if (next < 0) return false;
        ctx.touch();
        set(cur, next);
        watch(next === 1);
        return true;
      },
      destroy() {
        cancelPress();
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
      },
    };
  },
};
