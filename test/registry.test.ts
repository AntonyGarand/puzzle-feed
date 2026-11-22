// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '../src/core/categories';
import { PUZZLES } from '../src/games';

describe('registry', () => {
  it('has unique ids and known categories', () => {
    const ids = PUZZLES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PUZZLES)
      expect(
        CATEGORIES.map((c) => c.id),
        p.id,
      ).toContain(p.category);
  });
  it('gives every puzzle a short one-line rule', () => {
    for (const p of PUZZLES) expect(p.rules.length, p.id).toBeLessThanOrEqual(60);
  });
});
