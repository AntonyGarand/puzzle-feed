import './cards.css';
import type { Rng } from '../../core/rng';
import { L, locale } from '../../core/i18n';
import { h, s as svg } from '../../core/ui';

/** A playing card: suit * 13 + (rank - 1). Suits: 0 ♠, 1 ♥, 2 ♦, 3 ♣. */
export type Card = number;

const TEXT = '\uFE0E'; // force text (not emoji) presentation of suit glyphs
export const SUITS = ['♠', '♥', '♦', '♣'].map((s) => s + TEXT);
const RANKS_EN = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANKS_FR = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R'];
/** Rank letters for the current locale (French: valet, dame, roi). */
const ranks = () => (locale() === 'fr' ? RANKS_FR : RANKS_EN);
/** Letter shown for a rank (1 = ace … 13 = king). */
const rankName = (r: number) => ranks()[r - 1];

export const rank = (c: Card) => (c % 13) + 1;
export const suit = (c: Card) => Math.floor(c / 13) % 4;
export const isRed = (c: Card) => suit(c) === 1 || suit(c) === 2;
const make = (s: number, r: number): Card => s * 13 + r - 1;
/** Short card name for the current locale, e.g. "7♥", "Q♠" (French: "D♠"). */
export const label = (c: Card) => rankName(rank(c)) + SUITS[suit(c)];
/** French "le 7♥" / "l’A♥" (elided before an ace). */
export const leCard = (c: Card) => (rank(c) === 1 ? `l’${label(c)}` : `le ${label(c)}`);

/** Shuffled deck. `suits` picks which suits appear, `copies` repeats each suit (Spider). */
export function deck(rng: Rng, suits: number[] = [0, 1, 2, 3], copies = 1): Card[] {
  const out: Card[] = [];
  for (let k = 0; k < copies; k++) for (const s of suits) for (let r = 1; r <= 13; r++) out.push(make(s, r));
  return rng.shuffle(out);
}

const n3 = (v: number) => Math.round(v * 1000) / 1000;

/** Position helper for absolute layout inside a pile / table: x in card slots, y and dx in card widths. */
function pos(x: number, y: number, dx = 0): string {
  let st = '';
  if (x) st += `--x:${n3(x)};`;
  if (y) st += `--y:${n3(y)};`;
  if (dx) st += `--dx:${n3(dx)};`;
  return st;
}

/** Court-card icon (24×24, filled with currentColor = suit colour): 11 jack sword, 12 queen five-point crown, 13 king crown + cross. */
function faceIcon(r: number): SVGSVGElement {
  const parts: SVGElement[] =
    r === 13
      ? [
          svg('path', { d: 'M10.9 1h2.2v2h2v2h-2v2h-2.2V5h-2V3h2z' }),
          svg('path', { d: 'M2.5 8.5 8 12.5 12 7.5l4 5 5.5-4-2.3 10.5H4.8z' }),
          svg('rect', { x: 4.8, y: 20, width: 14.4, height: 2.6, rx: 0.6 }),
        ]
      : r === 12
        ? [
            svg('path', { d: 'M2.5 9 5.5 13 7 5.5l2.6 6.5L12 3.5l2.4 8.5L17 5.5l1.5 7.5 3-4-2.3 10H4.8z' }),
            ...[
              [2.5, 9],
              [7, 5.5],
              [12, 3.5],
              [17, 5.5],
              [21.5, 9],
            ].map(([cx, cy]) => svg('circle', { cx, cy, r: 1.5 })),
            svg('rect', { x: 4.8, y: 20, width: 14.4, height: 2.6, rx: 0.6 }),
          ]
        : [
            svg('path', { d: 'M12 1l1.4 2.6.3 11.4h-3.4l.3-11.4z' }),
            svg('rect', { x: 6, y: 15, width: 12, height: 2.2, rx: 1.1 }),
            svg('rect', { x: 10.9, y: 17, width: 2.2, height: 4 }),
            svg('circle', { cx: 12, cy: 21.6, r: 1.6 }),
          ];
  return svg('svg', { viewBox: '0 0 24 24', class: 'pc-face', 'aria-hidden': 'true' }, ...parts);
}

