import './style.css';
import { L } from '../../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../../core/types';
import { board, h, shake } from '../../ui/dom';
import { apply, bestDefence, forcesMate2, from, generate, isMate, legal, to, type Board } from './gen';
import { GLYPH, pieceName, sqName } from '../../kits/chess/pieces';

/** Is `sq` attacked by the white piece on `f` (sliders look through empty squares only)? */
function covers(b: Board, f: number, sq: number): boolean {
  const p = b[f];
  const dr = (sq >> 3) - (f >> 3),
    dc = (sq & 7) - (f & 7);
  const ar = Math.abs(dr),
    ac = Math.abs(dc);
  if (!ar && !ac) return false;
  if (p === 1) return dr === -1 && ac === 1;
  if (p === 2) return (ar === 1 && ac === 2) || (ar === 2 && ac === 1);
  if (p === 6) return Math.max(ar, ac) === 1;
  const orth = !ar || !ac,
    diag = ar === ac;
  if (!((p === 4 && orth) || (p === 3 && diag) || (p === 5 && (orth || diag)))) return false;
  const sr = Math.sign(dr),
    sc = Math.sign(dc);
  for (let k = 1; k < Math.max(ar, ac); k++) if (b[f + (sr * 8 + sc) * k]) return false;
  return true;
}

