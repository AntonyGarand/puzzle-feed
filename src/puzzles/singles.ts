import './singles.css';
import { L, P } from '../core/i18n';
import type { Rng } from '../core/rng';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, h } from '../core/ui';
import { pressable } from './latinkit/entry';
import { randomLatin } from './latinkit/solver';

const nb = (n: number, i: number) => {
  const r = Math.floor(i / n),
    c = i % n;
  const out: number[] = [];
  if (r > 0) out.push(i - n);
  if (r < n - 1) out.push(i + n);
  if (c > 0) out.push(i - 1);
  if (c < n - 1) out.push(i + 1);
  return out;
};

/** Connected components of the cells where `open` is true (component id per cell, -1 elsewhere). */
function components(n: number, open: (i: number) => boolean): { id: number[]; sizes: number[] } {
  const id = new Array<number>(n * n).fill(-1);
  const sizes: number[] = [];
  for (let s = 0; s < n * n; s++) {
    if (!open(s) || id[s] >= 0) continue;
    const k = sizes.length;
    let size = 0;
    const stack = [s];
    id[s] = k;
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      for (const j of nb(n, i))
        if (open(j) && id[j] < 0) {
          id[j] = k;
          stack.push(j);
        }
    }
    sizes.push(size);
  }
  return { id, sizes };
}

/** Cells sharing a row or column with i that hold the same number. */
function twins(n: number, nums: number[]): number[][] {
  return nums.map((v, i) => {
    const r = Math.floor(i / n),
      c = i % n;
    const out: number[] = [];
    for (let k = 0; k < n; k++) {
      if (k !== c && nums[r * n + k] === v) out.push(r * n + k);
      if (k !== r && nums[k * n + c] === v) out.push(k * n + c);
    }
    return out;
  });
}

/**
 * Counts shadings (only cells with a repeated number may be shaded) up to `limit`.
 * `fixed`: -1 free, 0 must stay unshaded, 1 must be shaded. Returns found solutions (1 = shaded).
 */
function solve(n: number, nums: number[], fixed: number[], limit: number, budget: number) {
  const tw = twins(n, nums);
  const res = { count: 0, aborted: false, solutions: [] as number[][] };
  let nodes = 0;
  const init = fixed.map((f, i) => (f >= 0 ? f : tw[i].length ? -1 : 0));
  const propagate = (st: number[], start: number[]): boolean => {
    const q = [...start];
    while (q.length) {
      const i = q.pop()!;
      if (st[i] === 1) {
        for (const j of nb(n, i)) {
          if (st[j] === 1) return false;
          if (st[j] < 0) {
            st[j] = 0;
            q.push(j);
          }
        }
      } else {
        for (const j of tw[i]) {
          if (st[j] === 0) return false;
          if (st[j] < 0) {
            st[j] = 1;
            q.push(j);
          }
        }
      }
    }
    const { sizes } = components(n, (i) => st[i] !== 1);
    return sizes.length === 1;
  };
  const rec = (st: number[], start: number[]): boolean => {
    if (++nodes > budget) {
      res.aborted = true;
      return true;
    }
    if (!propagate(st, start)) return false;
    // branch on the open cell with the most twins
    let best = -1;
    for (let i = 0; i < st.length; i++) if (st[i] < 0 && (best < 0 || tw[i].length > tw[best].length)) best = i;
    if (best < 0) {
      res.count++;
      if (res.solutions.length < limit) res.solutions.push([...st]);
      return res.count >= limit;
    }
    for (const v of [1, 0]) {
      const s2 = [...st];
      s2[best] = v;
      if (rec(s2, [best])) return true;
    }
    return false;
  };
  rec(
    init,
    init.flatMap((v, i) => (v >= 0 ? [i] : [])),
  );
  return res;
}

/** A random shading: no two shaded cells touch, the rest stays connected. */
function randomShade(n: number, density: number, rng: Rng): boolean[] {
  const sh = new Array<boolean>(n * n).fill(false);
  let count = 0;
  const want = Math.round(n * n * density);
  for (const i of rng.shuffle([...sh.keys()])) {
    if (count >= want) break;
    if (nb(n, i).some((j) => sh[j])) continue;
    sh[i] = true;
    if (components(n, (k) => !sh[k]).sizes.length === 1) count++;
    else sh[i] = false;
  }
  return sh;
}

