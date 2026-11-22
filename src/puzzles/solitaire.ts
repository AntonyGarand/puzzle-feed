import './solitaire.css';
import { L, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { btn, h, shake } from '../core/ui';
import { cap, cardEl, elAt, fan, isRed, label, leCard, pileEl, rank, slotEl, suit, SUITS, tableEl, topEl } from './cardkit/cards';
import {
  bestDest,
  canDraw,
  canRedeal,
  genK,
  draw,
  finishK,
  hasProgress,
  type KGoal,
  type KMove,
  moveK,
  progressPlan,
  talonPlays,
  picked,
  trivialK,
  wonK,
  type KRules,
  type KState,
} from './cardkit/klondike';
import { bindTable, History } from './cardkit/table';

const TAB_H = 7.6; // tableau height in card widths
const TOP = 1.7; // tableau y offset

function validState(v: unknown): v is KState {
  const s = v as KState;
  if (!s || !Array.isArray(s.stock) || !Array.isArray(s.waste) || !Array.isArray(s.found) || !Array.isArray(s.tab)) return false;
  if (s.found.length !== 4 || s.tab.length !== 7 || !s.tab.every((t) => Array.isArray(t?.d) && Array.isArray(t?.u))) return false;
  const n = s.stock.length + s.waste.length + s.found.reduce((a, b) => a + b, 0) + s.tab.reduce((a, t) => a + t.d.length + t.u.length, 0);
  return n === 52 && typeof s.redeals === 'number' && typeof s.moves === 'number';
}

export const solitaire: PuzzleDef = {
  id: 'solitaire',
  get name() {
    return L('Solitaire', 'Solitaire');
  },
  category: 'cards',
  get rules() {
    return L('Build suits A→K. Stack down in alternating colours.', 'Montez les sortes de A à R; alternez les couleurs.');
  },
  help: () => ({
    goal: L(
      'Move all 52 cards to the four foundations at the top right, one suit per pile, from ace up to king.',
      'Placez les 52 cartes sur les quatre fondations en haut à droite, une sorte par pile, de l’as jusqu’au roi.',
    ),
    steps: [
      L(
        'In the seven columns, stack cards in descending order with alternating colours (a red 9 on a black 10). Only a king can go in an empty column.',
        'Dans les sept colonnes, empilez les cartes en ordre décroissant en alternant les couleurs (un 9 rouge sur un 10 noir). Seul un roi peut occuper une colonne vide.',
      ),
      L(
        'Tap a card to play it automatically: to a foundation if it fits, otherwise onto a matching column. You can also drag it with the cards on top (on a touch screen, hold it a moment first).',
        'Touchez une carte pour la jouer automatiquement : sur une fondation si elle convient, sinon sur une colonne compatible. Vous pouvez aussi la glisser avec les cartes posées dessus (sur écran tactile, maintenez-la un instant d’abord).',
      ),
      L(
        'Tap the stock (top left) to turn cards onto the waste. When it is empty, tap ↻ to turn the waste over again, if redeals remain.',
        'Touchez la pioche (en haut à gauche) pour retourner des cartes sur le talon. Une fois vide, touchez ↻ pour reprendre le talon, s’il vous reste des passes.',
      ),
      L(
        'Levels change the draw: 1 card on Easy to Hard, 3 cards on Expert and Master, and fewer passes through the stock on Medium, Hard and Master.',
        'Les niveaux changent la pioche : 1 carte de Facile à Difficile, 3 cartes en Expert et Maître, et moins de passes en Moyen, Difficile et Maître.',
      ),
      L(
        'Undo takes back a move (Z or Backspace on a keyboard); Space or D draws. Once every card is face up and the stock is empty, the rest goes home on its own.',
        'Annuler reprend un coup (Z ou Retour arrière au clavier); Espace ou D pioche. Quand toutes les cartes sont visibles et la pioche vide, le reste se range tout seul.',
      ),
    ],
    tips: [
      L(
        'Prioritise moves that turn over a face-down card in the columns.',
        'Privilégiez les coups qui retournent une carte cachée dans les colonnes.',
      ),
      L(
        'Don’t empty a column unless you have a king ready to put there.',
        'Ne videz pas une colonne si vous n’avez pas de roi à y placer.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [240, 300, 360, 420, 540]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const rules: KRules = byLevel<KRules>(d, [
      { draw: 1, redeals: -1 },
      { draw: 1, redeals: 2 },
      { draw: 1, redeals: 1 },
      { draw: 3, redeals: -1 },
      { draw: 3, redeals: 2 },
    ]);
    let s = genK(rng, rules);

    const hist = new History<KState>(80);
    const sv = ctx.saved as { s?: unknown; hist?: unknown } | undefined;
    if (sv && validState(sv.s)) {
      s = sv.s;
      hist.restore(sv.hist);
    }

    const table = tableEl(7, TOP + TAB_H);
    let over = false;

    const status = (extra = '') => {
      const home = s.found.reduce((a, b) => a + b, 0);
      const pass = rules.redeals < 0 ? '' : ` · ${L('Pass', 'Passe')} ${s.redeals + 1}/${rules.redeals + 1}`;
      ctx.status(extra || `${L('Home', 'Fondations')} ${home}/52${pass || ` · ${L('Moves', 'Coups')} ${s.moves}`}`);
    };

    const render = () => {
      const kids: HTMLElement[] = [];
      // stock
      const sp = pileEl('s', 0, 0);
      sp.append(slotEl('s', s.waste.length && canRedeal(s, rules) ? '↻' : ''));
      if (s.stock.length) {
        sp.append(cardEl(0, false, 's', s.stock.length - 1, '', 'stock'));
        sp.append(h('span', { class: 'badge' }, s.stock.length));
      }
      kids.push(sp);
      // waste (fanned in draw-3)
      const wp = pileEl('w', 1, 0);
      wp.append(slotEl('w'));
      const show = rules.draw === 3 ? 3 : 1;
      const from = Math.max(0, s.waste.length - show);
      for (let i = from; i < s.waste.length; i++) {
        const top = i === s.waste.length - 1;
        wp.append(cardEl(s.waste[i], true, 'w', i, `--dx:${(i - from) * 0.3}`, top ? '' : 'lock'));
      }
      kids.push(wp);
      // foundations
      for (let su = 0; su < 4; su++) {
        const fp = pileEl('f' + su, 3 + su, 0);
        fp.append(slotEl('f' + su, SUITS[su]));
        if (s.found[su]) fp.append(cardEl(su * 13 + s.found[su] - 1, true, 'f' + su, 0));
        kids.push(fp);
      }
      // tableau
      s.tab.forEach((col, k) => {
        const tp = pileEl('t' + k, k, TOP, TAB_H);
        tp.append(slotEl('t' + k, L('K', 'R')));
        const ys = fan(col.d.length, col.u.length, TAB_H);
        col.d.forEach((c, i) => tp.append(cardEl(c, false, 't' + k, i, `--y:${ys[i]}`)));
        col.u.forEach((c, j) => tp.append(cardEl(c, true, 't' + k, col.d.length + j, `--y:${ys[col.d.length + j]}`)));
        kids.push(tp);
      });
      table.replaceChildren(...kids);
    };

    const after = () => {
      render();
      if (trivialK(s) && !wonK(s)) {
        finishK(s);
        render();
      }
      if (wonK(s)) {
        over = true;
        status(L(`Moves ${s.moves} · All home!`, `${P(s.moves, ['coup', 'coups'], ['coup', 'coups'])} · Tout est rangé!`));
        ctx.solved();
        return;
      }
      // Nothing can ever be flipped, played home or taken from the talon again: cycling the stock
      // (even with unlimited redeals) or shuffling runs around won't change that.
      if (!hasProgress(s, rules)) {
        over = true;
        status(L('No useful moves left', 'Plus aucun coup utile'));
        ctx.failed();
        return;
      }
      status();
    };

    const bump = (p: string, i: number) => {
      const el = elAt(table, p, i);
      if (el) shake(el);
    };

    const doDraw = () => {
      if (!canDraw(s, rules)) {
        bump('s', -1);
        return;
      }
      hist.push(s);
      draw(s, rules);
      after();
    };

    /** Apply a validated move (tap, drop and the guide all come through here). */
    const go = (p: string, i: number, to: string) => {
      hist.push(s);
      moveK(s, p, i, to);
      after();
    };

    bindTable(table, {
      canDrag: (p, i) => !over && p !== 's' && picked(s, p, i) != null,
      accepts: (p, i, to) => moveK(s, p, i, to[0] === 'f' ? 'f' : to, true),
      tap(p, i) {
        if (over) return;
        ctx.touch();
        if (p === 's') {
          doDraw();
          return;
        }
        if (i < 0) return;
        const to = bestDest(s, p, i);
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
        if (!moveK(s, p, i, dest, true)) return false;
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
      status();
    };
    ctx.controls(btn(L('Undo', 'Annuler'), undo, 'ghost'));
    root.append(table);
    render();
    status();

    let lastRule = '';
    const fit = (dst: number) =>
      L(
        `one lower, ${isRed(dst) ? 'black on red' : 'red on black'}`,
        `une valeur de moins, ${isRed(dst) ? 'noir sur rouge' : 'rouge sur noir'}`,
      );
    /** Exact position key, to follow a plan of shuffles one move at a time. */
    const keyOf = (x: KState) => JSON.stringify([x.stock, x.waste, x.found, x.tab]);
    /** Face-down cards plus talon cards: drops with every flip and every card taken from the talon. */
    const hidden = (x: KState) => x.stock.length + x.waste.length + x.tab.reduce((a, t) => a + t.d.length, 0);
    const homeCount = (x: KState) => x.found.reduce((a, b) => a + b, 0);
    /**
     * Shuffles the guide is walking through (no direct progress was possible), with the position
     * expected before each, and the foundation cards they take down: those must not go straight back
     * home until the shuffle has paid off (a flip, a talon card played or another card home).
     */
    let plan: { keys: string[]; line: KMove[]; keep: Set<number>; hidden: number; home: number } | null = null;
    const planStep = (m: KMove, goal: KGoal): Hint => {
      const c = picked(s, m.p, m.i)![0];
      const col = s.tab[Number(m.to.slice(1))];
      const dst = col.u[col.u.length - 1];
      const then =
        goal === 'flip'
          ? L('so that a face-down card can turn over', 'pour qu’une carte cachée puisse se retourner')
          : goal === 'home'
            ? L('so that another card can go home', 'pour qu’une autre carte puisse monter sur sa fondation')
            : L('so that a card from the stock can be played', 'pour qu’une carte de la pioche puisse se jouer');
      return {
        text:
          dst == null
            ? L(
                `Nothing plays directly. Move the ${label(c)} to the empty column (only kings may) ${then}.`,
                `Rien ne se joue directement. Déplacez ${leCard(c)} dans la colonne vide (seuls les rois le peuvent) ${then}.`,
              )
            : m.p[0] === 'f'
              ? L(
                  `Nothing plays directly. Take the ${label(c)} back down onto the ${label(dst)} (${fit(dst)}) ${then}.`,
                  `Rien ne se joue directement. Redescendez ${leCard(c)} sur ${leCard(dst)} (${fit(dst)}) ${then}.`,
                )
              : L(
                  `Nothing plays directly. Move the ${label(c)} onto the ${label(dst)} (${fit(dst)}) ${then}.`,
                  `Rien ne se joue directement. Déplacez ${leCard(c)} sur ${leCard(dst)} (${fit(dst)}) ${then}.`,
                ),
        why: [m.p[0] === 'f' ? topEl(table, m.p)! : elAt(table, m.p, m.i)!],
        at: [topEl(table, m.to)!],
        play: () => go(m.p, m.i, m.to),
      };
    };
    let planGoal: KGoal = 'flip';
    /** Positions where the guide found no useful move (it steers around them after an undo). */
    const deadEnds = new Set<string>();
    /** Positions the guide already drew from since the last real progress. */
    const drawSeen = new Set<string>();
    let drawMeasure = '';
    /** Hints given since the last real progress, and the position where that stretch began. */
    let idle = 0;
    let stretch = '';
    let best = -1e9;
    let giveUps = 0;
    const stuckHint = (): Hint => ({
      kind: 'stuck',
      text: L(
        'The guide finds no useful move from here: nothing more goes home, turns over or comes off the stock. Undo a few moves and try another way.',
        'Le guide ne trouve aucun coup utile d’ici : plus rien ne monte, ne se retourne ni ne sort de la pioche. Annulez quelques coups et essayez autrement.',
      ),
      at: [topEl(table, 's')!],
      action: L('Undo', 'Annuler'),
      play: undo,
    });

    const hint = (): Hint | null => {
      if (over) return null;
      // Follow the shuffles under way; drop the plan once it paid off (or the player went elsewhere).
      const measure = `${hidden(s)}/${homeCount(s)}`;
      if (measure !== drawMeasure) {
        drawSeen.clear();
        drawMeasure = measure;
        idle = 0;
        stretch = keyOf(s);
      }
      // Going round in circles (the useful-looking moves all lead back here): give up on this stretch.
      // After a few give-ups without ever getting further, stop suggesting anything.
      const record = homeCount(s) * 100 - hidden(s);
      if (record > best) {
        best = record;
        giveUps = 0;
      }
      if (giveUps >= 3) return null;
      if (++idle > 40 && hist.size) {
        deadEnds.add(stretch);
        giveUps++;
        idle = 0;
        return stuckHint();
      }
      const at = plan ? plan.keys.indexOf(keyOf(s)) : -1;
      if (plan && at >= 0) return planStep(plan.line[at], planGoal);
      if (plan && (hidden(s) !== plan.hidden || homeCount(s) > plan.home)) plan = null;
      const keep = plan?.keep ?? new Set<number>();
      let cands: { rule: string; h: Hint; m: KMove }[] = [];
      // Home: a top card that continues its foundation.
      const homeFrom = (p: string, i: number, c: number) =>
        cands.push({
          rule: 'home',
          m: { p, i, to: 'f' },
          h: {
            text:
              rank(c) === 1
                ? L(
                    `Aces go straight up: the ${label(c)} starts the ${SUITS[suit(c)]} foundation, which builds up to the king.`,
                    `Les as montent tout de suite : ${leCard(c)} commence la fondation ${SUITS[suit(c)]}, qui monte jusqu’au roi.`,
                  )
                : L(
                    `The ${label(c)} goes home on the ${label(c - 1)}: foundations build up by suit.`,
                    `${cap(leCard(c))} monte sur ${leCard(c - 1)} : les fondations montent par sorte.`,
                  ),
            why: [elAt(table, p, i)!],
            at: [topEl(table, 'f' + suit(c))!],
            play: () => go(p, i, 'f'),
          },
        });
      s.tab.forEach((col, a) => {
        const i = col.d.length + col.u.length - 1;
        if (col.u.length && !keep.has(col.u[col.u.length - 1]) && moveK(s, 't' + a, i, 'f', true))
          homeFrom('t' + a, i, col.u[col.u.length - 1]);
      });
      if (s.waste.length && moveK(s, 'w', s.waste.length - 1, 'f', true)) homeFrom('w', s.waste.length - 1, s.waste[s.waste.length - 1]);
      // Reveal: move a whole face-up run off a face-down card, deepest pile first.
      const order = s.tab.map((_, a) => a).sort((x, y) => s.tab[y].d.length - s.tab[x].d.length);
      reveal: for (const a of order) {
        const col = s.tab[a];
        if (!col.d.length || !col.u.length) continue;
        const i = col.d.length;
        for (let b = 0; b < 7; b++) {
          if (b === a || !moveK(s, 't' + a, i, 't' + b, true)) continue;
          const c = col.u[0];
          const dst = s.tab[b].u[s.tab[b].u.length - 1];
          const n = col.u.length;
          cands.push({
            rule: dst == null ? 'king' : 'reveal',
            m: { p: 't' + a, i, to: 't' + b },
            h: {
              text:
                dst == null
                  ? L(
                      `Only a king may fill an empty column. Move the ${label(c)} there to turn over the hidden card it was on.`,
                      `Seul un roi peut occuper une colonne vide. Déplacez-y ${leCard(c)} pour retourner la carte cachée dessous.`,
                    )
                  : L(
                      `Move the ${label(c)}${n > 1 ? ` and ${n === 2 ? 'the card' : `the ${n - 1} cards`} on it` : ''} onto the ${label(dst)} (${fit(dst)}): the face-down card underneath turns over.`,
                      `Déplacez ${leCard(c)}${n > 1 ? ` avec ${n === 2 ? 'la carte posée dessus' : `les ${n - 1} cartes posées dessus`}` : ''} sur ${leCard(dst)} (${fit(dst)}) : la carte cachée dessous se retourne.`,
                    ),
              why: [elAt(table, 't' + a, i)!],
              at: [topEl(table, 't' + b)!],
              play: () => go('t' + a, i, 't' + b),
            },
          });
          break reveal;
        }
      }
      // Waste: play the turned card onto the tableau.
      if (s.waste.length) {
        const i = s.waste.length - 1;
        const c = s.waste[i];
        for (let b = 0; b < 7; b++) {
          if (!moveK(s, 'w', i, 't' + b, true)) continue;
          const dst = s.tab[b].u[s.tab[b].u.length - 1];
          cands.push({
            rule: 'waste',
            m: { p: 'w', i, to: 't' + b },
            h: {
              text:
                dst == null
                  ? L(
                      `The ${label(c)} from the waste can fill the empty column: only kings may.`,
                      `${cap(leCard(c))} du talon peut occuper la colonne vide : seuls les rois le peuvent.`,
                    )
                  : L(
                      `Use the ${label(c)} from the waste: it fits on the ${label(dst)}, ${fit(dst)}.`,
                      `Jouez ${leCard(c)} du talon : il va sur ${leCard(dst)}, ${fit(dst)}.`,
                    ),
              why: [elAt(table, 'w', i)!],
              at: [topEl(table, 't' + b)!],
              play: () => go('w', i, 't' + b),
            },
          });
          break;
        }
      }
      // Never walk back into a position the guide already found to be a dead end.
      cands = cands.filter(({ m }) => {
        const x = structuredClone(s);
        moveK(x, m.p, m.i, m.to);
        return !deadEnds.has(keyOf(x));
      });
      // Drawing is useful while some talon card plays; a full turn of the talon back to a position
      // already drawn from (with nothing flipped or sent home since) means none of them helps.
      const talon = !cands.length && talonPlays(s, rules) && !drawSeen.has(keyOf(s));
      if (!cands.length && !talon) {
        // Nothing plays directly and the talon has nothing either: shuffle the tableau toward a play.
        const pl = progressPlan(s, rules, keep);
        if (!pl && keep.size) {
          // The player left the planned shuffles: forget which cards were held back.
          plan = null;
          return hint();
        }
        if (pl?.line.length) {
          const keys: string[] = [];
          const x = structuredClone(s);
          const down = new Set<number>(keep);
          for (const m of pl.line) {
            keys.push(keyOf(x));
            if (m.p[0] === 'f') down.add(picked(x, m.p, m.i)![0]);
            moveK(x, m.p, m.i, m.to);
          }
          plan = { keys, line: pl.line, keep: down, hidden: hidden(x), home: homeCount(x) };
          planGoal = pl.goal;
          return planStep(pl.line[0], pl.goal);
        }
        // Nothing to back out of: say nothing rather than offer an Undo that can't happen.
        if (!hist.size) return null;
        deadEnds.add(keyOf(s));
        return stuckHint();
      }
      if (!cands.length) {
        lastRule = 'draw';
        drawSeen.add(keyOf(s));
        return {
          text: s.stock.length
            ? L(
                `Nothing useful on the table: tap the stock to turn ${rules.draw === 1 ? 'a card' : 'three cards'} over, until the waste shows one that plays.`,
                `Rien d’utile sur la table : touchez la pioche pour retourner ${rules.draw === 1 ? 'une carte' : 'trois cartes'}, jusqu’à ce que le talon en montre une qui se joue.`,
              )
            : L(
                'The stock is empty: tap ↻ to turn the waste over and go through it again.',
                'La pioche est vide : touchez ↻ pour retourner le talon et le parcourir de nouveau.',
              ),
          at: [topEl(table, 's')!],
          play: () => {
            if (!s.stock.length) return doDraw();
            // Keep turning until the waste's top card has somewhere to go (or the stock runs out).
            const plays = () => s.waste.length > 0 && bestDest(s, 'w', s.waste.length - 1) != null;
            for (let n = s.stock.length; n > 0; n--) {
              doDraw();
              if (over || !s.stock.length || plays()) break;
            }
          },
        };
      }
      const pick = cands.find((x) => x.rule !== lastRule) ?? cands[0];
      lastRule = pick.rule;
      return pick.h;
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
            doDraw();
          }
          return true;
        }
        return false;
      },
    };
  },
};
