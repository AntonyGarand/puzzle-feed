import './notes.css';
import { L } from '../../core/i18n';
import type { PuzzleInstance } from '../../core/types';
import { h } from '../../ui/dom';

/**
 * Pencil marks for the number-entry grids: small candidate digits inside an empty cell.
 * Stored as one bitmask per cell (bit v = digit v noted). A note turns red once the digit
 * can no longer go there (`bad`), so stale candidates stand out without being erased.
 */
export interface Notes {
  /** Per-cell bitmask, shared with the snapshot. */
  readonly bits: number[];
  /** Note mode: digits toggle notes instead of filling the cell. */
  on: boolean;
  /** Append the note mini-grid to a cell. */
  mount(cell: HTMLElement, i: number): void;
  /** Redraw one cell's notes; `filled` hides them under a value. */
  draw(i: number, filled: boolean, bad: (v: number) => boolean): void;
  toggle(i: number, v: number): void;
  clear(i: number): void;
  /** Pad key for the note-mode switch (value `n`). */
  key: { label: string; value: string; aria: string };
  /** Lay the pad out as a keypad and hook its switch key: a tap latches note mode, holding it keeps notes on only while held. */
  bindPad(pad: HTMLElement): void;
  /** Pad callback for the switch key's click (keyboard activation, or a tap already handled by pointer). */
  padKey(): void;
  /** Flip note mode (`n` key). */
  flip(): void;
}

export function makeNotes(n: number, size: number, saved?: unknown): Notes {
  const bits = new Array<number>(size).fill(0);
  if (Array.isArray(saved) && saved.length === size) {
    saved.forEach((b, i) => {
      if (Number.isInteger(b) && (b as number) > 0) bits[i] = (b as number) & (((1 << n) - 1) << 1);
    });
  }
  const cols = n <= 4 ? 2 : 3,
    rows = Math.ceil(n / cols);
  // Each digit keeps a keypad spot pushed to the cell's edges: corners first, centre last.
  const edge = (k: number, m: number) => (k === 0 ? 'start' : k === m - 1 ? 'end' : 'center');
  const spot = (k: number) => `justify-self:${edge(k % cols, cols)};align-self:${edge(Math.floor(k / cols), rows)}`;
  const els: HTMLElement[][] = [];
  const boxes: HTMLElement[] = [];
  let keyEl: HTMLElement | null = null,
    padEl: HTMLElement | null = null;
  let held = false, // switch key is down
    heldUsed = false, // a note was toggled while it was down
    heldAt = 0,
    before = false, // mode when the press started
    lastUp = -1e9;
  const set = (on: boolean) => {
    notes.on = on;
    keyEl?.classList.toggle('sel', on);
    keyEl?.setAttribute('aria-pressed', String(on));
    padEl?.classList.toggle('notes', on);
  };
  const notes: Notes = {
    bits,
    on: false,
    mount(cell, i) {
      const box = h('span', { class: 'nt', style: `--nc:${cols};--nr:${rows}`, 'aria-hidden': 'true' });
      els[i] = Array.from({ length: n }, (_, k) => h('span', { style: spot(k) }, String(k + 1)));
      box.append(...els[i]);
      boxes[i] = box;
      cell.append(box);
    },
    draw(i, filled, bad) {
      const box = boxes[i];
      if (!box) return;
      const show = !filled && bits[i] !== 0;
      box.hidden = !show;
      if (!show) return;
      els[i].forEach((el, k) => {
        const v = k + 1,
          has = (bits[i] >> v) & 1;
        const cls = has ? (bad(v) ? 'on bad' : 'on') : '';
        if (el.className !== cls) el.className = cls;
      });
    },
    toggle(i, v) {
      if (held) heldUsed = true;
      bits[i] ^= 1 << v;
    },
    clear(i) {
      bits[i] = 0;
    },
    key: { label: '✎', value: 'n', aria: L('Notes', 'Notes') },
    bindPad(pad) {
      // Lay the digits out like the notes inside a cell (keypad block); ✎ fills the right column
      // above ✕. In note mode each digit slides to its note spot, previewing where it will land.
      padEl = pad;
      const keys = [...pad.querySelectorAll<HTMLElement>('.key')];
      pad.classList.add('npad');
      pad.style.setProperty('--nc', String(cols));
      keys.forEach((el, k) => {
        if (k < n) {
          el.style.cssText += `grid-column:${(k % cols) + 1};grid-row:${Math.floor(k / cols) + 1}`;
          el.style.setProperty('--jx', edge(k % cols, cols));
          el.style.setProperty('--jy', edge(Math.floor(k / cols), rows));
        } else if (k === n) el.style.cssText += `grid-column:${cols + 1};grid-row:1 / ${Math.max(2, rows)}`;
        else el.style.cssText += `grid-column:${cols + 1};grid-row:${Math.max(2, rows)}`;
      });
      keyEl = keys.find((k) => k.textContent === '✎') ?? null;
      if (!keyEl) return;
      const k = keyEl;
      k.classList.add('nk');
      k.setAttribute('aria-pressed', 'false');
      k.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        held = true;
        heldUsed = false;
        heldAt = performance.now();
        before = notes.on;
        set(true);
      });
      const release = (cancel: boolean) => () => {
        if (!held) return;
        held = false;
        lastUp = performance.now();
        const tap = !cancel && !heldUsed && lastUp - heldAt < 400;
        set(tap ? !before : before);
      };
      k.addEventListener('pointerup', release(false));
      k.addEventListener('pointercancel', release(true));
      k.addEventListener('contextmenu', (e) => e.preventDefault());
    },
    padKey() {
      // The click that follows a pointer press was already handled on release.
      if (held || performance.now() - lastUp < 600) return;
      notes.flip();
    },
    flip() {
      set(!notes.on);
    },
  };
  return notes;
}

/**
 * Digit from a key press: `value` for a plain digit, `note` for the same key held with Shift
 * (QWERTY `!` on Digit1) or typed without it on AZERTY (`&` on Digit1).
 */
export function keyDigit(e: KeyboardEvent, n: number): { v: number; note: boolean } | null {
  const k = Number(e.key);
  if (e.key.length === 1 && k >= 1 && k <= n) return { v: k, note: false };
  const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code ?? '');
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= n) return { v: Number(m[1]), note: true };
  return null;
}

/** Instances whose hint "place" must fill a value whatever the note mode. */
export const directPlace = new WeakMap<PuzzleInstance, (i: number, v: number) => void>();

/** Tutorial line for the note controls. */
export function notesHelpStep(): string {
  return L(
    'Not sure yet? Tap ✎ (or press N) to pencil in candidates, or hold ✎ while tapping numbers. A candidate turns red once it can’t fit anymore.',
    'Pas encore certain? Touchez ✎ (ou N) pour noter des candidats au crayon, ou maintenez ✎ en touchant les chiffres. Un candidat devient rouge quand il ne peut plus aller là.',
  );
}
