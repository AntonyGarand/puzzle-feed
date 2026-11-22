import './style.css';
import { L, P } from '../../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../../core/types';
import { board, h, restartBtn, shake, undoBtn } from '../../ui/dom';
import { GLYPH, pieceName, sqName as squareName } from '../../kits/chess/pieces';
import { anim } from '../../kits/move/kit';
import { apply, count, findMistake, generate, mFrom, moves, mTo, noCaptures, parseSaved, planHint, QUEEN, replay, ROOK } from './rules';

/**
 * Capture-only chess: one army, every move takes another piece, clear the board down to one.
 * The rules, solver and generator live in `rules.ts`; this module draws the board and handles input.
 */

/** French article for a piece: tour and dame are feminine. */
const LE = (p: number) => (p === ROOK || p === QUEEN ? 'la' : 'le');

export const captureChess: PuzzleDef = {
  id: 'capture-chess',
  get name() {
    return L('Capture Chess', 'Échecs à prises');
  },
  category: 'cards',
  offByDefault: true,
  get rules() {
    return L('Every move must capture. Leave just one piece.', 'Chaque coup doit prendre. Laissez une seule pièce.');
  },
  help: () => ({
    goal: L(
      'All pieces are on your side. Capture one with another, again and again, until a single piece is left on the board.',
      'Toutes les pièces sont à vous. Prenez-en une avec une autre, encore et encore, jusqu’à ce qu’il ne reste qu’une pièce.',
    ),
    steps: [
      L(
        'Pieces move as in chess, and every move must capture: sliding pieces can’t jump over others.',
        'Les pièces se déplacent comme aux échecs, et chaque coup doit prendre : les pièces qui glissent ne sautent pas les autres.',
      ),
      L(
        'Pawns take one square diagonally upward and never promote. The king is an ordinary piece moving one square.',
        'Les pions prennent une case en diagonale vers le haut et ne sont jamais promus. Le roi est une pièce ordinaire qui avance d’une case.',
      ),
      L(
        'From Hard up, each piece can capture at most twice: its dots show the captures it has left.',
        'À partir de Difficile, chaque pièce peut prendre au plus deux fois : ses points montrent les prises qui lui restent.',
      ),
      L(
        'Tap a piece to see what it can take, then tap the target. You can also drag the piece onto it.',
        'Touchez une pièce pour voir ce qu’elle peut prendre, puis touchez la cible. Vous pouvez aussi glisser la pièce dessus.',
      ),
      L(
        'Stuck with no capture left? Undo (Z or Backspace) takes back a move; Restart (R) sets the board up again.',
        'Bloqué sans prise possible? Annuler (Z ou Retour arrière) reprend un coup; Repartir (R) replace toutes les pièces.',
      ),
    ],
    tips: [
      L(
        'Find the piece that is hardest to reach and plan who will take it, or which piece it should take.',
        'Repérez la pièce la plus difficile à atteindre et prévoyez qui la prendra, ou ce qu’elle devra prendre.',
      ),
      L(
        'Pawns and kings only reach their neighbours: use them early, before the board thins out.',
        'Les pions et les rois n’atteignent que leurs voisines : servez-vous-en tôt, avant que le plateau se vide.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [30, 60, 120, 180, 300]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const g = generate(rng, d);
    const { n, limit } = g;
    const N = n * n;
    let cur = g.start;
    const done: number[] = [];
    let sel = -1;
    let over = false;
    let justPicked = false;

    /** Lines of captures taken back by Restart, newest last (Undo brings them back). */
    const restarts: number[][] = [];

    const sqName = (sq: number) => squareName(sq, n);
    const grid = board(n, n, 'cc-board chessboard');
    const cells = Array.from({ length: N }, (_, sq) => {
      const el = h('button', {
        type: 'button',
        class: 'cell',
        'data-i': sq,
        'data-rank': sq % n === 0 ? String(n - Math.floor(sq / n)) : null,
        onclick: () => tap(sq),
      });
      grid.append(el);
      return el;
    });

    const targets = () => new Set(sel >= 0 ? moves(g, cur, sel).map(mTo) : []);
    const stuck = () => !over && noCaptures(g, cur);

    const render = () => {
      const tg = targets();
      const last = done.length ? done[done.length - 1] : -1;
      cells.forEach((el, sq) => {
        const p = cur.type[sq];
        const dark = (Math.floor(sq / n) + (sq % n)) % 2 === 1;
        let cls = 'cell';
        if (dark) cls += ' dk';
        if (sq === sel) cls += ' sel';
        if (tg.has(sq)) cls += ' tgt';
        if (last >= 0 && (sq === mFrom(last) || sq === mTo(last))) cls += ' last';
        if (p && limit && cur.used[sq] >= limit) cls += ' spent';
        el.className = cls;
        el.setAttribute('aria-label', `${sqName(sq)}${p ? ' ' + pieceName(p) : ''}`);
        const kids: HTMLElement[] = [];
        if (p) kids.push(h('span', { class: 'pc' }, GLYPH[p]));
        if (p && limit) {
          const pips = h('span', { class: 'pips', 'aria-hidden': 'true' });
          for (let k = 0; k < limit; k++) pips.append(h('i', { class: k < limit - cur.used[sq] ? 'on' : '' }));
          kids.push(pips);
        }
        if (Math.floor(sq / n) === n - 1) kids.push(h('span', { class: 'co', 'aria-hidden': 'true' }, sqName(sq)[0]));
        el.replaceChildren(...kids);
      });
      const left = count(cur);
      const pieces = P(left, ['piece left', 'pieces left'], ['pièce restante', 'pièces restantes']);
      if (stuck()) ctx.status(`${pieces} · ${L('no capture left · undo', 'aucune prise possible · annulez')}`);
      else ctx.status(`${pieces}${limit ? L(` · max ${limit} captures`, ` · ${limit} prises max`) : ''}`);
    };

    const play = (m: number) => {
      cur = apply(cur, m);
      done.push(m);
      sel = -1;
      render();
      const a = cells[mFrom(m)],
        b = cells[mTo(m)];
      const pc = b.querySelector('.pc');
      if (pc)
        anim(
          pc,
          [{ transform: `translate(${a.offsetLeft - b.offsetLeft}px, ${a.offsetTop - b.offsetTop}px)` }, { transform: 'none' }],
          200,
        );
      if (count(cur) === 1) {
        over = true;
        ctx.solved();
      } else if (stuck()) shake(grid);
    };

    const tap = (sq: number) => {
      if (over) return;
      if (justPicked && sq === sel) {
        justPicked = false;
        return;
      }
      justPicked = false;
      ctx.touch();
      if (sel >= 0 && targets().has(sq)) {
        play(sel * 64 + sq);
        return;
      }
      if (cur.type[sq] && sq !== sel) {
        sel = sq;
        if (!moves(g, cur, sq).length) shake(cells[sq]);
      } else sel = -1;
      render();
    };

    // Drag: press a piece (it gets picked up), release over a target. A plain tap is handled by click.
    let dragging = false;
    grid.addEventListener('pointerdown', (e) => {
      if (over) return;
      const el = (e.target as Element).closest<HTMLElement>('[data-i]');
      const sq = el ? Number(el.dataset['i']) : -1;
      if (sq < 0 || !cur.type[sq] || (sel >= 0 && targets().has(sq))) return;
      ctx.touch();
      dragging = true;
      if (sq === sel) return;
      sel = sq;
      justPicked = true;
      render();
    });
    grid.addEventListener('pointercancel', () => (dragging = false));
    grid.addEventListener('pointerup', (e) => {
      if (!dragging) return;
      dragging = false;
      if (over || sel < 0) return;
      const el = document.elementFromPoint?.(e.clientX, e.clientY)?.closest<HTMLElement>('[data-i]');
      const sq = el && grid.contains(el) ? Number(el.dataset['i']) : -1;
      if (sq < 0 || sq === sel || !targets().has(sq)) return;
      justPicked = false;
      play(sel * 64 + sq);
    });

    /** Undo takes back the last capture; right after a Restart it brings the whole line back. */
    const undo = () => {
      if (over) return;
      if (done.length) done.pop();
      else if (restarts.length) done.push(...restarts.pop()!);
      else return;
      ctx.touch();
      cur = replay(g, done);
      sel = -1;
      render();
    };
    const restart = () => {
      if (over || !done.length) return;
      ctx.touch();
      restarts.push([...done]);
      done.length = 0;
      cur = g.start;
      sel = -1;
      render();
    };
    ctx.controls(undoBtn(undo), restartBtn(restart));

    // ---- resume ----
    const sv = parseSaved(g, ctx.saved);
    done.push(...sv.moves);
    cur = replay(g, done);
    restarts.push(...sv.restarts);
    sel = sv.sel;

    // ---- Guide ----
    /** Proven results by position, shared by check() and hint() (positions never change meaning). */
    const memo = new Map<string, boolean>();
    /** The capture that turned a clearable board into one that can't be cleared (fix: undo back to before it). */
    const check = (): Hint | null => {
      if (over) return null;
      const mk = findMistake(g, done, memo);
      if (!mk) return null;
      const { before: s, back } = mk;
      const f = mFrom(mk.move),
        t = mTo(mk.move);
      const pf = pieceName(s.type[f]),
        pt = pieceName(s.type[t]);
      const left = count(s) - 1;
      const why = mk.noCapture
        ? L(
            `after it no piece can capture anything, with ${left} pieces still on the board`,
            `après elle, aucune pièce ne peut plus rien prendre, et il en reste ${left}`,
          )
        : L(
            'from there, every order of captures leaves some piece that nothing can reach',
            'à partir de là, tout ordre de prises laisse une pièce que rien ne peut atteindre',
          );
      return {
        kind: 'fix',
        text:
          back === 1
            ? L(
                `Taking the ${pt} on ${sqName(t)} with your ${pf} was a mistake: ${why}. Undo it.`,
                `Prendre ${LE(s.type[t])} ${pt} en ${sqName(t)} avec votre ${pf} était une erreur : ${why}. Annulez ce coup.`,
              )
            : L(
                `Your ${pf} taking the ${pt} on ${sqName(t)}, ${back} moves ago, was the mistake: ${why}. Undo back to before it.`,
                `La prise de ${LE(s.type[t])} ${pt} en ${sqName(t)} par votre ${pf}, il y a ${back} coups, était l’erreur : ${why}. Annulez jusqu’avant ce coup.`,
              ),
        at: [cells[t]],
        action: L('Undo', 'Annuler'),
        play: () => {
          for (let i = 0; i < back; i++) undo();
        },
      };
    };
    let lastKind = '';
    const hint = (): Hint | null => {
      if (over) return null;
      const plan = planHint(g, cur, done, memo);
      if (!plan) return null;
      if (plan.type === 'stuck')
        return {
          text: L(
            `No piece can capture anything, and ${count(cur)} pieces are still on the board. Take back moves until a capture is possible again.`,
            `Aucune pièce ne peut rien prendre, et il reste ${count(cur)} pièces. Reprenez des coups jusqu’à ce qu’une prise redevienne possible.`,
          ),
          at: [cells[mTo(done[done.length - 1])]],
          play: undo,
        };
      if (plan.type === 'lost')
        return {
          text: L(
            'From here the board can no longer be cleared: some piece is out of everyone’s reach. Undo and try another order.',
            'D’ici, le plateau ne peut plus être vidé : une pièce est hors de portée. Annulez et essayez un autre ordre.',
          ),
          at: [cells[mTo(done[done.length - 1])]],
          play: undo,
        };
      const { all, bad, dead } = plan;
      const name = (sq: number) => pieceName(cur.type[sq]);
      const f = mFrom(plan.move),
        t = mTo(plan.move);
      const pf = name(f),
        pt = name(t);
      const kind = plan.kinds.find((x) => x !== lastKind) ?? plan.kinds[0];
      lastKind = kind;
      const text = (): string => {
        switch (kind) {
          case 'start':
            return L(
              `Every move must capture. Your ${pf} on ${sqName(f)} can take the ${pt} on ${sqName(t)}, and the rest can still be cleared after that.`,
              `Chaque coup doit prendre. Votre ${pf} en ${sqName(f)} peut prendre ${LE(cur.type[t])} ${pt} en ${sqName(t)}, et le reste pourra encore être vidé ensuite.`,
            );
          case 'last':
            return L(
              `Two pieces left: the ${pf} on ${sqName(f)} takes the ${pt} to finish with a single piece.`,
              `Il reste deux pièces : ${LE(cur.type[f])} ${pf} en ${sqName(f)} prend ${LE(cur.type[t])} ${pt} pour finir avec une seule pièce.`,
            );
          case 'only':
            return L(
              `Only one capture is possible right now: the ${pf} on ${sqName(f)} takes the ${pt} on ${sqName(t)}.`,
              `Une seule prise est possible pour l’instant : ${LE(cur.type[f])} ${pf} en ${sqName(f)} prend ${LE(cur.type[t])} ${pt} en ${sqName(t)}.`,
            );
          case 'dead': {
            const df = mFrom(dead ?? plan.move);
            const dt = mTo(dead ?? plan.move);
            return L(
              `Careful: the ${name(df)} on ${sqName(df)} taking on ${sqName(dt)} would leave no capture at all. Take with the ${pf} on ${sqName(f)} instead.`,
              `Attention : si ${LE(cur.type[df])} ${name(df)} en ${sqName(df)} prenait en ${sqName(dt)}, plus aucune prise ne serait possible. Prenez plutôt avec ${LE(cur.type[f])} ${pf} en ${sqName(f)}.`,
            );
          }
          case 'reach':
            return L(
              `Only your ${pf} can reach the ${pt} on ${sqName(t)}. Take it now, before that line closes.`,
              `Seul${LE(cur.type[f]) === 'la' ? 'e' : ''} votre ${pf} peut atteindre ${LE(cur.type[t])} ${pt} en ${sqName(t)}. Prenez-${LE(cur.type[t])} maintenant, avant que cette ligne se ferme.`,
            );
          case 'limit':
            return L(
              `This is the ${pf}’s last allowed capture: after taking on ${sqName(t)} it can’t capture again, so it must end where others can take it, or be the last piece.`,
              `C’est la dernière prise permise de ${LE(cur.type[f]) === 'la' ? 'cette' : 'ce'} ${pf} : après la prise en ${sqName(t)}, plus aucune prise ne lui sera permise : il faudra la prendre à son tour, ou la garder pour la fin.`,
            );
          case 'plan':
            return L(
              `${all.length} captures are possible, but ${bad.length === 1 ? 'one of them strands' : `${bad.length} of them strand`} a piece. The ${pf} on ${sqName(f)} taking the ${pt} keeps the board solvable.`,
              `${all.length} prises sont possibles, mais ${bad.length === 1 ? 'l’une d’elles isole' : `${bad.length} d’entre elles isolent`} une pièce. ${LE(cur.type[f]) === 'la' ? 'La' : 'Le'} ${pf} en ${sqName(f)} qui prend ${LE(cur.type[t])} ${pt} garde le plateau soluble.`,
            );
          case 'plain':
            return L(
              `The ${pf} on ${sqName(f)} takes the ${pt} on ${sqName(t)}: one piece fewer, and a way to finish remains.`,
              `${LE(cur.type[f]) === 'la' ? 'La' : 'Le'} ${pf} en ${sqName(f)} prend ${LE(cur.type[t])} ${pt} en ${sqName(t)} : une pièce de moins, et il reste une façon de finir.`,
            );
        }
      };
      return {
        why: kind === 'dead' && dead != null ? [cells[mFrom(dead)], cells[f]] : [cells[f]],
        at: [cells[t]],
        play: () => (tap(f), tap(t)),
        text: text(),
      };
    };

    root.append(grid);
    render();
    return {
      snapshot: () => ({ moves: [...done], sel, restarts: restarts.map((r) => [...r]) }),
      hint,
      check,
      onKey(e) {
        const k = e.key.toLowerCase();
        if (k === 'z' || k === 'backspace') undo();
        else if (k === 'r') restart();
        else if (k === 'escape' && sel >= 0) {
          sel = -1;
          render();
        } else return false;
        return true;
      },
    };
  },
};
