import type { Rng } from '../../core/rng';
import { deck, isRed, rank, suit, type Card } from '../../kits/card/cards';

/** Klondike rules engine (pure; no DOM). */
interface KCol {
  d: Card[];
  u: Card[];
}
export interface KState {
  stock: Card[]; // top = end
  waste: Card[]; // top = end
  found: number[]; // top rank per suit (0 = empty)
  tab: KCol[];
  redeals: number;
  moves: number;
}
export interface KRules {
  draw: 1 | 3;
  /** Redeals allowed; -1 = unlimited. */
  redeals: number;
}

function dealK(cards: Card[]): KState {
  const c = cards.slice();
  const tab: KCol[] = [];
  for (let i = 0; i < 7; i++) {
    const d = c.splice(0, i);
    const u = c.splice(0, 1);
    tab.push({ d, u });
  }
  return { stock: c, waste: [], found: [0, 0, 0, 0], tab, redeals: 0, moves: 0 };
}

const cloneK = (s: KState): KState => ({
  stock: s.stock.slice(),
  waste: s.waste.slice(),
  found: s.found.slice(),
  tab: s.tab.map((t) => ({ d: t.d.slice(), u: t.u.slice() })),
  redeals: s.redeals,
  moves: s.moves,
});

const fitsFound = (s: KState, c: Card) => s.found[suit(c)] === rank(c) - 1;
const fitsOn = (c: Card, top: Card) => rank(top) === rank(c) + 1 && isRed(top) !== isRed(c);
const fitsCol = (col: KCol, c: Card) => (col.u.length ? fitsOn(c, col.u[col.u.length - 1]) : col.d.length === 0 && rank(c) === 13);
export const wonK = (s: KState) => s.found.every((f) => f === 13);
export const canRedeal = (s: KState, r: KRules) => r.redeals < 0 || s.redeals < r.redeals;
export const canDraw = (s: KState, r: KRules) => s.stock.length > 0 || (s.waste.length > 0 && canRedeal(s, r));

export function draw(s: KState, r: KRules): boolean {
  if (s.stock.length) {
    for (let k = 0; k < r.draw && s.stock.length; k++) s.waste.push(s.stock.pop()!);
  } else if (s.waste.length && canRedeal(s, r)) {
    s.stock = s.waste.reverse();
    s.waste = [];
    s.redeals++;
  } else return false;
  s.moves++;
  return true;
}

const flip = (col: KCol) => {
  if (!col.u.length && col.d.length) col.u.push(col.d.pop()!);
};

/** Cards that would move when picking pile p at index i (tableau index counts face-down cards). */
export function picked(s: KState, p: string, i: number): Card[] | null {
  if (p === 'w') return s.waste.length && i === s.waste.length - 1 ? [s.waste[i]] : null;
  if (p[0] === 'f') {
    const su = Number(p.slice(1));
    return s.found[su] ? [su * 13 + s.found[su] - 1] : null;
  }
  if (p[0] === 't') {
    const col = s.tab[Number(p.slice(1))];
    const k = i - col.d.length;
    if (!col || k < 0 || k >= col.u.length) return null;
    return col.u.slice(k);
  }
  return null;
}

/** Validate and apply a move. Destination 'f' (any foundation) or 't#'. */
export function moveK(s: KState, p: string, i: number, to: string, dry = false): boolean {
  if (p === to) return false;
  const cards = picked(s, p, i);
  if (!cards) return false;
  const c = cards[0];
  if (to[0] === 'f') {
    if (cards.length !== 1 || !fitsFound(s, c) || p[0] === 'f') return false;
  } else if (to[0] === 't') {
    const col = s.tab[Number(to.slice(1))];
    if (!col || !fitsCol(col, c)) return false;
  } else return false;
  if (dry) return true;
  // remove from source
  if (p === 'w') s.waste.pop();
  else if (p[0] === 'f') s.found[suit(c)]--;
  else {
    const col = s.tab[Number(p.slice(1))];
    col.u.splice(i - col.d.length);
    flip(col);
  }
  if (to[0] === 'f') s.found[suit(c)]++;
  else s.tab[Number(to.slice(1))].u.push(...cards);
  s.moves++;
  return true;
}

/** Best destination for a tap: foundation, then a matching non-empty column, then an empty column. */
export function bestDest(s: KState, p: string, i: number): string | null {
  const cards = picked(s, p, i);
  if (!cards) return null;
  if (cards.length === 1 && p[0] !== 'f' && fitsFound(s, cards[0])) return 'f';
  const from = p[0] === 't' ? Number(p.slice(1)) : -1;
  for (let k = 0; k < 7; k++) {
    const t = from >= 0 ? (from + 1 + k) % 7 : k;
    if (t === from) continue;
    if (s.tab[t].u.length && fitsOn(cards[0], s.tab[t].u[s.tab[t].u.length - 1])) return 't' + t;
  }
  if (rank(cards[0]) === 13) {
    // Moving a king that already sits at the bottom of its column to another empty column is pointless.
    if (from >= 0 && s.tab[from].d.length === 0 && i === 0) return null;
    for (let t = 0; t < 7; t++) if (t !== from && !s.tab[t].u.length && !s.tab[t].d.length) return 't' + t;
  }
  return null;
}

