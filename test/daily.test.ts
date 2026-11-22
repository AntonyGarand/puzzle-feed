// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { DAILY_SIZE, dailyStats, dailyStreak, generateDaily, getDaily, isComplete, shiftDate } from '../src/core/daily';
import { _setLocaleForTests } from '../src/core/i18n';
import { getProfile, prefs, record, recordDaily, resetProfile, stats } from '../src/core/store';
import { LEVELS, type Difficulty } from '../src/core/types';
import { PUZZLES } from '../src/puzzles';
import { puzzle } from './support/mount';

const solveAll = (date: string, level: Difficulty) => {
  const list = getDaily(date, level, PUZZLES);
  list.forEach((_, i) => recordDaily(date, level, i, 'solved', 10_000, 0));
};

describe('daily lists', () => {
  beforeEach(() => resetProfile());

  it('is the same for everyone on a given day, whatever the language or game order', () => {
    const a = generateDaily('2026-11-20', 3, PUZZLES);
    _setLocaleForTests('fr');
    const b = generateDaily('2026-11-20', 3, [...PUZZLES].reverse());
    _setLocaleForTests('en');
    expect(b).toEqual(a);
  });

  it('has distinct, known games from several categories', () => {
    for (const l of LEVELS) {
      const list = generateDaily('2026-11-20', l, PUZZLES);
      expect(list).toHaveLength(DAILY_SIZE);
      expect(new Set(list.map((x) => x.id)).size).toBe(DAILY_SIZE);
      const cats = new Set(list.map((x) => puzzle(x.id).category));
      expect(cats.size).toBe(DAILY_SIZE);
      for (const x of list) expect(x.seed).toBe(x.seed >>> 0);
    }
  });

  it('changes with the level and the date', () => {
    const ids = (d: string, l: Difficulty) => JSON.stringify(generateDaily(d, l, PUZZLES));
    expect(ids('2026-11-20', 1)).not.toBe(ids('2026-11-20', 2));
    expect(ids('2026-11-20', 1)).not.toBe(ids('2026-11-21', 1));
  });

  it('is stored on first use, so it survives games being added', () => {
    const first = getDaily('2026-11-20', 2, PUZZLES).map((e) => e.id);
    const later = getDaily('2026-11-20', 2, PUZZLES.slice(0, 10)).map((e) => e.id);
    expect(later).toEqual(first);
    expect(getProfile().daily['2026-11-20'][2]).toHaveLength(DAILY_SIZE);
  });

  it('keeps the first solve and allows retries after a failure', () => {
    getDaily('2026-11-20', 1, PUZZLES);
    recordDaily('2026-11-20', 1, 0, 'failed', 5_000, 2);
    expect(getProfile().daily['2026-11-20'][1]![0]).toMatchObject({ o: 'failed', tries: 1 });
    recordDaily('2026-11-20', 1, 0, 'solved', 20_000, 1);
    recordDaily('2026-11-20', 1, 0, 'solved', 9_000, 0);
    expect(getProfile().daily['2026-11-20'][1]![0]).toMatchObject({ o: 'solved', ms: 20_000, m: 1, tries: 3 });
  });

  it('counts daily solves in stats but never in auto-levelling', () => {
    for (let i = 0; i < 3; i++) record('a', { d: 1, o: 'solved', ms: 1_000, m: 0, dy: true }, 30_000);
    expect(stats('a').solved).toBe(3);
    expect(prefs('a').level).toBe(1);
  });
});

describe('daily streaks', () => {
  beforeEach(() => resetProfile());

  it('steps dates across month and year ends', () => {
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts consecutive days with a completed list', () => {
    const today = '2026-11-20';
    solveAll('2026-11-17', 1);
    solveAll('2026-11-18', 5);
    solveAll('2026-11-19', 2);
    // Yesterday counts while today isn't done yet.
    expect(dailyStreak(today)).toBe(3);
    // A started but unfinished list doesn't count.
    getDaily(today, 1, PUZZLES);
    recordDaily(today, 1, 0, 'solved', 1_000, 0);
    expect(isComplete(getProfile().daily[today][1])).toBe(false);
    expect(dailyStreak(today)).toBe(3);
    solveAll(today, 1);
    expect(dailyStreak(today)).toBe(4);
    expect(dailyStreak('2026-11-22')).toBe(0);
  });

  it('summarises lists, solves and the best streak per level', () => {
    solveAll('2026-11-01', 1);
    solveAll('2026-11-02', 1);
    solveAll('2026-11-02', 3);
    solveAll('2026-11-10', 1);
    const s = dailyStats('2026-11-20');
    expect(s.streak).toBe(0);
    expect(s.bestStreak).toBe(2);
    expect(s.days).toBe(3);
    expect(s.completed).toBe(4);
    expect(s.byLevel[1]).toEqual({ completed: 3, solved: 3 * DAILY_SIZE, bestTotal: DAILY_SIZE * 10_000 });
    expect(s.byLevel[2].completed).toBe(0);
  });
});
