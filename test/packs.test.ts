// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { Card } from '../src/app/card/card';
import { _setLocaleForTests } from '../src/core/i18n';
import { finishPack, nextInTier, PACK_SIZE, packProgress, packSeed, packStars, tierProgress, UNLOCK_AT } from '../src/core/packs';
import { getSave, packSaveKey } from '../src/core/saves';
import { prefs, record, resetProfile, stats } from '../src/core/store';
import type { Difficulty, PuzzleCtx, PuzzleDef } from '../src/core/types';
import { PUZZLES } from '../src/games';
import { renderPacks } from '../src/pages/packs';

const solve = (id: string, level: Difficulty, index: number, r: Partial<{ ms: number; m: number; hn: number }> = {}) =>
  finishPack(id, { level, index }, { ms: 10_000, parMs: 60_000, m: 0, hn: 0, ...r });

describe('pack puzzles', () => {
  beforeEach(() => resetProfile());

  it('have fixed, distinct seeds per game, level and index', () => {
    expect(packSeed('sudoku', 1, 0)).toBe(packSeed('sudoku', 1, 0));
    const seeds = new Set<number>();
    for (const id of ['sudoku', 'mines'])
      for (const l of [1, 2, 3, 4, 5] as Difficulty[]) for (let i = 0; i < PACK_SIZE; i++) seeds.add(packSeed(id, l, i));
    expect(seeds.size).toBe(2 * 5 * PACK_SIZE);
    for (const s of seeds) expect(s).toBe(s >>> 0);
  });

  it('give one star for a solve, two under par, three under par with no mistakes or hints', () => {
    expect(packStars({ ms: 61_000, parMs: 60_000, m: 0, hn: 0 })).toBe(1);
    expect(packStars({ ms: 30_000, parMs: 60_000, m: 1, hn: 0 })).toBe(2);
    expect(packStars({ ms: 30_000, parMs: 60_000, m: 0, hn: 1 })).toBe(2);
    expect(packStars({ ms: 30_000, parMs: 60_000, m: 0, hn: 0 })).toBe(3);
  });

  it('keep the best stars, time and mistakes', () => {
    solve('mines', 1, 2, { ms: 20_000, m: 0 });
    solve('mines', 1, 2, { ms: 90_000, m: 3 });
    solve('mines', 1, 2, { ms: 15_000, m: 1 });
    expect(tierProgress('mines', 1).entries[2]).toEqual({ s: 3, ms: 15_000, m: 0 });
  });

  it(`unlock the next level after ${UNLOCK_AT} solves, and mark complete and perfect tiers`, () => {
    expect(tierProgress('mines', 1).state).toBe('open');
    expect(tierProgress('mines', 2).state).toBe('locked');
    for (let i = 0; i < UNLOCK_AT - 1; i++) solve('mines', 1, i);
    expect(tierProgress('mines', 2).state).toBe('locked');
    solve('mines', 1, UNLOCK_AT - 1);
    expect(tierProgress('mines', 2).state).toBe('open');
    expect(tierProgress('mines', 3).state).toBe('locked');
    for (let i = UNLOCK_AT; i < PACK_SIZE; i++) solve('mines', 1, i, { ms: 99_000 });
    expect(tierProgress('mines', 1).state).toBe('complete');
    for (let i = UNLOCK_AT; i < PACK_SIZE; i++) solve('mines', 1, i);
    expect(tierProgress('mines', 1).state).toBe('perfect');
    expect(packProgress('mines')).toMatchObject({ solved: PACK_SIZE, stars: 3 * PACK_SIZE, total: 5 * PACK_SIZE });
  });

  it('go to the next unsolved puzzle, wrapping around and skipping the current one', () => {
    solve('mines', 1, 1);
    expect(nextInTier('mines', 1, 0)).toBe(2);
    expect(nextInTier('mines', 1, PACK_SIZE - 1)).toBe(0);
    for (let i = 0; i < PACK_SIZE; i++) if (i !== 5) solve('mines', 1, i);
    expect(nextInTier('mines', 1, 5)).toBeNull();
    expect(nextInTier('mines', 1, 2)).toBe(5);
  });

  it('count in stats but never in auto-levelling', () => {
    for (let i = 0; i < 3; i++) record('a', { d: 1, o: 'solved', ms: 1_000, m: 0, pk: true }, 30_000);
    expect(stats('a').solved).toBe(3);
    expect(prefs('a').level).toBe(1);
  });
});

/** A tiny game: "win" solves it, "+" is a move (so the card saves). */
const tiny: PuzzleDef = {
  id: 'mines',
  name: 'Tiny',
  rules: 'Win.',
  category: 'logic',
  par: () => 60,
  create(ctx: PuzzleCtx) {
    const b = (label: string, fn: () => void) => {
      const el = document.createElement('button');
      el.dataset['act'] = label;
      el.addEventListener('click', fn);
      return el;
    };
    ctx.root.append(
      b('+', () => ctx.touch()),
      b('win', () => ctx.solved()),
    );
    return { snapshot: () => ({}) };
  },
};

describe('pack cards and page', () => {
  beforeEach(() => resetProfile());

  it('play the fixed puzzle in its own slot, and a solve earns stars', async () => {
    const seed = packSeed('mines', 2, 4);
    const nexts: Card[] = [];
    const card = new Card(tiny, (c) => nexts.push(c), { lab: true, level: 2, seed, pack: { level: 2, index: 4 } });
    document.body.append(card.el);
    card.setActive(true);
    expect(card.puzzleSeed).toBe(seed);
    card.el.querySelector<HTMLElement>('[data-act="+"]')!.click();
    card.persist();
    expect(getSave(packSaveKey('mines', 2, 4), 'pack')?.seed).toBe(seed);
    expect(getSave('mines')).toBeUndefined();
    card.el.querySelector<HTMLElement>('[data-act="win"]')!.click();
    expect(tierProgress('mines', 2).entries[4]?.s).toBe(3);
    expect(card.el.querySelectorAll('.win-stars .on')).toHaveLength(3);
    expect(getSave(packSaveKey('mines', 2, 4), 'pack')).toBeUndefined();
    expect(prefs('mines').level).toBe(1);
    // "Next" moves on to the following pack puzzle.
    [...card.el.querySelectorAll<HTMLElement>('.card-foot button')].find((x) => x.textContent === 'Next')!.click();
    expect(nexts).toHaveLength(1);
    card.destroy();
    card.el.remove();
  });

  it('renders the overview and a game page with locked tiers, in both languages', () => {
    solve('mines', 1, 0);
    for (const loc of ['en', 'fr'] as const) {
      _setLocaleForTests(loc);
      const el = document.createElement('div');
      renderPacks(el, PUZZLES);
      expect(el.querySelectorAll('.pack-row')).toHaveLength(PUZZLES.length);
      // The pack in progress comes first.
      expect(el.querySelector('.pack-row')!.getAttribute('data-puzzle')).toBe('mines');
      renderPacks(
        el,
        PUZZLES,
        PUZZLES.find((d) => d.id === 'mines'),
      );
      expect(el.querySelectorAll('.pack-tier')).toHaveLength(5);
      expect(el.querySelectorAll('a.pack-tile')).toHaveLength(PACK_SIZE);
      expect(el.querySelectorAll('.pack-tile.is-locked')).toHaveLength(4 * PACK_SIZE);
      expect(el.querySelector('a.pack-tile')!.getAttribute('href')).toBe('/packs/mines/1/1');
    }
    _setLocaleForTests('en');
  });
});
