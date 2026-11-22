import type { Hint } from '../core/types';
import { s as svg } from './dom';

/** Centre of an element's box, relative to `origin`. */
function centre(el: Element, origin: DOMRect) {
  const r = el.getBoundingClientRect();
  return { x: r.left - origin.left + r.width / 2, y: r.top - origin.top + r.height / 2 };
}

/**
 * Draw a hint into `layer` (an SVG absolutely covering `stage`): outline the clues (`why`), ring the
 * move (`at`) and, when both are there, a curved arrow from the clues to the nearest move target.
 */
export function drawHint(layer: SVGSVGElement, stage: Element, hint: Hint | null) {
  layer.replaceChildren();
  if (!hint) return;
  const origin = stage.getBoundingClientRect();
  layer.setAttribute('viewBox', `0 0 ${origin.width} ${origin.height}`);
  const ring = (el: Element, cls: string) => {
    if (!el.isConnected) return;
    const r = el.getBoundingClientRect();
    const pad = 3;
    layer.append(
      svg('rect', {
        class: cls,
        x: r.left - origin.left - pad,
        y: r.top - origin.top - pad,
        width: r.width + pad * 2,
        height: r.height + pad * 2,
        rx: 8,
      }),
    );
  };
  const why = (hint.why ?? []).filter((el) => el.isConnected);
  const at = hint.at.filter((el) => el.isConnected);
  why.forEach((el) => ring(el, 'guide-why'));
  at.forEach((el) => ring(el, 'guide-at'));
  if (!why.length || !at.length) return;
  // Arrow from the middle of the clue(s) to the nearest move target, curved slightly.
  const pts = why.map((el) => centre(el, origin));
  const from = { x: pts.reduce((t, p) => t + p.x, 0) / pts.length, y: pts.reduce((t, p) => t + p.y, 0) / pts.length };
  const to = at
    .map((el) => centre(el, origin))
    .sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0];
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  if (d < 12) return;
  // Stop short of the target's centre so the head sits on the ring, not under the finger.
  const k = Math.max(0, (d - 10) / d);
  const end = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
  const bend = Math.min(40, d * 0.25);
  const mx = (from.x + end.x) / 2 - ((end.y - from.y) / d) * bend;
  const my = (from.y + end.y) / 2 + ((end.x - from.x) / d) * bend;
  layer.append(
    svg('path', { class: 'guide-arrow', d: `M${from.x},${from.y} Q${mx},${my} ${end.x},${end.y}` }),
    svg('circle', { class: 'guide-dot', cx: from.x, cy: from.y, r: 4 }),
  );
  const ang = Math.atan2(end.y - my, end.x - mx);
  const head = (a: number) => `${end.x - 11 * Math.cos(ang + a)},${end.y - 11 * Math.sin(ang + a)}`;
  layer.append(svg('path', { class: 'guide-head', d: `M${head(0.45)} L${end.x},${end.y} L${head(-0.45)}` }));
}
