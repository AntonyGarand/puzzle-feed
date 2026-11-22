// @vitest-environment happy-dom
// Everything a player keeps between visits lives in localStorage / sessionStorage: these modules must
// round-trip it, keep the slots apart, and survive corrupt or missing data instead of throwing.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { migrateStorage } from '../src/core/migrate-storage';
import { allSaves, clearAllSaves, clearSave, dailySaveKey, getSave, putSave, type Save } from '../src/core/saves';
import { sessionGet, sessionSet } from '../src/core/session';

const save = (seed: number, extra: Partial<Save> = {}): Save => ({
  seed,
  level: 2,
  elapsed: 1234,
  mistakes: 1,
  state: { cells: [1, 0, 2] },
  at: 1_700_000_000_000,
  ...extra,
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('saves', () => {
  it('round-trips a save through localStorage', () => {
    putSave('sudoku', save(7, { hints: 2, locale: 'fr' }));
    expect(getSave('sudoku')).toEqual(save(7, { hints: 2, locale: 'fr' }));
    expect(Object.keys(allSaves())).toEqual(['sudoku']);
  });

  it('keeps one save per game, replaced by the newest', () => {
    putSave('sudoku', save(1));
    putSave('mines', save(2));
    putSave('sudoku', save(3));
    expect(getSave('sudoku')?.seed).toBe(3);
    expect(getSave('mines')?.seed).toBe(2);
  });

  it('keeps own, shared and daily slots apart', () => {
    putSave('sudoku', save(1));
    putSave('sudoku', save(2), 'shared');
    putSave(dailySaveKey('2026-11-22', 3, 0), save(3), 'daily');
    expect(getSave('sudoku')?.seed).toBe(1);
    expect(getSave('sudoku', 'shared')?.seed).toBe(2);
    expect(getSave('2026-11-22:3:0', 'daily')?.seed).toBe(3);
    clearSave('sudoku', undefined, 'shared');
    expect(getSave('sudoku')?.seed).toBe(1);
  });

  it('only keeps the current day of daily saves', () => {
    putSave(dailySaveKey('2026-11-21', 1, 0), save(1), 'daily');
    putSave(dailySaveKey('2026-11-21', 2, 4), save(2), 'daily');
    putSave(dailySaveKey('2026-11-22', 1, 0), save(3), 'daily');
    expect(getSave('2026-11-21:1:0', 'daily')).toBeUndefined();
    expect(getSave('2026-11-21:2:4', 'daily')).toBeUndefined();
    expect(getSave('2026-11-22:1:0', 'daily')?.seed).toBe(3);
  });

  it('clears a save only when the seed matches, if one is given', () => {
    putSave('sudoku', save(5));
    clearSave('sudoku', 6);
    expect(getSave('sudoku')).toBeDefined();
    clearSave('sudoku', 5);
    expect(getSave('sudoku')).toBeUndefined();
  });

  it('clears every slot at once', () => {
    putSave('a', save(1));
    putSave('b', save(2), 'shared');
    putSave(dailySaveKey('2026-11-22', 1, 0), save(3), 'daily');
    clearAllSaves();
    expect(getSave('a')).toBeUndefined();
    expect(getSave('b', 'shared')).toBeUndefined();
    expect(getSave('2026-11-22:1:0', 'daily')).toBeUndefined();
  });

  it('treats corrupt storage as empty instead of throwing', () => {
    localStorage.setItem('puzzle-feed:saves:v1', '{not json');
    expect(getSave('sudoku')).toBeUndefined();
    expect(allSaves()).toEqual({});
    localStorage.setItem('puzzle-feed:saves:v1', 'null');
    expect(allSaves()).toEqual({});
    putSave('sudoku', save(1));
    expect(getSave('sudoku')?.seed).toBe(1);
  });

  it('keeps playing when storage is full', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    try {
      expect(() => putSave('sudoku', save(1))).not.toThrow();
    } finally {
      setItem.mockRestore();
    }
  });
});

describe('storage migration from puzzle express', () => {
  const migrate = () => migrateStorage(localStorage);

  it('moves every old key to its new name', () => {
    localStorage.setItem('puzzle-express:profile:v1', '{"name":"A"}');
    localStorage.setItem('puzzle-express:saves:v1', '{}');
    localStorage.setItem('unrelated', 'x');
    migrate();
    expect(localStorage.getItem('puzzle-feed:profile:v1')).toBe('{"name":"A"}');
    expect(localStorage.getItem('puzzle-feed:saves:v1')).toBe('{}');
    expect(localStorage.getItem('puzzle-express:profile:v1')).toBeNull();
    expect(localStorage.getItem('puzzle-express:saves:v1')).toBeNull();
    expect(localStorage.getItem('unrelated')).toBe('x');
  });

  it('never overwrites data already saved under the new name', () => {
    localStorage.setItem('puzzle-express:profile:v1', 'old');
    localStorage.setItem('puzzle-feed:profile:v1', 'new');
    migrate();
    expect(localStorage.getItem('puzzle-feed:profile:v1')).toBe('new');
    expect(localStorage.getItem('puzzle-express:profile:v1')).toBeNull();
  });

  it('does nothing on a fresh install', () => {
    localStorage.setItem('puzzle-feed:profile:v1', 'p');
    migrate();
    expect(localStorage.length).toBe(1);
  });
});

describe('session memory', () => {
  it('round-trips JSON values per tab', () => {
    sessionSet('route', '/game/sudoku');
    sessionSet('feed', { id: 'mines', seed: 4 });
    expect(sessionGet('route')).toBe('/game/sudoku');
    expect(sessionGet('feed')).toEqual({ id: 'mines', seed: 4 });
    expect(sessionStorage.getItem('puzzle-feed:route')).toBe('"/game/sudoku"');
  });

  it('returns undefined for missing or corrupt values', () => {
    expect(sessionGet('nothing')).toBeUndefined();
    sessionStorage.setItem('puzzle-feed:feed', '{broken');
    expect(sessionGet('feed')).toBeUndefined();
  });
});
