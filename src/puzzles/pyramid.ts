import './pyramid.css';
import { L, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { h, restartBtn, shake, undoBtn } from '../core/ui';
import { cardEl, elAt, label, leCard, pileEl, pilesEl, rank, rankLabel, slotEl, tableEl, topEl } from './cardkit/cards';
import {
  cardAt,
  canRecycle,
  clearedP,
  deadP,
  drawP,
  exposed,
  genP,
  idx,
  removeP,
  searchP,
  solveP,
  type PAct,
  type PState,
} from './cardkit/pyramid';
import { bindTable, History } from './cardkit/table';

const STEP = 0.7; // row step in card widths
const BOTTOM = 6 * STEP + 1.4 + 0.45; // stock row y

function validState(v: unknown): v is PState {
  const s = v as PState;
  if (!s || !Array.isArray(s.pyr) || s.pyr.length !== 28 || !Array.isArray(s.stock) || !Array.isArray(s.waste)) return false;
  return typeof s.passes === 'number' && typeof s.moves === 'number' && s.stock.length + s.waste.length <= 24;
}

export const pyramid: PuzzleDef = {
  id: 'pyramid',
  get name() {
    return L('Pyramid', 'Pyramide');
  },
  category: 'cards',
  get rules() {
    return L('Pair open cards that add to 13 (K alone). Clear the top.', 'Retirez des paires qui font 13 (R seul). Videz la pyramide.');
  },
  help: () => ({
    goal: L(
      'Remove all 28 cards of the pyramid by pairing cards whose values add up to 13.',
      'Retirez les 28 cartes de la pyramide en formant des paires dont la valeur totale fait 13.',
    ),
    steps: [
      L(
        'Values: A = 1, numbers as shown, J = 11, Q = 12, K = 13. A king is removed on its own; other pairs must total 13 (Q + A, J + 2, 10 + 3…).',
        'Valeurs : A = 1, les chiffres tels quels, V = 11, D = 12, R = 13. Un roi se retire seul; les autres paires doivent totaliser 13 (D + A, V + 2, 10 + 3…).',
      ),
      L(
        'Only open cards can be used: a pyramid card is open once both cards covering it are gone. The top card of the waste is open too.',
        'Seules les cartes libres comptent : une carte de la pyramide se libère quand les deux cartes qui la couvrent sont parties. La carte du dessus du talon est libre aussi.',
      ),
      L(
        'Tap one card, then its partner; or drag one card onto the other (on a touch screen, hold it a moment first). Tap a king to remove it.',
        'Touchez une carte, puis sa partenaire; ou glissez une carte sur l’autre (sur écran tactile, maintenez-la un instant d’abord). Touchez un roi pour le retirer.',
      ),
      L(
        'Tap the stock to turn one card onto the waste. When it runs out, ↻ starts a new pass: unlimited on Easy, 3 on Medium, 2 on Hard and Expert, 1 on Master.',
        'Touchez la pioche pour retourner une carte sur le talon. Quand elle est vide, ↻ lance une nouvelle passe : illimitées en Facile, 3 en Moyen, 2 en Difficile et Expert, 1 en Maître.',
      ),
      L(
        'Undo takes back a move (Z or Backspace on a keyboard); Restart deals the same game again (R); Space or D draws.',
        'Annuler reprend un coup (Z ou Retour arrière au clavier); Repartir redonne la même partie (R); Espace ou D pioche.',
      ),
    ],
    tips: [
      L(
        'Before pairing, check which choice uncovers more of the pyramid.',
        'Avant de former une paire, voyez quel choix dégage le plus la pyramide.',
      ),
      L(
        'Work on the bottom rows early: cards near the top only open up late.',
        'Attaquez tôt les rangées du bas : les cartes du sommet se libèrent tard.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [90, 120, 150, 180, 210]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const passes = byLevel(d, [-1, 3, 2, 2, 1]); // -1 = unlimited
    // Always winnable: a random deal the solver proves, else one built around a winning line.
    let s = genP(rng, passes, byLevel(d, [10, 10, 16, 6, 30]), d === 5 ? 2000 : 5000);
    const init = structuredClone(s);

    const hist = new History<PState>(80);
    let sel: string | null = null;
    const sv = ctx.saved as { s?: unknown; hist?: unknown; sel?: unknown } | undefined;
    if (sv && validState(sv.s)) {
      s = sv.s;
      hist.restore(sv.hist);
      if (typeof sv.sel === 'string' && cardAt(s, sv.sel) != null) sel = sv.sel;
    }

    const table = tableEl(7, BOTTOM + 1.4);
    let over = false;

    /** Proven unwinnable from here, though moves remain (undo can still save it). */
    let doomed = false;
    /** Exact position key, to follow a winning line one move at a time. */
    const keyOf = (x: PState) => JSON.stringify([x.pyr, x.stock, x.waste, x.passes]);
    /** Winning line the guide follows, with the position expected before each of its moves. */
    let plan: { keys: string[]; line: PAct[] } | null = null;
    const judge = () => {
      doomed = deadP(s, passes) || (!plan?.keys.includes(keyOf(s)) && solveP(s, passes, 6000) === 'dead');
    };

    const status = () => {
      const gone = 28 - s.pyr.filter((c) => c >= 0).length;
      const head = `${L('Cleared', 'Retirées')} ${gone} / 28 · ${P(s.moves, ['move', 'moves'], ['coup', 'coups'])}`;
      if (doomed) {
        ctx.status(`${head} · ${L('no way to clear it from here · undo', 'impossible de la vider d’ici · annulez')}`);
        return;
      }
      const pass = passes < 0 ? '' : ` · ${L('Pass', 'Passe')} ${s.passes + 1} / ${passes}`;
      ctx.status(head + pass);
    };

    const render = () => {
      const kids: HTMLElement[] = [];
      for (let r = 0; r < 7; r++) {
        for (let k = 0; k <= r; k++) {
          const i = idx(r, k);
          if (s.pyr[i] < 0) continue;
          const p = 'p' + i;
          const pp = pileEl(p, (6 - r) / 2 + k, r * STEP);
          const open = exposed(s.pyr, i);
          pp.append(cardEl(s.pyr[i], true, p, 0, '', open ? (sel === p ? 'sel' : '') : 'lock'));
          kids.push(pp);
        }
      }
      const sp = pileEl('s', 2, BOTTOM);
      sp.append(slotEl('s', canRecycle(s, passes) ? '↻' : '✕'));
      if (s.stock.length) {
        sp.append(cardEl(0, false, 's', 0, '', 'stock'));
        sp.append(h('span', { class: 'badge' }, s.stock.length));
      }
      kids.push(sp);
      const wp = pileEl('w', 4, BOTTOM);
      wp.append(slotEl('w'));
      if (s.waste.length > 1) wp.append(cardEl(s.waste[s.waste.length - 2], true, 'w', 1, '', 'lock'));
      if (s.waste.length) wp.append(cardEl(s.waste[s.waste.length - 1], true, 'w', 0, '', sel === 'w' ? 'sel' : ''));
      kids.push(wp);
      table.replaceChildren(...kids);
    };

    const after = () => {
      if (sel && cardAt(s, sel) == null) sel = null;
      render();
      if (clearedP(s)) {
        over = true;
        ctx.solved();
        return;
      }
      judge();
      status();
    };

    const bump = (p: string) => {
      const el = topEl(table, p);
      if (el) shake(el);
    };

    const draw = () => {
      sel = null;
      const n = { ...s, stock: s.stock.slice(), waste: s.waste.slice() };
      if (!drawP(n, passes)) {
        bump('s');
        render();
        return;
      }
      hist.push(s);
      s = n;
      after();
    };

    const pick = (p: string) => {
      const c = cardAt(s, p);
      if (c == null) {
        bump(p);
        return;
      }
      if (rank(c) === 13) {
        hist.push(s);
        removeP(s, p);
        after();
        return;
      }
      if (sel == null || sel === p) {
        sel = sel === p ? null : p;
        render();
        return;
      }
      if (removeP(s, sel, p, true)) {
        hist.push(s);
        removeP(s, sel, p);
        sel = null;
        after();
        return;
      }
      sel = p;
      render();
    };

    bindTable(table, {
      canDrag: (p, i) => !over && p !== 's' && (p !== 'w' || i === 0) && cardAt(s, p) != null,
      accepts: (p, _i, to) => removeP(s, p, to, true),
      tap(p, i) {
        if (over) return;
        ctx.touch();
        if (p === 's') {
          draw();
          return;
        }
        if (p === 'w' && i !== 0) return;
        pick(p);
      },
      drop(p, _i, to) {
        if (over || !removeP(s, p, to, true)) return false;
        ctx.touch();
        hist.push(s);
        removeP(s, p, to);
        sel = null;
        after();
        return true;
      },
    });

    const undo = () => {
      if (over) return;
      const prev = hist.pop();
      if (!prev) return;
      ctx.touch();
      s = prev;
      sel = null;
      render();
      judge();
      status();
    };
    /** Deal the same game again (undoable). */
    const restart = () => {
      if (over || JSON.stringify(s) === JSON.stringify(init)) return;
      ctx.touch();
      hist.push(s);
      s = structuredClone(init);
      sel = null;
      render();
      judge();
      status();
    };
    /** Undo the last move, or deal the same game again when there is nothing to undo. */
    const backOut = () => (hist.size ? undo() : restart());
    ctx.controls(undoBtn(undo), restartBtn(restart));
    root.append(table);
    render();
    if (sv) judge();
    status();

    const el = (p: string) => (p === 'w' ? elAt(table, 'w', 0) : elAt(table, p, 0))!;
    /** Pyramid cards a removal would uncover. */
    const frees = (ps: string[]) => {
      const pyr = s.pyr.slice();
      for (const p of ps) if (p !== 'w') pyr[Number(p.slice(1))] = -1;
      const out: number[] = [];
      for (let i = 0; i < 28; i++) if (pyr[i] >= 0 && !exposed(s.pyr, i) && exposed(pyr, i)) out.push(i);
      return out;
    };
    /** "Q♦ + A♣ = 12 + 1 = 13" (values spelled out for letters), "8♠ + 5♥ = 13" otherwise. */
    const sum = (a: number, b: number) =>
      rank(a) > 10 || rank(a) === 1 || rank(b) > 10 || rank(b) === 1
        ? `${label(a)} + ${label(b)} = ${rank(a)} + ${rank(b)} = 13`
        : `${label(a)} + ${label(b)} = 13`;
    const freed = (ps: string[]) => {
      const f = frees(ps);
      if (!f.length) return ['', ''];
      const names = f.map((i) => label(s.pyr[i])).join(L(' and ', ' et '));
      return [` That opens the ${names} above.`, ` Cela libère ${f.length > 1 ? 'les cartes ' + names : leCard(s.pyr[f[0]])} au-dessus.`];
    };
    /** Could some open cards be removed right now (a king, or two making 13)? */
    const somePair = () => {
      const all: string[] = [];
      for (let i = 0; i < 28; i++) if (exposed(s.pyr, i)) all.push('p' + i);
      if (cardAt(s, 'w') != null) all.push('w');
      return all.some((a, x) => removeP(s, a, undefined, true) || all.slice(x + 1).some((b) => removeP(s, a, b, true)));
    };

    /** Positions the solver could not settle within its budget (not searched twice). */
    const unsure = new Set<string>();
    /** Next step of a winning line from here, planned once and followed while the player does. */
    const planned = (): PAct | null => {
      const k = keyOf(s);
      const at = plan ? plan.keys.indexOf(k) : -1;
      if (plan && at >= 0) return plan.line[at];
      if (unsure.has(k)) return null;
      const r = searchP(s, passes, 8000);
      if (r.v !== 'win' || !r.line.length) {
        unsure.add(k);
        return null;
      }
      const keys: string[] = [];
      const x = structuredClone(s);
      for (const a of r.line) {
        keys.push(keyOf(x));
        if (a.k === 'p') removeP(x, 'p' + a.a);
        else if (a.k === 'w') removeP(x, 'w');
        else if (a.k === 'pp') removeP(x, 'p' + a.a, 'p' + a.b);
        else if (a.k === 'wp') removeP(x, 'w', 'p' + a.a);
        else drawP(x, passes);
      }
      plan = { keys, line: r.line };
      return r.line[0];
    };

    /** Explain one step of the winning line. */
    const describe = (a: PAct): Hint => {
      if (a.k === 'p' || a.k === 'w') {
        const p = a.k === 'w' ? 'w' : 'p' + a.a;
        const c = cardAt(s, p)!;
        const [fe, ff] = freed([p]);
        return {
          text: L(
            `A king is worth 13 by itself: tap the ${label(c)} to remove it.${fe}`,
            `Un roi vaut 13 à lui seul : touchez ${leCard(c)} pour le retirer.${ff}`,
          ),
          at: [el(p)],
          play: () => pick(p),
        };
      }
      if (a.k === 'pp' || a.k === 'wp') {
        const pa = a.k === 'wp' ? 'w' : 'p' + a.a;
        const pb = a.k === 'wp' ? 'p' + a.a : 'p' + a.b;
        const ca = cardAt(s, pa)!;
        const cb = cardAt(s, pb)!;
        const [fe, ff] = freed([pa, pb]);
        return {
          text:
            a.k === 'wp'
              ? L(
                  `The waste’s top card is open too, and ${sum(ca, cb)}: pair the ${label(ca)} with the ${label(cb)}.${fe}`,
                  `La carte du dessus du talon est libre aussi, et ${sum(ca, cb)} : associez ${leCard(ca)} et ${leCard(cb)}.${ff}`,
                )
              : L(
                  `${sum(ca, cb)}, and both cards are open (nothing covers them): pair them.${fe}`,
                  `${sum(ca, cb)}, et les deux cartes sont libres (rien ne les couvre) : associez-les.${ff}`,
                ),
          why: [el(pa)],
          at: [el(pb)],
          play: () => {
            if (sel !== pa) pick(pa);
            pick(pb);
          },
        };
      }
      return {
        text: !s.stock.length
          ? L('The stock is empty: tap ↻ to go through the waste again.', 'La pioche est vide : touchez ↻ pour reparcourir le talon.')
          : somePair()
            ? L(
                'Turn a stock card first: the open pairs can wait, and taking them now would leave cards that never find a partner.',
                'Retournez d’abord une carte de la pioche : les paires libres peuvent attendre, les prendre maintenant laisserait des cartes sans partenaire.',
              )
            : L(
                'No two open cards make 13: turn a stock card over.',
                'Aucune paire de cartes libres ne fait 13 : retournez une carte de la pioche.',
              ),
        at: [topEl(table, 's')!],
        play: draw,
      };
    };

    /** Dead end: the solver tried every order of removals and draws from here, and none clears the pyramid. */
    const check = (): Hint | null => {
      if (over || !doomed || tired()) return null;
      deadEnds.add(keyOf(s));
      giveUps++;
      return {
        kind: 'stuck',
        text: L(
          'No way to clear the pyramid from here: in every order, some cards never find a partner adding up to 13 in time. Undo.',
          'Impossible de vider la pyramide d’ici : dans tous les ordres, des cartes ne trouvent jamais à temps de partenaire qui fasse 13. Annulez.',
        ),
        at: pilesEl(table, 'p'),
        action: hist.size ? L('Undo', 'Annuler') : L('Restart', 'Repartir'),
        play: backOut,
      };
    };

    /** Dead ends shown since the pyramid last got smaller, and its smallest size so far. */
    let giveUps = 0;
    let fewest = 99;
    /** The guide keeps backing into dead ends without getting further: it stops suggesting moves. */
    const tired = () => {
      const left = s.pyr.filter((c) => c >= 0).length;
      if (left < fewest) {
        fewest = left;
        giveUps = 0;
      }
      return giveUps >= 8;
    };

    const hint = (): Hint | null => {
      if (over || (doomed && tired())) return null;
      const a = planned();
      return a ? describe(a) : heuristic();
    };

    /** Positions found to be dead ends (the heuristic never steers back into one). */
    const deadEnds = new Set<string>();
    /** Would removing these cards leave a position known or quickly proven to be lost? */
    const bad = (a: string, b?: string) => {
      const x = structuredClone(s);
      removeP(x, a, b);
      return deadEnds.has(keyOf(x)) || deadP(x, passes) || solveP(x, passes, 1500) === 'dead';
    };
    let lastRule = '';
    /** No line from the solver within its budget: the old rules of thumb. */
    const heuristic = (): Hint | null => {
      const open: string[] = [];
      for (let i = 0; i < 28; i++) if (exposed(s.pyr, i)) open.push('p' + i);
      const wasteTop = cardAt(s, 'w');
      const cands: { rule: string; h: Hint }[] = [];
      // Kings leave on their own.
      for (const p of [...open, ...(wasteTop != null ? ['w'] : [])]) {
        const c = cardAt(s, p)!;
        if (rank(c) !== 13 || bad(p)) continue;
        const [fe, ff] = freed([p]);
        cands.push({
          rule: 'king',
          h: {
            text: L(
              `A king is worth 13 by itself: tap the ${label(c)} to remove it.${fe}`,
              `Un roi vaut 13 à lui seul : touchez ${leCard(c)} pour le retirer.${ff}`,
            ),
            at: [el(p)],
            play: () => pick(p),
          },
        });
      }
      // Pairs of open cards (pyramid + pyramid, or with the waste): prefer the one that uncovers most.
      const pairs: { a: string; b: string; n: number }[] = [];
      for (let x = 0; x < open.length; x++)
        for (let y = x + 1; y < open.length; y++)
          if (removeP(s, open[x], open[y], true)) pairs.push({ a: open[x], b: open[y], n: frees([open[x], open[y]]).length });
      if (wasteTop != null) for (const a of open) if (removeP(s, 'w', a, true)) pairs.push({ a: 'w', b: a, n: frees([a]).length });
      for (let k = pairs.length - 1; k >= 0; k--) if (bad(pairs[k].a, pairs[k].b)) pairs.splice(k, 1);
      pairs.sort((x, y) => y.n - x.n || Number(y.b.slice(1)) - Number(x.b.slice(1)));
      for (const { a, b } of pairs) {
        const ca = cardAt(s, a)!;
        const cb = cardAt(s, b)!;
        const [fe, ff] = freed([a, b]);
        const w = a === 'w';
        if (cands.some((c) => c.rule === (w ? 'waste' : 'pair'))) continue;
        cands.push({
          rule: w ? 'waste' : 'pair',
          h: {
            text: w
              ? L(
                  `The waste’s top card is open too, and ${sum(ca, cb)}: pair the ${label(ca)} with the ${label(cb)}.${fe}`,
                  `La carte du dessus du talon est libre aussi, et ${sum(ca, cb)} : associez ${leCard(ca)} et ${leCard(cb)}.${ff}`,
                )
              : L(
                  `${sum(ca, cb)}, and both cards are open (nothing covers them): pair them.${fe}`,
                  `${sum(ca, cb)}, et les deux cartes sont libres (rien ne les couvre) : associez-les.${ff}`,
                ),
            why: [el(a)],
            at: [el(b)],
            play: () => {
              pick(a);
              pick(b);
            },
          },
        });
      }
      if (!cands.length) {
        if (!s.stock.length && !canRecycle(s, passes)) return null;
        lastRule = 'draw';
        // What the open pyramid cards are waiting for, e.g. "a 9 for the 4♦".
        const wants = [...new Set(open.map((p) => 13 - rank(cardAt(s, p)!)))].sort((x, y) => x - y).map(rankLabel);
        const list = (or: string) => (wants.length > 1 ? wants.slice(0, -1).join(', ') + ` ${or} ` + wants[wants.length - 1] : wants[0]);
        const pairable = () => {
          const w = cardAt(s, 'w');
          return w != null && (rank(w) === 13 || open.some((p) => removeP(s, 'w', p, true)));
        };
        return {
          text: s.stock.length
            ? L(
                `No two open cards make 13. Turn stock cards until one completes a pair: the open cards need ${list('or')}.`,
                `Aucune paire de cartes libres ne fait 13. Retournez des cartes de la pioche jusqu’à compléter une paire : il faut un ${list('ou')}.`,
              )
            : L('The stock is empty: tap ↻ to go through the waste again.', 'La pioche est vide : touchez ↻ pour reparcourir le talon.'),
          at: [topEl(table, 's')!],
          play: () => {
            if (!s.stock.length) return draw();
            // Tap the stock until a card that pairs shows up (or the stock runs out).
            for (let n = s.stock.length; n > 0; n--) {
              draw();
              if (over || !s.stock.length || pairable()) break;
            }
          },
        };
      }
      const best = cands.find((x) => x.rule !== lastRule) ?? cands[0];
      lastRule = best.rule;
      return best.h;
    };

    return {
      hint,
      check,
      snapshot: () => ({ s, hist: hist.stack, sel }),
      onKey(e) {
        const k = e.key.toLowerCase();
        if (k === 'z' || k === 'backspace') {
          undo();
          return true;
        }
        if (k === 'r') {
          restart();
          return true;
        }
        if (e.key === ' ' || k === 'd') {
          if (!over) {
            ctx.touch();
            draw();
          }
          return true;
        }
        return false;
      },
    };
  },
};
