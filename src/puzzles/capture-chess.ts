import './capture-chess.css';
import { L, P } from '../core/i18n';
import type { Rng } from '../core/rng';
import { byLevel, type Difficulty, type Hint, type PuzzleDef } from '../core/types';
import { board, btn, h, shake } from '../core/ui';
import { anim } from './movekit/kit';

/**
 * Capture-only chess: one army, every move takes another piece, clear the board down to one.
 * Board: `type[sq]` (0 empty, 1 pawn … 6 king), `used[sq]` captures already made by that piece.
 * Pawns capture one square diagonally upward and never promote. A move is `from * 64 + to`.
 */
const PAWN = 1,
  KNIGHT = 2,
  BISHOP = 3,
  ROOK = 4,
  QUEEN = 5,
  KING = 6;
const KN = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
];
const ORTH = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
const DIAG = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];
const ALL = [...ORTH, ...DIAG];

interface Pos {
  type: Int8Array;
  used: Int8Array;
}
interface Game {
  n: number;
  /** Max captures per piece (0: unlimited). */
  limit: number;
  start: Pos;
  /** A known winning line (from the generator). */
  line: number[];
}

const mFrom = (m: number) => m >> 6;
const mTo = (m: number) => m & 63;

/** Squares the piece on `sq` attacks (first piece along each line for sliders). */
function attacks(n: number, type: Int8Array, sq: number): number[] {
  const r = Math.floor(sq / n),
    c = sq % n,
    p = type[sq];
  const inside = (rr: number, cc: number) => rr >= 0 && rr < n && cc >= 0 && cc < n;
  const out: number[] = [];
  if (p === PAWN) {
    for (const dc of [-1, 1]) if (inside(r - 1, c + dc) && type[(r - 1) * n + c + dc]) out.push((r - 1) * n + c + dc);
  } else if (p === KNIGHT || p === KING) {
    for (const [dr, dc] of p === KNIGHT ? KN : ALL)
      if (inside(r + dr, c + dc) && type[(r + dr) * n + c + dc]) out.push((r + dr) * n + c + dc);
  } else if (p) {
    for (const [dr, dc] of p === BISHOP ? DIAG : p === ROOK ? ORTH : ALL) {
      for (let rr = r + dr, cc = c + dc; inside(rr, cc); rr += dr, cc += dc) {
        if (type[rr * n + cc]) {
          out.push(rr * n + cc);
          break;
        }
      }
    }
  }
  return out;
}

function moves(g: Game, s: Pos, only = -1): number[] {
  const out: number[] = [];
  for (let sq = 0; sq < g.n * g.n; sq++) {
    if (!s.type[sq] || (only >= 0 && sq !== only) || (g.limit && s.used[sq] >= g.limit)) continue;
    for (const t of attacks(g.n, s.type, sq)) out.push(sq * 64 + t);
  }
  return out;
}

function apply(s: Pos, m: number): Pos {
  const f = mFrom(m),
    t = mTo(m);
  const type = s.type.slice(),
    used = s.used.slice();
  type[t] = type[f];
  used[t] = used[f] + 1;
  type[f] = used[f] = 0;
  return { type, used };
}

const count = (s: Pos) => s.type.reduce((a, p) => a + (p ? 1 : 0), 0);

/** Can `s` still be cleared down to one piece? Memoised DFS; null if the node budget runs out. */
function solver(g: Game, budget: number, memo = new Map<string, boolean>()) {
  let left = budget;
  const key = (s: Pos) => String.fromCharCode(...s.type.map((p, i) => p * 4 + s.used[i] + 48));
  const wins = (s: Pos): boolean | null => {
    const c = count(s);
    if (c === 1) return true;
    // Each capture removes one piece: the army needs at least c - 1 captures left in total.
    if (g.limit && s.type.reduce((a, p, i) => a + (p ? g.limit - s.used[i] : 0), 0) < c - 1) return false;
    const k = key(s);
    const m = memo.get(k);
    if (m != null) return m;
    if (--left < 0) return null;
    let unknown = false;
    for (const mv of moves(g, s)) {
      const w = wins(apply(s, mv));
      if (w) {
        memo.set(k, true);
        return true;
      }
      if (w == null) unknown = true;
    }
    if (unknown) return null;
    memo.set(k, false);
    return false;
  };
  return wins;
}

