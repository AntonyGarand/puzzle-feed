// @vitest-environment happy-dom
// The card around a game, driven through a tiny fake game: it counts mistakes, saves and resumes
// progress, takes moves back, and records the result once the game ends.
import { beforeEach, describe, expect, it } from 'vitest';
import { Card, type CardOptions } from '../src/app/card/card';
import { getSave } from '../src/core/saves';
import { resetProfile, stats } from '../src/core/store';
import type { PuzzleCtx, PuzzleDef } from '../src/core/types';

/**
 * A counter game: "+" moves (the snapshot is the count), "✕" is a mistake, "win" and "lose" end it.
 * Restores its count from `ctx.saved`.
 */
const counter: PuzzleDef = {
  id: 'counter',
  name: 'Counter',
  rules: 'Count up.',
  category: 'logic',
  undo: true,
  par: () => 60,
  create(ctx: PuzzleCtx) {
    let n = typeof ctx.saved === 'object' && ctx.saved && 'n' in ctx.saved ? Number(ctx.saved.n) : 0;
    const shown = document.createElement('output');
    const button = (label: string, onclick: () => void) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.dataset['act'] = label;
      b.addEventListener('click', onclick);
      return b;
    };
    const render = () => (shown.textContent = String(n));
    ctx.root.append(
      shown,
      button('+', () => {
        n++;
        ctx.touch();
        render();
      }),
      button('✕', () => ctx.mistake()),
      button('win', () => ctx.solved()),
      button('lose', () => ctx.failed()),
    );
    render();
    return { snapshot: () => ({ n }) };
  },
};

const tick = () => new Promise((r) => setTimeout(r, 0));

function open(opts: CardOptions = {}) {
  const nexts: Card[] = [];
  const card = new Card(counter, (c) => nexts.push(c), { lab: true, level: 2, ...opts });
  document.body.append(card.el);
  card.setActive(true);
  const press = async (act: string) => {
    card.el.querySelector<HTMLElement>(`[data-act="${act}"]`)!.click();
    await tick(); // the card records undo steps just after each click
  };
  const count = () => card.el.querySelector('output')!.textContent;
  return { card, nexts, press, count };
}

beforeEach(() => {
  localStorage.clear();
  resetProfile();
  document.body.replaceChildren();
});

describe('card', () => {
  it('counts mistakes in the header', async () => {
    const { card, press } = open();
    const mistakes = card.el.querySelector<HTMLElement>('.mistakes')!;
    expect(mistakes.hidden).toBe(true);
    await press('✕');
    await press('✕');
    expect(mistakes.hidden).toBe(false);
    expect(mistakes.textContent).toBe('✕ 2');
  });

  it('saves progress and resumes it on a new card', async () => {
    const a = open();
    await a.press('+');
    await a.press('+');
    await a.press('✕');
    a.card.persist();
    const save = getSave('counter');
    expect(save).toMatchObject({ level: 2, mistakes: 1, state: { n: 2 }, seed: a.card.puzzleSeed });

    document.body.replaceChildren();
    const b = open({ resume: save });
    expect(b.count()).toBe('2');
    expect(b.card.level).toBe(2);
    expect(b.card.el.querySelector('.mistakes')!.textContent).toBe('✕ 1');
    expect(b.card.time()).toBeGreaterThanOrEqual(save!.elapsed);
  });

  it('does not save a puzzle nobody touched', () => {
    const { card } = open();
    card.persist();
    expect(getSave('counter')).toBeUndefined();
  });

  it('takes moves back one at a time, with the button and Ctrl+Z', async () => {
    const { card, press, count } = open();
    const undo = [...card.el.querySelectorAll<HTMLButtonElement>('.card-foot button')].find((b) => b.textContent === 'Undo')!;
    expect(undo.disabled).toBe(true);
    await press('+');
    await press('+');
    await press('+');
    expect(count()).toBe('3');
    expect(undo.disabled).toBe(false);
    card.undo();
    expect(count()).toBe('2');
    expect(card.onKey(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }))).toBe(true);
    expect(count()).toBe('1');
    card.undo();
    card.undo(); // nothing left to take back
    expect(count()).toBe('0');
    expect(undo.disabled).toBe(true);
  });

  it('records a solve once, clears the save and locks the board', async () => {
    const { card, press } = open();
    await press('+');
    card.persist();
    expect(getSave('counter')).toBeDefined();
    await press('win');
    expect(card.done).toBe(true);
    expect(card.el.classList.contains('is-solved')).toBe(true);
    expect(getSave('counter')).toBeUndefined();
    expect(stats('counter')).toMatchObject({ played: 1, solved: 1 });
    expect(card.el.querySelector('.status.result')!.textContent).toContain('Solved');
    expect(card.el.querySelector<HTMLElement>('.puzzle')!.inert).toBe(true);
    // Late callbacks from the finished game are ignored.
    await press('lose');
    expect(stats('counter')).toMatchObject({ played: 1, solved: 1, failed: 0 });
  });

  it('records a loss with its mistakes', async () => {
    const { card, press } = open();
    await press('✕');
    await press('lose');
    expect(card.el.classList.contains('is-failed')).toBe(true);
    expect(stats('counter')).toMatchObject({ played: 1, failed: 1 });
    expect(card.el.querySelector('.status.result')!.textContent).toContain('1 mistake');
  });

  it('stops the clock when the card scrolls away', async () => {
    const { card } = open();
    await new Promise((r) => setTimeout(r, 30));
    card.setActive(false);
    const t = card.time();
    expect(t).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 30));
    expect(card.time()).toBe(t);
  });

  it('deals a new puzzle on "New puzzle" after a finish, and moves on with Next', async () => {
    const { card, nexts, press } = open();
    await press('win');
    const next = [...card.el.querySelectorAll<HTMLButtonElement>('.card-foot button')].find((b) => b.textContent === 'New puzzle');
    next!.click();
    expect(nexts).toEqual([card]);
  });
});
