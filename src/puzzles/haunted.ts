import './haunted.css';
import { L, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { addTally, board, h, s, setTally } from '../core/ui';
import { ALL, bit, genHaunted, GHOST, narrowLine, pathRange, propagate, seen, single, VAMPIRE, ZOMBIE } from './logickit/hauntedgen';

const kindName = (v: number) => (v === GHOST ? L('ghost', 'fantôme') : v === VAMPIRE ? L('vampire', 'vampire') : L('zombie', 'zombie'));
const kindPlural = (v: number) =>
  v === GHOST ? L('ghosts', 'fantômes') : v === VAMPIRE ? L('vampires', 'vampires') : L('zombies', 'zombies');
const KEYS: Record<string, number> = { g: GHOST, f: GHOST, v: VAMPIRE, z: ZOMBIE, '1': GHOST, '2': VAMPIRE, '3': ZOMBIE };

/** Original monster glyphs, drawn with tokens only. */
function glyph(v: number) {
  const ink = { class: 'ink' };
  if (v === GHOST)
    return s(
      'svg',
      { viewBox: '0 0 100 100', class: 'hn-m hn-g', 'aria-hidden': 'true' },
      s('path', { class: 'body', d: 'M22 86V46a28 28 0 0 1 56 0v40l-9.3-8-9.4 8-9.3-8-9.3 8-9.4-8z' }),
      s('ellipse', { ...ink, cx: 40, cy: 46, rx: 5, ry: 7 }),
      s('ellipse', { ...ink, cx: 60, cy: 46, rx: 5, ry: 7 }),
      s('ellipse', { ...ink, cx: 50, cy: 62, rx: 5, ry: 4 }),
    );
  if (v === VAMPIRE)
    return s(
      'svg',
      { viewBox: '0 0 100 100', class: 'hn-m hn-v', 'aria-hidden': 'true' },
      s('path', { class: 'cape', d: 'M14 90 30 56h40l16 34z' }),
      s('circle', { class: 'body', cx: 50, cy: 46, r: 26 }),
      s('path', { ...ink, d: 'M24 44c0-18 12-26 26-26s26 8 26 26l-10-9-16 11-16-11z' }),
      s('circle', { ...ink, cx: 41, cy: 50, r: 4 }),
      s('circle', { ...ink, cx: 59, cy: 50, r: 4 }),
      s('path', { class: 'fang', d: 'M40 61h20M42 61l3 8 3-8M52 61l3 8 3-8' }),
    );
  return s(
    'svg',
    { viewBox: '0 0 100 100', class: 'hn-m hn-z', 'aria-hidden': 'true' },
    s('rect', { class: 'body', x: 22, y: 18, width: 56, height: 66, rx: 12 }),
    s('path', { class: 'line', d: 'M34 42l12 12M46 42 34 54M30 30h20M36 26v8M44 26v8M34 70h32M40 66v8M48 66v8M56 66v8' }),
    s('circle', { ...ink, cx: 62, cy: 48, r: 6 }),
  );
}

const mirrorSvg = (m: number) =>
  s(
    'svg',
    { viewBox: '0 0 100 100', class: 'hn-mirror', 'aria-hidden': 'true' },
    s('line', { class: 'frame', x1: 14, y1: m === 1 ? 86 : 14, x2: 86, y2: m === 1 ? 14 : 86 }),
    s('line', { class: 'glass', x1: 14, y1: m === 1 ? 86 : 14, x2: 86, y2: m === 1 ? 14 : 86 }),
  );

export const haunted: PuzzleDef = {
  id: 'haunted',
  get name() {
    return L('Haunted', 'Hanté');
  },
  category: 'logic',
  undo: true,
  get rules() {
    return L('Fill with monsters; edge numbers count what is seen.', 'Placez les monstres; les bords comptent ceux vus.');
  },
  help: () => ({
    goal: L(
      'Put a ghost, a vampire or a zombie in every empty cell so the totals and every number around the edge are right.',
      'Placez un fantôme, un vampire ou un zombie dans chaque case vide pour respecter les totaux et chaque nombre du pourtour.',
    ),
    steps: [
      L(
        'A number on the edge counts the monsters you see looking into the grid from there. The line of sight bounces off the diagonal mirrors.',
        'Un nombre du pourtour compte les monstres vus en regardant dans la grille de cet endroit. Le regard rebondit sur les miroirs en diagonale.',
      ),
      L(
        'Vampires are seen only directly, before the first mirror. Ghosts are seen only in a mirror, after a bounce. Zombies are always seen.',
        'Les vampires ne se voient que directement, avant le premier miroir. Les fantômes ne se voient que dans un miroir, après un rebond. Les zombies se voient toujours.',
      ),
      L(
        'A monster the line passes twice counts twice. The keys under the grid show how many of each are left to place, out of the total.',
        'Un monstre croisé deux fois par le regard compte deux fois. Les touches sous la grille montrent combien il en reste à placer, sur le total.',
      ),
      L(
        'Tap a cell, then a monster key. Tap the same key again, or ✕, to clear it. Tap an edge number to light up its line.',
        'Touchez une case, puis une touche de monstre. Retouchez la même touche, ou ✕, pour l’effacer. Touchez un nombre du bord pour éclairer sa ligne.',
      ),
      L(
        'Keyboard: arrows move, G, V, Z (or 1, 2, 3) place, Backspace clears. A number turns red once it can no longer be met.',
        'Clavier : flèches pour se déplacer, G (ou F), V, Z (ou 1, 2, 3) pour placer, Retour arrière pour effacer. Un nombre rougit s’il ne peut plus être respecté.',
      ),
    ],
    tips: [
      L(
        'A 0 is a gift: before its first mirror only ghosts stay hidden, after it only vampires.',
        'Un 0 est un cadeau : avant son premier miroir, seuls les fantômes restent cachés; après, seuls les vampires.',
      ),
      L(
        'A cell a line sees both directly and in a mirror always counts for it at least once.',
        'Une case vue directement et dans un miroir par la même ligne ne peut pas lui échapper : elle compte au moins une fois.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [60, 100, 160, 260, 420]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const n = byLevel(d, [4, 5, 5, 6, 7]);
    const p = genHaunted(n, byLevel(d, [0.4, 0.4, 0.45, 0.45, 0.45]), byLevel(d, [0.85, 0.7, 0.45, 0.45, 0.35]), rng);
    const { mir, sol, givens, paths, clue, on, totals } = p;
    const N = n * n;
    const open = [...mir.keys()].filter((i) => !mir[i]);
    const vals = givens.slice();
    let sel = open.find((i) => !givens[i]) ?? -1;
    let lit = -1;
    let done = false;

    // Board: clue ring around the n×n cells.
    const grid = board(n + 2, n + 2, 'hn-grid');
    const baseCls: string[] = [];
    const cells = mir.map((m, i) => {
      if (m) {
        baseCls[i] = 'cell hn-mir';
        return h('div', { class: baseCls[i] }, mirrorSvg(m));
      }
      baseCls[i] = givens[i] ? 'cell given' : 'cell';
      return h(
        'button',
        { type: 'button', class: baseCls[i], 'data-i': i, 'aria-label': L('Cell', 'Case'), onclick: () => select(i) },
        glyph(GHOST),
        glyph(VAMPIRE),
        glyph(ZOMBIE),
      );
    });
    const clueEls = clue.map((v, k) =>
      on[k]
        ? addTally(
            h('button', { type: 'button', class: 'hn-clue', 'aria-label': L(`Clue ${v}`, `Indice ${v}`), onclick: () => light(k) }, v),
          )
        : h('div', { class: 'hn-clue off' }),
    );
    const corner = () => h('div', { class: 'hn-corner' });
    grid.append(corner(), ...clueEls.slice(0, n), corner());
    for (let r = 0; r < n; r++) grid.append(clueEls[3 * n + r], ...cells.slice(r * n, r * n + n), clueEls[n + r]);
    grid.append(corner(), ...clueEls.slice(2 * n, 3 * n), corner());

    const counts: HTMLElement[] = [];
    const keyEls = [GHOST, VAMPIRE, ZOMBIE].map((v) => {
      counts[v] = h('span', { class: 'hn-n' });
      return h(
        'button',
        { type: 'button', class: 'key hn-key', 'aria-label': kindName(v), title: kindName(v), onclick: () => input(v) },
        glyph(v),
        counts[v],
      );
    });
    const erase = h(
      'button',
      { type: 'button', class: 'key', 'aria-label': L('Erase', 'Effacer'), onclick: () => sel >= 0 && vals[sel] && input(vals[sel]) },
      '✕',
    );

    const domains = () => {
      const dom = new Uint8Array(N);
      for (const c of open) dom[c] = vals[c] ? bit(vals[c]) : ALL;
      return dom;
    };
    const placed = (v: number) => open.filter((c) => vals[c] === v).length;
    /** Clues that can no longer be met (empty cells may still be anything). */
    const broken = () => {
      const dom = domains();
      return clue.map((t, k) => {
        if (!on[k]) return false;
        const [lo, hi] = pathRange(paths[k], dom);
        return t < lo || t > hi;
      });
    };

    const render = () => {
      const seenB = new Set<number>(),
        seenA = new Set<number>();
      if (lit >= 0) for (const q of paths[lit].seq) (q.after ? seenA : seenB).add(q.cell);
      cells.forEach((el, i) => {
        let cls = baseCls[i];
        if (!mir[i]) {
          if (vals[i]) cls += ` m${vals[i]}`;
          if (i === sel) cls += ' sel';
        }
        if (seenB.has(i)) cls += ' ray';
        if (seenA.has(i)) cls += ' ray2';
        if (el.getAttribute('class') !== cls) el.setAttribute('class', cls);
      });
      const bad = broken();
      clueEls.forEach((el, k) => {
        if (!on[k]) return;
        const full = paths[k].cells.every((c) => vals[c]);
        const [lo] = pathRange(paths[k], domains());
        const ok = full && lo === clue[k];
        el.classList.toggle('err', bad[k]);
        el.classList.toggle('ok', ok);
        // monsters this line already sees for sure (lower bound, so it only ever climbs)
        setTally(el, lo, clue[k], bad[k], bad[k] || (lo > 0 && !ok));
        el.classList.toggle('on', k === lit);
      });
      for (const v of [GHOST, VAMPIRE, ZOMBIE]) {
        const left = totals[v - 1] - placed(v);
        counts[v].replaceChildren(h('b', null, left), h('small', null, `/${totals[v - 1]}`));
        keyEls[v - 1].classList.toggle('err', left < 0);
        keyEls[v - 1].classList.toggle('done', left === 0);
        keyEls[v - 1].setAttribute(
          'aria-label',
          `${kindName(v)} · ${L(`${left} left of ${totals[v - 1]}`, `${left} sur ${totals[v - 1]} à placer`)}`,
        );
      }
      const empty = open.filter((c) => !vals[c]).length;
      ctx.status(P(empty, ['cell to fill', 'cells to fill'], ['case à remplir', 'cases à remplir']));
      return bad;
    };

    const select = (i: number) => {
      sel = i;
      render();
    };
    const light = (k: number) => {
      lit = lit === k ? -1 : k;
      render();
    };

    const input = (v: number) => {
      if (done || sel < 0 || givens[sel]) return;
      ctx.touch();
      vals[sel] = vals[sel] === v ? 0 : v;
      const bad = render();
      if (vals[sel]) {
        const hit = paths.some((q, k) => bad[k] && q.cells.includes(sel));
        if (hit || placed(v) > totals[v - 1]) ctx.mistake();
      }
      const ok =
        open.every((c) => vals[c]) &&
        [GHOST, VAMPIRE, ZOMBIE].every((k) => placed(k) === totals[k - 1]) &&
        paths.every((q, k) => !on[k] || pathRange(q, domains())[0] === clue[k]);
      if (ok) {
        done = true;
        ctx.solved();
      }
    };

    const saved = ctx.saved as { vals?: unknown[]; sel?: unknown; lit?: unknown } | undefined;
    if (Array.isArray(saved?.vals) && saved.vals.length === N)
      saved.vals.forEach((v, i) => {
        if (!mir[i] && !givens[i] && (v === 0 || v === 1 || v === 2 || v === 3)) vals[i] = v;
      });
    if (typeof saved?.sel === 'number' && (saved.sel === -1 || (saved.sel >= 0 && saved.sel < N && !mir[saved.sel]))) sel = saved.sel;
    if (typeof saved?.lit === 'number' && saved.lit >= -1 && saved.lit < 4 * n && (saved.lit < 0 || on[saved.lit])) lit = saved.lit;

    root.append(grid, h('div', { class: 'pad hn-pad' }, ...keyEls, erase));
    render();

    // ---------- guide ----------
    const fillAll = (moves: [number, number][]) => () => {
      for (const [i, v] of moves) {
        if (vals[i] === v) continue;
        select(i);
        input(v);
      }
    };
    const R = { paths, clue, on, totals };
    let lastKind = '';
    let taught = false;
    const hint = (): Hint | null => {
      if (done) return null;
      const wrong = open.find((c) => vals[c] && vals[c] !== sol[c] && !givens[c]);
      if (wrong !== undefined) {
        const v = vals[wrong];
        return {
          text: L(
            `This ${kindName(v)} can’t stay: with it, the edge numbers and totals can no longer all work out. Clear it.`,
            `Ce ${kindName(v)} ne peut pas rester : avec lui, les nombres du bord et les totaux ne peuvent plus tous être respectés. Effacez-le.`,
          ),
          at: [cells[wrong]],
          play: () => {
            select(wrong);
            input(v);
          },
        };
      }
      const base = domains();
      const cands: { kind: string; hint: Hint }[] = [];
      const shown = clue.flatMap((_, k) => (on[k] ? [k] : []));

      // A 0: nothing on the line may be seen.
      for (const k of shown) {
        if (clue[k] !== 0) continue;
        const q = paths[k];
        const moves: [number, number][] = [];
        q.cells.forEach((c, j) => {
          if (vals[c]) return;
          moves.push([c, q.b[j] ? GHOST : VAMPIRE]);
        });
        if (!moves.length) continue;
        cands.push({
          kind: 'zero',
          hint: {
            text: L(
              'This 0 sees no monster. Before its first mirror only a ghost stays hidden, after it only a vampire, and a zombie is always seen.',
              'Ce 0 ne voit aucun monstre. Avant son premier miroir, seul un fantôme reste caché; après, seul un vampire; un zombie est toujours vu.',
            ),
            why: [clueEls[k]],
            at: moves.map(([c]) => cells[c]),
            play: fillAll(moves),
          },
        });
        break;
      }

      // One edge number alone, counted against its line.
      for (const k of shown) {
        const t = clue[k];
        if (t === 0) continue;
        const q = paths[k];
        const [lo, hi] = pathRange(q, base);
        const dom = base.slice();
        if (narrowLine(q, dom, t) <= 0) continue;
        const moves: [number, number][] = q.cells.flatMap((c): [number, number][] =>
          !vals[c] && single(dom[c]) ? [[c, dom[c] === 1 ? 1 : dom[c] === 2 ? 2 : 3]] : [],
        );
        if (!moves.length) continue;
        const one = moves.length === 1;
        const kinds = [...new Set(moves.map((m) => m[1]))];
        const what = kinds.length === 1 ? (one ? kindName(kinds[0]) : kindPlural(kinds[0])) : '';
        const now = q.cells.reduce((sum, c, j) => sum + (vals[c] ? seen(vals[c], q.b[j], q.a[j]) : 0), 0);
        const why =
          kinds.length !== 1
            ? ''
            : kinds[0] === GHOST
              ? L(' Ghosts only show in mirrors.', ' Les fantômes ne se voient que dans les miroirs.')
              : kinds[0] === VAMPIRE
                ? L(' Vampires never show in mirrors.', ' Les vampires ne se voient jamais dans les miroirs.')
                : '';
        const text =
          hi === t && moves.every((m) => m[1] === ZOMBIE)
            ? L(
                `This ${t} is the most its line can still show, so every monster on it must be seen as often as possible. ${one ? 'This cell is' : 'These cells are'} seen both directly and in a mirror: only a zombie counts both times.`,
                `Ce ${t} est le maximum que sa ligne peut encore montrer : chaque monstre doit y être vu le plus possible. ${one ? 'Cette case est vue' : 'Ces cases sont vues'} directement et dans un miroir : seul un zombie compte les deux fois.`,
              )
            : lo === t
              ? L(
                  `${now === t ? `This ${t} already sees ${t === 1 ? 'its monster' : `its ${t} monsters`}` : `This ${t} is already reached by what its line must show`}, so nothing else may be seen: ${one ? 'this cell has' : 'these cells have'} to hide ${what ? (one ? `a ${what}` : what) : 'their monster'}.${why}`,
                  `${now === t ? `Ce ${t} voit déjà ${t === 1 ? 'son monstre' : `ses ${t} monstres`}` : `Ce ${t} est déjà atteint par ce que sa ligne doit montrer`} : rien d’autre ne doit être vu, ${one ? 'cette case cache donc' : 'ces cases cachent donc'} ${what ? (one ? `un ${what}` : `des ${what}`) : 'leur monstre'}.${why}`,
                )
              : L(
                  `Count what this ${t} can still see: any other monster ${one ? 'here' : 'there'} would make its line show too many or too few.`,
                  `Comptez ce que ce ${t} peut encore voir : tout autre monstre ${one ? 'ici' : 'là'} donnerait trop ou pas assez à sa ligne.`,
                );
        cands.push({ kind: 'line', hint: { text, why: [clueEls[k]], at: moves.map(([c]) => cells[c]), play: fillAll(moves) } });
        if (cands.length >= 3) break;
      }

      // Totals: two kinds used up, the rest is the third.
      const empty = open.filter((c) => !vals[c]);
      const left = [GHOST, VAMPIRE, ZOMBIE].map((v) => totals[v - 1] - placed(v));
      const rest = [GHOST, VAMPIRE, ZOMBIE].filter((v) => left[v - 1] > 0);
      if (empty.length && rest.length === 1) {
        const v = rest[0];
        const [a, b] = [GHOST, VAMPIRE, ZOMBIE].filter((x) => x !== v);
        cands.push({
          kind: 'total',
          hint: {
            text: L(
              `All ${totals[a - 1]} ${kindPlural(a)} and ${totals[b - 1]} ${kindPlural(b)} are placed, so every empty cell holds a ${kindName(v)}.`,
              `Les ${totals[a - 1]} ${kindPlural(a)} et les ${totals[b - 1]} ${kindPlural(b)} sont placés : chaque case vide contient un ${kindName(v)}.`,
            ),
            why: [keyEls[a - 1], keyEls[b - 1]],
            at: empty.map((c) => cells[c]),
            play: fillAll(empty.map((c) => [c, v])),
          },
        });
      }

      // Everything together: lines and totals.
      if (!cands.length) {
        const dom = base.slice();
        if (propagate(R, dom, open)) {
          const c = empty.find((i) => single(dom[i]));
          if (c !== undefined) {
            const v = dom[c] === 1 ? 1 : dom[c] === 2 ? 2 : 3;
            const ks = shown.filter((k) => paths[k].cells.includes(c));
            cands.push({
              kind: 'combo',
              hint: {
                text: L(
                  `Put the lines through this cell (${ks.map((k) => clue[k]).join(', ') || '—'}) together with the totals: every option but a ${kindName(v)} breaks one of them.`,
                  `Combinez les lignes qui passent ici (${ks.map((k) => clue[k]).join(', ') || '—'}) et les totaux : toute option sauf un ${kindName(v)} en brise une.`,
                ),
                why: ks.map((k) => clueEls[k]),
                at: [cells[c]],
                play: fillAll([[c, v]]),
              },
            });
          }
        }
      }

      const pick = cands.find((c) => c.kind !== lastKind) ?? cands[0];
      if (pick) {
        lastKind = pick.kind;
        if (taught) return pick.hint;
        taught = true;
        return {
          ...pick.hint,
          text: pick.hint.text + L(' Tap a cell, then the monster’s key.', ' Touchez une case, puis la touche du monstre.'),
        };
      }
      lastKind = '';
      const c = empty[0];
      if (c === undefined) return null;
      return {
        text: L(
          `No single number decides here. Try each monster in this cell: only a ${kindName(sol[c])} lets every edge number work out.`,
          `Aucun nombre ne décide seul ici. Essayez chaque monstre dans cette case : seul un ${kindName(sol[c])} respecte tous les nombres du bord.`,
        ),
        at: [cells[c]],
        play: fillAll([[c, sol[c]]]),
      };
    };

    const move = (dr: number, dc: number) => {
      if (sel < 0) return select(open[0] ?? -1);
      let r = Math.floor(sel / n),
        c = sel % n;
      for (;;) {
        r += dr;
        c += dc;
        if (r < 0 || c < 0 || r >= n || c >= n) return;
        if (!mir[r * n + c]) return select(r * n + c);
      }
    };

    return {
      snapshot: () => ({ vals, sel, lit }),
      hint,
      onKey(e) {
        const v = KEYS[e.key.toLowerCase()];
        if (v) {
          input(v);
          return true;
        }
        if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
          if (sel >= 0 && vals[sel]) input(vals[sel]);
          return true;
        }
        const mv: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
        if (mv[e.key]) {
          move(...mv[e.key]);
          return true;
        }
        return false;
      },
    };
  },
};
