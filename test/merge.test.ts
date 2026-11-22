// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { PuzzleCtx } from '../src/core/types';
import { merge } from '../src/puzzles/merge';

(globalThis as any).ResizeObserver ??= class {
  observe() {}
  disconnect() {}
};

function run(saved: unknown) {
  const events: string[] = [];
  const buttons: HTMLElement[] = [];
  const c: PuzzleCtx = {
    difficulty: 1,
    rng: new Rng(1),
    root: document.createElement('div'),
    solved: (o) => events.push(o?.keepPlaying ? 'reached' : 'solved'),
    failed: () => events.push('failed'),
    mistake: () => {},
    touch: () => {},
    status: () => {},
    lives: () => {},
    controls: (...els) => buttons.push(...els),
    saved,
  };
  const inst = merge.create(c) || {};
  const key = (k: string) => inst.onKey!(new KeyboardEvent('keydown', { key: k }));
  return { events, buttons, key };
}

describe('2048 (merge)', () => {
  // Easy: 5×5, goal 64. Two 32s side by side: sliding left reaches the goal.
  const nearGoal = { cells: [32, 32, ...new Array<number>(23).fill(0)], score: 0, spawns: 2 };

  it('records the goal and keeps the board playable', () => {
    const { events, buttons, key } = run(nearGoal);
    key('ArrowLeft');
    expect(events).toEqual(['reached']);
    expect(buttons[0].hidden).toBe(false);
    // Still playable: further moves are accepted and don't end the run.
    key('ArrowDown');
    key('ArrowRight');
    expect(events).toEqual(['reached']);
    // Finish closes the run as a solve.
    buttons[0].click();
    expect(events).toEqual(['reached', 'solved']);
  });
});
