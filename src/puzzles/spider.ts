import './spider.css';
import { L, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { btn, h, shake } from '../core/ui';
import { cardEl, elAt, fan, label, leCard, pileEl, rank, slotEl, suit, SUITS, tableEl, topEl } from './cardkit/cards';
import {
  bestDestS,
  canDealS,
  dealRow,
  genS,
  hasMoveS,
  moveS,
  pickedS,
  progressPlanS,
  progressS,
  runStartS,
  wonS,
  type SState,
} from './cardkit/spider';
import { bindTable, History } from './cardkit/table';

const TOP = 1.7;

interface Cfg {
  suits: number[];
  copies: number;
  cols: number;
  dealt: number;
  tab: number;
  /** How often a card turned up while building the deal is one that fits (0 to 1). */
  help: number;
}

function validState(v: unknown, cfg: Cfg): v is SState {
  const s = v as SState;
  if (!s || !Array.isArray(s.cols) || s.cols.length !== cfg.cols || !Array.isArray(s.stock) || !Array.isArray(s.done)) return false;
  if (!s.cols.every((c) => Array.isArray(c?.d) && Array.isArray(c?.u)) || typeof s.moves !== 'number') return false;
  const n = s.stock.length + s.done.length * 13 + s.cols.reduce((a, c) => a + c.d.length + c.u.length, 0);
  return n === cfg.suits.length * cfg.copies * 13;
}

export const spider: PuzzleDef = {
  id: 'spider',
  get name() {
    return L('Spider', 'Araignée');
  },
  category: 'cards',
  get rules() {
    return L('Stack down; full K→A runs of one suit clear away.', 'Empilez en descendant; les suites R→A d’une sorte partent.');
  },
  help: () => ({
    goal: L(
      'Build complete runs from king down to ace in a single suit. Each finished run leaves the table; clear every card to win.',
      'Formez des suites complètes du roi jusqu’à l’as dans une même sorte. Chaque suite terminée quitte la table; videz-la au complet pour gagner.',
    ),
    steps: [
      L(
        'Put any card on a card one rank higher, whatever the suit (a 6 on any 7). Any card or run can go in an empty column.',
        'Posez une carte sur une carte d’un rang supérieur, peu importe la sorte (un 6 sur n’importe quel 7). Une colonne vide accepte n’importe quelle carte ou suite.',
      ),
      L(
        'Only a run of the same suit moves as one block. A finished king-to-ace run is removed automatically.',
        'Seule une suite de la même sorte se déplace en bloc. Une suite complète du roi à l’as est retirée automatiquement.',
      ),
      L(
        'Tap a card to send it to the best spot (same suit first), or drag it (on a touch screen, hold it a moment first). Face-down cards turn over once uncovered.',
        'Touchez une carte pour l’envoyer au meilleur endroit (même sorte d’abord), ou glissez-la (sur écran tactile, maintenez-la un instant d’abord). Les cartes cachées se retournent une fois dégagées.',
      ),
      L(
        'Tap the stock (top left) to deal one card on every column. You can only deal when no column is empty.',
        'Touchez la pioche (en haut à gauche) pour donner une carte sur chaque colonne. Impossible de donner tant qu’une colonne est vide.',
      ),
      L(
        'Easy and Medium use one suit, Hard and Expert two, Master all four; higher levels have more cards and columns. Undo: Z or Backspace; deal: Space or D.',
        'Facile et Moyen utilisent une sorte, Difficile et Expert deux, Maître les quatre; plus le niveau monte, plus il y a de cartes et de colonnes. Annuler : Z ou Retour arrière; donner : Espace ou D.',
      ),
    ],
    tips: [
      L(
        'Build in the same suit whenever you can: mixed runs get stuck.',
        'Empilez dans la même sorte dès que possible : les suites mélangées bloquent.',
      ),
      L(
        'An empty column is precious; use it to reorder runs before dealing.',
        'Une colonne vide est précieuse; servez-vous-en pour réordonner avant de donner.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [240, 360, 540, 900, 1500]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const cfg = byLevel<Cfg>(d, [
      { suits: [0], copies: 4, cols: 8, dealt: 36, tab: 9, help: 0.3 },
      { suits: [0], copies: 6, cols: 8, dealt: 46, tab: 9, help: 0.5 },
      { suits: [0, 1], copies: 3, cols: 8, dealt: 46, tab: 9, help: 0.8 },
      { suits: [0, 1], copies: 4, cols: 10, dealt: 54, tab: 10.5, help: 0.7 },
      { suits: [0, 1, 2, 3], copies: 2, cols: 10, dealt: 54, tab: 10.5, help: 0.9 },
    ]);
    const runs = cfg.suits.length * cfg.copies;
    // Always winnable: dealt by playing a winning game (see genS).
    const built = genS(rng, cfg.suits, cfg.copies, cfg.cols, cfg.dealt, cfg.help);
    built.s = structuredClone(built.s);
    let s = structuredClone(built.s);
    const hist = new History<SState>(60);
    const sv = ctx.saved as { s?: unknown; hist?: unknown } | undefined;
    if (sv && validState(sv.s, cfg)) {
      s = sv.s;
      hist.restore(sv.hist);
    }
    const table = tableEl(cfg.cols, TOP + cfg.tab, cfg.suits.length > 2 ? 'four-colour' : '');
    let over = false;

    const status = () => {
      const deals = s.stock.length / cfg.cols;
      ctx.status(`${L('Runs', 'Suites')} ${s.done.length}/${runs} · ${L('Deals', 'Donnes')} ${deals} · ${L('Moves', 'Coups')} ${s.moves}`);
    };

    const colCache: ({ key: string; el: HTMLElement } | undefined)[] = [];
    const render = () => {
      const kids: HTMLElement[] = [];
      const sp = pileEl('s', 0, 0);
      sp.append(slotEl('s'));
      const deals = s.stock.length / cfg.cols;
      for (let k = 0; k < Math.min(deals, 5); k++) sp.append(cardEl(0, false, 's', k, `--dx:${k * 0.12}`, 'stock'));
      if (deals) sp.append(h('span', { class: 'badge' }, deals));
      kids.push(sp);
      const dp = pileEl('done', 2, 0);
      if (!s.done.length) dp.append(slotEl('done', L('K', 'R')));
      s.done.forEach((su, k) => dp.append(cardEl(su * 13 + 12, true, 'done', k, `--dx:${k * 0.32}`, 'lock')));
      kids.push(dp);
      s.cols.forEach((col, k) => {
        // Columns a move didn't touch keep their elements (most of the table, most of the time).
        const key = col.d.length + ':' + col.u.join('.');
        const kept = colCache[k];
        if (kept?.key === key) {
          kids.push(kept.el);
          return;
        }
        const tp = pileEl('t' + k, k, TOP, cfg.tab);
        colCache[k] = { key, el: tp };
        tp.append(slotEl('t' + k));
        const ys = fan(col.d.length, col.u.length, cfg.tab, 0.18, 0.42);
        col.d.forEach((c, i) => tp.append(cardEl(c, false, 't' + k, i, `--y:${ys[i]}`)));
        col.u.forEach((c, j) => tp.append(cardEl(c, true, 't' + k, col.d.length + j, `--y:${ys[col.d.length + j]}`)));
        kids.push(tp);
      });
      table.replaceChildren(...kids);
    };

    /** Set while the guide plays a move of the deal's winning line: the position stays winnable, no need to check. */
    let onWinningLine = false;
    const after = () => {
      render();
      if (wonS(s)) {
        over = true;
        ctx.status(
          L(
            `All ${runs} runs cleared in ${s.moves} moves`,
            `Les ${runs} suites sont faites en ${P(s.moves, ['coup', 'coups'], ['coup', 'coups'])}`,
          ),
        );
        ctx.solved();
        return;
      }
      // No deal left and no way to turn a card or finish a run: shuffling runs around can't win.
      if (!onWinningLine && (!hasMoveS(s) || !progressS(s))) {
        over = true;
        ctx.status(L('No useful moves left', 'Plus aucun coup utile'));
        ctx.failed();
        return;
      }
      status();
    };

    const bump = (p: string, i: number) => {
      const el = elAt(table, p, i);
      if (el) shake(el);
    };

    const deal = () => {
      if (!canDealS(s)) {
        bump('s', 0);
        if (s.stock.length) ctx.status(L('Fill every empty column before dealing', 'Remplissez les colonnes vides avant de donner'));
        return;
      }
      hist.push(s);
      dealRow(s);
      after();
    };

    /** Apply a validated move (tap, drop and the guide all come through here). */
    const go = (p: string, i: number, to: string) => {
      hist.push(s);
      moveS(s, p, i, to);
      after();
    };

    bindTable(table, {
      canDrag: (p, i) => !over && pickedS(s, p, i) != null,
      accepts: (p, i, to) => moveS(s, p, i, to, true),
      tap(p, i) {
        if (over) return;
        ctx.touch();
        if (p === 's') {
          deal();
          return;
        }
        if (i < 0 || p === 'done') return;
        const to = bestDestS(s, p, i);
        if (!to) {
          bump(p, i);
          return;
        }
        go(p, i, to);
      },
      drop(p, i, to) {
        if (over || !moveS(s, p, i, to, true)) return false;
        ctx.touch();
        go(p, i, to);
        return true;
      },
    });

    const undo = () => {
      if (over) return;
      const prev = hist.pop();
      if (!prev) return;
      ctx.touch();
      s = prev;
      render();
      status();
    };
    ctx.controls(btn(L('Undo', 'Annuler'), undo, 'ghost'));
    root.append(table);
    render();
    status();

    /** Fast deep copy of a position. */
    const copy = (x: SState): SState => ({
      cols: x.cols.map((c) => ({ d: c.d.slice(), u: c.u.slice() })),
      stock: x.stock.slice(),
      done: x.done.slice(),
      moves: x.moves,
    });
    /** Exact position key (column order matters to replay a line). */
    const keyOf = (x: SState) => JSON.stringify([x.cols, x.stock.length, x.done.length]);
    type Mv = [number, number, number] | null;
    /**
     * A line the guide follows while the player stays on it, with the position expected before each
     * move: first the deal's own winning line, later a short series of shuffles toward a turned card.
     */
    let deal0: { keys: string[]; line: Mv[] } | null = null;
    let plan: { keys: string[]; line: Mv[] } | null = null;
    const follow = (l: { keys: string[]; line: Mv[] } | null): Mv | undefined => {
      const at = l ? l.keys.indexOf(keyOf(s)) : -1;
      return at >= 0 ? l!.line[at] : undefined;
    };
    const lineFrom = (x0: SState, line: Mv[]) => {
      const keys: string[] = [];
      const x = copy(x0);
      for (const m of line) {
        keys.push(keyOf(x));
        if (m) moveS(x, 't' + m[0], m[1], 't' + m[2]);
        else dealRow(x);
      }
      return { keys, line };
    };
    /** Face-down cards, stock and unfinished cards: drops with every real step forward. */
    const measure = () => s.stock.length + s.cols.reduce((a, c) => a + c.d.length, 0) - s.done.length * 100;

    /** Kind of move, for the lesson: completes a run, turns a card, joins same suits, or just makes room. */
    const ruleOf = (a: number, i: number, b: number) => {
      const src = s.cols[a];
      const k = i - src.d.length;
      const c = src.u[k];
      const reveals = k === 0 && src.d.length > 0;
      const dst = s.cols[b].u[s.cols[b].u.length - 1];
      const same = dst != null && suit(dst) === suit(c);
      const sim = copy(s);
      moveS(sim, 't' + a, i, 't' + b);
      if (sim.done.length > s.done.length) return 'done';
      if (dst == null) return reveals ? 'empty' : s.stock.length && !canDealS(s) && canDealS(sim) ? 'fill' : 'room';
      if (reveals) return same ? 'reveal' : 'mixed';
      if (same && k === 0 && !src.d.length) return 'clear';
      if (same && k > 0 && (suit(src.u[k - 1]) !== suit(c) || rank(src.u[k - 1]) !== rank(c) + 1)) return 'build';
      return 'shift';
    };

    const dealHint = (): Hint => {
      const n = s.cols.length;
      return {
        text: L(
          `No useful move left: tap the stock to deal a new row, one card on every column. ${s.stock.length / n === 1 ? 'This is the last one.' : `The stock holds ${s.stock.length / n}.`}`,
          `Plus de coup utile : touchez la pioche pour donner une nouvelle rangée, une carte par colonne. ${s.stock.length / n === 1 ? 'C’est la dernière.' : `La pioche en contient ${s.stock.length / n}.`}`,
        ),
        at: [topEl(table, 's')!],
        play: deal,
      };
    };

    const moveHint = (a: number, i: number, b: number, rule = ruleOf(a, i, b)): Hint => {
      const src = s.cols[a];
      const c = src.u[i - src.d.length];
      const cnt = src.u.length - (i - src.d.length);
      const dst = s.cols[b].u[s.cols[b].u.length - 1];
      const what =
        cnt > 1 ? L(`the ${label(c)} run (${cnt} cards)`, `la suite du ${label(c)} (${cnt} cartes)`) : L(`the ${label(c)}`, leCard(c));
      const dn = dst != null ? label(dst) : '';
      const texts: Record<string, string> = {
        done: L(
          `Move ${what} onto the ${dn}: that completes K to A in ${SUITS[suit(c)]}, and a finished run leaves the table.`,
          `Déplacez ${what} sur le ${dn} : cela complète une suite du R à l’A en ${SUITS[suit(c)]}, et une suite complète quitte la table.`,
        ),
        reveal: L(
          `Move ${what} onto the ${dn}: one lower and the same suit, so they can later move together. The hidden card underneath turns over.`,
          `Déplacez ${what} sur le ${dn} : une valeur de moins et même sorte, ils pourront bouger ensemble. La carte cachée dessous se retourne.`,
        ),
        mixed: L(
          `Any card one lower fits, even of another suit: move ${what} onto the ${dn} to turn over the hidden card. Mixed suits can’t move as a block, though.`,
          `N’importe quelle carte d’une valeur de moins convient, même d’une autre sorte : déplacez ${what} sur le ${dn} pour retourner la carte cachée. Mais des sortes mêlées ne bougent pas en bloc.`,
        ),
        clear: L(
          `Move ${what} onto the ${dn} (same suit, one lower): that empties a column, and an empty column takes any card.`,
          `Déplacez ${what} sur le ${dn} (même sorte, une valeur de moins) : cela vide une colonne, et une colonne vide accepte n’importe quelle carte.`,
        ),
        build: L(
          `Join ${what} to the ${dn}: same suit, one lower. Same-suit runs grow toward a full K-to-A set.`,
          `Joignez ${what} au ${dn} : même sorte, une valeur de moins. Les suites d’une même sorte grandissent vers un ensemble complet du R à l’A.`,
        ),
        empty: L(
          `An empty column takes any card: move ${what} there and turn over the hidden card it covered.`,
          `Une colonne vide accepte n’importe quelle carte : déplacez-y ${what} et retournez la carte cachée qu’elle couvrait.`,
        ),
        fill: L(
          `You can only deal when every column holds a card: move ${what} into the empty column.`,
          `On ne peut donner que si chaque colonne a une carte : déplacez ${what} dans la colonne vide.`,
        ),
        room: L(
          `An empty column takes any card: park ${what} there to make room for the next useful move.`,
          `Une colonne vide accepte n’importe quelle carte : placez-y ${what} pour faire de la place au prochain coup utile.`,
        ),
        shift: L(
          `Move ${what} onto the ${dn} (one lower): it makes room for the next useful move.`,
          `Déplacez ${what} sur le ${dn} (une valeur de moins) : ça fait de la place au prochain coup utile.`,
        ),
      };
      return {
        text: texts[rule],
        why: Array.from({ length: cnt }, (_, j) => elAt(table, 't' + a, i + j)!),
        at: [topEl(table, 't' + b)!],
        play: () => go('t' + a, i, 't' + b),
      };
    };
    /**
     * The deal's line wanders (it was found by a greedy player): when one move reaches a position
     * further along it, take that move instead.
     */
    let lineAt: Map<string, number> | null = null;
    const shortcut = (): [number, number, number] | null => {
      if (!deal0) return null;
      if (!lineAt) {
        lineAt = new Map();
        deal0.keys.forEach((k, j) => lineAt!.set(k, j));
      }
      const here = lineAt.get(keyOf(s)) ?? -1;
      let best: [number, number, number] | null = null;
      let far = here + 1;
      s.cols.forEach((col, a) => {
        for (let k = runStartS(col.u); k < col.u.length; k++)
          for (let b = 0; b < s.cols.length; b++) {
            const i = col.d.length + k;
            if (b === a || !moveS(s, 't' + a, i, 't' + b, true)) continue;
            const x = copy(s);
            moveS(x, 't' + a, i, 't' + b);
            const j = lineAt!.get(keyOf(x)) ?? -1;
            if (j > far) {
              far = j;
              best = [a, i, b];
            }
          }
      });
      return best;
    };
    const lineHint = (m: [number, number, number] | null) => (m ? moveHint(...m) : dealHint());

    /** Hints given since the last real step forward, give-ups since the best position, and the best. */
    let idle = 0;
    let lastMeasure = NaN;
    let giveUps = 0;
    let best = Infinity;
    /** Is some position in the undo history on the deal's winning line? */
    const lineBehind = () => {
      shortcut(); // builds lineAt
      return !!lineAt?.size && hist.stack.some((j) => lineAt!.has(keyOf(JSON.parse(j) as SState)));
    };
    /** Undoing back to the deal's winning line, after the guide got stuck off it. */
    let rewinding = false;
    const stuckHint = (): Hint | null => {
      rewinding = lineBehind();
      if (rewinding)
        return {
          kind: 'stuck',
          text: L(
            'The guide finds no useful move from here. Undo back to the last position it knows how to win from.',
            'Le guide ne trouve aucun coup utile d’ici. Annulez jusqu’à la dernière position d’où il sait gagner.',
          ),
          at: [topEl(table, 's')!],
          action: L('Undo', 'Annuler'),
          play: () => {
            // Several undos at once, drawn once.
            for (let prev = hist.pop(); prev; prev = lineAt?.has(keyOf(prev)) ? null : hist.pop()) s = prev;
            ctx.touch();
            render();
            status();
          },
        };
      return hist.size && ++giveUps <= 3
        ? {
            kind: 'stuck',
            text: L(
              'The guide finds no useful move from here: no card can be turned over, no run finished and no row dealt. Undo a few moves and try another way.',
              'Le guide ne trouve aucun coup utile d’ici : aucune carte à retourner, aucune suite à finir ni rangée à donner. Annulez quelques coups et essayez autrement.',
            ),
            at: [topEl(table, 's')!],
            action: L('Undo', 'Annuler'),
            play: undo,
          }
        : null;
    };

    /** Would this move (null: a deal) end the game without a win? The guide never suggests that. */
    const loses = (m: Mv) => {
      const x = copy(s);
      if (m) moveS(x, 't' + m[0], m[1], 't' + m[2]);
      else dealRow(x);
      return !wonS(x) && (!hasMoveS(x) || !progressS(x));
    };
    /** Positions where no shuffle leads to a turned card (searched once). */
    const noPlan = new Set<string>();
    let lastRule = '';
    const hint = (): Hint | null => {
      if (over) return null;
      const now = measure();
      if (now !== lastMeasure) {
        lastMeasure = now;
        idle = 0;
      }
      if (now < best) {
        best = now;
        giveUps = 0;
      }
      // The deal's own winning line, as long as the player is on it.
      deal0 ??= built.line ? lineFrom(built.s, built.line) : { keys: [], line: [] };
      const onLine = follow(deal0);
      if (onLine !== undefined) {
        rewinding = false;
        const step = lineHint(shortcut() ?? onLine);
        return {
          ...step,
          play: () => {
            onWinningLine = true;
            try {
              step.play();
            } finally {
              onWinningLine = false;
            }
          },
        };
      }
      if (rewinding) return stuckHint();
      // Going round in circles: say so (a few times at most) instead of shuffling forever.
      if (giveUps >= 3) return null;
      if (++idle > 60) {
        idle = 0;
        return stuckHint();
      }
      const onPlan = follow(plan);
      if (onPlan !== undefined && !loses(onPlan)) return lineHint(onPlan);
      // Moves that turn a card over or finish a run: always a step forward.
      type M = { a: number; i: number; b: number; rule: string; rank: number };
      const moves: M[] = [];
      const n = s.cols.length;
      for (let a = 0; a < n; a++) {
        const src = s.cols[a];
        for (let k = 0; k < src.u.length; k++) {
          const i = src.d.length + k;
          if (!pickedS(s, 't' + a, i)) continue;
          for (let b = 0; b < n; b++) {
            if (b === a || !moveS(s, 't' + a, i, 't' + b, true)) continue;
            const rule = ruleOf(a, i, b);
            const r = ['done', 'reveal', 'mixed', 'empty'].indexOf(rule);
            if (r >= 0 && !loses([a, i, b])) moves.push({ a, i, b, rule, rank: r * 100 - src.d.length });
          }
        }
      }
      moves.sort((x, y) => x.rank - y.rank);
      if (moves.length) {
        // Best move first; vary the lesson only between moves that also turn a card over.
        const m = moves.find((x) => x.rule !== lastRule && x.rank < moves[0].rank + 300) ?? moves[0];
        lastRule = m.rule;
        return moveHint(m.a, m.i, m.b, m.rule);
      }
      // Shuffle runs toward a card that can turn over (shortest way first).
      const k = keyOf(s);
      const pl = noPlan.has(k) ? null : progressPlanS(s);
      if (!pl) noPlan.add(k);
      if (pl && !loses(pl[0])) {
        plan = lineFrom(s, pl);
        lastRule = 'plan';
        return moveHint(...pl[0]);
      }
      if (canDealS(s) && !loses(null)) {
        lastRule = 'deal';
        return dealHint();
      }
      // Dealing needs every column filled: move the top run off a column that keeps a card face up.
      if (s.stock.length) {
        const e = s.cols.findIndex((c) => !c.u.length);
        let fill = -1;
        let size = Infinity;
        for (let a = 0; a < n; a++) {
          const u = s.cols[a].u;
          const r = runStartS(u);
          if (r > 0 && u.length - r < size) {
            fill = a;
            size = u.length - r;
          }
        }
        if (e >= 0 && fill >= 0 && !loses([fill, s.cols[fill].d.length + s.cols[fill].u.length - size, e]))
          return moveHint(fill, s.cols[fill].d.length + s.cols[fill].u.length - size, e, 'fill');
      }
      return stuckHint();
    };

    return {
      hint,
      snapshot: () => ({ s, hist: hist.stack }),
      onKey(e) {
        if (e.key === 'z' || e.key === 'Backspace') {
          undo();
          return true;
        }
        if (e.key === ' ' || e.key === 'd') {
          if (!over) {
            ctx.touch();
            deal();
          }
          return true;
        }
        return false;
      },
    };
  },
};
