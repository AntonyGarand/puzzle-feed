import { L, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, h, pad } from '../core/ui';
import { cellFromPointer, nb4, tint } from './logickit/kit';
import { candidates, exits, genFill, groupReach, regions } from './logickit/fillgen';
import './fill.css';

const join = (xs: (string | number)[], w: string) =>
  xs.length <= 1 ? String(xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} ${w} ${xs[xs.length - 1]}`;
/** "2 or 3" / "2 ou 3". */
const or = (xs: (string | number)[]) => join(xs, L('or', 'ou'));
/** Numbers set in a 1..9 bitmask. */
const bits = (m: number) => Array.from({ length: 9 }, (_, k) => k + 1).filter((v) => m & (1 << v));
/** "2 more cells" / "de 2 cases de plus" ("d’une case de plus"). */
/** Fill colour per number: palette tints for 1–8, a neutral ink wash for 9. */
const shade = (v: number) => (v > 8 ? 'color-mix(in srgb, var(--ink) 16%, var(--cell))' : tint(v - 1, 34));
const more = (k: number) => L(k === 1 ? '1 more cell' : `${k} more cells`, k === 1 ? 'd’une case de plus' : `de ${k} cases de plus`);

export const fill: PuzzleDef = {
  id: 'fill',
  get name() {
    return L('Fill', 'Remplissage');
  },
  category: 'logic',
  undo: true,
  get rules() {
    return L('Each group of equal numbers has that many cells.', 'Chaque groupe de nombres égaux compte autant de cases.');
  },
  help: () => ({
    goal: L(
      'Write a number in every cell so the grid splits into groups, each with as many cells as its number.',
      'Écrivez un nombre dans chaque case pour diviser la grille en groupes qui comptent chacun autant de cases que leur nombre.',
    ),
    steps: [
      L(
        'Touching cells with the same number form one group: a group of 3s has exactly three cells.',
        'Les cases voisines qui ont le même nombre forment un groupe : un groupe de 3 compte exactement trois cases.',
      ),
      L(
        'So two groups of the same size can never share an edge; they would merge into one too-big group.',
        'Deux groupes de même taille ne peuvent donc jamais se toucher par un côté : ils formeraient un seul groupe trop grand.',
      ),
      L(
        'Tap a cell, then a number on the pad (or type it). Tap the same number again, or ✕, to clear it.',
        'Touchez une case, puis un nombre du pavé (ou tapez-le). Retouchez le même nombre, ou ✕, pour l’effacer.',
      ),
      L(
        'Drag from a numbered cell across empty cells to copy its number into them.',
        'Glissez à partir d’une case numérotée sur des cases vides pour y copier son nombre.',
      ),
      L(
        'Thick lines show where groups end. A group that is too big, or boxed in too small, turns red.',
        'Les traits épais montrent où finissent les groupes. Un groupe trop grand, ou enfermé trop petit, passe au rouge.',
      ),
      L(
        'Keyboard: arrow keys move, number keys fill, Backspace or 0 clears.',
        'Clavier : flèches pour se déplacer, chiffres pour remplir, Retour arrière ou 0 pour effacer.',
      ),
    ],
    tips: [
      L(
        'A group with only one free cell next to it must grow into that cell.',
        'Un groupe qui n’a qu’une case libre à côté de lui doit s’étendre dans cette case.',
      ),
      L(
        'Once a group is complete, the cells around it can’t take its number.',
        'Une fois un groupe complet, les cases autour ne peuvent pas prendre son nombre.',
      ),
      L(
        'An empty cell walled in by complete groups is a 1 by itself.',
        'Une case vide entourée de groupes complets est un 1 à elle seule.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [45, 90, 160, 260, 400]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const n = byLevel(d, [5, 6, 7, 8, 9]);
    const max = n;
    const { sol, clue } = genFill({ n, max, minGivens: byLevel(d, [12, 14, 0, 0, 0]), deep: d >= 3 }, rng);
    const given = clue.map((v) => v > 0);
    const vals = [...clue];
    let sel = given.indexOf(false);
    let done = false;
    let bad = new Set<number>();

    const grid = board(n, n, 'fill-plate');
    const cells = vals.map((_, i) => {
      const el = h('button', {
        type: 'button',
        class: 'cell',
        'data-i': i,
        onclick: () => {
          if (dragged) dragged = false;
          else select(i);
        },
      });
      grid.append(el);
      return el;
    });

    /** Cells of groups that break the rules: too big, or boxed in before reaching their size. */
    const broken = () => {
      const rg = regions(n, vals);
      const out = new Set<number>();
      rg.cells.forEach((cs, r) => {
        const v = rg.val[r];
        const boxed = cs.length < v && cs.every((i) => nb4(i, n, n).every((j) => vals[j]));
        if (cs.length > v || boxed) for (const i of cs) out.add(i);
      });
      return out;
    };

    const render = () => {
      bad = broken();
      const differs = (i: number, j: number) => vals[i] !== vals[j];
      cells.forEach((el, i) => {
        const r = Math.floor(i / n),
          c = i % n;
        const cls = ['cell'];
        if (r > 0 && differs(i, i - n)) cls.push('bt');
        if (c < n - 1 && differs(i, i + 1)) cls.push('br');
        if (r < n - 1 && differs(i, i + n)) cls.push('bb');
        if (c > 0 && differs(i, i - 1)) cls.push('bl');
        if (given[i]) cls.push('given');
        if (i === sel) cls.push('sel');
        if (bad.has(i)) cls.push('err');
        el.className = cls.join(' ');
        el.textContent = vals[i] ? String(vals[i]) : '';
        el.setAttribute('style', vals[i] ? `--rc:${shade(vals[i])}` : '');
      });
      const left = vals.filter((v) => !v).length;
      ctx.status(P(left, ['cell left', 'cells left'], ['case à remplir', 'cases à remplir']));
    };

    /** After a change: count a mistake if a new broken group appeared, and check for the win. */
    const settle = (before: Set<number>) => {
      render();
      if ([...bad].some((i) => !before.has(i))) ctx.mistake();
      if (!done && bad.size === 0 && vals.every((v) => v > 0)) {
        done = true;
        ctx.solved();
      }
    };

    const select = (i: number) => {
      sel = i;
      render();
    };

    const input = (v: number) => {
      if (done || sel < 0 || given[sel]) return;
      ctx.touch();
      const before = bad;
      vals[sel] = vals[sel] === v ? 0 : v;
      settle(before);
    };

    // Drag from a numbered cell over empty cells to copy its number.
    let dragV = 0,
      last = -1,
      dragged = false,
      stroke: Set<number> | null = null;
    const paint = (i: number) => {
      if (given[i] || vals[i] || !dragV) return false;
      vals[i] = dragV;
      dragged = true;
      return true;
    };
    const endStroke = () => {
      if (stroke) settle(stroke);
      stroke = null;
      dragV = 0;
      last = -1;
    };
    grid.addEventListener('pointerdown', (e) => {
      dragged = false;
      if (done || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const i = cellFromPointer(grid, e, n, n);
      if (i < 0 || !vals[i]) return;
      dragV = vals[i];
      last = i;
    });
    grid.addEventListener('pointermove', (e) => {
      if (!dragV) return;
      const i = cellFromPointer(grid, e, n, n);
      if (i < 0 || i === last) return;
      last = i;
      if (!stroke) {
        ctx.touch();
        stroke = bad;
      }
      if (paint(i)) render();
    });
    grid.addEventListener('pointerup', endStroke);
    grid.addEventListener('pointercancel', endStroke);
    grid.addEventListener('contextmenu', (e) => e.preventDefault());

    const saved = ctx.saved as { vals?: unknown[]; sel?: number } | undefined;
    if (Array.isArray(saved?.vals) && saved.vals.length === vals.length)
      saved.vals.forEach((v, i) => {
        if (!given[i] && Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max) vals[i] = v as number;
      });
    if (Number.isInteger(saved?.sel) && saved!.sel! >= -1 && saved!.sel! < vals.length) sel = saved!.sel!;

    const keys: { label: string; value: string; aria?: string }[] = Array.from({ length: max }, (_, k) => ({
      label: String(k + 1),
      value: String(k + 1),
    }));
    keys.push({ label: '✕', value: '0', aria: L('Erase', 'Effacer') });
    root.append(
      grid,
      pad(keys, (v) => {
        if (v !== '0') input(Number(v));
        else if (sel >= 0 && vals[sel]) input(vals[sel]);
      }),
    );
    render();

    // ---------- guide ----------
    let lastKind = '';
    let taught = false;
    const els = (is: number[]) => is.map((i) => cells[i]);
    const place = (i: number, v: number) => () => {
      select(i);
      input(v);
    };
    /** Same path as a drag: copy `v` into the empty cells `to`. */
    const flood = (to: number[], v: number) => () => {
      dragV = v;
      stroke = bad;
      for (const i of to) paint(i);
      dragged = false;
      endStroke();
    };

    /** A wrong number (the answer is unique): one in a broken group first, with the rule it breaks. */
    const check = (): Hint | null => {
      if (done) return null;
      const wrongs = vals.flatMap((v, i) => (v > 0 && !given[i] && v !== sol[i] ? [i] : []));
      if (!wrongs.length) return null;
      const rg = regions(n, vals);
      // A red group of right numbers is boxed in by a wrong neighbour.
      const boxer = wrongs.find((i) => !bad.has(i) && nb4(i, n, n).some((j) => bad.has(j) && vals[j] === sol[j] && vals[j] !== vals[i]));
      const wrong = wrongs.find((i) => bad.has(i)) ?? boxer ?? wrongs[0];
      const v = vals[wrong];
      const group = rg.cells[rg.id[wrong]];
      const size = group.length;
      if (wrong === boxer) {
        const j = nb4(wrong, n, n).find((x) => bad.has(x) && vals[x] === sol[x] && vals[x] !== v)!;
        const w = vals[j];
        return {
          kind: 'fix',
          text: L(
            `This ${v} boxes in the group of ${w}s next to it before it reaches ${w} cells.`,
            `Ce ${v} enferme le groupe de ${w} voisin avant qu’il atteigne ${w} cases.`,
          ),
          why: els(rg.cells[rg.id[j]]),
          at: [cells[wrong]],
          action: L(`Clear the ${v}`, `Effacer le ${v}`),
          play: place(wrong, v),
        };
      }
      return {
        kind: 'fix',
        text: !bad.has(wrong)
          ? L(
              `This ${v} breaks no rule yet, but it leads to a dead end: the numbers around it can’t all finish their groups.`,
              `Ce ${v} ne brise encore aucune règle, mais il mène à une impasse : les nombres autour ne peuvent pas tous compléter leurs groupes.`,
            )
          : size > v
            ? L(
                `This group of ${v}s has ${size} cells: a ${v} groups exactly ${v} cells.`,
                `Ce groupe de ${v} compte ${size} cases : un ${v} regroupe exactement ${v} cases.`,
              )
            : L(
                `This group of ${v}s is boxed in at ${size} ${size === 1 ? 'cell' : 'cells'}: it can never reach ${v}.`,
                `Ce groupe de ${v} est enfermé à ${size} case${size > 1 ? 's' : ''} : il ne pourra jamais atteindre ${v}.`,
              ),
        why: bad.has(wrong) ? els(group) : [],
        at: [cells[wrong]],
        action: L(`Clear the ${v}`, `Effacer le ${v}`),
        play: place(wrong, v),
      };
    };

    const hint = (): Hint | null => {
      if (done) return null;
      // A wrong number first: nothing else can be trusted until it's gone.
      const fix = check();
      if (fix) return fix;
      const rg = regions(n, vals);
      const { cand, join: jn, room } = candidates(n, max, vals, rg);
      const fresh = vals.every((v, i) => !v || given[i]);
      const cands: { kind: string; hint: Hint }[] = [];
      const ok = (is: number[], v: number) => is.length > 0 && is.every((i) => !vals[i] && sol[i] === v);

      for (let r = 0; r < rg.cells.length; r++) {
        const v = rg.val[r],
          s = rg.cells[r].length;
        if (s >= v) continue;
        const ex = exits(n, vals, cand, rg, r);
        if (ex.length === 1 && ok(ex, v)) {
          cands.push({
            kind: 'exit',
            hint: {
              text: L(
                `This ${v} still needs ${more(v - s)}, and this is the only free cell next to it that can take a ${v}.`,
                `Ce ${v} a encore besoin ${more(v - s)}, et c’est la seule case libre voisine qui peut recevoir un ${v}.`,
              ),
              why: els(rg.cells[r]),
              at: [cells[ex[0]]],
              play: place(ex[0], v),
            },
          });
          continue;
        }
        const { total, via } = groupReach(n, max, vals, cand, rg, r);
        if (total !== v) continue;
        const need = via.filter((y) => groupReach(n, max, vals, cand, rg, r, y).total < v);
        if (need.length === via.length && via.length > 1 && ok(via, v))
          cands.push({
            kind: 'room',
            hint: {
              text: L(
                `This ${v} needs ${more(v - s)}, and exactly that many free cells are within its reach, so they’re all ${v}s.`,
                `Ce ${v} a besoin ${more(v - s)}, et il y a juste assez de cases libres à sa portée : ce sont toutes des ${v}.`,
              ),
              why: els(rg.cells[r]),
              at: els(via),
              play: flood(via, v),
            },
          });
        else if (need.length && ok([need[0]], v))
          cands.push({
            kind: 'neck',
            hint: {
              text: L(
                `This ${v} needs ${more(v - s)}, and every way to reach them goes through this cell.`,
                `Ce ${v} a besoin ${more(v - s)}, et tous les chemins pour les atteindre passent par cette case.`,
              ),
              why: els(rg.cells[r]),
              at: [cells[need[0]]],
              play: place(need[0], v),
            },
          });
      }
      for (let x = 0; x < n * n; x++) {
        if (vals[x] || cand[x] & (cand[x] - 1) || !cand[x]) continue;
        const v = bits(cand[x])[0];
        if (!ok([x], v)) continue;
        const nbs = nb4(x, n, n).filter((j) => vals[j]);
        const jv = bits(jn[x]).filter((w) => nbs.some((j) => vals[j] === w));
        const rv = bits(room[x]);
        const walled = nbs.length === nb4(x, n, n).length && nbs.every((j) => rg.cells[rg.id[j]].length === vals[j]);
        const parts = [
          jv.length ? L(`a ${or(jv)} would make the group next to it too big`, `un ${or(jv)} rendrait le groupe voisin trop grand`) : '',
          rv.length > 3
            ? L(
                `numbers from ${rv[0]} to ${rv[rv.length - 1]} wouldn’t have room`,
                `les nombres de ${rv[0]} à ${rv[rv.length - 1]} n’auraient pas la place`,
              )
            : rv.length
              ? L(`a ${or(rv)} wouldn’t have room`, `un ${or(rv)} n’aurait pas la place`)
              : '',
        ].filter(Boolean);
        cands.push({
          kind: v === 1 ? 'one' : 'single',
          hint: {
            text:
              v === 1 && walled
                ? L(
                    `Every group around this cell is already complete, so it’s a group of its own: a 1.`,
                    `Tous les groupes autour de cette case sont déjà complets : elle forme un groupe à elle seule, un 1.`,
                  )
                : L(`Only ${v} fits here: ${parts.join('; ')}.`, `Seul un ${v} va ici : ${parts.join('; ')}.`),
            why: els(nbs),
            at: [cells[x]],
            play: place(x, v),
          },
        });
      }

      const order = ['exit', 'one', 'room', 'single', 'neck'];
      cands.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
      let pick = cands.find((c) => c.kind !== lastKind) ?? cands[0];
      if (!pick) {
        // Nothing forced by a single rule: extend the group with the fewest options, from the answer.
        const opts: { x: number; v: number; r: number }[] = [];
        for (let r = 0; r < rg.cells.length; r++) {
          const v = rg.val[r];
          if (rg.cells[r].length >= v) continue;
          for (const x of exits(n, vals, cand, rg, r)) if (sol[x] === v) opts.push({ x, v, r });
        }
        const o = opts[0];
        const x = o ? o.x : vals.findIndex((v) => !v);
        if (x < 0) return null;
        const v = sol[x];
        pick = {
          kind: 'guess',
          hint: {
            text: o
              ? L(
                  `This ${v} still needs ${more(v - rg.cells[o.r].length)}. Growing any other way leaves a neighbour stuck, so it grows here.`,
                  `Ce ${v} a encore besoin ${more(v - rg.cells[o.r].length)}. Toute autre direction bloque un voisin : il s’étend donc ici.`,
                )
              : L(
                  `Try the other numbers here: only ${v} leads to a full grid.`,
                  `Essayez les autres nombres ici : seul un ${v} mène à une grille complète.`,
                ),
            why: o ? els(rg.cells[o.r]) : [],
            at: [cells[x]],
            play: place(x, v),
          },
        };
      }
      lastKind = pick.kind;
      const hnt = pick.hint;
      if (!taught && fresh) {
        taught = true;
        const many = hnt.at.length > 1;
        return {
          ...hnt,
          text:
            hnt.text +
            (many
              ? L(' Drag from the number across them.', ' Glissez à partir du nombre sur ces cases.')
              : L(' Tap the cell, then the number.', ' Touchez la case, puis le nombre.')),
        };
      }
      return hnt;
    };

    return {
      snapshot: () => ({ vals, sel }),
      hint,
      check,
      onKey(e) {
        const k = Number(e.key);
        if (k >= 1 && k <= max) {
          input(k);
          return true;
        }
        if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
          if (sel >= 0 && vals[sel]) input(vals[sel]);
          return true;
        }
        const mv: Record<string, number> = { ArrowUp: -n, ArrowDown: n, ArrowLeft: -1, ArrowRight: 1 };
        if (mv[e.key] != null) {
          const nx = (sel < 0 ? 0 : sel) + mv[e.key];
          if (nx >= 0 && nx < n * n && !(Math.abs(mv[e.key]) === 1 && Math.floor(nx / n) !== Math.floor(sel / n))) select(nx);
          return true;
        }
        return false;
      },
    };
  },
};
