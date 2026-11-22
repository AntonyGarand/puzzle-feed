// @vitest-environment happy-dom
// ruleBreaks(): rule breaks are judged once the player pauses. A wrong state passed through on the way to
// the right one is neither shown (data-hold) nor counted; one left on the board shows and counts once.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ruleBreaks, SETTLE_MS, settleRuleBreaks } from '../src/ui/dom';
import { mountGame } from './support/mount';

/** A board of `n` plain cells, and a spy for mistakes. */
function setup(n = 3) {
  const board = document.createElement('div');
  const cells = Array.from({ length: n }, () => board.appendChild(document.createElement('span')));
  const mistake = vi.fn<() => void>();
  const watch = ruleBreaks(board, mistake);
  const held = () => cells.map((c) => c.hasAttribute('data-hold'));
  return { board, cells, mistake, watch, held };
}

beforeEach(() => void vi.useFakeTimers());
afterEach(() => {
  settleRuleBreaks();
  vi.useRealTimers();
});

describe('ruleBreaks', () => {
  it('holds a new rule break, then shows and counts it once the player pauses', () => {
    const { cells, mistake, watch, held } = setup();
    cells[0].className = 'err';
    watch();
    expect(held()).toEqual([true, false, false]);
    vi.advanceTimersByTime(SETTLE_MS - 1);
    expect(mistake).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(mistake).toHaveBeenCalledTimes(1);
    expect(held()).toEqual([false, false, false]);
    // Still broken on the next move: already judged, not a second mistake.
    watch();
    vi.advanceTimersByTime(SETTLE_MS);
    expect(mistake).toHaveBeenCalledTimes(1);
  });

  it('never counts a wrong state the player taps through', () => {
    const { cells, mistake, watch, held } = setup();
    cells[0].className = 'err'; // sun: breaks a rule
    watch();
    vi.advanceTimersByTime(SETTLE_MS * 0.6);
    cells[0].className = ''; // moon: fine
    watch();
    vi.advanceTimersByTime(SETTLE_MS * 3);
    expect(mistake).not.toHaveBeenCalled();
    expect(held()).toEqual([false, false, false]);
  });

  it('keeps waiting while the player keeps tapping', () => {
    const { cells, mistake, watch } = setup();
    cells[0].className = 'err';
    watch();
    vi.advanceTimersByTime(SETTLE_MS * 0.8);
    cells[0].className = 'other err'; // another wrong state of the same cell
    watch();
    vi.advanceTimersByTime(SETTLE_MS * 0.8);
    expect(mistake).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SETTLE_MS * 0.2);
    expect(mistake).toHaveBeenCalledTimes(1);
  });

  it('leaves judged rule breaks showing while a new one waits', () => {
    const { cells, mistake, watch, held } = setup();
    cells[0].className = 'err';
    watch();
    vi.advanceTimersByTime(SETTLE_MS);
    cells[1].className = 'err';
    watch();
    expect(held()).toEqual([false, true, false]);
    vi.advanceTimersByTime(SETTLE_MS);
    expect(mistake).toHaveBeenCalledTimes(2);
  });

  it('counts a fixed rule break that comes back', () => {
    const { cells, mistake, watch } = setup();
    cells[0].className = 'err';
    watch();
    vi.advanceTimersByTime(SETTLE_MS);
    cells[0].className = '';
    watch();
    cells[0].className = 'err';
    watch();
    vi.advanceTimersByTime(SETTLE_MS);
    expect(mistake).toHaveBeenCalledTimes(2);
  });

  it('judges uncounted moves at once and silently', () => {
    const { cells, mistake, watch, held } = setup();
    cells[2].className = 'err';
    watch(false);
    expect(held()).toEqual([false, false, false]);
    vi.advanceTimersByTime(SETTLE_MS);
    expect(mistake).not.toHaveBeenCalled();
  });

  it('holds rule breaks drawn between moves (a drag), counting them only if the move counts', async () => {
    const { board, cells, mistake, watch, held } = setup();
    board.dispatchEvent(new Event('pointerdown')); // the stroke starts
    cells[1].className = 'err';
    await Promise.resolve(); // the observer sees the render
    expect(held()).toEqual([false, true, false]);
    watch(false); // the stroke only erased: nothing to count
    vi.advanceTimersByTime(SETTLE_MS);
    expect(mistake).not.toHaveBeenCalled();
    expect(held()).toEqual([false, false, false]);
  });

  it('recognises a judged rule break on a redrawn element', () => {
    const { board, cells, mistake, watch } = setup();
    cells[0].className = 'tile err';
    cells[0].setAttribute('style', 'grid-area:1/1');
    watch();
    vi.advanceTimersByTime(SETTLE_MS);
    const again = document.createElement('span');
    again.className = 'tile err';
    again.setAttribute('style', 'grid-area:1/1');
    board.replaceChild(again, cells[0]);
    watch();
    expect(again.hasAttribute('data-hold')).toBe(false);
    vi.advanceTimersByTime(SETTLE_MS);
    expect(mistake).toHaveBeenCalledTimes(1);
  });
});

describe('a number grid', () => {
  /** Sudoku with the selected cell and a digit that clashes with its row. */
  const start = () => {
    const g = mountGame('sudoku', 1, 7);
    const { vals, sel } = g.inst.snapshot!() as { vals: number[]; sel: number };
    const row = Math.floor(sel / 9);
    const clash = vals.slice(row * 9, row * 9 + 9).find((v) => v > 0)!;
    const key = (k: string | number) => g.inst.onKey!(new KeyboardEvent('keydown', { key: String(k) }));
    return { g, clash, key, cell: () => g.root.querySelectorAll('.cell')[sel] };
  };

  it('counts a clash left on the board, after the pause', () => {
    const { g, clash, key, cell } = start();
    key(clash);
    expect(cell().matches('.err[data-hold]')).toBe(true);
    expect(g.events).toEqual([]);
    vi.advanceTimersByTime(SETTLE_MS);
    expect(cell().matches('.err:not([data-hold])')).toBe(true);
    expect(g.events).toEqual(['mistake']);
  });

  it('forgives a clash fixed right away', () => {
    const { g, clash, key } = start();
    key(clash);
    vi.advanceTimersByTime(SETTLE_MS / 2);
    key('Backspace');
    vi.advanceTimersByTime(SETTLE_MS * 2);
    expect(g.events).toEqual([]);
  });
});
