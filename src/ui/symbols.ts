// Colour symbols: one shape per palette colour (PALETTE index k), the same in every game, so a colour is
// never the only cue. Shown when the "Colour symbols" setting is on (`:root[data-symbols]`).
//   HTML: append `mark(k)` to a positioned element that carries the colour.
//   SVG:  append `svgMark(k, cx, cy, r)` over a coloured shape.
import { s } from './dom';

/** 24 × 24 silhouettes, PALETTE order: orange ▲, blue ■, green ●, yellow ★, purple ◆, cyan ✚, pink ♥, lime ⧗. */
const PATHS = [
  'M12 2.5 22.5 20.5H1.5Z',
  'M3.5 3.5h17v17h-17Z',
  'M12 2a10 10 0 1 1 0 20a10 10 0 1 1 0-20Z',
  'M12 1.5l3.1 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.3l-6.4 3.6 1.5-7.1-5.4-4.9 7.2-.8Z',
  'M12 1 23 12 12 23 1 12Z',
  'M8.5 2h7v6.5H22v7h-6.5V22h-7v-6.5H2v-7h6.5Z',
  'M12 21.5 3 12.6C.3 9.9 1.4 4.6 5.6 4c2.6-.4 4.9 1 6.4 3.2C13.5 5 15.8 3.6 18.4 4c4.2.6 5.3 5.9 2.6 8.6Z',
  'M3 2.5h18L3 21.5h18Z',
];

let styled = false;
function style() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const css = PATHS.map((d, k) => {
    const url = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='${d}'/></svg>`)}")`;
    return `.cmark[data-k="${k}"]{-webkit-mask-image:${url};mask-image:${url}}`;
  }).join('');
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
}

/** HTML symbol for palette colour `k` (none yet when `k < 0`); sits centred over its parent. */
export function mark(k: number): HTMLElement {
  style();
  const el = document.createElement('i');
  el.className = 'cmark';
  el.setAttribute('aria-hidden', 'true');
  setMark(el, k);
  return el;
}

/** Point an existing {@link mark} at another colour (or hide it with `k < 0`). */
export function setMark(el: HTMLElement, k: number) {
  if (k < 0) el.removeAttribute('data-k');
  else el.dataset['k'] = String(k % PATHS.length);
}

/** SVG symbol for palette colour `k`, centred on (cx, cy) and fitting a circle of radius `r`. */
export function svgMark(k: number, cx: number, cy: number, r: number): SVGPathElement {
  const sc = (r * 2) / 24 / 1.25;
  return s('path', {
    class: 'cmark-svg',
    d: PATHS[((k % PATHS.length) + PATHS.length) % PATHS.length],
    transform: `translate(${cx - 12 * sc} ${cy - 12 * sc}) scale(${sc})`,
    'aria-hidden': 'true',
  });
}
