import './kit.css';
import { L, P } from '../../core/i18n';
import type { PuzzleCtx, PuzzleInstance } from '../../core/types';
import { board, clearBtn, h, pad } from '../../ui/dom';
import { directPlace, keyDigit, makeNotes, notesHelpStep } from './notes';
import { conflicts, type Problem } from './solver';

export interface EntryOpts {
  ctx: PuzzleCtx;
  cols: number;
  rows: number;
  problem: Problem;
  /** Per cell: <0 inactive (clue/block), 0 empty, >0 given digit. */
  puzzle: number[];
  /** Extra classes on the board element. */
  boardClass: string;
  /** Static extra classes per cell (borders, tints…). */
  cellClass?: (i: number) => string;
  /** Add static children to a cell (cage sums, signs, clue numbers…). Called for inactive cells too. */
  decorate?: (el: HTMLElement, i: number) => void;
  /** Called after every render with the selected cell (-1 for none) and current values. */
  onRender?: (sel: number, vals: readonly number[]) => void;
}

/**
 * Shared select-a-cell + number pad + keyboard game used by the number-logic grids.
 * Validation is rule-based through `conflicts()`; snapshot is `{ vals, sel }`.
 */
export function entryGame(o: EntryOpts): PuzzleInstance {
  const { ctx, cols, rows, problem, puzzle } = o;
  const N = problem.maxDigit;
  const size = cols * rows;
  const active = (i: number) => puzzle[i] >= 0;
  const given = puzzle.map((v) => v > 0);
  const vals = [...puzzle];
  let sel = puzzle.findIndex((v) => v === 0);
  let done = false;
  const saved = ctx.saved as { vals?: unknown[]; sel?: unknown; notes?: unknown } | undefined;
  const notes = makeNotes(N, size, saved?.notes);

  const unitsOf: number[][] = Array.from({ length: size }, () => []);
  problem.units.forEach((u, k) => u.cells.forEach((c) => unitsOf[c].push(k)));
  const peerOf = (i: number, j: number) => unitsOf[i].some((k) => problem.units[k].cells.includes(j));

  const grid = board(cols, rows, `numgrid ${o.boardClass}`);
  const valEls: HTMLElement[] = [];
  const baseCls: string[] = [];
  const cells = puzzle.map((_, i) => {
    const lastC = i % cols === cols - 1 ? ' lc' : '',
      lastR = Math.floor(i / cols) === rows - 1 ? ' lr' : '';
    const extra = (o.cellClass?.(i) ?? '') + lastC + lastR;
    let el: HTMLElement;
    if (active(i)) {
      baseCls[i] = `cell${given[i] ? ' given' : ''} ${extra}`.replace(/\s+/g, ' ').trim();
      el = h('button', { type: 'button', class: baseCls[i], onclick: () => select(i) });
      valEls[i] = h('span', { class: 'v' });
      el.append(valEls[i]);
      notes.mount(el, i);
    } else {
      el = h('div', { class: `cell off ${extra}`.replace(/\s+/g, ' ').trim() });
    }
    o.decorate?.(el, i);
    grid.append(el);
    return el;
  });

  /** Would `v` at empty cell `i` clash with what's on the board? */
  const blocked = (i: number, v: number) => {
    vals[i] = v;
    const bad = conflicts(problem, vals).has(i);
    vals[i] = 0;
    return bad;
  };

  const render = () => {
    const bad = conflicts(problem, vals);
    const sv = sel >= 0 ? vals[sel] : 0;
    cells.forEach((el, i) => {
      if (!active(i)) return;
      valEls[i].textContent = vals[i] > 0 ? String(vals[i]) : '';
      let cls = baseCls[i];
      if (i === sel) cls += ' sel';
      if (sel >= 0 && i !== sel && peerOf(sel, i)) cls += ' peer';
      if (sv > 0 && vals[i] === sv && i !== sel) cls += ' same';
      if (bad.has(i) && !given[i]) cls += ' err';
      if (el.className !== cls) el.className = cls;
      notes.draw(i, vals[i] > 0, (v) => blocked(i, v));
    });
    o.onRender?.(sel, vals);
    ctx.status(P(vals.filter((v, i) => active(i) && !v).length, ['left', 'left'], ['à remplir', 'à remplir']));
    return bad;
  };

  const select = (i: number) => {
    sel = i;
    render();
  };

  const input = (v: number, note = notes.on) => {
    if (done || sel < 0 || given[sel]) return;
    if (note) {
      if (vals[sel] > 0) return;
      ctx.touch();
      notes.toggle(sel, v);
      render();
      return;
    }
    ctx.touch();
    const was = vals[sel];
    vals[sel] = vals[sel] === v ? 0 : v;
    const bad = render();
    if (vals[sel] && vals[sel] !== was && bad.has(sel)) ctx.mistake();
    if (bad.size === 0 && vals.every((x, i) => !active(i) || x > 0)) {
      done = true;
      ctx.solved();
    }
  };

  const erase = () => {
    if (done || sel < 0 || given[sel]) return;
    if (vals[sel] > 0) input(vals[sel], false);
    else if (notes.bits[sel]) {
      ctx.touch();
      notes.clear(sel);
      render();
    }
  };

  const keys: { label: string; value: string; aria?: string }[] = Array.from({ length: N }, (_, i) => ({
    label: String(i + 1),
    value: String(i + 1),
  }));
  keys.push(notes.key, { label: '✕', value: '0', aria: L('Erase', 'Effacer') });

  if (Array.isArray(saved?.vals) && saved.vals.length === size) {
    saved.vals.forEach((v, i) => {
      if (puzzle[i] === 0 && Number.isInteger(v) && (v as number) >= 0 && (v as number) <= N) vals[i] = v as number;
    });
  }
  if (typeof saved?.sel === 'number' && (saved.sel === -1 || (saved.sel >= 0 && saved.sel < size && active(saved.sel)))) sel = saved.sel;

  /** Clear: wipe every entry and note, keeping the givens. */
  const clear = () => {
    if (done) return;
    let any = false;
    vals.forEach((v, i) => {
      if (puzzle[i] === 0 && (v > 0 || notes.bits[i])) {
        vals[i] = 0;
        notes.clear(i);
        any = true;
      }
    });
    if (!any) return;
    ctx.touch();
    render();
  };
  ctx.controls(clearBtn(clear));

  const padEl = pad(keys, (v) => (v === 'n' ? notes.padKey() : v === '0' ? erase() : input(Number(v))));
  notes.bindPad(padEl);
  ctx.root.append(grid, padEl);
  render();

  const step = (dr: number, dc: number) => {
    let r = sel < 0 ? 0 : Math.floor(sel / cols),
      c = sel < 0 ? 0 : sel % cols;
    if (sel < 0 && active(0)) return select(0);
    for (;;) {
      r += dr;
      c += dc;
      if (r < 0 || c < 0 || r >= rows || c >= cols) return;
      if (active(r * cols + c)) return select(r * cols + c);
    }
  };

  const inst: PuzzleInstance = {
    snapshot: () => ({ vals, sel, notes: notes.bits }),
    onKey(e) {
      const d = keyDigit(e, N);
      if (d) {
        input(d.v, d.note !== notes.on);
        return true;
      }
      if (e.key === 'n' || e.key === 'N') {
        notes.flip();
        return true;
      }
      if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
        erase();
        return true;
      }
      const mv: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      if (mv[e.key]) {
        step(...mv[e.key]);
        return true;
      }
      return false;
    },
  };
  directPlace.set(inst, (i, v) => {
    select(i);
    input(v, false);
  });
  return inst;
}

/** Tutorial steps describing the shared entry controls (tap + pad, keyboard, conflict marks). */
export function entryHelpSteps(): string[] {
  return [
    L(
      'Tap a cell, then a number on the pad. Tap the same number again, or ✕, to erase it.',
      'Touchez une case, puis un chiffre du pavé. Touchez le même chiffre, ou ✕, pour l’effacer.',
    ),
    L(
      'Keyboard: arrow keys move, digits fill, Backspace erases. Clashing numbers are marked. Clear wipes all your numbers.',
      'Au clavier : flèches pour bouger, chiffres pour remplir, Retour arrière pour effacer. Les conflits sont signalés. Effacer retire tous vos chiffres.',
    ),
    notesHelpStep(),
  ];
}

/** Right/bottom thick-edge classes for a region map (`er` / `eb`), skipping the outer frame. */
export function edgeClasses(region: number[], cols: number, rows: number, i: number): string {
  const r = Math.floor(i / cols),
    c = i % cols;
  const out: string[] = [];
  if (c < cols - 1 && region[i] !== region[i + 1]) out.push('er');
  if (r < rows - 1 && region[i] !== region[i + cols]) out.push('eb');
  return out.join(' ');
}