// ---------- generation: build backwards from one piece ----------

interface Level {
  n: number;
  pieces: number;
  pawns: boolean;
  limit: number;
  /** Target share of random playouts that clear the board (lower = harder). */
  target: number;
}
const LEVELS: Record<Difficulty, Level> = {
  1: { n: 4, pieces: 4, pawns: false, limit: 0, target: 0.4 },
  2: { n: 5, pieces: 6, pawns: true, limit: 0, target: 0.2 },
  3: { n: 5, pieces: 7, pawns: true, limit: 2, target: 0.1 },
  4: { n: 6, pieces: 9, pawns: true, limit: 2, target: 0.04 },
  5: { n: 6, pieces: 12, pawns: true, limit: 2, target: 0 },
};
const WEIGHTS: [number, number][] = [
  [PAWN, 3],
  [KNIGHT, 3],
  [BISHOP, 3],
  [ROOK, 3],
  [QUEEN, 1],
  [KING, 2],
];

function pickType(rng: Rng, pawns: boolean, row: number): number {
  const ws = WEIGHTS.filter(([p]) => p !== PAWN || (pawns && row > 0));
  let x = rng.next() * ws.reduce((a, [, w]) => a + w, 0);
  for (const [p, w] of ws) if ((x -= w) < 0) return p;
  return ROOK;
}

/** Empty squares the piece now on `t` could have captured from. */
function origins(n: number, type: Int8Array, t: number): number[] {
  const r = Math.floor(t / n),
    c = t % n,
    p = type[t];
  const inside = (rr: number, cc: number) => rr >= 0 && rr < n && cc >= 0 && cc < n;
  const out: number[] = [];
  if (p === PAWN) {
    for (const dc of [-1, 1]) if (inside(r + 1, c + dc) && !type[(r + 1) * n + c + dc]) out.push((r + 1) * n + c + dc);
  } else if (p === KNIGHT || p === KING) {
    for (const [dr, dc] of p === KNIGHT ? KN : ALL)
      if (inside(r + dr, c + dc) && !type[(r + dr) * n + c + dc]) out.push((r + dr) * n + c + dc);
  } else {
    for (const [dr, dc] of p === BISHOP ? DIAG : p === ROOK ? ORTH : ALL) {
      for (let rr = r + dr, cc = c + dc; inside(rr, cc) && !type[rr * n + cc]; rr += dr, cc += dc) out.push(rr * n + cc);
    }
  }
  return out;
}

/** One random solvable position (with its winning line), or null if the backwards build got stuck. */
function build(rng: Rng, lv: Level): Game | null {
  const { n } = lv;
  const type = new Int8Array(n * n);
  const future = new Int8Array(n * n); // captures each piece still makes in the winning line
  const last = rng.int(0, n * n - 1);
  type[last] = pickType(rng, lv.pawns, Math.floor(last / n));
  const line: number[] = [];
  for (let k = 1; k < lv.pieces; k++) {
    const opts: [number, number][] = [];
    for (let t = 0; t < n * n; t++) {
      if (!type[t] || (lv.limit && future[t] >= lv.limit)) continue;
      for (const f of origins(n, type, t)) opts.push([f, t]);
    }
    if (!opts.length) return null;
    const [f, t] = rng.pick(opts);
    type[f] = type[t];
    future[f] = future[t] + 1;
    type[t] = pickType(rng, lv.pawns, Math.floor(t / n));
    future[t] = 0;
    line.unshift(f * 64 + t);
  }
  return { n, limit: lv.limit, start: { type, used: new Int8Array(n * n) }, line };
}

/** Share of random playouts that clear the board. */
function easiness(rng: Rng, g: Game, tries: number): number {
  let ok = 0;
  for (let k = 0; k < tries; k++) {
    let s = g.start;
    for (let ms = moves(g, s); ms.length; ms = moves(g, s)) s = apply(s, rng.pick(ms));
    if (count(s) === 1) ok++;
  }
  return ok / tries;
}