/** A card element. `p` = pile id, `i` = index in that pile (drives tap / drag). */
export function cardEl(c: Card, up: boolean, p: string, i: number, style = '', extra = ''): HTMLButtonElement {
  if (!up) {
    return h('button', {
      type: 'button',
      class: `pc down ${extra}`.trim(),
      'data-p': p,
      'data-i': i,
      style: style || null,
      'aria-label': L('face-down card', 'carte face cachée'),
    });
  }
  const s = SUITS[suit(c)];
  const r = rank(c);
  return h(
    'button',
    {
      type: 'button',
      class: `pc ${isRed(c) ? 'red' : 'blk'} s${suit(c)} ${extra}`.trim(),
      'data-p': p,
      'data-i': i,
      style: style || null,
      'aria-label': label(c),
    },
    h('span', { class: 'pc-r' }, rankName(r), h('i', null, s)),
    h('span', { class: 'pc-s' }, r > 10 ? faceIcon(r) : s),
  );
}

/** Empty card-sized outline (pile base). Tapping it reports index -1. */
export function slotEl(p: string, text = '', extra = ''): HTMLDivElement {
  return h('div', { class: `pc-slot ${extra}`.trim(), 'data-p': p, 'data-i': -1 }, text);
}

/** Pile container placed on the table at slot x / height y (card widths). */
export function pileEl(p: string, x: number, y: number, heightCw = 1.4, extra = ''): HTMLDivElement {
  return h('div', { class: `pile ${extra}`.trim(), 'data-pile': p, style: `${pos(x, y)}--ph:${n3(heightCw)}` });
}

/**
 * Vertical offsets (in card widths) for a stacked column: face-down cards first, then face-up.
 * Compresses so the column fits `maxH` card widths.
 */
export function fan(down: number, up: number, maxH: number, dOff = 0.2, uOff = 0.42): number[] {
  const need = down * dOff + Math.max(0, up - 1) * uOff + (up ? 0 : -dOff);
  const room = maxH - 1.4;
  const k = need > room && need > 0 ? room / need : 1;
  const out: number[] = [];
  let y = 0;
  for (let i = 0; i < down + up; i++) {
    out.push(y);
    y += (i < down ? dOff : uOff) * k;
  }
  return out;
}

/** Table root: `n` slot columns wide, `hcw` card widths tall. */
export function tableEl(n: number, hcw: number, extra = ''): HTMLDivElement {
  return h('div', { class: `ctable ${extra}`.trim(), style: `--n:${n};--hcw:${hcw}` });
}

/**
 * Elements under `root` (document order) that pass `ok`. A plain walk over `children`: the guide looks
 * elements up after every move, and attribute selectors (querySelector) are much slower in test DOMs.
 */
function collect(root: Element, ok: (el: HTMLElement) => boolean, out: HTMLElement[] = []): HTMLElement[] {
  for (const el of root.children) {
    if (ok(el as HTMLElement)) out.push(el as HTMLElement);
    if (el.children.length) collect(el, ok, out);
  }
  return out;
}

/** Card (or slot, i = -1) element for pile p / index i on a rendered table (guide hints). */
export const elAt = (table: HTMLElement, p: string, i: number): HTMLElement | null =>
  collect(table, (el) => el.dataset.p === p && el.dataset.i === String(i))[0] ?? null;

/** Topmost rendered element of pile p: its top card, or its empty slot. */
export function topEl(table: HTMLElement, p: string): HTMLElement | null {
  const all = collect(table, (el) => el.dataset.p === p);
  return all.length ? all[all.length - 1] : null;
}

/** Pile containers whose id starts with `prefix` (e.g. 'f' for every foundation). */
export const pilesEl = (table: HTMLElement, prefix: string): HTMLElement[] => collect(table, (el) => !!el.dataset.pile?.startsWith(prefix));

/** Capitalise the first letter (sentence starts like "Le 7♥…"). */
export const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

/** Rank letter alone for the current locale (1 = A … 13 = K / R). */
export const rankLabel = (r: number) => rankName(r);