/** Cards that will show on top of the waste (in order) if the player just keeps drawing. */
function talonTops(s: KState, r: KRules): Card[] {
  const out: Card[] = [];
  if (s.waste.length) out.push(s.waste[s.waste.length - 1]);
  const st = s.stock.slice();
  const w = s.waste.slice();
  const pass = () => {
    while (st.length) {
      for (let k = 0; k < r.draw && st.length; k++) w.push(st.pop()!);
      out.push(w[w.length - 1]);
    }
  };
  pass();
  if (canRedeal(s, r) && w.length) {
    st.push(...w.reverse());
    w.length = 0;
    pass();
  }
  return out;
}

const keyK = (s: KState) => s.found.join(',') + '|' + s.tab.map((t) => t.d.length + ':' + t.u.join('.')).join('/');

/**
 * Is real progress still possible? Searches every chain of tableau / foundation→tableau shuffles
 * for a foundation play, a flip, or a talon play (the talon shows the same cards on every pass, so
 * one more pass covers them all). Exact unless the node cap is hit, where it answers "yes".
 */
export function hasProgress(s0: KState, r: KRules, cap = 3000): boolean {
  if (wonK(s0)) return true;
  const tops = talonTops(s0, r);
  const seen = new Set<string>();
  let nodes = 0;
  const immediate = (s: KState): boolean => {
    for (const c of tops) {
      if (fitsFound(s, c)) return true;
      for (const col of s.tab) if (fitsCol(col, c)) return true;
    }
    for (let a = 0; a < 7; a++) {
      const col = s.tab[a];
      if (!col.u.length) continue;
      if (fitsFound(s, col.u[col.u.length - 1])) return true;
      if (col.d.length) for (let b = 0; b < 7; b++) if (b !== a && fitsCol(s.tab[b], col.u[0])) return true;
    }
    return false;
  };
  const rec = (s: KState): boolean => {
    if (++nodes > cap) return true;
    if (immediate(s)) return true;
    const k = keyK(s);
    if (seen.has(k)) return false;
    seen.add(k);
    // shuffles: tableau runs (k>0 or whole column with nothing beneath) and foundation tops to tableau
    for (let a = 0; a < 7; a++) {
      const col = s.tab[a];
      for (let j = 0; j < col.u.length; j++) {
        for (let b = 0; b < 7; b++) {
          if (b === a || !fitsCol(s.tab[b], col.u[j])) continue;
          if (!s.tab[b].u.length && j === 0) continue; // whole column to an empty one: no change
          const n = cloneK(s);
          moveK(n, 't' + a, col.d.length + j, 't' + b);
          if (rec(n)) return true;
        }
      }
    }
    for (let su = 0; su < 4; su++) {
      if (!s.found[su]) continue;
      for (let b = 0; b < 7; b++) {
        if (!fitsCol(s.tab[b], su * 13 + s.found[su] - 1)) continue;
        const n = cloneK(s);
        moveK(n, 'f' + su, 0, 't' + b);
        if (rec(n)) return true;
      }
    }
    return false;
  };
  return rec(cloneK(s0));
}

/** Does a card the talon will show (now or after more draws) play somewhere right away? */
export function talonPlays(s: KState, r: KRules): boolean {
  return talonTops(s, r).some((c) => fitsFound(s, c) || s.tab.some((col) => fitsCol(col, c)));
}

/** A tableau move: card at pile `p` / index `i` (and its cover) to `to`. */
export interface KMove {
  p: string;
  i: number;
  to: string;
}

/** What the shuffles of a plan set up: a card going home, a hidden card turning over, or a talon card playing. */
export type KGoal = 'home' | 'flip' | 'talon';

/**
 * Shortest series of tableau / foundation→tableau shuffles after which real progress is possible (the
 * moves hasProgress explores), breadth first so following it one move at a time never loops. Cards in
 * `keep` may not go home as the goal (they were just taken down from a foundation for the plan).
 * Null when none is found within `cap` positions.
 */