function generate(rng: Rng, d: Difficulty): Game {
  const lv = LEVELS[d];
  let best: Game | null = null,
    bestScore = Infinity;
  for (let a = 0, found = 0; a < 200 && found < byLevel(d, [10, 14, 16, 20, 30]); a++) {
    const g = build(rng, lv);
    if (!g || !moves(g, g.start).length) continue;
    found++;
    const e = easiness(rng, g, 80);
    // Never trivial: at least one first move must be a mistake on small boards.
    const score = Math.abs(e - lv.target) + (e > 0.9 ? 1 : 0);
    if (score < bestScore) {
      best = g;
      bestScore = score;
    }
  }
  if (best) return best;
  // Fallback (4×4): rook a1 takes knight a3, which takes bishop b1, which takes king d3.
  const type = new Int8Array(16);
  type[12] = ROOK; // a1
  type[4] = KNIGHT; // a3
  type[13] = BISHOP; // b1
  type[7] = KING; // d3
  return { n: 4, limit: 0, start: { type, used: new Int8Array(16) }, line: [12 * 64 + 4, 4 * 64 + 13, 13 * 64 + 7] };
}

// ---------- game ----------

const GLYPH = ['', '♟', '♞', '♝', '♜', '♛', '♚'].map((g) => (g ? g + '\uFE0E' : ''));
const NAME = () => [
  '',
  L('pawn', 'pion'),
  L('knight', 'cavalier'),
  L('bishop', 'fou'),
  L('rook', 'tour'),
  L('queen', 'dame'),
  L('king', 'roi'),
];
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
        'Stuck with no capture left? Undo (Z) takes back a move; Restart (R) sets the board up again.',
        'Bloqué sans prise possible? Annuler (Z) reprend un coup; Repartir (R) replace toutes les pièces.',
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

    const sqName = (sq: number) => 'abcdefgh'[sq % n] + (n - Math.floor(sq / n));
    const grid = board(n, n, 'cc-board');
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
    const stuck = () => !over && count(cur) > 1 && !moves(g, cur).length;

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
        el.setAttribute('aria-label', `${sqName(sq)}${p ? ' ' + NAME()[p] : ''}`);
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
      if (stuck()) ctx.status(L(`No capture left with ${left} pieces · Undo`, `Aucune prise possible avec ${left} pièces · Annulez`));
      else
        ctx.status(
          `${P(left, ['piece left', 'pieces left'], ['pièce restante', 'pièces restantes'])}${limit ? L(` · max ${limit} captures`, ` · ${limit} prises max`) : ''}`,
        );
    };

    const play = (m: number, animate = true) => {
      cur = apply(cur, m);
      done.push(m);
      sel = -1;
      if (!animate) return;
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
      const sq = el ? Number(el.dataset.i) : -1;
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
      const sq = el && grid.contains(el) ? Number(el.dataset.i) : -1;
      if (sq < 0 || sq === sel || !targets().has(sq)) return;
      justPicked = false;
      play(sel * 64 + sq);
    });

    const undo = () => {
      if (over || !done.length) return;
      done.pop();
      cur = done.reduce(apply, g.start);
      sel = -1;
      render();
    };
    const restart = () => {
      if (over || !done.length) return;
      done.length = 0;
      cur = g.start;
      sel = -1;
      render();
    };
    ctx.controls(btn(L('Undo', 'Annuler'), undo, 'ghost'), btn(L('Restart', 'Repartir'), restart, 'ghost'));

    const sv = ctx.saved as { moves?: unknown; sel?: unknown } | undefined;
    if (Array.isArray(sv?.moves)) {
      for (const m of sv.moves) {
        if (typeof m !== 'number' || !moves(g, cur).includes(m) || count(cur) <= 2) break;
        play(m, false);
      }
      if (Number.isInteger(sv.sel) && (sv.sel as number) >= 0 && (sv.sel as number) < N && cur.type[sv.sel as number])
        sel = sv.sel as number;
    }

    // ---- Guide ----
    /** Proven results by position, shared by check() and hint() (positions never change meaning). */
    const memo = new Map<string, boolean>();
    /** The capture that turned a clearable board into one that can't be cleared (fix: undo back to before it). */
    const check = (): Hint | null => {
      if (over || !done.length || done.every((m, i) => m === g.line[i])) return null;
      const wins = solver(g, 30000, memo);
      if (wins(cur) !== false) return null;
      let s = g.start;
      let k = 0;
      for (; k < done.length - 1; k++) {
        const nx = apply(s, done[k]);
        if (wins(nx) === false) break;
        s = nx;
      }
      const m = done[k];
      const f = mFrom(m),
        t = mTo(m);
      const pf = NAME()[s.type[f]],
        pt = NAME()[s.type[t]];
      const after = apply(s, m);
      const back = done.length - k;
      const left = count(after);
      const why = !moves(g, after).length
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
      const all = moves(g, cur);
      const name = (sq: number, s: Pos = cur) => NAME()[s.type[sq]];
      if (!all.length) {
        if (!done.length) return null;
        const t = mTo(done[done.length - 1]);
        return {
          text: L(
            `No piece can capture anything, and ${count(cur)} pieces are still on the board. Take back moves until a capture is possible again.`,
            `Aucune pièce ne peut rien prendre, et il reste ${count(cur)} pièces. Reprenez des coups jusqu’à ce qu’une prise redevienne possible.`,
          ),
          at: [cells[t]],
          play: undo,
        };
      }
      const onLine = done.every((m, i) => m === g.line[i]);
      // On the generator's line its next move is known to win: the solver only sizes up the others,
      // within a small budget. Off the line, stop at the first capture proven to keep a win.
      const wins = solver(g, onLine ? 4000 : 30000, memo);
      const verdict: (boolean | null)[] = [];
      for (const m of all) {
        if (onLine && m === g.line[done.length]) verdict.push(true);
        else if (!onLine && verdict.includes(true)) verdict.push(null);
        else verdict.push(wins(apply(cur, m)));
      }
      let good = all.filter((_, i) => verdict[i]);
      if (!good.length && onLine) good = [g.line[done.length]];
      // Out of budget isn't proof of a dead end: try a capture the solver couldn't rule out.
      if (!good.length) good = all.filter((_, i) => verdict[i] == null).slice(0, 1);
      if (!good.length) {
        const t = mTo(done[done.length - 1]);
        return {
          text: L(
            'From here the board can no longer be cleared: some piece is out of everyone’s reach. Undo and try another order.',
            'D’ici, le plateau ne peut plus être vidé : une pièce est hors de portée. Annulez et essayez un autre ordre.',
          ),
          at: [cells[t]],
          play: undo,
        };
      }
      const bad = all.filter((_, i) => verdict[i] === false);
      // Prefer the generator's line when it's still open, so the guide follows a stable plan.
      const pick = onLine && good.includes(g.line[done.length]) ? g.line[done.length] : good[0];
      const f = mFrom(pick),
        t = mTo(pick);
      const pf = name(f),
        pt = name(t);
      const base = { why: [cells[f]], at: [cells[t]], play: () => (tap(f), tap(t)) };
      const kinds: { kind: string; text: string; why?: Element[] }[] = [];
      if (!done.length)
        kinds.push({
          kind: 'start',
          text: L(
            `Every move must capture. Your ${pf} on ${sqName(f)} can take the ${pt} on ${sqName(t)}, and the rest can still be cleared after that.`,
            `Chaque coup doit prendre. Votre ${pf} en ${sqName(f)} peut prendre ${LE(cur.type[t])} ${pt} en ${sqName(t)}, et le reste pourra encore être vidé ensuite.`,
          ),
        });
      if (count(cur) === 2)
        kinds.push({
          kind: 'last',
          text: L(
            `Two pieces left: the ${pf} on ${sqName(f)} takes the ${pt} to finish with a single piece.`,
            `Il reste deux pièces : ${LE(cur.type[f])} ${pf} en ${sqName(f)} prend ${LE(cur.type[t])} ${pt} pour finir avec une seule pièce.`,
          ),
        });
      if (all.length === 1)
        kinds.push({
          kind: 'only',
          text: L(
            `Only one capture is possible right now: the ${pf} on ${sqName(f)} takes the ${pt} on ${sqName(t)}.`,
            `Une seule prise est possible pour l’instant : ${LE(cur.type[f])} ${pf} en ${sqName(f)} prend ${LE(cur.type[t])} ${pt} en ${sqName(t)}.`,
          ),
        });
      const dead = bad.find((m) => !moves(g, apply(cur, m)).length);
      if (dead != null)
        kinds.push({
          kind: 'dead',
          text: L(
            `Careful: the ${name(mFrom(dead))} on ${sqName(mFrom(dead))} taking on ${sqName(mTo(dead))} would leave no capture at all. Take with the ${pf} on ${sqName(f)} instead.`,
            `Attention : si ${LE(cur.type[mFrom(dead)])} ${name(mFrom(dead))} en ${sqName(mFrom(dead))} prenait en ${sqName(mTo(dead))}, plus aucune prise ne serait possible. Prenez plutôt avec ${LE(cur.type[f])} ${pf} en ${sqName(f)}.`,
          ),
          why: [cells[mFrom(dead)], cells[f]],
        });
      // A piece that only this one can still reach must be taken now (or used before it's stranded).
      const takers = all.filter((m) => mTo(m) === t);
      if (takers.length === 1 && all.length > 1)
        kinds.push({
          kind: 'reach',
          text: L(
            `Only your ${pf} can reach the ${pt} on ${sqName(t)}. Take it now, before that line closes.`,
            `Seul${LE(cur.type[f]) === 'la' ? 'e' : ''} votre ${pf} peut atteindre ${LE(cur.type[t])} ${pt} en ${sqName(t)}. Prenez-${LE(cur.type[t])} maintenant, avant que cette ligne se ferme.`,
          ),
        });
      if (limit && cur.used[f] === limit - 1)
        kinds.push({
          kind: 'limit',
          text: L(
            `This is the ${pf}’s last allowed capture: after taking on ${sqName(t)} it can’t capture again, so it must end where others can take it, or be the last piece.`,
            `C’est la dernière prise permise de ${LE(cur.type[f]) === 'la' ? 'cette' : 'ce'} ${pf} : après la prise en ${sqName(t)}, plus aucune prise ne lui sera permise : il faudra la prendre à son tour, ou la garder pour la fin.`,
          ),
        });
      if (bad.length)
        kinds.push({
          kind: 'plan',
          text: L(
            `${all.length} captures are possible, but ${bad.length === 1 ? 'one of them strands' : `${bad.length} of them strand`} a piece. The ${pf} on ${sqName(f)} taking the ${pt} keeps the board solvable.`,
            `${all.length} prises sont possibles, mais ${bad.length === 1 ? 'l’une d’elles isole' : `${bad.length} d’entre elles isolent`} une pièce. ${LE(cur.type[f]) === 'la' ? 'La' : 'Le'} ${pf} en ${sqName(f)} qui prend ${LE(cur.type[t])} ${pt} garde le plateau soluble.`,
          ),
        });
      kinds.push({
        kind: 'plain',
        text: L(
          `The ${pf} on ${sqName(f)} takes the ${pt} on ${sqName(t)}: one piece fewer, and a way to finish remains.`,
          `${LE(cur.type[f]) === 'la' ? 'La' : 'Le'} ${pf} en ${sqName(f)} prend ${LE(cur.type[t])} ${pt} en ${sqName(t)} : une pièce de moins, et il reste une façon de finir.`,
        ),
      });
      const k = kinds.find((x) => x.kind !== lastKind) ?? kinds[0];
      lastKind = k.kind;
      return { ...base, text: k.text, why: k.why ?? base.why };
    };

    root.append(grid);
    render();
    return {
      snapshot: () => ({ moves: [...done], sel }),
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
