import { Rng } from './rng';
import type { PuzzleDef, PuzzleInstance } from './types';
import { h } from './ui';

/** Board size the preview is generated at, before being scaled down to the thumbnail. */
const BASE = 340;
const live = new Set<PuzzleInstance>();
let io: IntersectionObserver | null = null;

/** Stable per-game seed so a game's preview is always the same board. */
const seedOf = (id: string) => [...id].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 7);

function mount(box: HTMLElement, def: PuzzleDef) {
  const stage = h('div', { class: 'thumb-stage stage' });
  stage.style.setProperty('--fit', `${BASE - 20}px`);
  const root = h('div', { class: 'puzzle' });
  stage.append(root);
  box.append(stage);
  stage.inert = true;
  try {
    const noop = () => {};
    const inst =
      def.create({
        difficulty: 2,
        rng: new Rng(seedOf(def.id)),
        root,
        solved: noop,
        failed: noop,
        mistake: noop,
        touch: noop,
        status: noop,
        controls: noop,
      }) || {};
    live.add(inst);
  } catch {
    stage.remove();
    box.classList.add('thumb-failed');
    return;
  }
  // Scale the full-size board down to the box.
  requestAnimationFrame(() => {
    // Measure what's actually drawn (some boards overflow their root), unscaled.
    stage.style.transform = 'none';
    const r = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity };
    for (const el of root.querySelectorAll('*')) {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      r.l = Math.min(r.l, b.left);
      r.t = Math.min(r.t, b.top);
      r.r = Math.max(r.r, b.right);
      r.b = Math.max(r.b, b.bottom);
    }
    const s = stage.getBoundingClientRect();
    if (!Number.isFinite(r.l)) Object.assign(r, { l: s.left, t: s.top, r: s.right, b: s.bottom });
    const k = Math.min(box.clientWidth / (r.r - r.l), box.clientHeight / (r.b - r.t)) * 0.88;
    // Centre the drawn content (not the stage) in the box.
    const dx = (s.left + s.width / 2 - (r.l + r.r) / 2) * k;
    const dy = (s.top + s.height / 2 - (r.t + r.b) / 2) * k;
    stage.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${k})`;
    box.classList.add('thumb-ready');
  });
}

/** A static, non-interactive mini board of the game, mounted lazily when scrolled into view. */
export function thumb(def: PuzzleDef, cls = ''): HTMLElement {
  const box = h('div', { class: `thumb ${cls}`, 'data-puzzle': def.id, 'aria-hidden': 'true' });
  io ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io!.unobserve(e.target);
        const el = e.target as HTMLElement & { __def?: PuzzleDef };
        if (el.__def) mount(el, el.__def);
      }
    },
    { rootMargin: '300px 0px' },
  );
  (box as HTMLElement & { __def?: PuzzleDef }).__def = def;
  io.observe(box);
  return box;
}

/** Tear down every preview (call before re-rendering the page). */
export function destroyThumbs() {
  for (const inst of live) inst.destroy?.();
  live.clear();
  io?.disconnect();
  io = null;
}
