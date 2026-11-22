import { expect } from 'vitest';
import { Rng } from '../../src/core/rng';
import type { Difficulty, PuzzleDef } from '../../src/core/types';
import { boardView, mountGame } from './mount';

/**
 * Resume round trip: play a few random taps, save with `snapshot()` (through JSON, like localStorage),
 * mount the same seed from that save, and expect the exact same board. Finished games aren't saved, so a
 * seed whose taps end the game is retried with fewer taps (down to the fresh board), then with more seeds.
 */
export function expectResumes(def: PuzzleDef, d: Difficulty) {
  let compared = 0;
  for (let seed = 11; seed < 16 || (compared === 0 && seed < 40); seed++)
    for (const taps of [6, 2, 0]) {
      const a = mountGame(def, d, seed);
      const pick = new Rng(seed * 31);
      for (let k = 0; k < taps && !a.outcome; k++) {
        const buttons = [...a.root.querySelectorAll<HTMLButtonElement>('button')];
        if (!buttons.length) break;
        pick.pick(buttons).click();
      }
      if (a.outcome) {
        a.inst.destroy?.();
        continue;
      }
      const snap: unknown = JSON.parse(JSON.stringify(a.inst.snapshot?.() ?? null));
      expect(snap, 'puzzle must implement snapshot()').not.toBeNull();
      const b = mountGame(def, d, seed, { saved: snap });
      const before = boardView(a.root).split('\n');
      const after = boardView(b.root).split('\n');
      expect(before.join(''), 'empty board').not.toBe('');
      // Report the first differing element only: a full-board string diff is huge and slow.
      const at = before.findIndex((line, i) => line !== after[i]);
      const first = (lines: string[]) => (at < 0 ? '' : `element ${at}: ${lines[at] ?? '(missing)'}`);
      expect(first(after), `seed ${seed}, ${taps} taps`).toBe(first(before));
      expect(after.length, `seed ${seed}, ${taps} taps`).toBe(before.length);
      a.inst.destroy?.();
      b.inst.destroy?.();
      compared++;
      break;
    }
  expect(compared, 'no unfinished board to resume').toBeGreaterThan(0);
}
