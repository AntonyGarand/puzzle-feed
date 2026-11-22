import './style.css';
import { L, P } from '../../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../../core/types';
import { restartBtn, shake, undoBtn } from '../../ui/dom';
import {
  cap,
  cardEl,
  elAt,
  fan,
  isRed,
  label,
  leCard,
  pileEl,
  pilesEl,
  rank,
  slotEl,
  suit,
  SUITS,
  tableEl,
  topEl,
} from '../../kits/card/cards';
import { autoF, bestDestF, genF, moveF, pickedF, searchF, solveF, wonF, type FMove, type FState } from './rules';
import { bindTable, History } from '../../kits/card/table';

const TAB_H = 7.5;
const TOP = 1.7;

function validState(v: unknown): v is FState {
  const s = v as FState;
  if (!s || !Array.isArray(s.cells) || !Array.isArray(s.found) || !Array.isArray(s.cas) || s.cas.length !== 8 || s.found.length !== 4)
    return false;
  if (!s.cas.every(Array.isArray) || typeof s.moves !== 'number') return false;
  const n = s.cells.filter((c) => c >= 0).length + s.found.reduce((a, b) => a + b, 0) + s.cas.reduce((a, c) => a + c.length, 0);
  return n === 52;
}

export const freecell: PuzzleDef = {
  id: 'freecell',
  get name() {
    return L('FreeCell', 'FreeCell');
  },
  category: 'cards',
  get rules() {
    return L('Use free cells to sort every suit home, A→K.', 'Rangez chaque sorte de A à R grâce aux cellules libres.');
  },
  help: () => ({
    goal: L(
      'All 52 cards are dealt face up. Move them all to the four foundations at the top right, one suit per pile, from ace up to king.',
      'Les 52 cartes sont distribuées face visible. Placez-les toutes sur les quatre fondations en haut à droite, une sorte par pile, de l’as jusqu’au roi.',
    ),
    steps: [
      L(
        'In the eight columns, stack cards in descending order with alternating colours (a red 9 on a black 10). Any card can go in an empty column.',
        'Dans les huit colonnes, empilez les cartes en ordre décroissant en alternant les couleurs (un 9 rouge sur un 10 noir). N’importe quelle carte peut aller dans une colonne vide.',
      ),
      L(
        'The free cells at the top left each hold one card. There are 4, or only 3 on Master.',
        'Les cellules libres en haut à gauche contiennent une carte chacune. Il y en a 4, ou seulement 3 en Maître.',
      ),
      L(
        'Tap a card to play it automatically: to a foundation, onto a matching column, into a free cell, then into an empty column. Or drag it where you want (on a touch screen, hold it a moment first).',
        'Touchez une carte pour la jouer automatiquement : sur une fondation, sur une colonne compatible, dans une cellule libre, puis dans une colonne vide. Ou glissez-la où vous voulez (sur écran tactile, maintenez-la un instant d’abord).',
      ),
      L(
        'You can move an ordered run at once if there is enough room: free cells + 1, doubled for each empty column.',
        'Vous pouvez déplacer une suite ordonnée d’un coup s’il y a assez de place : cellules libres + 1, doublé par colonne vide.',
      ),
      L(
        'Cards that are no longer needed go home on their own. Undo takes back a move (Z or Backspace on a keyboard); Restart deals the same game again (R).',
        'Les cartes devenues inutiles se rangent toutes seules. Annuler reprend un coup (Z ou Retour arrière au clavier); Repartir redonne la même partie (R).',
      ),
    ],
    tips: [
      L('Free the aces and twos buried deep in the columns first.', 'Dégagez d’abord les as et les 2 enfouis dans les colonnes.'),
      L(
        'Keep free cells empty as long as you can; an empty column is worth even more.',
        'Gardez les cellules libres vides le plus longtemps possible; une colonne vide vaut encore plus.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [200, 260, 330, 420, 520]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    let s = genF(d, rng);
    autoF(s);
    const init = structuredClone(s);
    const hist = new History<FState>(80);
    const sv = ctx.saved as { s?: unknown; hist?: unknown } | undefined;
    if (sv && validState(sv.s) && sv.s.cells.length === s.cells.length) {
      s = sv.s;
      hist.restore(sv.hist);
    }
    const nc = s.cells.length;
    const table = tableEl(8, TOP + TAB_H);
    let over = false;

    /** Proven unwinnable from here, though moves remain (undo can still save it). */
    /** Exact position key (cell order and column order matter to replay a line). */
    const keyOf = (x: FState) => x.cells.join(',') + '|' + x.found.join(',') + '|' + x.cas.map((c) => c.join('.')).join('/');
    /** Winning line the guide is following, with the position expected before each of its moves. */
    let plan: { keys: string[]; line: FMove[] } | null = null;
    let doomed = false;
    /** Proven dead ends, by position (undo and the hint button come back to the same ones). */
    const dead = new Map<string, boolean>();
    const judge = () => {
      const k = keyOf(s);
      if (plan?.keys.includes(k)) doomed = false;
      else {
        // No legal move at all is a dead end too (undo can still save it).
        if (!dead.has(k)) dead.set(k, !hasMove() || solveF(s, 1500, true) === 'dead');
        doomed = dead.get(k)!;
      }
    };

    const status = () => {
      const home = s.found.reduce((a, b) => a + b, 0);
      const head = `${L('Home', 'Fondations')} ${home} / 52 · ${P(s.moves, ['move', 'moves'], ['coup', 'coups'])}`;
      if (doomed) ctx.status(`${head} · ${L('no way to win from here · undo', 'impossible de gagner d’ici · annulez')}`);
      else ctx.status(`${head}${nc < 4 ? ` · ${P(nc, ['cell', 'cells'], ['cellule', 'cellules'])}` : ''}`);
    };

    const render = () => {
      const kids: HTMLElement[] = [];
      for (let k = 0; k < nc; k++) {
        const cp = pileEl('c' + k, k, 0, 1.4, 'freecell');
        cp.append(slotEl('c' + k));
        if (s.cells[k] >= 0) cp.append(cardEl(s.cells[k], true, 'c' + k, 0));
        kids.push(cp);
      }
      for (let su = 0; su < 4; su++) {
        const fp = pileEl('f' + su, 4 + su, 0);
        fp.append(slotEl('f' + su, SUITS[su]));
        if (s.found[su]) fp.append(cardEl(su * 13 + s.found[su] - 1, true, 'f' + su, 0, '', 'lock'));
        kids.push(fp);
      }
      s.cas.forEach((col, k) => {
        const tp = pileEl('t' + k, k, TOP, TAB_H);
        tp.append(slotEl('t' + k));
        const ys = fan(0, col.length, TAB_H);
        col.forEach((c, i) => tp.append(cardEl(c, true, 't' + k, i, `--y:${ys[i]}`)));
        kids.push(tp);
      });
      table.replaceChildren(...kids);
    };

    const hasMove = () => {
      for (let k = 0; k < nc; k++) if (s.cells[k] >= 0 && bestDestF(s, 'c' + k, 0)) return true;
      if (s.cells.includes(-1) && s.cas.some((c) => c.length)) return true;
      for (let a = 0; a < 8; a++) {
        const col = s.cas[a];
        for (let i = 0; i < col.length; i++) if (pickedF(s, 't' + a, i) && bestDestF(s, 't' + a, i)) return true;
      }
      return false;
    };

    const after = () => {
      autoF(s);
      render();
      if (wonF(s)) {
        over = true;
        ctx.solved();
        return;
      }
      judge();
      status();
    };

    const bump = (p: string, i: number) => {
      const el = elAt(table, p, i);
      if (el) shake(el);
    };

    /** Apply a validated move (tap, drop and the guide all come through here). */
    const go = (p: string, i: number, to: string) => {
      hist.push(s);
      moveF(s, p, i, to);
      after();
    };

    bindTable(table, {
      canDrag: (p, i) => !over && pickedF(s, p, i) != null,
      accepts: (p, i, to) => moveF(s, p, i, to[0] === 'f' ? 'f' : to, true) || (to[0] === 't' && (pickedF(s, p, i)?.length ?? 0) > 1),
      tap(p, i) {
        if (over || i < 0) return;
        ctx.touch();
        const to = bestDestF(s, p, i);
        if (!to) {
          bump(p, i);
          return;
        }
        go(p, i, to);
      },
      drop(p, i, to) {
        if (over) return false;
        ctx.touch();
        const dest = to[0] === 'f' ? 'f' : to;
        if (!moveF(s, p, i, dest, true)) {
          const n = pickedF(s, p, i)?.length ?? 0;
          if (n > 1 && to[0] === 't')
            ctx.status(
              `${L('Not enough free space to move', 'Pas assez d’espace libre pour déplacer')} ${P(n, ['card', 'cards'], ['carte', 'cartes'])}`,
            );
          return false;
        }
        go(p, i, dest);
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
      judge();
      status();
    };
    /** Deal the same game again (undoable). */
    const restart = () => {
      if (over || JSON.stringify(s) === JSON.stringify(init)) return;
      ctx.touch();
      hist.push(s);
      s = structuredClone(init);
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

    /** Positions the solver could not crack within its budget (don't search them twice). */
    const unknown = new Set<string>();

    /** Next move of a winning line from here, planned once and followed as long as the player does. */
    const planned = (): FMove | null => {
      const k = keyOf(s);
      const at = plan ? plan.keys.indexOf(k) : -1;
      if (plan && at >= 0) return plan.line[at];
      if (unknown.has(k)) return null;
      const r = searchF(s, 2500);
      if (r.v !== 'win' || !r.line.length) {
        unknown.add(k);
        return null;
      }
      const keys: string[] = [];
      const x = structuredClone(s);
      for (const m of r.line) {
        keys.push(keyOf(x));
        moveF(x, m.p, m.i, m.to);
        autoF(x);
      }
      plan = { keys, line: r.line };
      return r.line[0];
    };

    /** The next card a foundation needs, buried under index i of cascade a (or null). */
    const neededUnder = (a: number, i: number): number | null => {
      const col = s.cas[a];
      for (let j = i - 1; j >= 0; j--) if (s.found[suit(col[j])] === rank(col[j]) - 1) return col[j];
      return null;
    };

    /** Explain a solver move the way a player would think about it. */
    const describe = (m: FMove): Hint => {
      const el = (p: string, i: number) => elAt(table, p, i)!;
      const cards = pickedF(s, m.p, m.i)!;
      const c = cards[0];
      const n = cards.length;
      const from = m.p[0] === 't' ? Number(m.p.slice(1)) : -1;
      const need = from >= 0 ? neededUnder(from, m.i) : null;
      const dig =
        need == null
          ? ''
          : s.cas[from][m.i - 1] === need
            ? L(` That uncovers the ${label(need)} for its foundation.`, ` Ça découvre ${leCard(need)} pour sa fondation.`)
            : L(` That digs toward the ${label(need)}, which a foundation needs.`, ` Ça dégage ${leCard(need)}, attendu sur sa fondation.`);
      const why = [el(m.p, m.i)];
      if (need != null) why.push(el(m.p, s.cas[from].indexOf(need)));
      const play = () => go(m.p, m.i, m.to);
      if (m.to === 'f')
        return {
          text:
            rank(c) === 1
              ? L(
                  `The ${label(c)} starts its foundation. Each suit builds up there from ace to king.`,
                  `${cap(leCard(c))} commence sa fondation. Chaque sorte s’y empile de l’as au roi.`,
                )
              : L(
                  `The ${label(c)} goes home on the ${label(c - 1)}: foundations build up by suit.`,
                  `${cap(leCard(c))} monte sur ${leCard(c - 1)} : les fondations montent par sorte.`,
                ),
          why,
          at: [topEl(table, 'f' + suit(c))!],
          play,
        };
      if (m.to[0] === 'c')
        return {
          text:
            L(
              `Park the ${label(c)} in a free cell: each cell holds one card.`,
              `Rangez ${leCard(c)} dans une cellule libre : une carte par cellule.`,
            ) + dig,
          why,
          at: [el('c' + Math.max(0, s.cells.indexOf(-1)), -1)],
          play,
        };
      const t = Number(m.to.slice(1));
      const dst = s.cas[t];
      if (!dst.length)
        return {
          text:
            (n > 1
              ? L(
                  `An empty column takes any card: move these ${n} cards there.`,
                  `Une colonne vide accepte n’importe quelle carte : déplacez-y ces ${n} cartes.`,
                )
              : L(
                  `An empty column takes any card: move the ${label(c)} there.`,
                  `Une colonne vide accepte n’importe quelle carte : déplacez-y ${leCard(c)}.`,
                )) + (m.p[0] === 'c' ? L(' That frees the cell.', ' Ça libère la cellule.') : dig),
          why,
          at: [topEl(table, m.to)!],
          play,
        };
      const top = dst[dst.length - 1];
      const fit = L(
        `one lower, ${isRed(top) ? 'black on red' : 'red on black'}`,
        `une valeur de moins, ${isRed(top) ? 'noir sur rouge' : 'rouge sur noir'}`,
      );
      return {
        text:
          (m.p[0] === 'c'
            ? L(
                `The ${label(c)} can leave its cell for the ${label(top)} (${fit}). Free cells are precious; empty them when you can.`,
                `${cap(leCard(c))} peut quitter sa cellule pour ${leCard(top)} (${fit}). Videz les cellules dès que possible.`,
              )
            : n > 1
              ? L(
                  `Move these ${n} cards at once onto the ${label(top)} (${fit}): free cells and empty columns let a run move together.`,
                  `Déplacez ces ${n} cartes d’un coup sur ${leCard(top)} (${fit}) : les cellules et colonnes libres permettent de bouger une suite.`,
                )
              : L(`Stack the ${label(c)} on the ${label(top)}: ${fit}.`, `Empilez ${leCard(c)} sur ${leCard(top)} : ${fit}.`)) + dig,
        why,
        at: [el(m.to, dst.length - 1)],
        play,
      };
    };

    /** Positions the guide has already been through (its fallback never walks back into one). */
    const seenByGuide = new Set<string>();
    /** No line from the solver: what a tap would do with some card, avoiding positions already seen. */
    const fallback = (): FMove | null => {
      const tries: { p: string; i: number }[] = [];
      for (let k = 0; k < nc; k++) if (s.cells[k] >= 0) tries.push({ p: 'c' + k, i: 0 });
      s.cas.forEach((col, a) => {
        for (let i = col.length - 1; i >= 0 && pickedF(s, 't' + a, i); i--) tries.push({ p: 't' + a, i });
      });
      for (const m of tries) {
        const to = bestDestF(s, m.p, m.i);
        if (!to) continue;
        const x = structuredClone(s);
        moveF(x, m.p, m.i, to);
        autoF(x);
        const k = keyOf(x);
        if (seenByGuide.has(k)) continue;
        if (!dead.has(k)) dead.set(k, solveF(x, 1500, true) === 'dead');
        if (!dead.get(k)) return { ...m, to };
      }
      return null;
    };

    const hint = (): Hint | null => {
      if (over) return null;
      seenByGuide.add(keyOf(s));
      const m = planned() ?? fallback();
      return m ? describe(m) : null;
    };

    /** Dead end: the solver went through every position reachable from here without finding a win. */
    const check = (): Hint | null => {
      if (over || !doomed) return null;
      return {
        kind: 'stuck',
        text: s.cells.every((c) => c >= 0)
          ? L(
              'No way to win from here: the free cells are full and no series of moves frees the cards the foundations need. Undo.',
              'Impossible de gagner d’ici : les cellules sont pleines et aucune suite de coups ne libère les cartes attendues. Annulez.',
            )
          : L(
              'No way to win from here: every series of moves runs dry before the foundations are complete. Undo.',
              'Impossible de gagner d’ici : toutes les suites de coups s’épuisent avant que les fondations soient complètes. Annulez.',
            ),
        at: pilesEl(table, 'f'),
        action: hist.size ? L('Undo', 'Annuler') : L('Restart', 'Repartir'),
        play: backOut,
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
