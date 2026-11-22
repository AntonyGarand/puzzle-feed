import './style.css';
import { L, P } from '../../core/i18n';
import type { Rng } from '../../core/rng';
import { byLevel, type Hint, type PuzzleDef } from '../../core/types';
import { board, clearBtn, h, ruleBreaks, s } from '../../ui/dom';
import { pressable } from '../../kits/latin/entry';
import { type TakuzuRule, takuzuCheck, takuzuStep } from './hint';

// Cell values: -1 empty, 0 sun, 1 moon. A row is a bitmask with bit c set for a moon in column c.

const ROWS = new Map<number, number[]>();
/** Every balanced row of length n without three equal symbols in a row (cached per n). */
function validRows(n: number): number[] {
  const hit = ROWS.get(n);
  if (hit) return hit;
  const out: number[] = [];
  const full = (1 << n) - 1;
  for (let m = 0; m <= full; m++) {
    let ones = 0;
    for (let x = m; x; x &= x - 1) ones++;
    if (ones * 2 !== n) continue;
    const z = ~m & full;
    if (m & (m >> 1) & (m >> 2) || z & (z >> 1) & (z >> 2)) continue;
    out.push(m);
  }
  ROWS.set(n, out);
  return out;
}

/**
 * Counts solutions (rows top to bottom, columns checked as they grow) up to `limit`.
 * Gives up after `budget` nodes (reported as `aborted`). With `rng`, returns a random fill in `found`.
 */
function solve(g: number[], n: number, limit: number, budget: number, rng?: Rng) {
  const rows = validRows(n);
  const full = (1 << n) - 1;
  const half = n / 2;
  const fixedMask: number[] = [],
    fixedVal: number[] = [];
  for (let r = 0; r < n; r++) {
    let fm = 0,
      fv = 0;
    for (let c = 0; c < n; c++) {
      const v = g[r * n + c];
      if (v < 0) continue;
      fm |= 1 << c;
      if (v === 1) fv |= 1 << c;
    }
    fixedMask.push(fm);
    fixedVal.push(fv);
  }
  const cand = fixedMask.map((fm, r) => {
    const list = rows.filter((m) => (m & fm) === fixedVal[r]);
    return rng ? rng.shuffle(list) : list;
  });
  const res = { count: 0, aborted: false, found: [] as number[] };
  const pick: number[] = [];
  const ones = new Array<number>(n).fill(0);
  let nodes = 0;
  const colsDistinct = () => {
    const seen = new Set<number>();
    for (let c = 0; c < n; c++) {
      let m = 0;
      for (let r = 0; r < n; r++) if (pick[r] & (1 << c)) m |= 1 << r;
      if (seen.has(m)) return false;
      seen.add(m);
    }
    return true;
  };
  const rec = (r: number): boolean => {
    if (++nodes > budget) {
      res.aborted = true;
      return true;
    }
    if (r === n) {
      if (!colsDistinct()) return false;
      res.count++;
      if (!res.found.length) res.found = [...pick];
      return res.count >= limit;
    }
    for (const m of cand[r]) {
      let dup = false;
      for (let k = 0; k < r && !dup; k++) dup = pick[k] === m;
      if (dup) continue;
      if (r >= 2) {
        const p1 = pick[r - 1],
          p2 = pick[r - 2];
        if (~(p1 ^ p2) & ~(p1 ^ m) & full) continue;
      }
      let ok = true;
      for (let c = 0; c < n && ok; c++) {
        const o = ones[c] + ((m >> c) & 1);
        if (o > half || r + 1 - o > half) ok = false;
      }
      if (!ok) continue;
      for (let c = 0; c < n; c++) ones[c] += (m >> c) & 1;
      pick[r] = m;
      const stop = rec(r + 1);
      for (let c = 0; c < n; c++) ones[c] -= (m >> c) & 1;
      if (stop) return true;
    }
    return false;
  };
  rec(0);
  return res;
}

