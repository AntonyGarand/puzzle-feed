// Drag-through-letters interaction shared by the letter-grid word games (hunt, cover):
// a line drawn through the traced cells, plus pointer handling (drag to trace, or tap cell by cell).
import { h, s as svg } from '../../ui/dom';
import { adjacent } from './hunt-solver';
import './trace.css';

/** A fixed (already claimed) path drawn under the live one, in its own colour. */
export interface FixedLine {
  path: number[];
  color: string;
}

/**
 * Wraps `grid` with an SVG overlay. `draw(path, fixed)` links the cells of `path` in order
 * (ringed start, dot at the end) and draws each fixed line. Cells are the grid's children, by index.
 */
export function traceOverlay(grid: HTMLElement) {
  const under = svg('polyline', { class: 'trace-line-under' });
  const over = svg('polyline', { class: 'trace-line' });
  const startDot = svg('circle', { class: 'trace-start', r: 0 });
  const endDot = svg('circle', { class: 'trace-end', r: 0 });
  const fixedG = svg('g', { class: 'trace-fixed' });
  const overlay = svg(
    'svg',
    { class: 'trace-path', 'aria-hidden': 'true' },
    fixedG,
    svg('g', { class: 'trace-live' }, under, over, startDot, endDot),
  );
  const wrap = h('div', { class: 'trace-wrap' }, grid, overlay);
  let last: number[] = [];
  let lastFixed: FixedLine[] = [];
  const draw = (path: number[], fixed: FixedLine[] = lastFixed) => {
    last = path;
    lastFixed = fixed;
    const cells = grid.children as HTMLCollectionOf<HTMLElement>;
    overlay.setAttribute('viewBox', `0 0 ${wrap.clientWidth} ${wrap.clientHeight}`);
    const at = (i: number) => {
      const el = cells[i];
      return [el.offsetLeft + el.offsetWidth / 2, el.offsetTop + el.offsetHeight / 2] as const;
    };
    const str = (p: number[]) =>
      p
        .map(at)
        .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
        .join(' ');
    const cell = cells[0]?.offsetWidth || 40;
    for (const line of [under, over]) line.setAttribute('points', str(path));
    overlay.style.setProperty('--lw', `${(cell * 0.11).toFixed(1)}px`);
    fixedG.replaceChildren(
      ...fixed.map((f) => svg('polyline', { class: 'trace-fixed-line', points: str(f.path), style: `--c:${f.color}` })),
    );
    const pts = path.map(at);
    const dot = (c: SVGCircleElement, p: readonly [number, number] | undefined, r: number) => {
      c.setAttribute('r', p ? String(r) : '0');
      if (p) {
        c.setAttribute('cx', p[0].toFixed(1));
        c.setAttribute('cy', p[1].toFixed(1));
      }
    };
    dot(startDot, pts[0], cell * 0.36);
    dot(endDot, pts.length > 1 ? pts[pts.length - 1] : undefined, cell * 0.08);
  };
  const ro = new ResizeObserver(() => draw(last));
  ro.observe(grid);
  return { wrap, draw, destroy: () => ro.disconnect() };
}

export interface TraceOpts {
  /** Grid width in cells. */
  cols: number;
  path(): number[];
  /** Replace the traced path (and re-render). */
  set(path: number[]): void;
  submit(): void;
  /** Whether input is accepted right now (false once solved). */
  active(): boolean;
  /** First interaction. */
  touch(): void;
  /** Cells that may be traced (default: all). */
  free?: (i: number) => boolean;
}

/**
 * Pointer input on a letter grid: drag through touching cells (release submits), or tap cells one
 * by one and tap the last one again to submit; tapping an earlier cell backs up. Returns a cleanup.
 */
export function traceInput(grid: HTMLElement, o: TraceOpts): () => void {
  const free = o.free ?? (() => true);
  let dragging = false;
  let moved = false;
  const cellAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const c = el?.closest<HTMLElement>('[data-i]');
    if (!c || !grid.contains(c)) return -1;
    const r = c.getBoundingClientRect();
    const dx = x - (r.left + r.width / 2),
      dy = y - (r.top + r.height / 2);
    // only count the inner part of a cell so diagonal drags don't clip neighbours
    return dx * dx + dy * dy <= (r.width * 0.42) ** 2 ? Number(c.dataset['i']) : -1;
  };
  const extend = (i: number) => {
    const path = o.path();
    if (i < 0 || !free(i)) return false;
    const lastI = path[path.length - 1];
    if (i === lastI) return false;
    if (path.length >= 2 && i === path[path.length - 2]) {
      o.set(path.slice(0, -1)); // back up
      return true;
    }
    if (path.includes(i) || (path.length && !adjacent(o.cols, lastI, i))) return false;
    o.set([...path, i]);
    return true;
  };
  grid.addEventListener('pointerdown', (e) => {
    if (!o.active()) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
    if (!el) return;
    const i = Number(el.dataset['i']);
    o.touch();
    e.preventDefault();
    if (!free(i)) return;
    dragging = true;
    moved = false;
    const path = o.path();
    if (path.length && i === path[path.length - 1]) {
      dragging = false;
      o.submit();
      return;
    }
    const k = path.indexOf(i);
    if (k >= 0) o.set(path.slice(0, k + 1));
    else if (!(path.length && adjacent(o.cols, path[path.length - 1], i))) o.set([i]);
    else o.set([...path, i]);
  });
  grid.addEventListener('pointermove', (e) => {
    if (dragging && extend(cellAt(e.clientX, e.clientY))) moved = true;
  });
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    if (moved && o.path().length > 1) o.submit();
  };
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  return () => {
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  };
}
