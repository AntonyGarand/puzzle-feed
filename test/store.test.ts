// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { addPlayTime, prefs, record, resetProfile, setLevel, stats } from '../src/core/store';

const PAR = 30_000;
const solve = (id: string, ms = 10_000, m = 0) => record(id, { d: prefs(id).level, o: 'solved', ms, m }, PAR);
const fail = (id: string) => record(id, { d: prefs(id).level, o: 'failed', ms: 40_000, m: 3 }, PAR);

describe('auto-levelling', () => {
  beforeEach(() => resetProfile());

  it('levels up after three clean solves within par', () => {
    solve('a', 20_000);
    solve('a', 20_000);
    expect(prefs('a').level).toBe(1);
    const r = solve('a', 20_000);
    expect(r.levelChange).toEqual({ from: 1, to: 2 });
    expect(prefs('a').level).toBe(2);
  });

  it('levels up after two very fast flawless solves', () => {
    solve('a', 5_000);
    expect(solve('a', 5_000).levelChange?.to).toBe(2);
  });

  it('does not count slow or sloppy solves', () => {
    solve('a', 20_000);
    solve('a', 40_000);
    solve('a', 20_000, 3);
    expect(prefs('a').level).toBe(1);
  });

  it('eases off after two misses', () => {
    setLevel('a', 3);
    setLevel('a', 'auto');
    fail('a');
    expect(fail('a').levelChange).toEqual({ from: 3, to: 2 });
  });

  it('never changes a manually set level', () => {
    setLevel('a', 2);
    for (let i = 0; i < 5; i++) solve('a', 1_000);
    expect(prefs('a').level).toBe(2);
    expect(prefs('a').manual).toBe(true);
    for (let i = 0; i < 5; i++) fail('a');
    expect(prefs('a').level).toBe(2);
  });

  it('resumes from the manual level when switched back to auto', () => {
    setLevel('a', 4);
    setLevel('a', 'auto');
    solve('a', 1_000);
    expect(solve('a', 1_000).levelChange).toEqual({ from: 4, to: 5 });
  });

  it('tracks stats and bests', () => {
    solve('a', 12_000);
    solve('a', 9_000);
    fail('a');
    const s = stats('a');
    expect([s.played, s.solved, s.failed]).toEqual([3, 2, 1]);
    expect(s.best[1]).toBe(9_000);
  });
});

describe('shared puzzles', () => {
  beforeEach(() => resetProfile());

  it('count in stats but never move the auto level', () => {
    for (let i = 0; i < 3; i++) record('a', { d: 1, o: 'solved', ms: 1_000, m: 0, sh: true }, PAR);
    expect(stats('a').solved).toBe(3);
    expect(prefs('a').level).toBe(1);
    // ...and don't count towards a later level change either.
    expect(solve('a', 1_000).levelChange).toBeUndefined();
    expect(solve('a', 1_000).levelChange?.to).toBe(2);
  });
});

describe('play time', () => {
  beforeEach(() => resetProfile());

  it('adds up time on every outcome, apart from solve times', () => {
    addPlayTime('a', 90_000);
    fail('a');
    addPlayTime('a', 10_000.4);
    expect(stats('a').playTime).toBe(100_000);
    expect(stats('a').time).toBe(0);
  });
});
