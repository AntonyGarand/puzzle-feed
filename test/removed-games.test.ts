// @vitest-environment happy-dom
// A game can leave the feed (Memory moved to the arcade feed). Profiles, saves and links that still name
// it must keep working: its history stays in the totals, and everything else just skips it.
import { beforeEach, describe, expect, it } from 'vitest';
import { dailyDate, getDaily } from '../src/core/daily';
import { checkGoals } from '../src/core/goals';
import { putSave } from '../src/core/saves';
import { resolveCode } from '../src/core/share';
import { dailyList, record, recordPack, resetProfile, totalXp } from '../src/core/store';
import { PUZZLES } from '../src/games';
import { renderDaily } from '../src/pages/daily';
import { renderLabs } from '../src/pages/labs';
import { renderPacks } from '../src/pages/packs';
import { renderStats } from '../src/pages/stats';

const GONE = 'memory';

describe('a game that no longer exists', () => {
  beforeEach(() => {
    localStorage.clear();
    resetProfile();
  });

  it('is not registered', () => {
    expect(PUZZLES.some((p) => p.id === GONE)).toBe(false);
  });

  it('leaves stats, saves, packs and a stored daily list working', () => {
    const xp = totalXp();
    record(GONE, { d: 3, o: 'solved', ms: 5000, m: 0 }, 60_000);
    expect(totalXp()).toBeGreaterThan(xp); // earned XP is kept
    recordPack(GONE, 1, 0, { s: 3, ms: 4000, m: 0 });
    const save = { seed: 1, level: 2 as const, elapsed: 1, mistakes: 0, state: {}, at: 1 };
    putSave(GONE, save);
    putSave(`${GONE}:1:0`, save, 'pack');
    const today = dailyDate();
    dailyList(today, 2, () => [
      { id: GONE, seed: 1 },
      { id: 'sudoku', seed: 2 },
    ]);
    expect(getDaily(today, 2, PUZZLES).map((e) => e.id)).toEqual([GONE, 'sudoku']);

    const el = document.createElement('div');
    for (const render of [
      () => renderStats(el, PUZZLES),
      () => renderLabs(el, PUZZLES),
      () => renderPacks(el, PUZZLES),
      () => renderDaily(el, PUZZLES, 2),
    ])
      expect(render).not.toThrow();
    // The daily page names it but offers no way to open it; the rest of the list still plays.
    const rows = [...el.querySelectorAll('.daily-item')];
    expect(rows[0].querySelector(`a[href="/daily/2/1"]`)).toBeNull();
    expect(rows[1].querySelector(`a[href="/daily/2/2"]`)).not.toBeNull();
    expect(() => checkGoals(PUZZLES)).not.toThrow();
  });

  it('turns an old share link into a friendly error', () => {
    const r = resolveCode(`https://puzzle.garand.dev/s/${GONE}-3-1k2x9q`, PUZZLES);
    expect('error' in r && r.error).toContain(GONE);
  });
});
