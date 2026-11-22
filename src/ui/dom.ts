import { L } from '../core/i18n';

type Child = Node | string | number | null | undefined | false;

type Attrs = Record<string, unknown> | null;

/** Attribute text for a primitive value; anything else is a caller bug, not "[object Object]". */
function attrText(k: string, v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  throw new TypeError(`h(): attribute "${k}" must be a string, number or boolean`);
}

function apply(el: Element, attrs: Attrs, kids: Child[]) {
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      } else if (k === 'class') {
        el.setAttribute('class', attrText(k, v));
      } else if (k === 'value' && 'value' in el) {
        (el as HTMLInputElement).value = attrText(k, v);
      } else if (k === 'checked' && 'checked' in el) {
        (el as HTMLInputElement).checked = Boolean(v);
      } else {
        el.setAttribute(k, v === true ? '' : attrText(k, v));
      }
    }
  }
  for (const c of kids) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
}

/** Tiny DOM builder. `h('div', { class: 'x', onclick: fn }, 'text', child)` */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = null, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  apply(el, attrs, kids);
  return el;
}

/** SVG variant of `h`. */
export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = null, ...kids: Child[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  apply(el, attrs, kids);
  return el;
}

export function fmtTime(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(t / 60);
  const sec = t % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/** Shared square board: every grid-based puzzle uses this so sizing & spacing stay identical. */
export function board(cols: number, rows = cols, extraClass = ''): HTMLDivElement {
  const n = Math.max(cols, rows);
  const gap = n >= 12 ? 3 : n >= 8 ? 4 : 6;
  const bw = n >= 12 ? 1.5 : n >= 8 ? 2 : 2.5; // cell border width
  const sh = n >= 8 ? 0 : 3; // cell shadow offset: chunky tiles on small boards only
  return h('div', {
    class: `grid ${extraClass}`.trim(),
    style: `--cols:${cols};--rows:${rows};--gap:${gap}px;--cbw:${bw}px;--csh:${sh}px`,
  });
}

/** Shared button. */
export function btn(label: string, onclick: (e: MouseEvent) => void, variant: '' | 'primary' | 'ghost' = ''): HTMLButtonElement {
  return h('button', { class: `btn ${variant}`.trim(), type: 'button', onclick }, label);
}

/** Shared key pad: square keys under a board, two even rows past 7 keys. */
export function pad(
  keys: { label: string | Node; value: string; class?: string; style?: string | undefined; aria?: string }[],
  onkey: (v: string) => void,
): HTMLDivElement {
  // Long pads split into two even rows instead of shrinking every key.
  const el = h('div', keys.length > 7 ? { class: 'pad rows', style: `--pc:${Math.ceil(keys.length / 2)}` } : { class: 'pad' });
  for (const k of keys) {
    el.append(
      h(
        'button',
        { class: `key ${k.class ?? ''}`.trim(), type: 'button', style: k.style, 'aria-label': k.aria, onclick: () => onkey(k.value) },
        k.label,
      ),
    );
  }
  return el;
}

/**
 * Arrow pad laid out like a keyboard's arrow cluster (inverted T: ↑ above ← ↓ →), so each arrow sits on
 * the side it points to. Directions are 0 up, 1 right, 2 down, 3 left. `extra` takes the spare top-right slot.
 */
export function dpad(
  onDir: (d: number) => void,
  aria: [up: string, right: string, down: string, left: string] = [
    L('Up', 'Haut'),
    L('Right', 'Droite'),
    L('Down', 'Bas'),
    L('Left', 'Gauche'),
  ],
  extra?: { label: string; aria?: string; class?: string; onclick: () => void },
): HTMLDivElement {
  const el = h('div', { class: 'dpad' });
  aria.forEach((label, d) =>
    el.append(h('button', { class: `key d${d}`, type: 'button', 'aria-label': label, onclick: () => onDir(d) }, arrowIcon(d * 90))),
  );
  if (extra)
    el.append(
      h(
        'button',
        { class: `key dx ${extra.class ?? ''}`.trim(), type: 'button', 'aria-label': extra.aria, onclick: extra.onclick },
        extra.label,
      ),
    );
  return el;
}

/**
 * Arrow drawn as one stroked SVG rotated `deg` clockwise from up, so every direction (diagonals included)
 * has the same weight; font arrows render ↑↓, ←→ and ↗ at visibly different thicknesses.
 */
export function arrowIcon(deg: number) {
  return s(
    'svg',
    { viewBox: '0 0 24 24', class: 'arrow-icon', 'aria-hidden': 'true', style: `transform:rotate(${deg}deg)` },
    s('path', { d: 'M12 19V5M6 11l6-6 6 6' }),
  );
}

export function shake(el: Element) {
  el.classList.remove('shake');
  void (el as HTMLElement).offsetWidth;
  el.classList.add('shake');
}

/** Shared colour palette (CSS vars --p1..--p8). */
export const PALETTE = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)', 'var(--p5)', 'var(--p6)', 'var(--p7)', 'var(--p8)'];

