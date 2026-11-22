import { L, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, clearBtn, h, ruleBreaks } from '../core/ui';
import { cellFromPointer, edgeClasses, nb4, tint } from './logickit/kit';
import { genTiles, rectCells, type Rect } from './logickit/tilesgen';
import './tiles.css';

type Placed = Rect & { k: number };

export const tiles: PuzzleDef = {
  id: 'tiles',
  get name() {
    return L('Tiles', 'Rectangles');
  },
  category: 'logic',
  undo: true,
  get rules() {
    return L('Split into rectangles, each holding one number = its area.', 'Découpez en rectangles contenant un nombre égal à leur aire.');
  },
  help: () => ({
    goal: L(
      'Cut the whole grid into rectangles. Each rectangle holds exactly one number, equal to the number of cells it covers.',
      'Découpez toute la grille en rectangles. Chaque rectangle contient un seul nombre, égal au nombre de cases qu’il couvre.',
    ),
    steps: [
      L(
        'Every cell belongs to one rectangle; each rectangle has one number, and that number is its area.',
        'Chaque case appartient à un rectangle; chaque rectangle a un seul nombre, qui est son aire.',
      ),
      L(
        'Drag from one corner to the opposite corner to draw a rectangle. It replaces any rectangle it overlaps.',
        'Glissez d’un coin au coin opposé pour tracer un rectangle. Il remplace ceux qu’il chevauche.',
      ),
      L(
        'Tap a rectangle to remove it. Tap a 1 to make a one-cell rectangle.',
        'Touchez un rectangle pour l’enlever. Touchez un 1 pour faire un rectangle d’une case.',
      ),
      L(
        'Rectangles that break the rule turn red and count as a mistake. The footer counts the correct ones; Clear wipes the board.',
        'Les rectangles fautifs deviennent rouges et comptent comme une erreur. Le bas de la carte compte les bons; Effacer vide la grille.',
      ),
    ],
    tips: [
      L(
        'Start with numbers that fit only one way, like big numbers near a corner.',
        'Commencez par les nombres qui n’entrent que d’une façon, comme les gros nombres près d’un coin.',
      ),
      L(
        'A cell only one number can reach must belong to that number’s rectangle.',
        'Une case qu’un seul nombre peut atteindre fait partie de son rectangle.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [30, 60, 100, 160, 260]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const n = byLevel(d, [5, 6, 7, 8, 10]);
    const maxArea = byLevel(d, [6, 8, 9, 10, 12]);
    const { clue, rects: solRects } = genTiles(n, maxArea, rng);
    const clueCount = clue.filter((v) => v > 0).length;

    let rects: Placed[] = [];
    let start = -1,
      cur = -1;
    let done = false;

    const grid = board(n, n, 'lk-plate');
    const cells = clue.map((v, i) => {
      const el = h('div', { class: 'cell', 'data-i': i }, v || '');
      grid.append(el);
      return el;
    });
    /** Counts a mistake when a drawn rectangle breaks the rule. */
    const watch = ruleBreaks(grid, ctx.mistake);

    const span = (a: number, b: number): Rect => ({
      r0: Math.min(Math.floor(a / n), Math.floor(b / n)),
      c0: Math.min(a % n, b % n),
      r1: Math.max(Math.floor(a / n), Math.floor(b / n)),
      c1: Math.max(a % n, b % n),
    });
    const inRect = (q: Rect, i: number) => {
      const r = Math.floor(i / n),
        c = i % n;
      return r >= q.r0 && r <= q.r1 && c >= q.c0 && c <= q.c1;
    };
    const valid = (q: Rect) => {
      const cs = rectCells(q, n).filter((i) => clue[i] > 0);
      return cs.length === 1 && clue[cs[0]] === (q.r1 - q.r0 + 1) * (q.c1 - q.c0 + 1);
    };
    const ownerMap = () => {
      const owner = new Array<number>(n * n).fill(-1);
      rects.forEach((q, k) => rectCells(q, n).forEach((i) => (owner[i] = k)));
      return owner;
    };

    const render = () => {
      const owner = ownerMap();
      const edges = edgeClasses(n, n, (i) => owner[i]);
      const ok = rects.map(valid);
      const prev = start >= 0 && cur >= 0 ? span(start, cur) : null;
      cells.forEach((el, i) => {
        const o = owner[i];
        const cls = ['cell', edges[i]];
        if (o >= 0 && !ok[o]) cls.push('err');
        if (prev && inRect(prev, i)) cls.push('pv');
        el.className = cls.join(' ');
        el.setAttribute('style', o >= 0 ? `--rc:${tint(rects[o].k, 45)}` : '');
      });
      const good = ok.filter(Boolean).length;
      ctx.status(`${good} / ${P(clueCount, ['rectangle', 'rectangles'], ['rectangle', 'rectangles'])}`);
      return owner.every((o) => o >= 0) && ok.every(Boolean);
    };

    const place = (q: Rect) => {
      rects = rects.filter((o) => o.r1 < q.r0 || o.r0 > q.r1 || o.c1 < q.c0 || o.c0 > q.c1);
      const owner = ownerMap();
      const near = new Set<number>();
      for (const i of rectCells(q, n)) for (const j of nb4(i, n, n)) if (owner[j] >= 0 && !inRect(q, j)) near.add(rects[owner[j]].k);
      const off = (rects.length * 3 + q.r0 + q.c0) % 8;
      let k = 0;
      while (k < 8 && near.has((k + off) % 8)) k++;
      rects.push({ ...q, k: (k + off) % 8 });
    };

    const finish = () => {
      if (start < 0) return;
      const a = start,
        b = cur;
      start = cur = -1;
      if (b >= 0) {
        if (a === b) {
          const owner = ownerMap();
          if (owner[a] >= 0) rects.splice(owner[a], 1);
          else if (clue[a] === 1) place(span(a, a));
        } else place(span(a, b));
      }
      const won = render();
      watch();
      if (won && !done) {
        done = true;
        ctx.solved();
      }
    };

    grid.addEventListener('pointerdown', (e) => {
      if (done || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const i = cellFromPointer(grid, e, n, n);
      if (i < 0) return;
      ctx.touch();
      e.preventDefault();
      try {
        grid.setPointerCapture(e.pointerId);
      } catch {
        /* not capturable */
      }
      start = cur = i;
      render();
    });
    grid.addEventListener('pointermove', (e) => {
      if (start < 0) return;
      const i = cellFromPointer(grid, e, n, n);
      if (i >= 0 && i !== cur) {
        cur = i;
        render();
      }
    });
    grid.addEventListener('pointerup', (e) => {
      if (start < 0) return;
      const i = cellFromPointer(grid, e, n, n);
      if (i >= 0) cur = i;
      finish();
    });
    grid.addEventListener('pointercancel', () => {
      start = cur = -1;
      render();
    });
    grid.addEventListener('contextmenu', (e) => e.preventDefault());

    const sv = ctx.saved as { rects?: unknown } | undefined;
    if (Array.isArray(sv?.rects)) {
      for (const q of sv.rects as Placed[]) {
        const okNum = [q?.r0, q?.c0, q?.r1, q?.c1, q?.k].every((x) => Number.isInteger(x) && x >= 0);
        if (okNum && q.r1 < n && q.c1 < n && q.r0 <= q.r1 && q.c0 <= q.c1)
          rects.push({ r0: q.r0, c0: q.c0, r1: q.r1, c1: q.c1, k: q.k % 8 });
      }
    }
    root.append(grid);
    render();
    watch(false);
    ctx.controls(
      clearBtn(() => {
        if (done || !rects.length) return;
        ctx.touch();
        rects = [];
        start = cur = -1;
        render();
        watch(false);
      }),
    );
    // Guide: shapes that fit only one way, cells only one number can reach.
    let lastKind = '';
    let taught = false;
    /** Mention the drag gesture on the first rectangle the guide draws. */
    const teach = (h0: Hint, drag: boolean): Hint => {
      if (!drag || taught) return h0;
      taught = true;
      return { ...h0, text: h0.text + L(' Drag from one corner to the opposite one.', ' Glissez d’un coin au coin opposé.') };
    };
    const solKey = new Set(solRects.map((q) => `${q.r0},${q.c0},${q.r1},${q.c1}`));
    /** A rectangle that isn't in the (unique) solution: a broken rule first, else a dead end. */
    const check = (): Hint | null => {
      if (done) return null;
      const wrongs = rects.filter((q) => !solKey.has(`${q.r0},${q.c0},${q.r1},${q.c1}`));
      if (!wrongs.length) return null;
      const fix = (q: Rect, text: string, why: number[] = []): Hint => ({
        kind: 'fix',
        text: text + L(' Tap it to remove it.', ' Touchez-le pour l’enlever.'),
        why: why.map((i) => cells[i]),
        at: rectCells(q, n).map((i) => cells[i]),
        action: L('Remove the rectangle', 'Enlever le rectangle'),
        play: () => {
          start = cur = q.r0 * n + q.c0;
          finish();
        },
      });
      for (const q of wrongs) {
        const nums = rectCells(q, n).filter((i) => clue[i] > 0);
        const area = (q.r1 - q.r0 + 1) * (q.c1 - q.c0 + 1);
        if (!nums.length)
          return fix(
            q,
            L(
              'This rectangle has no number: each one holds exactly one.',
              'Ce rectangle n’a aucun nombre : chacun en contient exactement un.',
            ),
          );
        if (nums.length > 1)
          return fix(
            q,
            L(
              `This rectangle holds ${nums.length} numbers: each one holds exactly one.`,
              `Ce rectangle contient ${nums.length} nombres : chacun en contient exactement un.`,
            ),
            nums,
          );
        if (area !== clue[nums[0]])
          return fix(
            q,
            L(
              `This rectangle covers ${area} cells, but its number is ${clue[nums[0]]}.`,
              `Ce rectangle couvre ${area} cases, mais son nombre est ${clue[nums[0]]}.`,
            ),
            nums,
          );
      }
      return fix(
        wrongs[0],
        L(
          'This rectangle breaks no rule yet, but it leads to a dead end: the numbers around it can’t all get their rectangles.',
          'Ce rectangle ne brise encore aucune règle, mais il mène à une impasse : les nombres autour ne peuvent pas tous avoir leur rectangle.',
        ),
      );
    };
    const hint = (): Hint | null => {
      if (done) return null;
      const owner = ownerMap();
      const open = clue.map((v, i) => (v > 0 && owner[i] < 0 ? i : -1)).filter((i) => i >= 0);
      /** Every rectangle the number at `p` could still take. */
      const shapes = (p: number): Rect[] => {
        const a = clue[p],
          pr = Math.floor(p / n),
          pc = p % n;
        const out: Rect[] = [];
        for (let h0 = 1; h0 <= a; h0++) {
          if (a % h0) continue;
          const w0 = a / h0;
          for (let r0 = pr - h0 + 1; r0 <= pr; r0++)
            for (let c0 = pc - w0 + 1; c0 <= pc; c0++) {
              const q = { r0, c0, r1: r0 + h0 - 1, c1: c0 + w0 - 1 };
              if (r0 < 0 || c0 < 0 || q.r1 >= n || q.c1 >= n) continue;
              const cs = rectCells(q, n);
              if (cs.every((i) => owner[i] < 0 && (i === p || !clue[i]))) out.push(q);
            }
        }
        return out;
      };
      const all = new Map(open.map((p) => [p, shapes(p)]));
      const dims = (q: Rect) => `${q.r1 - q.r0 + 1}×${q.c1 - q.c0 + 1}`;
      const draw = (q: Rect) => () => {
        start = q.r0 * n + q.c0;
        cur = q.r1 * n + q.c1;
        finish();
      };
      const cands: { kind: string; hint: Hint }[] = [];
      for (const p of open) {
        const qs = all.get(p)!;
        if (clue[p] === 1)
          cands.push({
            kind: 'one',
            hint: {
              text: L('A 1 is a rectangle all by itself: tap it.', 'Un 1 forme un rectangle à lui seul : touchez-le.'),
              at: [cells[p]],
              play: draw(qs[0] ?? { r0: Math.floor(p / n), c0: p % n, r1: Math.floor(p / n), c1: p % n }),
            },
          });
        else if (qs.length === 1)
          cands.push({
            kind: 'only',
            hint: {
              text: L(
                `This ${clue[p]} fits only one way, as a ${dims(qs[0])} block: every other shape hits the edge, a number or a rectangle.`,
                `Ce ${clue[p]} n’entre que d’une façon, en bloc de ${dims(qs[0])} : toute autre forme touche le bord, un nombre ou un rectangle.`,
              ),
              why: [cells[p]],
              at: rectCells(qs[0], n).map((i) => cells[i]),
              play: draw(qs[0]),
            },
          });
      }
      // A free cell that only one number can reach.
      for (let x = 0; x < n * n && cands.length < 8; x++) {
        if (owner[x] >= 0) continue;
        const by = open.filter((p) => all.get(p)!.some((q) => inRect(q, x)));
        if (by.length !== 1) continue;
        const p = by[0];
        const qs = all.get(p)!.filter((q) => inRect(q, x));
        if (qs.length !== 1 || all.get(p)!.length === 1) continue;
        cands.push({
          kind: 'reach',
          hint: {
            text: L(
              `Only the ${clue[p]} can reach this cell, and just one of its shapes covers it: a ${dims(qs[0])} block.`,
              `Seul le ${clue[p]} peut atteindre cette case, et une seule de ses formes la couvre : un bloc de ${dims(qs[0])}.`,
            ),
            why: [cells[x]],
            at: rectCells(qs[0], n)
              .filter((i) => i !== x)
              .map((i) => cells[i]),
            play: draw(qs[0]),
          },
        });
        break;
      }
      const order = ['only', 'one', 'reach'];
      cands.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
      const pick = cands.find((c) => c.kind !== lastKind) ?? cands[0];
      if (pick) {
        lastKind = pick.kind;
        return teach(pick.hint, pick.kind !== 'one');
      }
      lastKind = '';
      // No forced shape: take the intended one for the number with the fewest options.
      const p = open.sort((a, b) => all.get(a)!.length - all.get(b)!.length)[0];
      const q = p == null ? undefined : solRects.find((r) => inRect(r, p));
      if (!q || !rectCells(q, n).every((i) => owner[i] < 0)) return null;
      return teach(
        {
          text: L(
            `This ${clue[p]} fits ${all.get(p)!.length} ways, but only this ${dims(q)} block leaves room for the numbers around it.`,
            `Ce ${clue[p]} entre de ${all.get(p)!.length} façons, mais seul ce bloc de ${dims(q)} laisse de la place aux nombres autour.`,
          ),
          why: [cells[p]],
          at: rectCells(q, n).map((i) => cells[i]),
          play: draw(q),
        },
        true,
      );
    };
    return { snapshot: () => ({ rects }), hint, check };
  },
};