export const singles: PuzzleDef = {
  id: 'singles',
  get name() {
    return L('Singles', 'Uniques');
  },
  category: 'logic',
  get rules() {
    return L('Shade repeats away; shades never touch; stay linked.', 'Noircissez les doublons; noires isolées; blanches reliées.');
  },
  help: () => ({
    goal: L(
      'Shade some cells so no number appears twice in any row or column among the cells left unshaded.',
      'Noircissez des cases pour qu’aucun chiffre ne se répète dans une rangée ou une colonne parmi les cases restées blanches.',
    ),
    steps: [
      L(
        'Unshaded cells never repeat a number in a row or column.',
        'Les cases blanches ne répètent jamais un chiffre dans une rangée ou une colonne.',
      ),
      L(
        'Shaded cells never touch side by side (corners are fine).',
        'Les cases noires ne se touchent jamais par un côté (les coins, ça va).',
      ),
      L(
        'All unshaded cells stay connected in one piece, through their sides.',
        'Toutes les cases blanches restent reliées en un seul morceau, par leurs côtés.',
      ),
      L(
        'Tap a cell to cycle it: shaded, circled (sure to stay), then plain. Long-press (or right-click) to circle it.',
        'Touchez une case pour la changer : noircie, encerclée (sûre de rester), puis normale. Appuyez longuement (ou clic droit) pour l’encercler.',
      ),
      L(
        'Keyboard: arrows move, Space cycles, Backspace resets. Red marks broken rules: repeats between circled cells, touching shades, or cut-off cells.',
        'Au clavier : flèches pour bouger, Espace pour changer, Retour arrière pour remettre. Le rouge signale une règle brisée : doublon entre cases encerclées, noires qui se touchent ou cases coupées du reste.',
      ),
    ],
    tips: [
      L(
        'Next to a shaded cell, every neighbour stays unshaded: circle them.',
        'Autour d’une case noire, toutes les voisines restent blanches : encerclez-les.',
      ),
      L(
        'In a pattern like 3 2 3, the middle cell stays: shading it would keep both 3s beside it, a repeat.',
        'Dans un motif comme 3 2 3, la case du milieu reste : la noircir garderait les deux 3 voisins, un doublon.',
      ),
      L(
        'A circled number means its twins in the same row and column must be shaded.',
        'Un chiffre encerclé oblige à noircir ses jumeaux de la même rangée et de la même colonne.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [35, 70, 120, 200, 320]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const n = byLevel(d, [5, 6, 7, 8, 9]);
    const hints = byLevel(d, [2, 1, 0, 0, 0]);
    const budget = 4000;

    // Latin square, then a shading whose cells get rewritten into repeats of unshaded numbers.
    let nums: number[] = [];
    let shade: boolean[] = [];
    let fixed: number[] = [];
    for (let attempt = 0; attempt < 30; attempt++) {
      const lat = randomLatin(n, rng);
      shade = randomShade(n, 0.3, rng);
      nums = [...lat];
      for (let i = 0; i < n * n; i++) {
        if (!shade[i]) continue;
        const r = Math.floor(i / n),
          c = i % n;
        const opts: number[] = [];
        for (let k = 0; k < n; k++) {
          if (!shade[r * n + k]) opts.push(lat[r * n + k]);
          if (!shade[k * n + c]) opts.push(lat[k * n + c]);
        }
        nums[i] = rng.pick(opts);
      }
      fixed = nums.map(() => -1);
      const r = solve(n, nums, fixed, 2, budget);
      if (r.count === 1 && !r.aborted) break;
    }
    // Still ambiguous (rare): lock cells where two solutions disagree until only ours is left.
    for (let guard = 0; guard < n * n; guard++) {
      const r = solve(n, nums, fixed, 2, budget);
      if (r.count === 1 && !r.aborted) break;
      const open = [...fixed.keys()].filter((i) => fixed[i] < 0);
      let pool = open;
      if (r.solutions.length === 2) {
        const [a, b] = r.solutions;
        const diff = open.filter((i) => a[i] !== b[i]);
        if (diff.length) pool = diff;
      }
      if (!pool.length) break;
      const i = rng.pick(pool);
      fixed[i] = shade[i] ? 1 : 0;
    }
    // Easy levels: a few repeated numbers that stay are circled for you.
    const tw = twins(n, nums);
    for (let k = 0; k < hints; k++) {
      const open = [...fixed.keys()].filter((i) => fixed[i] < 0 && !shade[i] && tw[i].length);
      if (!open.length) break;
      fixed[rng.pick(open)] = 0;
    }
    const locked = fixed.map((f) => f >= 0);

    // 0 plain, 1 shaded, 2 circled
    const st: number[] = fixed.map((f) => (f === 1 ? 1 : f === 0 ? 2 : 0));
    let cur = -1;
    let done = false;

    const grid = board(n, n, 'sgl');
    const cells = nums.map((v, i) => {
      const el = h('button', { type: 'button', class: 'cell' }, h('span', { class: 'v' }, v));
      pressable(
        el,
        () => tap(i),
        () => set(i, 2),
      );
      grid.append(el);
      return el;
    });

    const render = () => {
      const bad = new Set<number>();
      for (let i = 0; i < n * n; i++) {
        if (st[i] === 1) {
          for (const j of nb(n, i)) if (st[j] === 1) bad.add(i).add(j);
        } else if (st[i] === 2) {
          for (const j of tw[i]) if (st[j] === 2) bad.add(i).add(j);
        }
      }
      const { id, sizes } = components(n, (i) => st[i] !== 1);
      const main = sizes.indexOf(Math.max(...sizes));
      if (sizes.length > 1) for (let i = 0; i < n * n; i++) if (id[i] >= 0 && id[i] !== main) bad.add(i);
      let repeats = 0;
      for (let i = 0; i < n * n; i++) if (st[i] !== 1) for (const j of tw[i]) if (j > i && st[j] !== 1) repeats++;
      cells.forEach((el, i) => {
        let cls = 'cell';
        if (locked[i]) cls += ' given';
        if (st[i] === 1) cls += ' shade';
        if (st[i] === 2) cls += ' ring';
        if (i === cur) cls += ' cur';
        if (bad.has(i) && !locked[i]) cls += ' err';
        if (el.className !== cls) el.className = cls;
      });
      ctx.status(P(repeats, ['repeat left', 'repeats left'], ['doublon restant', 'doublons restants']));
      return bad.size === 0 && repeats === 0;
    };
    const set = (i: number, v: number) => {
      if (done || locked[i] || st[i] === v) return;
      ctx.touch();
      st[i] = v;
      if (render()) {
        done = true;
        ctx.solved();
      }
    };
    const tap = (i: number) => {
      if (cur >= 0) {
        cur = -1;
        render();
      }
      set(i, (st[i] + 1) % 3);
    };

    const sv = ctx.saved as { st?: unknown; cur?: unknown } | undefined;
    if (Array.isArray(sv?.st) && sv.st.length === st.length)
      sv.st.forEach((v, i) => !locked[i] && (v === 0 || v === 1 || v === 2) && (st[i] = v));
    if (typeof sv?.cur === 'number' && Number.isInteger(sv.cur) && sv.cur >= -1 && sv.cur < st.length) cur = sv.cur;
    root.append(grid);
    render();

    const lineCells = (row: boolean, k: number) => Array.from({ length: n }, (_, j) => (row ? k * n + j : j * n + k));
    const lineName = (row: boolean, k: number) =>
      row ? L(`row ${k + 1}`, `la rangée ${k + 1}`) : L(`column ${k + 1}`, `la colonne ${k + 1}`);
    const els = (ix: number[]) => ix.map((i) => cells[i]);
    const mark = (ix: number[], v: number) => () => ix.forEach((i) => st[i] === 0 && set(i, v));
    let last = -1;
    /** The next deduction for the guide, from the numbers, shades and circles on the board. */
    const hint = (): Hint | null => {
      if (done) return null;
      const plain = (i: number) => st[i] === 0;

      const twinsOf = (): Hint | null => {
        // A circled number stays, so its repeats in the same row and column go.
        for (let i = 0; i < n * n; i++) {
          if (st[i] !== 2) continue;
          const ix = tw[i].filter(plain);
          if (!ix.length) continue;
          return {
            text: L(
              `This ${nums[i]} is circled, so it stays. ${ix.length > 1 ? `The other ${nums[i]}s in its row and column` : `The other ${nums[i]} in its row or column`} must be shaded. Tap once to shade.`,
              `Ce ${nums[i]} est encerclé : il reste. ${ix.length > 1 ? `Les autres ${nums[i]} de sa rangée et de sa colonne doivent être noircis` : `L’autre ${nums[i]} de sa rangée ou de sa colonne doit être noirci`}. Touchez une fois pour noircir.`,
            ),
            why: els([i]),
            at: els(ix),
            play: mark(ix, 1),
          };
        }
        return null;
      };
      const beside = (): Hint | null => {
        // Shaded cells never touch, so a shade's neighbours all stay: circle them.
        for (let i = 0; i < n * n; i++) {
          if (st[i] !== 1) continue;
          const ix = nb(n, i).filter(plain);
          if (!ix.length) continue;
          return {
            text: L(
              `Shaded cells never touch side by side, so every neighbour of this shaded cell stays. Long-press to circle ${ix.length > 1 ? 'them' : 'it'}.`,
              `Les cases noires ne se touchent jamais par un côté : chaque voisine de cette case noire reste. Appuyez longuement pour ${ix.length > 1 ? 'les ' : 'l’'}encercler.`,
            ),
            why: els([i]),
            at: els(ix),
            play: mark(ix, 2),
          };
        }
        return null;
      };
      const sandwich = (): Hint | null => {
        // a b a: shading b would keep both a's beside it, a repeat.
        for (const row of [true, false])
          for (let k = 0; k < n; k++) {
            const line = lineCells(row, k);
            for (let j = 0; j + 2 < n; j++) {
              const [a, m, b] = [line[j], line[j + 1], line[j + 2]];
              if (nums[a] !== nums[b] || st[a] === 1 || st[b] === 1 || !plain(m) || !tw[m].length) continue;
              return {
                text: L(
                  `In ${lineName(row, k)}, this ${nums[m]} sits between two ${nums[a]}s. Shading it would keep both ${nums[a]}s (shades can’t touch), a repeat. So it stays: circle it.`,
                  `Dans ${lineName(row, k)}, ce ${nums[m]} est entre deux ${nums[a]}. Le noircir garderait les deux ${nums[a]} (les noires ne se touchent pas), un doublon. Il reste : encerclez-le.`,
                ),
                why: els([a, b]),
                at: els([m]),
                play: mark([m], 2),
              };
            }
          }
        return null;
      };
      const pair = (): Hint | null => {
        // a a … a: one of the pair stays, so the lone a goes.
        for (const row of [true, false])
          for (let k = 0; k < n; k++) {
            const line = lineCells(row, k);
            for (let j = 0; j + 1 < n; j++) {
              const [a, b] = [line[j], line[j + 1]];
              if (nums[a] !== nums[b]) continue;
              const ix = line.filter((x) => x !== a && x !== b && nums[x] === nums[a] && plain(x));
              if (!ix.length) continue;
              const v = nums[a];
              return {
                text: L(
                  `Two ${v}s side by side in ${lineName(row, k)}: one of them has to stay, since both can’t be shaded. So the other ${v} in that line must go.`,
                  `Deux ${v} côte à côte dans ${lineName(row, k)} : l’un des deux reste, car on ne peut pas noircir les deux. L’autre ${v} de la ligne doit donc partir.`,
                ),
                why: els([a, b]),
                at: els(ix),
                play: mark(ix, 1),
              };
            }
          }
        return null;
      };
      const cut = (): Hint | null => {
        // Shading this cell would split the unshaded cells in two.
        for (let i = 0; i < n * n; i++) {
          if (!plain(i) || !tw[i].length) continue;
          if (components(n, (j) => j !== i && st[j] !== 1).sizes.length <= 1) continue;
          return {
            text: L(
              'Shading this cell would cut some unshaded cells off from the rest. They must stay in one piece, so it stays: circle it.',
              'Noircir cette case couperait des cases blanches du reste. Elles doivent rester d’un seul morceau : encerclez-la.',
            ),
            why: els(nb(n, i).filter((j) => st[j] === 1)),
            at: els([i]),
            play: mark([i], 2),
          };
        }
        return null;
      };
      const rules = [twinsOf, beside, sandwich, pair, cut];
      for (const rule of [...rules.filter((_, k) => k !== last), ...rules.filter((_, k) => k === last)]) {
        const found = rule();
        if (found) {
          last = rules.indexOf(rule);
          return found;
        }
      }
      // Nothing simple: follow the solution for a repeated number that's still undecided.
      const i = st.findIndex((v, j) => v === 0 && tw[j].length);
      if (i < 0) return null;
      last = -1;
      return {
        text: shade[i]
          ? L(
              `This ${nums[i]} has to go: keeping it forces a repeat or a cut elsewhere (check its row and column).`,
              `Ce ${nums[i]} doit partir : le garder force un doublon ou une coupure ailleurs (vérifiez sa rangée et sa colonne).`,
            )
          : L(
              `This ${nums[i]} has to stay: shading it forces a repeat or a cut elsewhere (check its row and column).`,
              `Ce ${nums[i]} doit rester : le noircir force un doublon ou une coupure ailleurs (vérifiez sa rangée et sa colonne).`,
            ),
        at: els([i]),
        play: mark([i], shade[i] ? 1 : 2),
      };
    };

    /**
     * What's wrong: a broken rule (touching shades, two circled twins, a shade cutting the white
     * cells apart), else a shade or circle that disagrees with the unique solution. Plain cells are
     * never mistakes. play() resets the cell to plain (the Backspace path).
     */
    const check = (): Hint | null => {
      if (done) return null;
      const off = (i: number) => (st[i] === 1) !== shade[i];
      const fix = (text: string, at: number[], why: number[] = []): Hint | null => {
        const mine = at.filter((i) => !locked[i] && st[i] !== 0);
        const i = mine.find(off) ?? mine[0];
        if (i == null) return null;
        return {
          kind: 'fix',
          text,
          why: els(why),
          at: els(at),
          action: st[i] === 1 ? L('Unshade it', 'Retirer le noir') : L('Remove the circle', 'Retirer le cercle'),
          play: () => set(i, 0),
        };
      };
      for (let i = 0; i < n * n; i++) {
        if (st[i] !== 1) continue;
        for (const j of nb(n, i)) {
          if (j < i || st[j] !== 1) continue;
          const found = fix(
            L(
              'These two shaded cells touch side by side: shaded cells never do.',
              'Ces deux cases noires se touchent par un côté : c’est interdit.',
            ),
            [i, j],
          );
          if (found) return found;
        }
      }
      for (let i = 0; i < n * n; i++) {
        if (st[i] !== 2) continue;
        for (const j of tw[i]) {
          if (j < i || st[j] !== 2) continue;
          const found = fix(
            L(
              `Both ${nums[i]}s are circled in the same line, but one of them has to be shaded: a number can’t repeat.`,
              `Les deux ${nums[i]} sont encerclés sur la même ligne, mais l’un d’eux doit être noirci : un chiffre ne peut pas se répéter.`,
            ),
            [i, j],
          );
          if (found) return found;
        }
      }
      if (components(n, (i) => st[i] !== 1).sizes.length > 1) {
        // The shade whose removal joins the white cells back (a wrong one first).
        const shaded = st.flatMap((v, i) => (v === 1 && !locked[i] ? [i] : []));
        const before = components(n, (i) => st[i] !== 1).sizes.length;
        const cutter = [...shaded.filter(off), ...shaded.filter((i) => !off(i))].find(
          (i) => components(n, (j) => j === i || st[j] !== 1).sizes.length < before,
        );
        if (cutter != null) {
          const found = fix(
            L(
              'This shaded cell cuts some white cells off from the rest. White cells must stay in one piece.',
              'Cette case noire coupe des cases blanches du reste. Les blanches doivent rester d’un seul morceau.',
            ),
            [cutter],
          );
          if (found) return found;
        }
      }
      const i = st.findIndex((v, j) => !locked[j] && v !== 0 && (v === 1) !== shade[j]);
      if (i < 0) return null;
      return fix(
        st[i] === 1
          ? L(
              `Shading this ${nums[i]} breaks no rule yet, but it leads to a dead end: it has to stay.`,
              `Noircir ce ${nums[i]} ne brise encore aucune règle, mais mène à une impasse : il doit rester.`,
            )
          : L(
              `Circling this ${nums[i]} breaks no rule yet, but it leads to a dead end: it has to be shaded.`,
              `Encercler ce ${nums[i]} ne brise encore aucune règle, mais mène à une impasse : il doit être noirci.`,
            ),
        [i],
      );
    };

    const DIRS: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    return {
      hint,
      check,
      snapshot: () => ({ st, cur }),
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
        if (e.key === ' ' || e.key === 'Enter') set(cur, (st[cur] + 1) % 3);
        else if (e.key === 'Backspace' || e.key === 'Delete') set(cur, 0);
        else return false;
        return true;
      },
    };
  },
};
