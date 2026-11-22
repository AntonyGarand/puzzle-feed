// @vitest-environment happy-dom
// Tetrominoes input: a piece can be tapped in cell by cell, and a T can be traced through its middle.
import { describe, expect, it } from 'vitest';
import { mountGame } from './support/mount';

function setup() {
  const g = mountGame('tetrominoes', 1, 3);
  const grid = g.root.querySelector('.grid')!;
  const cell = (i: number) => grid.querySelector(`[data-i="${i}"]`)!;
  const fire = (type: string, i: number) =>
    cell(i).dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'touch', button: 0 }));
  const tap = (i: number) => (fire('pointerdown', i), fire('pointerup', i));
  const drag = (...path: number[]) => {
    fire('pointerdown', path[0]);
    for (const i of path.slice(1)) fire('pointermove', i);
    fire('pointerup', path.at(-1)!);
  };
  const pieces = () => (g.inst.snapshot!() as { pieces: number[][] }).pieces;
  const selected = () => [...grid.querySelectorAll('.cell.pv')].map((el) => Number((el as HTMLElement).dataset['i']));
  return { tap, drag, pieces, selected };
}

// 6×6 board: a vertical T pointing right is cells 0, 6, 7, 12.
const T = [0, 6, 7, 12];

describe('tetrominoes input', () => {
  it('places a piece from four taps', () => {
    const { tap, pieces, selected } = setup();
    tap(0);
    tap(6);
    tap(7);
    expect(selected().toSorted((a, b) => a - b)).toEqual([0, 6, 7]);
    expect(pieces()).toEqual([]);
    tap(12);
    expect(pieces()).toEqual([T]);
    expect(selected()).toEqual([]);
  });

  it('traces a T back through its middle', () => {
    const { drag, pieces } = setup();
    drag(0, 6, 7, 6, 12);
    expect(pieces()).toEqual([T]);
  });

  it('swaps an overshot corner cell for the next touching one', () => {
    const { drag, pieces } = setup();
    drag(0, 6, 7, 13, 12);
    expect(pieces()).toEqual([T]);
  });

  it('keeps a short drag selected, finished by a tap', () => {
    const { drag, tap, pieces, selected } = setup();
    drag(0, 6, 12);
    expect(pieces()).toEqual([]);
    expect(selected().length).toBe(3);
    tap(7);
    expect(pieces()).toEqual([T]);
  });

  it('drops a tapped selected cell, and removes a tapped piece', () => {
    const { drag, tap, pieces, selected } = setup();
    drag(0, 6, 7);
    tap(7);
    expect(selected().toSorted((a, b) => a - b)).toEqual([0, 6]);
    tap(0);
    tap(6);
    expect(selected()).toEqual([]);
    drag(...T);
    expect(pieces()).toEqual([T]);
    tap(6);
    expect(pieces()).toEqual([]);
  });
});