export const chess: PuzzleDef = {
  id: 'chess',
  get name() {
    return L('Chess', 'Échecs');
  },
  category: 'cards',
  get rules() {
    return L('White to move. Find the only mating line.', 'Aux blancs de jouer. Trouvez l’unique suite qui mate.');
  },
  help: () => ({
    goal: L(
      'You play White. Checkmate the black king in the number of moves shown: mate in 1 on Easy and Medium, mate in 2 from Hard up.',
      'Vous jouez les blancs. Faites échec et mat au roi noir dans le nombre de coups indiqué : mat en 1 en Facile et Moyen, mat en 2 à partir de Difficile.',
    ),
    steps: [
      L('Tap one of your white pieces: its legal squares light up.', 'Touchez une de vos pièces blanches : ses cases permises s’allument.'),
      L(
        'Tap a highlighted square to play the move. Tap another white piece to switch, or press Escape to cancel.',
        'Touchez une case en surbrillance pour jouer le coup. Touchez une autre pièce blanche pour changer, ou appuyez sur Échap pour annuler.',
      ),
      L(
        'In a mate in 2, Black replies automatically with the toughest defence, shown in the status line. Then find the final mate.',
        'Dans un mat en 2, les noirs répondent automatiquement avec la meilleure défense, affichée sous le plateau. Trouvez ensuite le mat final.',
      ),
      L(
        'A move that doesn’t lead to mate counts as a mistake and is taken back: try again.',
        'Un coup qui ne mène pas au mat compte comme une erreur et est annulé : réessayez.',
      ),
      L(
        'No castling or en passant here; a pawn reaching the last rank always becomes a queen.',
        'Ni roque ni prise en passant ici; un pion qui atteint la dernière rangée devient toujours une dame.',
      ),
    ],
    tips: [
      L(
        'Look at the squares around the black king: which ones are already covered?',
        'Observez les cases autour du roi noir : lesquelles sont déjà contrôlées?',
      ),
      L(
        'Checks are tempting, but in a mate in 2 the key move is often a quiet one.',
        'Les échecs sont tentants, mais dans un mat en 2, le coup clé est souvent un coup tranquille.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [30, 45, 90, 120, 150]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const puzzle = generate(rng, d);
    const start = Int8Array.from(puzzle.board) as Board;

    let moves: number[] = [];
    let sel = -1;
    let over = false;

    const replay = (ms: number[]) => ms.reduce((b, m) => apply(b, m), start);
    const sv = ctx.saved as { moves?: unknown; sel?: unknown } | undefined;
    if (sv && Array.isArray(sv.moves) && sv.moves.every((m) => typeof m === 'number')) {
      // replay defensively: each white move must be legal
      let b = start;
      const ok: number[] = [];
      for (const m of sv.moves) {
        const white = ok.length % 2 === 0;
        if (!legal(b, white).includes(m)) break;
        ok.push(m);
        b = apply(b, m);
      }
      if (ok.length % 2 === 0 && ok.length < puzzle.mateIn * 2 - 1) moves = ok;
    }

    let cur = replay(moves);
    // The saved selection must be a white piece on the board actually restored (moves may have been dropped).
    if (sv && Number.isInteger(sv.sel) && (sv.sel as number) >= 0 && (sv.sel as number) < 64 && cur[sv.sel as number] > 0)
      sel = sv.sel as number;
    const grid = board(8, 8, 'chess chessboard');
    const cells: HTMLButtonElement[] = [];
    for (let sq = 0; sq < 64; sq++) {
      const el = h('button', {
        type: 'button',
        class: 'cell',
        'aria-label': sqName(sq),
        'data-rank': (sq & 7) === 0 ? sqName(sq)[1] : null,
        'data-file': sq >> 3 === 7 ? sqName(sq)[0] : null,
        onclick: () => tap(sq),
      });
      cells.push(el);
      grid.append(el);
    }

    const left = () => puzzle.mateIn - moves.length / 2;
    const status = (t?: string) => ctx.status(t ?? L(`Mate in ${left()} · White to move`, `Mat en ${left()} · Aux blancs de jouer`));

    const render = () => {
      const targets = new Set(
        sel >= 0
          ? legal(cur, true)
              .filter((m) => from(m) === sel)
              .map(to)
          : [],
      );
      const last = moves.length ? moves[moves.length - 1] : -1;
      cells.forEach((el, sq) => {
        const dark = ((sq >> 3) + (sq & 7)) % 2 === 1;
        const p = cur[sq];
        let cls = 'cell';
        if (dark) cls += ' dk';
        if (sq === sel) cls += ' sel';
        if (targets.has(sq)) cls += p ? ' tgt cap' : ' tgt';
        if (last >= 0 && (sq === from(last) || sq === to(last))) cls += ' last';
        el.className = cls;
        const kids: HTMLElement[] = [];
        if (p) kids.push(h('span', { class: p > 0 ? 'pw' : 'pb' }, GLYPH[Math.abs(p)]));
        if (sq >> 3 === 7) kids.push(h('span', { class: 'co', 'aria-hidden': 'true' }, sqName(sq)[0]));
        el.replaceChildren(...kids);
      });
    };

    const wrong = (msg: string) => {
      ctx.mistake();
      shake(grid);
      sel = -1;
      render();
      status(msg);
    };

    const tap = (sq: number) => {
      if (over) return;
      ctx.touch();
      if (cur[sq] > 0 && sq !== sel) {
        sel = sq;
        render();
        return;
      }
      if (sel < 0) return;
      const m = legal(cur, true).find((mv) => from(mv) === sel && to(mv) === sq);
      if (m == null) {
        sel = -1;
        render();
        return;
      }
      const nb = apply(cur, m);
      if (left() === 2) {
        if (!forcesMate2(cur, m)) {
          wrong(L('Black escapes · Try again', 'Les noirs s’échappent · Réessayez'));
          return;
        }
        const reply = bestDefence(nb);
        moves.push(m, reply);
        cur = apply(nb, reply);
        sel = -1;
        render();
        status(
          L(
            `Black ${sqName(from(reply))}→${sqName(to(reply))} · Mate in 1`,
            `Noirs ${sqName(from(reply))}→${sqName(to(reply))} · Mat en 1`,
          ),
        );
        return;
      }
      if (!isMate(nb, false)) {
        wrong(L('Not mate · Try again', 'Pas mat · Réessayez'));
        return;
      }
      moves.push(m);
      cur = nb;
      sel = -1;
      over = true;
      render();
      ctx.solved();
    };

    /** Guide: pick up the right piece, then play the move and show why the king has no way out. */
    const hint = (): Hint | null => {
      if (over) return null;
      const target =
        left() === 2 ? (moves.length === 0 ? puzzle.key : null) : (legal(cur, true).find((m) => isMate(apply(cur, m), false)) ?? null);
      if (target == null) return null;
      const f = from(target),
        t = to(target);
      const kSq = cur.indexOf(-6);
      const name = (sq: number, b: Board = cur) => pieceName(b[sq]);
      const fem = (sq: number) => (cur[sq] === 4 || cur[sq] === 5 ? 'la' : 'le');
      if (sel !== f) {
        return {
          text:
            left() === 2
              ? L(
                  `Mate in 2: first find a move after which every Black reply still allows a mate. It starts with your ${name(f)} on ${sqName(f)}: tap it to see where it can go.`,
                  `Mat en 2 : trouvez d’abord un coup après lequel chaque réponse des noirs permet encore un mat. Il commence par votre ${name(f)} en ${sqName(f)} : touchez-${fem(f)} pour voir ses cases.`,
                )
              : L(
                  `To mate, the king on ${sqName(kSq)} must be in check with no square to flee to. Your ${name(f)} on ${sqName(f)} can do it: tap it to see its moves.`,
                  `Pour faire mat, le roi en ${sqName(kSq)} doit être en échec sans case où fuir. Votre ${name(f)} en ${sqName(f)} peut le faire : touchez-${fem(f)} pour voir ses cases.`,
                ),
          why: [cells[kSq]],
          at: [cells[f]],
          play: () => tap(f),
        };
      }
      const nb = apply(cur, target);
      if (left() === 2) {
        return {
          text: L(
            `${name(t, nb)[0].toUpperCase() + name(t, nb).slice(1)} to ${sqName(t)}: a quiet move that takes away the king’s squares. Whatever Black replies, a mate follows.`,
            `${name(t, nb)[0].toUpperCase() + name(t, nb).slice(1)} en ${sqName(t)} : un coup tranquille qui enlève ses cases au roi. Peu importe la réponse des noirs, le mat suit.`,
          ),
          why: [cells[kSq]],
          at: [cells[t]],
          play: () => tap(t),
        };
      }
      // Why it's mate: each square around the king is either Black's own piece or covered by White.
      const bk = nb.indexOf(-6);
      const open = nb.slice();
      open[bk] = 0; // the king can't hide behind itself along a line of attack
      const own: number[] = [];
      const by = new Map<number, number[]>();
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const r = (bk >> 3) + dr,
            c = (bk & 7) + dc;
          if ((!dr && !dc) || r < 0 || r > 7 || c < 0 || c > 7) continue;
          const sq = r * 8 + c;
          if (nb[sq] < 0) {
            own.push(sq);
            continue;
          }
          const w = [...Array(64).keys()].find((x) => nb[x] > 0 && x !== sq && covers(open, x, sq));
          if (w != null) by.set(w, [...(by.get(w) ?? []), sq]);
        }
      const list = (sqs: number[]) =>
        sqs.length < 2 ? sqName(sqs[0]) : `${sqs.slice(0, -1).map(sqName).join(', ')} ${L('and', 'et')} ${sqName(sqs[sqs.length - 1])}`;
      const piece = name(t, nb);
      const guard = [...by].find(([, sqs]) => sqs.includes(t))?.[0];
      const fe = nb[t] === 4 || nb[t] === 5 ? 'e' : '';
      const fes = (sqs: number[]) => (sqs.length > 1 ? 's' : '');
      const parts = [
        ...(own.length ? [L(`${list(own)} blocked by Black’s own pieces`, `${list(own)} occupée${fes(own)} par ses propres pièces`)] : []),
        ...[...by]
          .map(([w, sqs]) => [w, sqs.filter((x) => x !== t)] as const)
          .filter(([, sqs]) => sqs.length)
          .map(([w, sqs]) =>
            L(`${list(sqs)} covered by your ${name(w, nb)}`, `${list(sqs)} contrôlée${fes(sqs)} par votre ${name(w, nb)}`),
          ),
        ...(guard != null
          ? [L(`your ${piece} guarded by your ${name(guard, nb)}`, `votre ${piece} protégé${fe} par votre ${name(guard, nb)}`)]
          : []),
      ];
      const cap = cur[t] < 0;
      return {
        text: L(
          `Play the ${piece} to ${sqName(t)}${cap ? ', taking' : ''}: it’s check, and the king has no way out (${parts.join('; ')}). Checkmate!`,
          `Jouez ${fe ? 'la' : 'le'} ${piece} en ${sqName(t)}${cap ? ' en prenant' : ''} : c’est échec, et le roi n’a aucune issue (${parts.join('; ')}). Échec et mat!`,
        ),
        why: [cells[bk], ...[...by.keys()].filter((w) => w !== t).map((w) => cells[w])],
        at: [cells[t]],
        play: () => tap(t),
      };
    };

    root.append(grid);
    render();
    if (moves.length) {
      const r = moves[moves.length - 1];
      status(L(`Black ${sqName(from(r))}→${sqName(to(r))} · Mate in 1`, `Noirs ${sqName(from(r))}→${sqName(to(r))} · Mat en 1`));
    } else status();

    return {
      snapshot: () => ({ moves, sel }),
      hint,
      onKey(e) {
        if (e.key === 'Escape' && sel >= 0) {
          sel = -1;
          render();
          return true;
        }
        return false;
      },
    };
  },
};
