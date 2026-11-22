import './style.css';
import { L, P } from '../../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../../core/types';
import { restartBtn, shake, undoBtn } from '../../ui/dom';
import { cap, cardEl, elAt, fan, label, leCard, pileEl, pilesEl, rankLabel, slotEl, tableEl, topEl } from '../../kits/card/cards';
import {
  cardAtL,
  cloneL,
  destsL,
  ladderLen,
  type LConfig,
  type LMove,
  type LState,
  type LVerdict,
  moveL,
  movableL,
  movesL,
  genL,
  LADDER_LEVELS,
  solveL,
  wonL,
} from './rules';
import { bindTable, History } from '../../kits/card/table';

const TAB_H = 7.2;
const TOP = 1.7;

function validState(v: unknown, cfg: LConfig): v is LState {
  const s = v as LState;
  if (!s || !Array.isArray(s.cols) || !Array.isArray(s.cells) || !Array.isArray(s.done)) return false;
  if (s.cols.length !== cfg.cols || s.cells.length !== cfg.cells || s.low !== cfg.low || typeof s.moves !== 'number') return false;
  if (!s.cols.every((c) => Array.isArray(c) && c.every((x) => Number.isInteger(x) && x >= 0 && x < 52))) return false;
  const n = s.cols.reduce((a, c) => a + c.length, 0) + s.cells.filter((c) => c >= 0).length + s.done.length * ladderLen(cfg.low);
  return n === 4 * ladderLen(cfg.low) && s.done.length < 4;
}