/** Cells breaking a rule: three alike in a line, too many of one symbol, or a full line repeated. */
function broken(g: number[], n: number): Set<number> {
  const bad = new Set<number>();
  const lines: number[][] = [];
  for (let r = 0; r < n; r++) lines.push(Array.from({ length: n }, (_, c) => r * n + c));
  for (let c = 0; c < n; c++) lines.push(Array.from({ length: n }, (_, r) => r * n + c));
  for (const line of lines) {
    for (let k = 0; k + 2 < n; k++) {
      const [a, b, c] = [line[k], line[k + 1], line[k + 2]];
      if (g[a] >= 0 && g[a] === g[b] && g[b] === g[c]) bad.add(a).add(b).add(c);
    }
    for (const v of [0, 1]) {
      const these = line.filter((i) => g[i] === v);
      if (these.length > n / 2) for (const i of these) bad.add(i);
    }
  }
  for (const group of [lines.slice(0, n), lines.slice(n)]) {
    const key = group.map((line) => (line.every((i) => g[i] >= 0) ? line.map((i) => g[i]).join('') : ''));
    for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++) if (key[a] && key[a] === key[b]) for (const i of [...group[a], ...group[b]]) bad.add(i);
  }
  return bad;
}

const sun = () =>
  s(
    'svg',
    { viewBox: '0 0 100 100', class: 'sym sun', 'aria-hidden': 'true' },
    ...Array.from({ length: 8 }, (_, k) => {
      const a = (k * Math.PI) / 4;
      const p = (r: number) => [50 + r * Math.cos(a), 50 + r * Math.sin(a)].map((x) => x.toFixed(1));
      const [x1, y1] = p(31),
        [x2, y2] = p(43);
      return s('line', { x1, y1, x2, y2, class: 'ray' });
    }),
    s('circle', { cx: 50, cy: 50, r: 22, class: 'disc' }),
  );
const moon = () =>
  s(
    'svg',
    { viewBox: '0 0 100 100', class: 'sym moon', 'aria-hidden': 'true' },
    s('path', { d: 'M48.2 19.1A31 31 0 1 0 79.2 60.4A26 26 0 0 1 48.2 19.1Z', class: 'disc' }),
  );

