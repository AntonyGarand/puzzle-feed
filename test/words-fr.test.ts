// @vitest-environment happy-dom
// The word games in Québec French: generation speed, not solved at start, resume round-trip, a–z only.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { _setLocaleForTests } from '../src/core/i18n';
import { LEVELS, type Difficulty, type PuzzleDef } from '../src/core/types';
import { answers, commonOfLength, fold, isWord, letterKey, whenDict } from '../src/kits/word/lexicon';
import { mountGame, puzzle } from './support/mount';
import { expectResumes } from './support/resume';

const IDS = ['anagram', 'word-guess', 'hunt', 'tower', 'cover'];
const GAMES = IDS.map((id) => [id, puzzle(id)] as const);

beforeAll(() => _setLocaleForTests('fr'));
afterAll(() => _setLocaleForTests('en'));

function make(def: PuzzleDef, d: Difficulty, seed: number, saved?: unknown) {
  const g = mountGame(def, d, seed, { saved });
  const { root, inst } = g;
  return { root, inst, events: g.events, isDone: () => g.outcome !== '' };
}

/** Letters shown on the board (tiles, grid cells, tower rows). */
const shown = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.cell')].map((e) => e.textContent ?? '').join('');

describe('French word data', () => {
  it('folds accents to a–z', () => {
    expect(fold('Élève')).toBe('eleve');
    expect(fold('œuvre')).toBe('oeuvre');
    expect(fold('garçon')).toBe('garcon');
    expect(letterKey('é')).toBe('e');
    expect(letterKey('Ç')).toBe('c');
    expect(letterKey('Enter')).toBeNull();
  });

  it('has plenty of a–z French answers at every length', () => {
    for (const len of [3, 4, 5, 6, 7, 8]) {
      const a = answers(len);
      expect(a.length, `length ${len}`).toBeGreaterThan(100);
      for (const w of a) expect(w).toMatch(new RegExp(`^[a-z]{${len}}$`));
      for (const w of commonOfLength(len)) expect(w).toMatch(/^[a-z]+$/);
    }
    expect(answers(5)).toContain('chien');
    expect(answers(5)).not.toContain('about');
    expect(answers(6)).toContain('maison');
  });

  it('validates French words (accents folded) and rejects non-words', async () => {
    await new Promise<void>((r) => whenDict(r));
    expect(isWord('chien')).toBe(true);
    expect(isWord(fold('élève'))).toBe(true);
    expect(isWord('zqxw')).toBe(false);
    expect(isWord('house')).not.toBe(true);
  });

  it('only accepts familiar short words, Québec words included', async () => {
    await new Promise<void>((r) => whenDict(r));
    for (const w of ['fats', 'let', 'rai', 'ers', 'ohm', 'fat', 'out', 'usa', 'jack']) expect(isWord(w), w).toBe(false);
    for (const w of ['chat', 'lit', 'pis', 'ben', 'job', 'chum', 'tuque', 'pogne', 'niaiser', 'igloo', 'faon'])
      expect(isWord(w), w).toBe(true);
    for (const w of commonOfLength(3)) expect(isWord(w), w).toBe(true);
  });
});

describe.each(GAMES)('%s (fr)', (_id, def) => {
  it('is localized with French name, rules and tutorial', () => {
    expect(def.localized).toBe(true);
    expect(def.rules.length).toBeLessThanOrEqual(60);
    expect(def.help?.().steps.length).toBeGreaterThanOrEqual(3);
  });

  it.each(LEVELS)('generates quickly, unsolved and a–z only at level %i', (d) => {
    for (let seed = 1; seed <= 15; seed++) {
      const t = performance.now();
      const { root, inst, events } = make(def, d, seed * 7919 + d);
      const ms = performance.now() - t;
      expect(ms, `seed ${seed} took ${ms.toFixed(0)}ms`).toBeLessThan(1500);
      expect(root.childElementCount).toBeGreaterThan(0);
      expect(events).toEqual([]);
      expect(shown(root)).toMatch(/^[a-z]*$/);
      inst.destroy?.();
    }
  });

  it.each([1, 3, 5] as Difficulty[])('resumes at level %i', (d) => expectResumes(def, d));
});