/** Gear icon (Feather "settings", MIT), stroked with currentColor. */
export function cogIcon(cls = 'icon') {
  return s(
    'svg',
    { viewBox: '0 0 24 24', class: cls, 'aria-hidden': 'true' },
    s('circle', { cx: 12, cy: 12, r: 3 }),
    s('path', {
      d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
    }),
  );
}

/**
 * Give an existing clue element a small live tally pill tucked against its number (styles: `.cc-host` in styles/controls.css).
 * Drive it with {@link setTally}. Idempotent.
 */
export function addTally<E extends HTMLElement>(el: E): E {
  el.classList.add('cc-host');
  if (!el.querySelector('.cc-have')) el.append(h('span', { class: 'cc-have', 'aria-hidden': 'true' }));
  return el;
}

/**
 * Update a tally pill: shown when `show` (default: started but not yet met, or wrong). Only the pill turns red
 * when the line is wrong (default: past the target); the clue itself keeps its colour.
 */
export function setTally(el: HTMLElement, have: number, want: number, bad = have > want, show = bad || (have > 0 && have !== want)) {
  const pill = el.querySelector<HTMLElement>('.cc-have');
  if (pill && show) pill.textContent = String(have);
  el.classList.toggle('counting', show);
  el.classList.toggle('tally-over', bad);
}

/** An edge clue showing a target count with a live tally; pair with {@link setCountClue} on every render. */
export function countClue(cls: string, want: number): HTMLDivElement {
  return addTally(h('div', { class: cls, 'aria-label': String(want) }, h('span', { class: 'cc-want' }, want)));
}

/** Update a {@link countClue}: tally plus `done` / `over` state. Returns whether the line is satisfied. */
export function setCountClue(el: HTMLElement, have: number, want: number): boolean {
  setTally(el, have, want);
  el.classList.toggle('done', have === want);
  el.classList.toggle('over', have > want);
  el.setAttribute('aria-label', L(`${have} of ${want}`, `${have} sur ${want}`));
  return have === want;
}

/** Pill-shaped radio group; redraws itself on pick. */
export function segmented<T extends string | number>(
  options: { label: string; value: T }[],
  current: T,
  onpick: (v: T) => void,
  attrs: Record<string, string> = {},
) {
  const el = h('div', { class: 'seg', role: 'radiogroup', ...attrs });
  const draw = (cur: T) =>
    el.replaceChildren(
      ...options.map((o) =>
        h(
          'button',
          {
            type: 'button',
            role: 'radio',
            'aria-checked': String(o.value === cur),
            class: o.value === cur ? 'on' : '',
            onclick: () => {
              onpick(o.value);
              draw(o.value);
            },
          },
          o.label,
        ),
      ),
    );
  draw(current);
  return el;
}

/** Light bulb icon (Lucide "lightbulb", ISC), stroked with currentColor. */
export function bulbIcon(cls = 'icon') {
  return s(
    'svg',
    { viewBox: '0 0 24 24', class: cls, 'aria-hidden': 'true' },
    s('path', { d: 'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5' }),
    s('path', { d: 'M9 18h6' }),
    s('path', { d: 'M10 22h4' }),
  );
}

/*
 * Standard footer actions. Every game uses these (never a hand-written label) so the same action has the same
 * name, look and order everywhere: Undo, then Restart (back to the starting position) or Clear (wipe drawn
 * marks when there's no move history). Pass them to `ctx.controls()` after any game-specific button.
 */
/** Undo/Annuler (ghost). Keyboard: Z or Backspace. */
export const undoBtn = (onclick: () => void) => btn(L('Undo', 'Annuler'), onclick, 'ghost');
/**
 * A ghost button that asks for a second tap before running `onclick` (the label turns into a question
 * for 3 s). Used for actions that throw progress away, so a stray tap never wipes a board.
 */
function confirmBtn(label: string, ask: string, onclick: () => void): HTMLButtonElement {
  let timer = 0;
  const reset = () => {
    clearTimeout(timer);
    timer = 0;
    el.textContent = label;
    el.classList.remove('danger');
  };
  const el = btn(
    label,
    () => {
      if (timer) {
        reset();
        onclick();
        return;
      }
      el.textContent = ask;
      el.classList.add('danger');
      timer = window.setTimeout(reset, 3000);
    },
    'ghost',
  );
  el.addEventListener('blur', reset);
  return el;
}
/** Restart/Repartir (ghost, tap twice): back to the starting position. Keyboard: R. */
export const restartBtn = (onclick: () => void) => confirmBtn(L('Restart', 'Repartir'), L('Restart?', 'Repartir ?'), onclick);
/** Clear/Effacer (ghost, tap twice): wipe every mark the player drew. */
export const clearBtn = (onclick: () => void) => confirmBtn(L('Clear', 'Effacer'), L('Clear?', 'Effacer ?'), onclick);

