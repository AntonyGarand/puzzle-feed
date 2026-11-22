import { shake } from '../../ui/dom';

/**
 * Shared tap + drag-and-drop for card tables.
 * Every card / slot element carries `data-p` (pile id) and `data-i` (index, -1 for an empty slot);
 * every pile container carries `data-pile` (drop target).
 */
export interface TableHooks {
  /** Can the card at pile p / index i (and everything above it) be picked up? */
  canDrag(p: string, i: number): boolean;
  /** Tap (click) on a card or slot. */
  tap(p: string, i: number): void;
  /** Drop the picked card(s) on pile `to`. Return true if a move happened (the game re-renders). */
  drop(p: string, i: number, to: string): boolean;
  /** Optional filter: only consider drop piles that would accept the picked card(s). */
  accepts?(p: string, i: number, to: string): boolean;
}

/** Touch: how long a finger must rest on a card before it lifts for a drag in any direction. */
const HOLD_MS = 230;
/** Movement (px) that separates a tap from a drag. */
const SLOP = 7;

/**
 * Mouse / pen: press and move to drag. Touch: the feed scrolls vertically, so a vertical swipe on the
 * table scrolls it (the table is `touch-action: pan-y`). A card only lifts on touch after a sideways
 * move or a short hold; taps always work.
 */
export function bindTable(table: HTMLElement, hooks: TableHooks): () => void {
  let drag: {
    p: string;
    i: number;
    x: number;
    y: number;
    els: HTMLElement[];
    on: boolean;
    moved: boolean;
    id: number;
    touch: boolean;
    timer: number;
  } | null = null;
  let suppress = 0;

  const target = (e: Event) => (e.target as HTMLElement | null)?.closest?.('[data-p]') as HTMLElement | null;

  const onClick = (e: MouseEvent) => {
    if (performance.now() < suppress) return;
    const el = target(e);
    if (!el || !table.contains(el)) return;
    hooks.tap(el.dataset['p']!, Number(el.dataset['i']));
  };

  const reset = (d = drag) => {
    if (!d) return;
    for (const el of d.els) {
      el.style.removeProperty('transform');
      el.classList.remove('lift');
    }
  };

  const end = () => {
    if (drag) clearTimeout(drag.timer);
    drag = null;
  };

  const lift = (id: number) => {
    if (!drag || drag.on) return;
    drag.on = true;
    try {
      table.setPointerCapture(id);
    } catch {
      /* ignore */
    }
    for (const el of drag.els) el.classList.add('lift');
  };

  const onDown = (e: PointerEvent) => {
    if (e.button > 0 || drag) return;
    const el = target(e);
    if (!el || !el.classList.contains('pc')) return;
    const p = el.dataset['p']!;
    const i = Number(el.dataset['i']);
    if (!hooks.canDrag(p, i)) return;
    const els = [...table.querySelectorAll<HTMLElement>('.pc[data-p]')].filter((c) => c.dataset['p'] === p && Number(c.dataset['i']) >= i);
    const touch = e.pointerType === 'touch';
    const id = e.pointerId;
    const timer = touch ? window.setTimeout(() => lift(id), HOLD_MS) : 0;
    drag = { p, i, x: e.clientX, y: e.clientY, els, on: false, moved: false, id, touch, timer };
  };

  const onMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.on) {
      if (Math.hypot(dx, dy) < SLOP) return;
      if (drag.touch && Math.abs(dy) >= Math.abs(dx)) {
        end(); // vertical swipe before the hold: leave it to the feed
        return;
      }
      lift(e.pointerId);
    }
    if (!drag.moved && Math.hypot(dx, dy) < SLOP) return;
    drag.moved = true;
    for (const el of drag.els) el.style.transform = `translate(${dx}px, ${dy}px)`;
    e.preventDefault();
  };

  // Once a card is lifted, keep the browser from turning the gesture into a scroll.
  const onTouchMove = (e: TouchEvent) => {
    if (drag?.on && e.cancelable) e.preventDefault();
  };

  const onUp = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    end();
    if (!d.on) return;
    suppress = performance.now() + 250;
    if (!d.moved) {
      // Held without moving: that's a tap.
      reset(d);
      hooks.tap(d.p, d.i);
      return;
    }
    // Drop on the pile whose box overlaps the lead card most (pointer position breaks ties).
    const lead = d.els[0].getBoundingClientRect();
    let best: string | null = null;
    let bestA = 0;
    for (const pile of table.querySelectorAll<HTMLElement>('[data-pile]')) {
      if (pile.dataset['pile'] === d.p) continue;
      if (hooks.accepts && !hooks.accepts(d.p, d.i, pile.dataset['pile']!)) continue;
      const r = pile.getBoundingClientRect();
      const w = Math.min(lead.right, r.right) - Math.max(lead.left, r.left);
      const hh = Math.min(lead.bottom, r.bottom) - Math.max(lead.top, r.top);
      let a = w > 0 && hh > 0 ? w * hh : 0;
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) a += lead.width * lead.height;
      if (a > bestA) {
        bestA = a;
        best = pile.dataset['pile']!;
      }
    }
    const moved = best != null && hooks.drop(d.p, d.i, best);
    if (!moved) {
      // Refused or nowhere to go: the cards snap back and shake, like a tap that can't play.
      reset(d);
      for (const el of d.els) if (el.isConnected) shake(el);
    }
  };

  const onCancel = () => {
    reset();
    end();
  };

  const onMenu = (e: Event) => e.preventDefault();

  table.addEventListener('click', onClick);
  table.addEventListener('pointerdown', onDown);
  table.addEventListener('pointermove', onMove);
  table.addEventListener('pointerup', onUp);
  table.addEventListener('pointercancel', onCancel);
  table.addEventListener('touchmove', onTouchMove, { passive: false });
  table.addEventListener('contextmenu', onMenu);
  return () => {
    end();
    table.removeEventListener('click', onClick);
    table.removeEventListener('pointerdown', onDown);
    table.removeEventListener('pointermove', onMove);
    table.removeEventListener('pointerup', onUp);
    table.removeEventListener('pointercancel', onCancel);
    table.removeEventListener('touchmove', onTouchMove);
    table.removeEventListener('contextmenu', onMenu);
  };
}

/** Simple undo stack of serialised states, capped so snapshots stay small. */
export class History<T> {
  stack: string[] = [];
  constructor(private cap = 60) {}
  push(state: T) {
    this.stack.push(JSON.stringify(state));
    if (this.stack.length > this.cap) this.stack.shift();
  }
  pop(): T | null {
    const s = this.stack.pop();
    return s ? (JSON.parse(s) as T) : null;
  }
  get size() {
    return this.stack.length;
  }
  restore(v: unknown) {
    if (Array.isArray(v) && v.every((x) => typeof x === 'string')) this.stack = v.slice(-this.cap);
  }
}
