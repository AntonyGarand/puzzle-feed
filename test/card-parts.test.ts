// The pure parts of a card: play clock, undo history, and when a solve deserves confetti.
import { describe, expect, it } from 'vitest';
import { Clock } from '../src/app/card/clock';
import { celebrate } from '../src/app/card/result';
import { UndoHistory } from '../src/app/card/undo-history';
import type { XpGain, XpOutcome } from '../src/core/xp';

describe('clock', () => {
  let now = 0;
  const clock = () => new Clock(() => now);

  it('counts only while running', () => {
    now = 1000;
    const c = clock();
    c.reset(0, false);
    now = 5000;
    expect(c.time()).toBe(0);
    c.start();
    now = 7000;
    expect(c.time()).toBe(2000);
    c.stop();
    now = 60_000;
    expect(c.time()).toBe(2000);
    expect(c.running).toBe(false);
  });

  it('resumes from a saved time', () => {
    now = 0;
    const c = clock();
    c.reset(30_000, true);
    now = 500;
    expect(c.time()).toBe(30_500);
    expect(c.running).toBe(true);
  });

  it('adds up several stretches of play', () => {
    now = 0;
    const c = clock();
    c.reset(0, true);
    now = 100;
    c.stop();
    c.stop(); // stopping twice doesn't count the pause
    now = 1000;
    c.start();
    now = 1250;
    expect(c.time()).toBe(350);
  });
});

describe('undo history', () => {
  it('records a step only when the position changes', () => {
    const u = new UndoHistory();
    u.record(() => ({ cells: [0, 0] }));
    u.record(() => ({ cells: [0, 0] }));
    expect(u.canUndo).toBe(false);
    u.record(() => ({ cells: [1, 0] }));
    expect(u.canUndo).toBe(true);
  });

  it('ignores selection and cursor moves', () => {
    const u = new UndoHistory();
    u.record(() => ({ cells: [0], sel: 1 }));
    u.record(() => ({ cells: [0], sel: 2, cur: 5 }));
    expect(u.canUndo).toBe(false);
  });

  it('goes back one move, keeping the current selection and cursor', () => {
    const u = new UndoHistory();
    u.record(() => ({ cells: [0, 0], sel: 0 }));
    u.record(() => ({ cells: [1, 0], sel: 0 }));
    u.record(() => ({ cells: [1, 2], sel: 1, cur: 3 }));
    expect(u.undo()).toEqual({ state: { cells: [1, 0], sel: 1, cur: 3 } });
    expect(u.undo()).toEqual({ state: { cells: [0, 0], sel: 0 } });
    expect(u.undo()).toBeNull();
  });

  it('hands back copies, so the game can mutate them', () => {
    const u = new UndoHistory();
    u.record(() => ({ cells: [0] }));
    u.record(() => ({ cells: [1] }));
    const a = u.undo()!.state as { cells: number[] };
    a.cells[0] = 9;
    u.record(() => ({ cells: [2] }));
    expect(u.undo()).toEqual({ state: { cells: [0] } });
  });

  it('skips games without snapshots and snapshots that are not JSON', () => {
    const u = new UndoHistory();
    u.record(() => undefined);
    u.record(() => {
      throw new Error('broken');
    });
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    u.record(() => cyclic);
    expect(u.canUndo).toBe(false);
    expect(u.undo()).toBeNull();
  });

  it('keeps at most `max` steps', () => {
    const u = new UndoHistory(3);
    for (let i = 0; i < 10; i++) u.record(() => ({ n: i }));
    expect(u.undo()).toEqual({ state: { n: 8 } });
    expect(u.undo()).toEqual({ state: { n: 7 } });
    expect(u.undo()).toBeNull();
  });
});

describe('celebrate', () => {
  const xp = (before: number, after: number, why: XpGain['why'] = 'solve'): XpOutcome => ({
    gains: [{ why, xp: after - before }],
    total: after - before,
    game: { before, after },
    player: { before, after },
  });

  it('celebrates first clears, new bests and level ups', () => {
    expect(celebrate({ prevBest: undefined })).toBe(true);
    expect(celebrate({ best: true, prevBest: 30_000 })).toBe(true);
    expect(celebrate({ prevBest: 30_000, levelChange: { from: 2, to: 3 } })).toBe(true);
  });

  it('stays quiet for an ordinary solve or a level going down', () => {
    expect(celebrate({ prevBest: 30_000 })).toBe(false);
    expect(celebrate({ prevBest: 30_000, levelChange: { from: 3, to: 2 } })).toBe(false);
    expect(celebrate({ prevBest: 30_000, xp: xp(10, 20) })).toBe(false);
  });

  it('celebrates an XP level up and the daily bonuses', () => {
    expect(celebrate({ prevBest: 30_000, xp: xp(90, 110) })).toBe(true);
    expect(celebrate({ prevBest: 30_000, xp: xp(10, 20, 'daily') })).toBe(true);
    expect(celebrate({ prevBest: 30_000, xp: xp(10, 20, 'gameToday') })).toBe(true);
  });
});
