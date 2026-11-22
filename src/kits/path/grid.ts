// Small helpers shared by the "paths & links" games. Not a PuzzleDef module.

/** Orthogonal steps: up, right, down, left. */
export const ORTHO = [
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
] as const;

/** Orthogonal neighbours of cell i in a cols x rows grid. */
export function nbrs(i: number, cols: number, rows: number): number[] {
  const r = Math.floor(i / cols),
    c = i % cols;
  const out: number[] = [];
  for (const [dr, dc] of ORTHO) {
    const rr = r + dr,
      cc = c + dc;
    if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) out.push(rr * cols + cc);
  }
  return out;
}

export const adjacent = (a: number, b: number, cols: number) => {
  const dr = Math.abs(Math.floor(a / cols) - Math.floor(b / cols));
  const dc = Math.abs((a % cols) - (b % cols));
  return dr + dc === 1;
};

/** Content box of an element in client coordinates (inside its border). */
export function innerRect(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const left = r.left + (el.clientLeft || 0);
  const top = r.top + (el.clientTop || 0);
  return { left, top, width: el.clientWidth || r.width, height: el.clientHeight || r.height };
}

/** Grid cell under a client point, or -1. Assumes a gap-free grid filling the element. */
export function cellAt(el: HTMLElement, cols: number, rows: number, x: number, y: number): number {
  const r = innerRect(el);
  if (!r.width || !r.height) return -1;
  const c = Math.floor(((x - r.left) / r.width) * cols);
  const rr = Math.floor(((y - r.top) / r.height) * rows);
  return c >= 0 && c < cols && rr >= 0 && rr < rows ? rr * cols + c : -1;
}

/** One orthogonal step from `from` towards `to` (dominant axis first, falling back to the other). */
export function stepsToward(from: number, to: number, cols: number): number[] {
  const fr = Math.floor(from / cols),
    fc = from % cols;
  const dr = Math.floor(to / cols) - fr,
    dc = (to % cols) - fc;
  const h = dc ? fr * cols + fc + Math.sign(dc) : -1;
  const v = dr ? (fr + Math.sign(dr)) * cols + fc : -1;
  const order = Math.abs(dc) >= Math.abs(dr) ? [h, v] : [v, h];
  return order.filter((x) => x >= 0);
}

/** SVG polyline points for cells in a gap-free grid whose viewBox is `0 0 cols rows`. */
export const pts = (cells: number[], cols: number) => cells.map((i) => `${(i % cols) + 0.5},${Math.floor(i / cols) + 0.5}`).join(' ');

/** Try pointer capture without failing in environments that lack it. */
export function capture(el: Element, id: number) {
  try {
    el.setPointerCapture?.(id);
  } catch {
    /* ignore */
  }
}
