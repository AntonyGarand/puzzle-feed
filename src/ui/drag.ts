/**
 * One-handed touch dragging: the held piece floats above the finger (so the thumb doesn't hide it)
 * and runs ahead of it (so a thumb resting near the tray reaches the far side of the board).
 * Mouse and pen drags follow the pointer exactly.
 */

/** How much farther the piece travels than the finger, on touch. */
const TOUCH_GAIN = 1.35;
/** Gap between the finger and the bottom of the held piece, in cells, on touch. */
export const TOUCH_LIFT_CELLS = 2;

export type DragStart = { sx: number; sy: number; touch: boolean };

/** Where a dragged piece should be for a pointer at (x, y); `lift` is the extra upward offset in px (touch only). */
export function dragPoint(d: DragStart, x: number, y: number, lift: number): { x: number; y: number } {
  if (!d.touch) return { x, y };
  return { x: d.sx + (x - d.sx) * TOUCH_GAIN, y: d.sy + (y - d.sy) * TOUCH_GAIN - lift };
}
