// Long-press / right-click flagging (and optional swipes) on a grid of `[data-i]` cells.

export interface PressOpts {
  /** May cell `i` be flagged right now? */
  canFlag(i: number): boolean;
  flag(i: number): void;
  /** Swipe direction: 0 up, 1 right, 2 down, 3 left. */
  swipe?(dir: number): void;
}

export interface Press {
  /** True when the click that follows a long-press or swipe must be ignored (consumes the flag). */
  swallow(): boolean;
  cancel(): void;
}

export function cellOf(grid: HTMLElement, target: EventTarget | null): number {
  const t = (target as Element | null)?.closest?.('[data-i]') as HTMLElement | null;
  return t && grid.contains(t) ? Number(t.dataset['i']) : -1;
}

export function gridPress(grid: HTMLElement, cells: HTMLElement[], o: PressOpts): Press {
  let timer = 0,
    cell = -1,
    px = 0,
    py = 0,
    id = -1,
    suppress = false;
  const cancel = () => {
    clearTimeout(timer);
    timer = 0;
    if (cell >= 0) cells[cell]?.classList.remove('lp');
  };
  grid.addEventListener('pointerdown', (e) => {
    suppress = false;
    cancel();
    id = -1;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    id = e.pointerId;
    cell = cellOf(grid, e.target);
    px = e.clientX;
    py = e.clientY;
    if (cell < 0 || !o.canFlag(cell)) return;
    // Progress hint while holding (transient class, gone before the next render/snapshot).
    cells[cell].classList.add('lp');
    timer = window.setTimeout(() => {
      timer = 0;
      cells[cell].classList.remove('lp');
      if (!o.canFlag(cell)) return;
      suppress = true;
      o.flag(cell);
      try {
        navigator.vibrate?.(15);
      } catch {
        /* not allowed */
      }
    }, 350);
  });
  grid.addEventListener('pointermove', (e) => {
    if (timer && Math.hypot(e.clientX - px, e.clientY - py) > 10) cancel();
  });
  grid.addEventListener('pointerup', (e) => {
    cancel();
    if (!o.swipe || e.pointerId !== id || suppress) return;
    const dx = e.clientX - px,
      dy = e.clientY - py;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    suppress = true;
    o.swipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
  });
  grid.addEventListener('pointercancel', cancel);
  grid.addEventListener('pointerleave', cancel);
  grid.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    cancel();
    if (suppress) return;
    const i = cellOf(grid, e.target);
    if (i >= 0 && o.canFlag(i)) o.flag(i);
  });
  return {
    swallow() {
      const s = suppress;
      suppress = false;
      return s;
    },
    cancel,
  };
}
