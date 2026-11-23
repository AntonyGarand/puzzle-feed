// @vitest-environment happy-dom
// Puzzle Rush: the pure picking and levelling rules, the stored records, and a run played through the
// real view with fake games and a fake clock.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRush, raceLevel, rushKey, rushLevel, rushPick } from '../src/core/rush';
import { getProfile, recordRush, resetProfile, rushRecord, stats } from '../src/core/store';
import type { CategoryId } from '../src/core/categories';
import type { Difficulty, PuzzleCtx, PuzzleDef } from '../src/core/types';
import { getSave } from '../src/core/saves';
import { RushView } from '../src/pages/rush-play';

/** A game that ends when its "win" or "lose" button is pressed. */
function fake(id: string, category: CategoryId = 'logic', par = (d: Difficulty) => 20 * d): PuzzleDef {
  return {
    id,
    name: id,
    rules: 'Press win.',
    category,
    par,
    create(ctx: PuzzleCtx) {
      const b = (label: string, fn: () => void) => {
        const el = document.createElement('button');
        el.dataset['act'] = label;
        el.addEventListener('click', fn);
        return el;
      };
      ctx.root.append(
        b('win', () => ctx.solved()),
        b('goal', () => ctx.solved({ keepPlaying: true })),
        b('lose', () => ctx.failed()),
        b('touch', () => ctx.touch()),
      );
      return { snapshot: () => ({}) };
    },
  };
}

describe('rules', () => {
  it('parses play paths', () => {
    expect(parseRush('race', '3')).toEqual({ mode: 'race', minutes: 3 });
    expect(parseRush('classic', '1')).toEqual({ mode: 'classic', minutes: 1 });
    expect(parseRush('race', '2')).toBeUndefined();
    expect(parseRush('sprint', '3')).toBeUndefined();
    expect(parseRush(undefined, undefined)).toBeUndefined();
  });

  it('steps Race up every two solves, up to Master', () => {
    expect([0, 1, 2, 3, 4, 7, 8, 30].map(raceLevel)).toEqual([1, 1, 2, 2, 3, 4, 5, 5]);
    expect(rushLevel('race', 4, 1)).toBe(3);
  });

  it('caps Classic at Hard', () => {
    expect(rushLevel('classic', 10, 2)).toBe(2);
    expect(rushLevel('classic', 0, 5)).toBe(3);
  });

  it('deals quick games only, never one of the last three', () => {
    const defs = [fake('a'), fake('b'), fake('c'), fake('d'), fake('slow', 'cards', () => 300)];
    for (let i = 0; i < 50; i++) {
      const p = rushPick(defs, ['a', 'b', 'c'], () => 1, Math.random)!;
      expect(p.def.id).toBe('d');
      expect(p.level).toBe(1);
    }
  });

  it('prefers another category than the last card', () => {
    const defs = [fake('a', 'logic'), fake('b', 'logic'), fake('w', 'words')];
    let words = 0;
    for (let i = 0; i < 400; i++) if (rushPick(defs, ['a'], () => 1, Math.random)!.def.id === 'w') words++;
    // w weighs 1 against b's 0.25: about 80 %.
    expect(words).toBeGreaterThan(260);
  });

  it('falls back to the quickest games when none is quick enough', () => {
    const defs = [fake('x', 'cards', () => 900), fake('y', 'cards', () => 500)];
    expect(['x', 'y']).toContain(rushPick(defs, [], () => 5, Math.random)!.def.id);
    expect(rushPick([], [], () => 1, Math.random)).toBeNull();
  });
});

describe('records', () => {
  beforeEach(() => resetProfile());

  it('keeps the best score and counts runs', () => {
    const k = rushKey('race', 3);
    expect(recordRush(k, 4)).toEqual({ best: true, prev: undefined });
    expect(recordRush(k, 2)).toEqual({ best: false, prev: 4 });
    expect(recordRush(k, 6)).toEqual({ best: true, prev: 4 });
    expect(rushRecord(k)).toMatchObject({ best: 6, runs: 3 });
    expect(rushRecord(rushKey('classic', 3))).toBeUndefined();
  });

  it('never celebrates a zero', () => {
    expect(recordRush(rushKey('classic', 1), 0).best).toBe(false);
  });
});

describe('a run', () => {
  let view: RushView;
  beforeEach(() => {
    resetProfile();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'requestAnimationFrame'] });
    view = new RushView([fake('a'), fake('b', 'words'), fake('c', 'moves'), fake('d', 'paths')]);
    document.body.replaceChildren(view.el);
  });
  afterEach(() => {
    view.close();
    vi.useRealTimers();
  });

  const press = (act: string) => view.el.querySelector<HTMLElement>(`.card [data-act="${act}"]`)!.click();
  const clock = () => view.el.querySelector('.rush-clock')!.textContent;
  const score = () => view.el.querySelector('.rush-score')!.textContent;
  const game = () => view.el.querySelector<HTMLElement>('.card')!.dataset['puzzle'];

  it('scores solves, moves on after losses and skips, and ends on time', () => {
    view.start('race', 1);
    view.setShown(true);
    expect(clock()).toBe('1:00');
    vi.advanceTimersByTime(10_000);
    expect(clock()).toBe('0:50');

    const first = game();
    press('win');
    expect(score()).toBe('1');
    vi.advanceTimersByTime(500);
    expect(game()).not.toBe(first);

    press('goal'); // an endless game's goal ends its puzzle in a rush
    vi.advanceTimersByTime(500);
    expect(score()).toBe('2');
    expect(view.el.querySelector('.rush-note')!.textContent).toMatch(/Medium/);

    press('lose');
    vi.advanceTimersByTime(800);
    expect(score()).toBe('2');

    view.el.querySelector<HTMLElement>('.rush-bar .btn:last-child')!.click(); // Skip: −5 s
    const left = clock();
    view.setShown(false); // the clock stops while the view is hidden
    vi.advanceTimersByTime(60_000);
    expect(clock()).toBe(left);
    view.setShown(true);

    vi.advanceTimersByTime(60_000);
    expect(clock()).toBe('0:00');
    const end = view.el.querySelector('.rush-end')!;
    expect(end.querySelector('.rush-end-score strong')!.textContent).toBe('2');
    expect(end.querySelectorAll('.rush-log li')).toHaveLength(4); // the puzzle on screen when time ran out isn't listed
    expect(end.querySelectorAll('.rush-log .is-skipped')).toHaveLength(1);
    expect(rushRecord(rushKey('race', 1))).toMatchObject({ best: 2, runs: 1 });
  });

  it('leaves game stats, levels and saves alone', () => {
    view.start('classic', 3);
    view.setShown(true);
    const id = game()!;
    press('touch');
    view.setShown(false);
    expect(getSave(id)).toBeUndefined();
    view.setShown(true);
    press('win');
    expect(stats(id).played).toBe(0);
    expect(getProfile().days).toEqual({});
    expect(view.el.querySelector('[data-action="settings"]')!.hasAttribute('hidden')).toBe(true);
  });

  it('starts over with Again', () => {
    view.start('classic', 1);
    view.setShown(true);
    press('win');
    vi.advanceTimersByTime(61_000);
    [...view.el.querySelectorAll<HTMLElement>('.rush-end .btn')].at(-1)!.click();
    expect(score()).toBe('0');
    expect(clock()).toBe('1:00');
  });
});
