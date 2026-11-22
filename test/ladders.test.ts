// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { byLevel, LEVELS } from '../src/core/types';
import { destsL, genL, LADDER_LEVELS, moveL, playLineL, solveL, type LState } from '../src/games/ladders/rules';
import { ladders } from '../src/games/ladders/index';
import { mountGame } from './support/mount';

/** Card id: suit (0 ♠, 1 ♥, 2 ♦, 3 ♣) * 13 + rank - 1. */
const C = (suit: number, rank: number) => suit * 13 + rank - 1;

describe('ladders', () => {
  it('only deals games the solver has won', () => {
    for (const d of LEVELS)
      for (let k = 1; k <= 12; k++) {
        const s = genL(new Rng(k * 7919 + d), byLevel(d, LADDER_LEVELS));
        const r = solveL(s, 20000);
        expect(r.v, `level ${d} seed ${k}`).toBe('win');
        expect(playLineL(s, r.v === 'win' ? r.line : [])).toBe(true);
      }
  }, 60_000);

  it('builds winnable deals when no random deal is proven', () => {
    for (const d of LEVELS)
      for (let k = 1; k <= 6; k++) {
        const s = genL(new Rng(k * 31 + d), byLevel(d, LADDER_LEVELS), 3000, 0);
        expect(solveL(s, 50000).v, `level ${d} seed ${k}`).toBe('win');
      }
  }, 60_000);

  it('moves a card onto one rank higher of another suit, with its ladder', () => {
    const s: LState = {
      cols: [[C(0, 10)], [C(2, 10), C(1, 9), C(0, 8)], [C(1, 10)], []],
      cells: [-1],
      done: [],
      low: 8,
      moves: 0,
    };
    expect(moveL(s, 't1', 1, 't2', true)).toBe(false); // 9♥ on 10♥: same suit
    expect(moveL(s, 't1', 0, 't3', true)).toBe(false); // only a king fills an empty column
    expect(moveL(s, 't1', 1, 't0', true)).toBe(true); // 9♥ + 8♠ on 10♠
    expect(destsL(s, 't1', 2)).toEqual(['c0']); // 8♠ alone: no 9 open, so the free cell
    expect(moveL(s, 't1', 1, 't0')).toBe(true);
    expect(s.cols[0]).toEqual([C(0, 10), C(1, 9), C(0, 8)]);
  });

  it('collects a finished ladder and proves a dead end', () => {
    const s: LState = {
      cols: [[C(0, 13), C(1, 12)], [C(3, 11)]],
      cells: [],
      done: [C(1, 13), C(2, 13), C(3, 13)],
      low: 11,
      moves: 0,
    };
    // Low 11: a ladder is K, Q, J. J♣ on Q♥ finishes K♠ Q♥ J♣.
    expect(moveL(s, 't1', 0, 't0')).toBe(true);
    expect(s.done.length).toBe(4);
    expect(s.cols[0]).toEqual([]);
  });

  it('warns when the game is lost but moves remain', () => {
    // Two columns: Q♥ blocks K♥ under it; J♠ can only shuttle between the free cell and the Q♥.
    const s: LState = { cols: [[C(1, 13), C(1, 12)], [C(0, 11)]], cells: [-1], done: [C(0, 13), C(2, 13), C(3, 13)], low: 11, moves: 3 };
    expect(solveL(s, 5000).v).toBe('dead');
  });

  it('cycles a re-tapped card to its next spot', () => {
    const saved = {
      s: {
        cols: [
          [C(0, 12), C(0, 10)],
          [C(1, 12), C(2, 10)],
          [C(1, 11), C(3, 9)],
          [C(3, 13), C(3, 12), C(3, 11), C(3, 10), C(0, 9), C(1, 9), C(2, 9)],
          [C(1, 13), C(2, 13), C(0, 11), C(2, 11), C(1, 10)],
          [C(0, 13), C(2, 12)],
        ],
        cells: [-1, -1],
        done: [],
        low: 9,
        moves: 0,
      },
      hist: [],
    };
    const { root } = mountGame(ladders, 1, 1, { saved });
    const tap = (p: string, i: number) => root.querySelector<HTMLElement>(`[data-p="${p}"][data-i="${i}"]`)!.click();
    tap('t2', 1); // 9♣ → the 10♥ (longest ladder) first; 10♠ and 10♦ also fit
    const find = () => [...root.querySelectorAll<HTMLElement>('.pc')].find((e) => e.getAttribute('aria-label')?.startsWith('9♣'))!;
    expect(find().dataset['p']).toBe('t4');
    tap('t4', 5);
    expect(find().dataset['p']).toBe('t0');
    tap('t0', 2);
    expect(find().dataset['p']).toBe('t1');
  });
});
