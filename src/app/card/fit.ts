/**
 * Size the board to the space actually left between header and footer. Every game scales from
 * `--board`, so shrink it until the whole game (board + pads/palettes) fits without overflowing.
 */
export function fitBoard(stage: HTMLElement) {
  const root = stage.firstElementChild as HTMLElement | null;
  const W = stage.clientWidth;
  const H = stage.clientHeight;
  if (!root || !W || !H) return;
  const set = (f: number) => stage.style.setProperty('--fit', `${Math.max(120, Math.floor(f))}px`);
  let f = Math.min(W - 8, 600);
  set(f);
  // Bracket the answer: `lo` is the largest size known to fit, `hi` the smallest known to overflow.
  // Content height isn't always 1:1 with the board size (grids capped by width or per-cell maximums
  // stop growing), so a bare secant step can overshoot to the minimum; keep every guess in the bracket.
  let lo = 120;
  let hi = Infinity;
  let prevF = 0;
  let prevOver = 0;
  for (let i = 0; i < 8; i++) {
    const overH = root.getBoundingClientRect().height - H;
    const overW = root.scrollWidth - W;
    const over = Math.max(overH, overW);
    if (over <= 0.5) {
      lo = f;
      if (hi === Infinity || hi - lo <= 2) break;
      // Fits but a larger size overflowed earlier: try halfway back up.
      f = (lo + hi) / 2;
    } else {
      hi = f;
      // Secant step once there are two samples, bisection if it leaves the bracket.
      const slope = prevF ? Math.max(0.3, (prevOver - over) / (prevF - f || 1)) : 1;
      prevF = f;
      prevOver = over;
      f -= over / slope + 1;
      if (f <= lo || f >= hi) f = (lo + hi) / 2;
      if (hi - lo <= 2) f = lo;
    }
    set(f);
  }
  // Out of steps while overflowing: fall back to the largest size known to fit.
  if (Math.max(root.getBoundingClientRect().height - H, root.scrollWidth - W) > 0.5) set(lo);
}
