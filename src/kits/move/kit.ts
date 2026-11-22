import { Rng } from '../../core/rng';

/** Directions: 0 up, 1 right, 2 down, 3 left. */
export type Dir = 0 | 1 | 2 | 3;
/** Draw a 32-bit base seed from the puzzle rng (deterministic for a given puzzle seed). */
export const baseSeed = (rng: Rng) => Math.floor(rng.next() * 2 ** 32) >>> 0;

/** Independent rng for the k-th event (spawn, piece batch, …), so resumed games replay identically. */
export function subRng(base: number, k: number): Rng {
  let x = (base ^ Math.imul(k + 1, 0x9e3779b9)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return new Rng((x ^ (x >>> 16)) >>> 0);
}

/** Arrow keys / WASD to a direction. */
export function keyDir(e: KeyboardEvent): Dir | null {
  const m: Record<string, Dir> = {
    ArrowUp: 0,
    w: 0,
    W: 0,
    ArrowRight: 1,
    d: 1,
    D: 1,
    ArrowDown: 2,
    s: 2,
    S: 2,
    ArrowLeft: 3,
    a: 3,
    A: 3,
  };
  return m[e.key] ?? null;
}

/**
 * Swipe detection with pointer events. The element gets `touch-action: none` so the feed doesn't scroll.
 * `onTap` receives the pointerup event when the gesture was too short to count as a swipe.
 */
export function onSwipe(el: HTMLElement, cb: (d: Dir) => void, onTap?: (e: PointerEvent) => void) {
  el.style.touchAction = 'none';
  let sx = 0,
    sy = 0,
    id = -1;
  el.addEventListener('pointerdown', (e) => {
    id = e.pointerId;
    sx = e.clientX;
    sy = e.clientY;
  });
  el.addEventListener('pointerup', (e) => {
    if (e.pointerId !== id) return;
    id = -1;
    const dx = e.clientX - sx,
      dy = e.clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) {
      onTap?.(e);
      return;
    }
    cb(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
  });
  el.addEventListener('pointercancel', () => (id = -1));
}

/** Subtle Web Animations pulse; never touches class/style attributes (so resume views stay identical). */
export function anim(el: Element, frames: Keyframe[], ms = 160) {
  const target = el as HTMLElement;
  // happy-dom (tests) has no Web Animations API.
  if (typeof target.animate === 'function') {
    try {
      target.animate(frames, { duration: ms, easing: 'ease-out' });
    } catch {
      /* ignore */
    }
  }
}
export const POP: Keyframe[] = [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }];
export const GROW: Keyframe[] = [
  { transform: 'scale(0.55)', opacity: 0.4 },
  { transform: 'scale(1)', opacity: 1 },
];

/** Defensive helpers for restoring snapshots. */
export const isIntArr = (v: unknown, len?: number): v is number[] =>
  Array.isArray(v) && (len == null || v.length === len) && v.every((x) => Number.isInteger(x));
export const int = (v: unknown, def: number) => (Number.isInteger(v) ? (v as number) : def);