export const ladders: PuzzleDef = {
  id: 'ladders',
  get name() {
    return L('Ladders', 'Échelles');
  },
  category: 'cards',
  offByDefault: true,
  get rules() {
    return L('Tap to stack down, changing suit. Build ladders from K.', 'Touchez pour descendre en changeant de sorte, dès le R.');
  },
  help: () => ({
    goal: L(
      'Clear the table by building four ladders. A ladder runs from a king down to the lowest card in play, changing suit at every step; a finished one leaves the table.',
      'Videz la table en bâtissant quatre échelles. Une échelle descend d’un roi jusqu’à la plus petite carte en jeu, en changeant de sorte à chaque marche; une échelle finie quitte la table.',
    ),
    steps: [
      L(
        'The deck is short and all face up: 9 to K on Easy, down to 6 on Expert and Master.',
        'Le paquet est court et tout visible : du 9 au R en Facile, jusqu’au 6 en Expert et Maître.',
      ),
      L(
        'A card goes on a card one rank higher of another suit: a 9♥ fits on the 10♠, 10♦ or 10♣, not the 10♥. A card brings along the cards covering it, but only if they form a ladder.',
        'Une carte va sur une carte d’un rang de plus, d’une autre sorte : un 9♥ va sur le 10♠, le 10♦ ou le 10♣, mais pas le 10♥. Une carte entraîne celles qui la couvrent, seulement si elles forment une échelle.',
      ),
      L(
        'Only a king can fill an empty column. Each free cell at the top left holds one uncovered card: 2 on Easy, 1 from Medium to Expert, none on Master.',
        'Seul un roi peut occuper une colonne vide. Chaque cellule libre en haut à gauche garde une carte découverte : 2 en Facile, 1 de Moyen à Expert, aucune en Maître.',
      ),
      L(
        'Tap a card to send it to its best spot; tap it again to try the next one. You can also drag it (on a touch screen, hold it a moment first).',
        'Touchez une carte pour l’envoyer à la meilleure place; touchez-la encore pour essayer la suivante. Vous pouvez aussi la glisser (sur écran tactile, maintenez-la un instant d’abord).',
      ),
      L(
        'Undo takes back a move (Z or Backspace on a keyboard); Restart deals the same game again (R).',
        'Annuler reprend un coup (Z ou Retour arrière au clavier); Repartir redonne la même partie (R).',
      ),
    ],
    tips: [
      L(
        'Free the kings early and give each its own column: every ladder starts there.',
        'Libérez tôt les rois et donnez-leur chacun une colonne : chaque échelle commence là.',
      ),
      L(
        'With three possible targets per card, choose the one that keeps a buried card reachable.',
        'Avec trois cibles possibles par carte, choisissez celle qui garde une carte enfouie accessible.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [70, 110, 160, 220, 300]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const cfg = byLevel(d, LADDER_LEVELS);
    const init = genL(rng, cfg);
    let s = cloneL(init);
    const hist = new History<LState>(100);
    const sv = ctx.saved as { s?: unknown; hist?: unknown } | undefined;
    if (sv && validState(sv.s, cfg)) {
      s = sv.s;
      hist.restore(sv.hist);
    }
    const nc = cfg.cols;
    const table = tableEl(nc, TOP + TAB_H, 'four-colour');
    let over = false;
    /** Last tapped card and the pile it left, so tapping it again tries its next spot. */
    let lastTap: { c: number; from: string } | null = null;

    /** Proven unwinnable from here, though moves remain (undo can still save it). */
    let doomed = false;
    const judge = () => {
      doomed = !movesL(s).length || solveL(s, 1000).v === 'dead';
    };

    const status = () => {
      const head = `${L('Ladders', 'Échelles')} ${s.done.length} / 4 · ${P(s.moves, ['move', 'moves'], ['coup', 'coups'])}`;
      ctx.status(doomed ? `${head} · ${L('no way to win from here · undo', 'impossible de gagner d’ici · annulez')}` : head);
    };

    const render = () => {
      const kids: HTMLElement[] = [];
      for (let k = 0; k < cfg.cells; k++) {
        const cp = pileEl('c' + k, k, 0, 1.4);
        cp.append(slotEl('c' + k));
        if (s.cells[k] >= 0) cp.append(cardEl(s.cells[k], true, 'c' + k, 0));
        kids.push(cp);
      }
      for (let k = 0; k < 4; k++) {
        const dp = pileEl('d' + k, nc - 4 + k, 0);
        dp.append(slotEl('d' + k, rankLabel(13)));
        if (k < s.done.length) dp.append(cardEl(s.done[k], true, 'd' + k, 0, '', 'lock'));
        kids.push(dp);
      }
      s.cols.forEach((col, k) => {
        const tp = pileEl('t' + k, k, TOP, TAB_H);
        tp.append(slotEl('t' + k));
        const ys = fan(0, col.length, TAB_H);
        col.forEach((c, i) => tp.append(cardEl(c, true, 't' + k, i, `--y:${ys[i]}`)));
        kids.push(tp);
      });
      table.replaceChildren(...kids);
    };

    const after = () => {
      render();
      if (wonL(s)) {
        over = true;
        ctx.solved();
        return;
      }
      judge();
      status();
    };

    /** Apply a validated move (tap, drop and the guide all come through here). */
    const go = (p: string, i: number, to: string) => {
      const c = cardAtL(s, p, i);
      hist.push(s);
      moveL(s, p, i, to);
      lastTap = c == null ? null : { c, from: p };
      after();
    };

    const bump = (p: string, i: number) => {
      const el = elAt(table, p, i);
      if (el) shake(el);
    };

    bindTable(table, {
      canDrag: (p, i) => !over && movableL(s, p, i),
      accepts: (p, i, to) => moveL(s, p, i, to, true),
      tap(p, i) {
        if (over || i < 0 || p[0] === 'd') return;
        ctx.touch();
        const c = cardAtL(s, p, i);
        let opts = destsL(s, p, i);
        // Tapping the card that just moved tries its next spot instead of sending it straight back.
        if (lastTap && lastTap.c === c && opts.length > 1) opts = opts.filter((o) => o !== lastTap!.from);
        if (!opts.length) {
          bump(p, i);
          return;
        }
        go(p, i, opts[0]);
      },
      drop(p, i, to) {
        if (over || !moveL(s, p, i, to, true)) return false;
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
      lastTap = null;
      render();
      judge();
      status();
    };
    const restart = () => {
      if (over || (!hist.size && s.moves === 0)) return;
      ctx.touch();
      hist.push(s);
      s = cloneL(init);
      lastTap = null;
      render();
      judge();
      status();
    };
    ctx.controls(undoBtn(undo), restartBtn(restart));
    root.append(table);
    render();
    if (sv) judge();
    status();

    /** Words for a pile in hint texts. */
    const describe = (m: LMove) => {
      const c = cardAtL(s, m.p, m.i)!;
      const col = m.p[0] === 't' ? s.cols[Number(m.p.slice(1))] : [c];
      const n = m.p[0] === 't' ? col.length - m.i : 1;
      const under = m.p[0] === 't' && m.i > 0 ? col[m.i - 1] : -1;
      if (m.to[0] === 'c')
        return under >= 0
          ? L(
              `Park the ${label(c)} in a free cell to uncover the ${label(under)}.`,
              `Rangez ${leCard(c)} dans une cellule libre pour découvrir ${leCard(under)}.`,
            )
          : L(`Park the ${label(c)} in a free cell for now.`, `Rangez ${leCard(c)} dans une cellule libre pour l’instant.`);
      const dst = s.cols[Number(m.to.slice(1))];
      if (!dst.length)
        return L(
          `Only a king can fill an empty column: move the ${label(c)} there to start a ladder.`,
          `Seul un roi peut occuper une colonne vide : déplacez-y ${leCard(c)} pour commencer une échelle.`,
        );
      const t = dst[dst.length - 1];
      const more =
        n > 2
          ? L(
              ` The ${n - 1} cards on it come along: they form a ladder.`,
              ` Les ${n - 1} cartes dessus suivent : elles forment une échelle.`,
            )
          : n === 2
            ? L(' The card on it comes along: they form a ladder.', ' La carte dessus suit : elles forment une échelle.')
            : '';
      const why =
        under >= 0
          ? L(` That uncovers the ${label(under)}.`, ` Ça découvre ${leCard(under)}.`)
          : m.p[0] === 'c'
            ? L(' That frees the cell.', ' Ça libère la cellule.')
            : '';
      return (
        L(
          `The ${label(c)} fits on the ${label(t)}: one rank lower, another suit.`,
          `${cap(leCard(c))} va sur ${leCard(t)} : un rang de moins, une autre sorte.`,
        ) +
        more +
        why
      );
    };

    /** Exact position key (column and cell order matter to replay a line). */
    const keyOf = (x: LState) => x.cols.map((c) => c.join('.')).join('/') + '|' + x.cells.join(',');
    /** Solver verdicts by position, so check() and hint() never search the same position twice. */
    const verdicts = new Map<string, LVerdict>();
    const solveHere = (): LVerdict => {
      const k = keyOf(s);
      let r = verdicts.get(k);
      if (!r) {
        if (verdicts.size > 300) verdicts.clear();
        r = solveL(s, 4000);
        verdicts.set(k, r);
      }
      return r;
    };
    /** Winning line the guide follows, with the position expected before each of its moves. */
    let plan: { keys: string[]; line: LMove[] } | null = null;
    const planned = (): LMove | null => {
      const k = keyOf(s);
      const at = plan ? plan.keys.indexOf(k) : -1;
      if (plan && at >= 0) return plan.line[at];
      const r = solveHere();
      if (r.v !== 'win' || !r.line.length) return null;
      const keys: string[] = [];
      const x = cloneL(s);
      for (const m of r.line) {
        keys.push(keyOf(x));
        moveL(x, m.p, m.i, m.to);
      }
      plan = { keys, line: r.line };
      return r.line[0];
    };
    /** Positions the guide already went through: its fallback never walks back into one. */
    const seenByGuide = new Set<string>();
    const fallback = (): LMove | null => {
      for (const m of movesL(s)) {
        const x = cloneL(s);
        moveL(x, m.p, m.i, m.to);
        const k = keyOf(x);
        if (seenByGuide.has(k) || verdicts.get(k)?.v === 'dead' || solveL(x, 200).v === 'dead') continue;
        return m;
      }
      return null;
    };
    /** Undo the last move, or deal the same game again when there is nothing to undo. */
    const backOut = () => (hist.size ? undo() : restart());

    /** Dead end: the solver went through every position reachable from here without a win. */
    const check = (): Hint | null => {
      if (over || solveHere().v !== 'dead') return null;
      const cellsFull = cfg.cells > 0 && s.cells.every((c) => c >= 0);
      return {
        kind: 'stuck',
        text: cellsFull
          ? L(
              'No way to win from here: the free cells are full and no series of moves sorts the buried cards. Undo.',
              'Impossible de gagner d’ici : les cellules sont pleines et aucune suite de coups ne remet en ordre les cartes enfouies. Annulez.',
            )
          : L(
              'No way to win from here: every series of moves gets blocked before the four ladders are built. Undo.',
              'Impossible de gagner d’ici : toute suite de coups bloque avant que les quatre échelles soient bâties. Annulez.',
            ),
        at: pilesEl(table, 't'),
        action: hist.size ? L('Undo', 'Annuler') : L('Restart', 'Repartir'),
        play: backOut,
      };
    };

    const hint = (): Hint | null => {
      if (over) return null;
      seenByGuide.add(keyOf(s));
      const m = planned() ?? fallback();
      if (!m)
        return {
          kind: 'stuck',
          text: L(
            'The guide can’t find a way to win from here. Undo a few moves and try another route.',
            'Le guide ne trouve pas de façon de gagner d’ici. Annulez quelques coups et essayez une autre voie.',
          ),
          at: pilesEl(table, 't'),
          action: hist.size ? L('Undo', 'Annuler') : L('Restart', 'Repartir'),
          play: backOut,
        };
      const src = elAt(table, m.p, m.i);
      const at = topEl(table, m.to);
      if (!src || !at) return null;
      const why = [src];
      if (m.p[0] === 't' && m.i > 0) why.push(elAt(table, m.p, m.i - 1)!);
      return {
        text: describe(m),
        why,
        at: [at],
        play: () => go(m.p, m.i, m.to),
      };
    };

    return {
      hint,
      check,
      snapshot: () => ({ s, hist: hist.stack }),
      onKey(e) {
        const k = e.key.toLowerCase();
        if (k === 'z' || k === 'backspace') undo();
        else if (k === 'r') restart();
        else return false;
        return true;
      },
    };
  },
};
