// @vitest-environment happy-dom
import { describe, it } from 'vitest';
import type { Difficulty } from '../src/core/types';
import { PUZZLES } from '../src/games';
import { expectResumes } from './support/resume';

// Memory deliberately restarts its reveal on resume (same board, same seed).
describe.each(PUZZLES.filter((p) => p.id !== 'memory').map((p) => [p.id, p] as const))('%s resumes', (_id, def) => {
  it.each([1, 3, 5] as Difficulty[])('level %i', (d) => expectResumes(def, d));
});