export function progressPlan(
  s0: KState,
  r: KRules,
  keep: ReadonlySet<Card> = new Set(),
  cap = 3000,
): { line: KMove[]; goal: KGoal } | null {
  const tops = talonTops(s0, r);
  const goal = (s: KState): KGoal | null => {
    for (let a = 0; a < 7; a++) {
      const col = s.tab[a];
      if (!col.u.length) continue;
      const c = col.u[col.u.length - 1];
      // A card taken down from a foundation on the way doesn't count when it goes straight back.
      if (fitsFound(s, c) && !keep.has(c) && rank(c) > s0.found[suit(c)]) return 'home';
      if (col.d.length) for (let b = 0; b < 7; b++) if (b !== a && fitsCol(s.tab[b], col.u[0])) return 'flip';
    }
    for (const c of tops) if (fitsFound(s, c) || s.tab.some((col) => fitsCol(col, c))) return 'talon';
    return null;
  };
  type Node = { s: KState; up: Node | null; m: KMove | null };
  const start: Node = { s: cloneK(s0), up: null, m: null };
  const seen = new Set<string>([keyK(start.s)]);
  const queue: Node[] = [start];
  for (let q = 0; q < queue.length && q < cap; q++) {
    const node = queue[q];
    const s = node.s;
    const g = q ? goal(s) : null;
    if (g) {
      const line: KMove[] = [];
      for (let x: Node | null = node; x?.m; x = x.up) line.push(x.m);
      return { line: line.reverse(), goal: g };
    }
    const kid = (p: string, i: number, to: string) => {
      const n = cloneK(s);
      moveK(n, p, i, to);
      const k = keyK(n);
      if (seen.has(k)) return;
      seen.add(k);
      queue.push({ s: n, up: node, m: { p, i, to } });
    };
    for (let a = 0; a < 7; a++) {
      const col = s.tab[a];
      for (let j = 0; j < col.u.length; j++)
        for (let b = 0; b < 7; b++) {
          if (b === a || !fitsCol(s.tab[b], col.u[j])) continue;
          if (!s.tab[b].u.length && j === 0) continue;
          kid('t' + a, col.d.length + j, 't' + b);
        }
    }
    for (let su = 0; su < 4; su++) {
      if (!s.found[su]) continue;
      for (let b = 0; b < 7; b++) if (fitsCol(s.tab[b], su * 13 + s.found[su] - 1)) kid('f' + su, 0, 't' + b);
    }
  }
  return null;
}

/** All face-down cards revealed and the talon empty: the rest is mechanical. */
export const trivialK = (s: KState) => !s.stock.length && !s.waste.length && s.tab.every((t) => !t.d.length);

/** Play everything home (used once the game is trivially won). */
export function finishK(s: KState) {
  for (let guard = 0; guard < 60; guard++) {
    let moved = false;
    for (const col of s.tab) {
      const c = col.u[col.u.length - 1];
      if (c != null && fitsFound(s, c)) {
        col.u.pop();
        s.found[suit(c)]++;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

/** Quick greedy player used to bias deals toward winnable ones. Returns true if it wins. */
export function greedyK(s0: KState, r: KRules, maxSteps = 900): boolean {
  const s = cloneK(s0);
  let idle = 0;
  for (let step = 0; step < maxSteps; step++) {
    if (wonK(s) || trivialK(s)) return true;
    let did = false;
    // 1. anything to foundation (tableau first, then waste)
    for (let a = 0; a < 7 && !did; a++) {
      const col = s.tab[a];
      if (col.u.length && fitsFound(s, col.u[col.u.length - 1])) did = moveK(s, 't' + a, col.d.length + col.u.length - 1, 'f');
    }
    if (!did && s.waste.length && fitsFound(s, s.waste[s.waste.length - 1])) did = moveK(s, 'w', s.waste.length - 1, 'f');
    // 2. whole face-up run that frees a face-down card (most face-down first)
    if (!did) {
      let bestA = -1,
        bestB = -1,
        bestD = -1;
      for (let a = 0; a < 7; a++) {
        const col = s.tab[a];
        if (!col.u.length || !col.d.length || col.d.length <= bestD) continue;
        for (let b = 0; b < 7; b++) {
          if (b !== a && fitsCol(s.tab[b], col.u[0])) {
            bestA = a;
            bestB = b;
            bestD = col.d.length;
            break;
          }
        }
      }
      if (bestA >= 0) did = moveK(s, 't' + bestA, s.tab[bestA].d.length, 't' + bestB);
    }
    // 3. waste to tableau
    if (!did && s.waste.length) {
      const c = s.waste[s.waste.length - 1];
      for (let b = 0; b < 7 && !did; b++) if (fitsCol(s.tab[b], c)) did = moveK(s, 'w', s.waste.length - 1, 't' + b);
    }
    // 4. partial run move that lets the exposed card go home
    if (!did) {
      for (let a = 0; a < 7 && !did; a++) {
        const col = s.tab[a];
        for (let j = 1; j < col.u.length && !did; j++) {
          if (!fitsFound(s, col.u[j - 1])) continue;
          for (let b = 0; b < 7 && !did; b++)
            if (b !== a && s.tab[b].u.length && fitsCol(s.tab[b], col.u[j])) did = moveK(s, 't' + a, col.d.length + j, 't' + b);
        }
      }
    }
    if (did) {
      idle = 0;
      continue;
    }
    // 5. draw
    if (!draw(s, r)) return false;
    idle++;
    if (idle > (s.stock.length + s.waste.length) / r.draw + 3) return false;
  }
  return false;
}

/**
 * A deal the greedy player wins under the real rules (so it is certainly winnable). Each deal has at
 * least a 1.2% chance (Master: draw 3, 3 passes), so 3000 tries all failing is a ~1e-16 event.
 */
export function genK(rng: Rng, r: KRules, tries = 3000): KState {
  let s = dealK(deck(rng));
  for (let t = 1; t < tries && !greedyK(s, r); t++) s = dealK(deck(rng));
  return s;
}
