/**
 * Tap and long-press on a grid of `[data-i]` cells. `onTap` runs on click (so keyboard and synthetic
 * clicks work too); `onHold` runs after holding ~400 ms, or on right-click. Returns a cleanup function.
 */
export function tapOrHold(grid: HTMLElement, onTap: (i: number) => void, onHold: (i: number) => void, ms = 400): () => void {
  let timer = 0;
  let held = false;
  let start: { x: number; y: number; el: HTMLElement } | null = null;
  const indexOf = (t: EventTarget | null) => {
    const el = (t as Element | null)?.closest?.('[data-i]') as HTMLElement | null;
    return el && grid.contains(el) ? { el, i: Number(el.dataset['i']) } : null;
  };
  const cancel = () => {
    clearTimeout(timer);
    timer = 0;
    start?.el.classList.remove('lp');
    start = null;
  };
  const hold = (i: number) => {
    held = true;
    onHold(i);
    try {
      navigator.vibrate?.(15);
    } catch {
      /* not allowed */
    }
  };
  grid.addEventListener('pointerdown', (e) => {
    held = false;
    cancel();
    const hit = indexOf(e.target);
    if (!hit || e.button !== 0) return;
    start = { x: e.clientX, y: e.clientY, el: hit.el };
    hit.el.classList.add('lp');
    timer = window.setTimeout(() => {
      timer = 0;
      hit.el.classList.remove('lp');
      start = null;
      hold(hit.i);
    }, ms);
  });
  grid.addEventListener('pointermove', (e) => {
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel();
  });
  grid.addEventListener('pointerup', cancel);
  grid.addEventListener('pointercancel', cancel);
  grid.addEventListener('pointerleave', cancel);
  grid.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const hit = indexOf(e.target);
    if (held || !hit) return; // a touch long-press already fired
    cancel();
    hold(hit.i);
  });
  grid.addEventListener('click', (e) => {
    const hit = indexOf(e.target);
    // Swallow the click that ends a long-press (keyboard clicks have detail 0).
    if (held && e.detail !== 0) {
      held = false;
      return;
    }
    if (hit) onTap(hit.i);
  });
  return cancel;
}
