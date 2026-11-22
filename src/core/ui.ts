import { L } from './i18n';

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown> | null;

function apply(el: Element, attrs: Attrs, kids: Child[]) {
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      } else if (k === 'class') {
        el.setAttribute('class', String(v));
      } else if (k === 'value' && 'value' in el) {
        (el as HTMLInputElement).value = String(v);
      } else if (k === 'checked' && 'checked' in el) {
        (el as HTMLInputElement).checked = Boolean(v);
      } else {
        el.setAttribute(k, v === true ? '' : String(v));
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

/** Shared key pad (row of equal keys under a board). */
export function pad(
  keys: { label: string; value: string; class?: string; style?: string; aria?: string }[],
  onkey: (v: string) => void,
): HTMLDivElement {
  const el = h('div', { class: 'pad' });
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
 * Give an existing clue element a small live tally pill tucked against its number (styles: `.cc-host` in styles.css).
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
