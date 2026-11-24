// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { LEVELS } from '../src/core/types';
import { generate, isSolved, validTiles } from '../src/games/gradient/gen';
import { mountGame } from './support/mount';

describe('gradient generator', () => {
  it.each(LEVELS)('level %i: distinct colours, pins stay home, every free tile starts away', (d) => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = generate(new Rng(seed), d);
      expect(new Set(g.colors).size, `seed ${seed}`).toBe(g.colors.length);
      expect(validTiles(g.start, g)).toBe(true);
      g.start.forEach((t, i) => expect(t === i).toBe(g.pinned[i]));
      expect(isSolved(g.start)).toBe(false);
    }
  });

  it('pins fewer tiles and grows the board as the level rises', () => {
    const at = LEVELS.map((d) => generate(new Rng(7), d));
    for (let k = 1; k < at.length; k++) {
      expect(at[k].colors.length).toBeGreaterThanOrEqual(at[k - 1].colors.length);
      const free = (g: (typeof at)[number]) => g.pinned.filter((p) => !p).length;
      expect(free(at[k])).toBeGreaterThan(free(at[k - 1]));
    }
  });

  it('rejects saves that move a pinned tile or repeat a tile', () => {
    const g = generate(new Rng(3), 1);
    const moved = [...g.start];
    [moved[0], moved[6]] = [moved[6], moved[0]];
    expect(validTiles(moved, g)).toBe(false);
    expect(
      validTiles(
        g.start.map(() => 6),
        g,
      ),
    ).toBe(false);
  });
});

describe('gradient game', () => {
  it('swaps two tapped tiles and refuses pinned ones', () => {
    const g = mountGame('gradient', 1, 5);
    const cells = [...g.root.querySelectorAll<HTMLElement>('.cell')];
    const before = cells.map((c) => c.style.background);
    cells[0].click(); // pinned corner
    expect(g.root.querySelector('.sel')).toBeNull();
    cells[6].click();
    cells[7].click();
    expect(cells[6].style.background).toBe(before[7]);
    expect(cells[7].style.background).toBe(before[6]);
    expect(g.status).toMatch(/1 swap/);
    expect(g.events).toEqual([]);
  });

  it.each(LEVELS)('level %i: the guide solves it', (d) => {
    const g = mountGame('gradient', d, 11);
    for (let k = 0; k < 200 && g.outcome === ''; k++) g.inst.hint!()!.play();
    expect(g.outcome).toBe('solved');
    expect(g.events).toEqual(['solved']);
    expect(g.inst.hint!()).toBeNull();
  });
});
