// Seats' venues: where the seats are, what each seat is like and which seats are neighbours.
// Every venue is lopsided on purpose (an aisle on one side, numbered tables, a window wall facing the kitchen),
// so no seating has a mirror image that fits the same wishes.

export type Kind = 'bus' | 'cinema' | 'diner';
export const KINDS: readonly Kind[] = ['bus', 'cinema', 'diner'];

/** What a seat is like, for the place wishes. */
export type Tag = 'window' | 'aisle' | 'front' | 'back' | 'center' | 'kitchen';
const TAGS: ReadonlySet<string> = new Set(['window', 'aisle', 'front', 'back', 'center', 'kitchen']);
export const isTag = (t: string): t is Tag => TAGS.has(t);

interface Seat {
  /** Grid line (1-based) where the seat is drawn. */
  row: number;
  col: number;
  tags: Tag[];
  /** The seats right beside it (same row, same side of the aisle or of the table). */
  side: number[];
  /** The seat facing it across a table, -1 if none. */
  across: number;
  /** The seats right in front of it and right behind it (bus and cinema), -1 if none. */
  front: number;
  back: number;
  /** Table number (diner), 0 if none. */
  table: number;
  /** Neighbours for smells, noise and kids: the seats beside it and the one facing it. */
  near: number[];
}

/** Something drawn between the seats: the aisle, or a table with its number. */
interface Deco {
  row: number;
  col: number;
  rows: number;
  cols: number;
  cls: 'aisle' | 'table';
  text?: string;
}

export interface Venue {
  kind: Kind;
  seats: Seat[];
  /** CSS grid templates. */
  cols: string;
  rows: string;
  deco: Deco[];
}

const finish = (kind: Kind, seats: Omit<Seat, 'near'>[], cols: string, rows: string, deco: Deco[]): Venue => ({
  kind,
  seats: seats.map((s) => ({ ...s, near: s.across >= 0 ? [...s.side, s.across] : s.side.slice() })),
  cols,
  rows,
  deco,
});

/** Rows of seats in blocks split by aisles; `blocks` are block widths, an aisle after each but the last, plus `tail` aisle at the end. */
function rowsOf(kind: Kind, R: number, blocks: number[], tail: boolean, tagsOf: (r: number, c: number, C: number) => Tag[]): Venue {
  const C = blocks.reduce((a, b) => a + b, 0);
  const seats: Omit<Seat, 'near'>[] = [];
  const deco: Deco[] = [];
  /** Grid column of seat column c, and which block it's in. */
  const gcol: number[] = [];
  const blockOf: number[] = [];
  let g = 1;
  blocks.forEach((w, b) => {
    for (let i = 0; i < w; i++) {
      gcol.push(g++);
      blockOf.push(b);
    }
    if (b < blocks.length - 1 || tail) deco.push({ row: 1, col: g++, rows: R, cols: 1, cls: 'aisle' });
  });
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      const s = r * C + c;
      const side: number[] = [];
      if (c > 0 && blockOf[c - 1] === blockOf[c]) side.push(s - 1);
      if (c < C - 1 && blockOf[c + 1] === blockOf[c]) side.push(s + 1);
      seats.push({
        row: r + 1,
        col: gcol[c],
        tags: tagsOf(r, c, C),
        side,
        across: -1,
        front: r > 0 ? s - C : -1,
        back: r < R - 1 ? s + C : -1,
        table: 0,
      });
    }
  const tpl = blocks.map((w) => `repeat(${w}, 1fr)`).join(' 0.45fr ') + (tail ? ' 0.45fr' : '');
  return finish(kind, seats, tpl, `repeat(${R}, auto)`, deco);
}

/** A bus seen from above, front at the top: two seats, the aisle, three seats. */
export function bus(R: number): Venue {
  return rowsOf('bus', R, [2, 3], false, (r, c, C) => {
    const t: Tag[] = [];
    if (c === 0 || c === C - 1) t.push('window');
    if (c === 1 || c === 2) t.push('aisle');
    if (r === 0) t.push('front');
    if (r === R - 1) t.push('back');
    return t;
  });
}

/** A cinema: rows of `W` seats (odd), the screen in front and the stairs on the right. */
export function cinema(R: number, W: number): Venue {
  return rowsOf('cinema', R, [W], true, (r, c) => {
    const t: Tag[] = [];
    if (c === W - 1) t.push('aisle');
    if (c === (W - 1) / 2) t.push('center');
    if (r === 0) t.push('front');
    if (r === R - 1) t.push('back');
    return t;
  });
}

/**
 * A restaurant: `TR` rows of two tables, `k` seats on each side of a table. Windows run along the top wall,
 * the kitchen along the bottom one, and the waiters' aisle between the two columns of tables.
 */
export function diner(TR: number, k: number): Venue {
  const seats: Omit<Seat, 'near'>[] = [];
  const deco: Deco[] = [];
  const rows: string[] = [];
  for (let tr = 0; tr < TR; tr++) {
    const base = tr * 4;
    rows.push('auto', '20px', 'auto');
    if (tr < TR - 1) rows.push('6px');
    for (let tc = 0; tc < 2; tc++) {
      const n = tr * 2 + tc + 1;
      const col0 = tc === 0 ? 1 : k + 2;
      deco.push({ row: base + 2, col: col0, rows: 1, cols: k, cls: 'table', text: String(n) });
      const first = seats.length;
      for (const top of [true, false])
        for (let i = 0; i < k; i++) {
          const t: Tag[] = [];
          if (top && tr === 0) t.push('window');
          if (!top && tr === TR - 1) t.push('kitchen');
          if ((tc === 0 && i === k - 1) || (tc === 1 && i === 0)) t.push('aisle');
          const s = seats.length;
          const side: number[] = [];
          if (i > 0) side.push(s - 1);
          if (i < k - 1) side.push(s + 1);
          seats.push({
            row: base + (top ? 1 : 3),
            col: col0 + i,
            tags: t,
            side,
            across: top ? first + k + i : first + i,
            front: -1,
            back: -1,
            table: n,
          });
        }
    }
  }
  deco.push({ row: 1, col: k + 1, rows: rows.length, cols: 1, cls: 'aisle' });
  return finish('diner', seats, `repeat(${k}, 1fr) 0.45fr repeat(${k}, 1fr)`, rows.join(' '), deco);
}

/** The venue of a kind, sized for a level. */
export function venueFor(kind: Kind, d: number): Venue {
  const i = Math.min(5, Math.max(1, d)) - 1;
  if (kind === 'bus') return bus([2, 3, 4, 5, 6][i]);
  if (kind === 'cinema') return cinema([2, 3, 3, 4, 4][i], [5, 5, 7, 7, 7][i]);
  return diner([1, 2, 2, 2, 2][i], [2, 2, 2, 3, 3][i]);
}