export const eclipse: PuzzleDef = {
  id: 'eclipse',
  get name() {
    return L('Eclipse', 'Éclipse');
  },
  category: 'logic',
  undo: true,
  get rules() {
    return L('Half suns, half moons; no three alike; no twin lines.', 'Moitié soleils, moitié lunes; ni trois pareils, ni doublon.');
  },
  help: () => ({
    goal: L(
      'Fill every cell with a sun or a moon so that all three rules hold everywhere.',
      'Remplissez chaque case d’un soleil ou d’une lune pour que les trois règles soient respectées partout.',
    ),
    steps: [
      L('Every row and column holds as many suns as moons.', 'Chaque rangée et chaque colonne contient autant de soleils que de lunes.'),
      L(
        'Never three of the same symbol side by side, across or down.',
        'Jamais trois symboles pareils côte à côte, à l’horizontale ou à la verticale.',
      ),
      L('No two rows are identical, and no two columns are identical.', 'Deux rangées ne sont jamais identiques, ni deux colonnes.'),
      L(
        'Tap a cell to cycle it: sun, moon, then empty. Long-press (or right-click) to clear it. Dashed cells are given.',
        'Touchez une case pour la changer : soleil, lune, puis vide. Appuyez longuement (ou clic droit) pour l’effacer. Les cases pointillées sont données.',
      ),
      L(
        'Keyboard: arrows move, Space cycles, 1 = sun, 2 = moon, Backspace clears. Cells breaking a rule turn red and count as a mistake once you move on. Clear wipes your entries.',
        'Au clavier : flèches pour bouger, Espace pour changer, 1 = soleil, 2 = lune, Retour arrière pour effacer. Les cases fautives passent au rouge et comptent comme une erreur dès que vous passez à une autre case. Effacer retire vos entrées.',
      ),
    ],
    tips: [
      L('Two alike side by side? Both ends get the other symbol.', 'Deux pareils côte à côte? Les deux bouts reçoivent l’autre symbole.'),
      L('Once a line has its half of suns, the rest are moons.', 'Quand une ligne a sa moitié de soleils, le reste, ce sont des lunes.'),
      L(
        'A nearly full line that could copy a finished one must differ: that decides its last cells.',
        'Une ligne presque pleine qui pourrait copier une ligne finie doit en différer : ça décide ses dernières cases.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [25, 60, 100, 180, 300]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const n = byLevel(d, [4, 6, 6, 8, 10]);
    const maxHoles = Math.round(n * n * byLevel(d, [0.5, 0.55, 0.75, 0.75, 0.8]));
    const budget = byLevel(d, [5000, 5000, 5000, 8000, 8000]);

    const fill = solve(new Array(n * n).fill(-1), n, 1, 200000, rng).found;
    const sol = Array.from({ length: n * n }, (_, i) => (fill[Math.floor(i / n)] >> (i % n)) & 1);
    const puz = [...sol];
    let holes = 0;
    for (const i of rng.shuffle([...puz.keys()])) {
      if (holes >= maxHoles) break;
      puz[i] = -1;
      const r = solve(puz, n, 2, budget);
      if (r.count === 1 && !r.aborted) holes++;
      else puz[i] = sol[i];
    }
    const given = puz.map((v) => v >= 0);
    const g = [...puz];
    let cur = -1;
    let done = false;

    const grid = board(n, n, 'ecl');
    const cells = g.map((_, i) => {
      const el = h('button', { type: 'button', class: 'cell', 'aria-label': '' }, sun(), moon());
      pressable(
        el,
        () => tap(i),
        () => set(i, -1),
        () => !given[i] && g[i] !== -1,
      );
      grid.append(el);
      return el;
    });
    /**
     * Rule breaks count as a mistake once the player moves on: a tap cycles sun → moon, so the sun on the
     * way to a moon must not count. `pending` is the cell whose entry hasn't been judged yet.
     */
    const watch = ruleBreaks(grid, ctx.mistake);
    let pending = -1;
    const render = () => {
      const bad = broken(g, n);
      cells.forEach((el, i) => {
        let cls = 'cell';
        if (given[i]) cls += ' given';
        if (g[i] === 0) cls += ' is-sun';
        if (g[i] === 1) cls += ' is-moon';
        if (i === cur) cls += ' cur';
        if (bad.has(i) && !given[i]) cls += ' err';
        if (el.className !== cls) el.className = cls;
        el.setAttribute('aria-label', g[i] === 0 ? L('sun', 'soleil') : g[i] === 1 ? L('moon', 'lune') : L('empty', 'vide'));
      });
      const left = g.filter((v) => v < 0).length;
      ctx.status(P(left, ['empty cell', 'empty cells'], ['case vide', 'cases vides']));
      return left === 0 && bad.size === 0;
    };
    const set = (i: number, v: number) => {
      if (done || given[i] || g[i] === v) return;
      ctx.touch();
      if (pending !== i && pending >= 0) watch();
      g[i] = v;
      const won = render();
      pending = v >= 0 && !won ? i : -1;
      if (pending < 0) watch(false);
      if (won) {
        done = true;
        ctx.solved();
      }
    };
    const tap = (i: number) => {
      cur = -1;
      set(i, g[i] === -1 ? 0 : g[i] === 0 ? 1 : -1);
      render();
    };

    const sv = ctx.saved as { g?: unknown; cur?: unknown } | undefined;
    if (Array.isArray(sv?.g) && sv.g.length === g.length) sv.g.forEach((v, i) => !given[i] && (v === 0 || v === 1) && (g[i] = v));
    if (typeof sv?.cur === 'number' && Number.isInteger(sv.cur) && sv.cur >= -1 && sv.cur < g.length) cur = sv.cur;
    root.append(grid);
    render();
    watch(false);
    ctx.controls(
      clearBtn(() => {
        if (done || g.every((v, i) => given[i] || v < 0)) return;
        ctx.touch();
        g.forEach((_, i) => !given[i] && (g[i] = -1));
        cur = -1;
        pending = -1;
        render();
        watch(false);
      }),
    );

    const lineName = (row: boolean, k: number) =>
      row ? L(`Row ${k + 1}`, `La rangée ${k + 1}`) : L(`Column ${k + 1}`, `La colonne ${k + 1}`);
    const one = (v: number) => (v === 0 ? L('a sun', 'un soleil') : L('a moon', 'une lune'));
    const many = (v: number) => (v === 0 ? L('suns', 'soleils') : L('moons', 'lunes'));
    const put = (ix: number[], vs: number[]) => () => ix.forEach((i, k) => set(i, vs[k]));
    let last: TakuzuRule | undefined;
    /** The next deduction for the guide, from the visible cells only. */
    const hint = (): Hint | null => {
      if (done || !g.includes(-1)) return null;
      const st = takuzuStep(g, n, last, ['pair', 'gap', 'count', 'twin']);
      if (!st) {
        const i = g.indexOf(-1);
        return {
          text: L(
            `Only ${one(sol[i])} fits here: the other symbol would break a rule (check its row and column).`,
            `Seul${sol[i] ? 'e' : ''} ${one(sol[i])} convient ici : l’autre symbole briserait une règle (vérifiez sa rangée et sa colonne).`,
          ),
          at: [cells[i]],
          play: put([i], [sol[i]]),
        };
      }
      last = st.rule;
      const name = lineName(st.row, st.line);
      const lower = name.toLowerCase();
      const w = 1 - st.v;
      const both = st.at.length > 1;
      const text =
        st.rule === 'pair'
          ? L(
              `Two ${many(st.v)} side by side in ${lower}: ${both ? 'both ends get' : 'the next cell gets'} ${one(w)}, since three alike is not allowed.`,
              `Deux ${many(st.v)} côte à côte dans ${lower} : ${both ? 'les deux bouts reçoivent' : 'la case suivante reçoit'} ${one(w)}, car trois pareils sont interdits.`,
            )
          : st.rule === 'gap'
            ? L(
                `Two ${many(st.v)} with one cell between them in ${lower}: the middle gets ${one(w)}, or there would be three in a row.`,
                `Deux ${many(st.v)} séparé${st.v ? 'es' : 's'} d’une case dans ${lower} : celle du milieu reçoit ${one(w)}, sinon il y en aurait trois de suite.`,
              )
            : st.rule === 'count'
              ? L(
                  `${name} already has its ${n / 2} ${many(st.v)} (half of ${n}), so ${both ? `the other cells get ${many(w)}` : `the last cell gets ${one(w)}`}.`,
                  `${name} a déjà ses ${n / 2} ${many(st.v)} (la moitié de ${n}) : ${both ? `les autres cases reçoivent des ${many(w)}` : `la dernière case reçoit ${one(w)}`}.`,
                )
              : L(
                  `${name} would become a copy of ${lineName(st.row, st.other!).toLowerCase()} if filled the same way. Lines must differ, so swap the two symbols.`,
                  `${name} deviendrait une copie de ${lineName(st.row, st.other!).toLowerCase()} si on la remplissait pareil. Les lignes doivent différer : inversez les deux symboles.`,
                );
      return { text, why: st.why.map((i) => cells[i]), at: st.at.map((i) => cells[i]), play: put(st.at, st.vals) };
    };

    /** A broken rule, else an entry off the unique solution; play() clears it (the long-press path). */
    const check = (): Hint | null => {
      if (done) return null;
      const f = takuzuCheck(g, n, sol, given, [
        [L('This sun', 'Ce soleil'), many(0)],
        [L('This moon', 'Cette lune'), many(1)],
      ]);
      if (!f) return null;
      const i = f.clear;
      return {
        kind: 'fix',
        text: f.text,
        at: f.at.map((j) => cells[j]),
        action: g[i] === 0 ? L('Clear the sun', 'Effacer le soleil') : L('Clear the moon', 'Effacer la lune'),
        play: () => set(i, -1),
      };
    };

    const DIRS: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    return {
      hint,
      check,
      snapshot: () => ({ g, cur }),
      onKey(e) {
        if (done) return false;
        const dir = DIRS[e.key];
        if (dir) {
          cur =
            cur < 0 ? 0 : Math.min(n - 1, Math.max(0, Math.floor(cur / n) + dir[0])) * n + Math.min(n - 1, Math.max(0, (cur % n) + dir[1]));
          render();
          return true;
        }
        if (cur < 0) return false;
        const v =
          e.key === ' ' || e.key === 'Enter'
            ? g[cur] === -1
              ? 0
              : g[cur] === 0
                ? 1
                : -1
            : e.key === '1'
              ? 0
              : e.key === '2'
                ? 1
                : e.key === 'Backspace' || e.key === 'Delete' || e.key === '0'
                  ? -1
                  : null;
        if (v == null) return false;
        set(cur, v);
        return true;
      },
    };
  },
};
