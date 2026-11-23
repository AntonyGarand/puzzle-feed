import { afterEach, describe, expect, it } from 'vitest';
import { dailyShareText, dailySquare } from '../src/core/daily-share';
import { _setLocaleForTests } from '../src/core/i18n';
import type { DailyEntry } from '../src/core/store';
import { fmtTime } from '../src/ui/dom';

const opts = { level: 3 as const, date: 'Nov 22', origin: 'https://puzzle.garand.dev', fmtTime };

describe('daily share text', () => {
  afterEach(() => _setLocaleForTests('en'));

  it('gives one square per puzzle by outcome', () => {
    expect(dailySquare({ id: 'a', seed: 1, o: 'solved', m: 0, ms: 1000 })).toBe('🟩');
    expect(dailySquare({ id: 'a', seed: 1, o: 'solved', m: 2, ms: 1000 })).toBe('🟨');
    expect(dailySquare({ id: 'a', seed: 1, o: 'failed' })).toBe('🟥');
    expect(dailySquare({ id: 'a', seed: 1 })).toBe('⬜');
  });

  it('shows squares, solve count, total time and the link, without game names', () => {
    const list: DailyEntry[] = [
      { id: 'sudoku', seed: 1, o: 'solved', m: 0, ms: 60_000 },
      { id: 'pipes', seed: 2, o: 'solved', m: 1, ms: 120_000 },
      { id: 'mines', seed: 3, o: 'failed' },
      { id: 'tents', seed: 4 },
      { id: 'queens', seed: 5, o: 'solved', m: 0, ms: 192_000 },
    ];
    const text = dailyShareText(list, opts);
    expect(text).toBe('Puzzle Feed · Nov 22 · Hard\n🟩🟨🟥⬜🟩 3/5 · 6:12\nhttps://puzzle.garand.dev/daily/3');
    for (const e of list) expect(text).not.toContain(e.id);
  });

  it('leaves the time out when nothing is solved', () => {
    const text = dailyShareText(
      [
        { id: 'a', seed: 1, o: 'failed' },
        { id: 'b', seed: 2 },
      ],
      opts,
    );
    expect(text.split('\n')[1]).toBe('🟥⬜ 0/2');
  });

  it('follows the locale for the level name', () => {
    _setLocaleForTests('fr');
    expect(dailyShareText([{ id: 'a', seed: 1 }], opts).split('\n')[0]).toBe('Puzzle Feed · Nov 22 · Difficile');
  });
});