/** How long a new rule break waits before it shows and counts: the player may still be tapping through it. */
export const SETTLE_MS = 1000;

/** Marks a rule break that isn't judged yet: every `.err` style is written `.err:not([data-hold])`. */
const HOLD = 'data-hold';

/** Rule-break watchers with a judgment pending, so tests (or a final tally) can settle them now. */
const unsettled = new Set<() => void>();

/** Judge every pending rule break right away, as if the player had paused. */
export function settleRuleBreaks() {
  for (const settle of unsettled) settle();
}

/** What identifies a redrawn element (a game that rebuilds its tiles each render): tag, classes, style. */
const sig = (e: Element) =>
  `${e.tagName}|${[...e.classList]
    .filter((c) => c !== 'err')
    .sort()
    .join('.')}|${e.getAttribute('style') ?? ''}`;

/**
 * Counts a mistake when a player's move breaks a visible rule: call the returned function right after
 * rendering a move. A rule break isn't judged at once: new `.err` elements stay hidden (`data-hold`) until
 * the board has been left alone for `SETTLE_MS`, so tapping through a wrong state on the way to the right
 * one (sun → moon, star → ✕), or dragging over it, is never shown nor counted. If they are still there
 * then, they show, and `onMistake` is called once if a move since the last judgment counted. Pass `false`
 * to resync without counting (restore, clear, hint replays that go through other paths).
 */
export function ruleBreaks(boardEl: Element, onMistake: () => void): (count?: boolean) => void {
  /** The `.err` elements at the last judgment, every element then, and the signatures of those errors. */
  let shown = new WeakSet<Element>();
  let known = new WeakSet<Element>();
  let shownSigs = new Map<string, number>();
  let timer = 0;
  /** A counted move happened since the last judgment. */
  let counting = false;

  /** A judged error that stops being one, even for a moment, is a new one if it comes back. */
  const forget = (recs: MutationRecord[]) => {
    for (const r of recs) {
      const t = r.target as Element;
      if (r.type === 'attributes' && shown.has(t) && !` ${r.oldValue ?? ''} `.includes(' err ')) shown.delete(t);
    }
  };
  /** Rule breaks that appeared since the last judgment. */
  const fresh = () => {
    forget(mo.takeRecords());
    const left = new Map(shownSigs);
    return [...boardEl.querySelectorAll('.err')].filter((e) => {
      if (known.has(e)) return !shown.has(e);
      const k = sig(e);
      const n = left.get(k) ?? 0;
      if (n) left.set(k, n - 1);
      return !n;
    });
  };
  /** Hide the new rule breaks and (re)start the wait before judging them. */
  const wait = (errs: Element[]) => {
    for (const e of errs) if (!e.hasAttribute(HOLD)) e.setAttribute(HOLD, '');
    window.clearTimeout(timer);
    timer = window.setTimeout(settle, SETTLE_MS);
    unsettled.add(settle);
  };
  const judge = (count: boolean) => {
    window.clearTimeout(timer);
    timer = 0;
    unsettled.delete(settle);
    if (count && fresh().length) onMistake();
    counting = false;
    const errs = [...boardEl.querySelectorAll('.err')];
    shown = new WeakSet(errs);
    known = new WeakSet(boardEl.querySelectorAll('*'));
    shownSigs = new Map();
    for (const e of errs) shownSigs.set(sig(e), (shownSigs.get(sig(e)) ?? 0) + 1);
    for (const e of boardEl.querySelectorAll(`[${HOLD}]`)) e.removeAttribute(HOLD);
    mo.takeRecords();
  };
  const settle = () => judge(counting);

  // Renders between moves (a drag in progress, a cursor move) hold new rule breaks too.
  const mo = new MutationObserver((recs) => {
    forget(recs);
    const errs = fresh();
    if (errs.length) wait(errs);
  });
  // Observing starts with the player's first touch or move: boards that are only generated (thumbnails,
  // previews) never get an observer.
  let observing = false;
  const observe = () => {
    if (observing) return;
    observing = true;
    mo.observe(boardEl, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  };
  for (const type of ['pointerdown', 'keydown']) boardEl.addEventListener(type, observe, { capture: true, once: true });

  judge(false);
  return (count = true) => {
    observe();
    const errs = fresh();
    if (!errs.length || (!count && !timer)) return judge(false);
    counting ||= count;
    wait(errs);
  };
}
