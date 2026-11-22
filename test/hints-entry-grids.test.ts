// @vitest-environment happy-dom
/**
 * Hint button on the entry grids (sudoku family, latin squares, singles, eclipse): every level, with
 * keyboard-typed wrong digits (which the random taps of hints.test.ts rarely produce), check() never
 * changes the board, and the button alone always finishes.
 */
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { Difficulty, PuzzleDef, PuzzleInstance } from '../src/core/types';
import { mountGame, puzzle } from './support/mount';

const IDS = ['jigsaw-sudoku', 'killer-sudoku', 'cross-sums', 'math-cages', 'skyscrapers', 'unequal', 'singles', 'eclipse'];
const SLOW_MS = 1500;

function make(def: PuzzleDef, d: Difficulty, seed: number) {
  const g = mountGame(def, d, seed, { attach: true, controlsInRoot: true });
  const { root, inst } = g;
  inst.activate?.();
  return { root, inst, outcome: () => g.outcome, destroy: () => root.remove() };
}

/** Select random cells and type random keys (digits, and for eclipse 1/2/Space/Backspace). */
function typeJunk(g: ReturnType<typeof make>, rng: Rng, k: number) {
  const cells = [...g.root.querySelectorAll<HTMLElement>('button.cell')];
  for (let t = 0; t < k && !g.outcome(); t++) {
    rng.pick(cells).click();
    const key = rng.pick(['1', '2', '3', '4', '5', '6', '7', '8', '9', ' ', 'Backspace']);
    g.inst.onKey?.(new KeyboardEvent('keydown', { key }));
  }
}

const json = (inst: PuzzleInstance) => JSON.stringify(inst.snapshot?.());

describe.each(IDS)('%s', (id) => {
  const def = puzzle(id);
  it.each([1, 2, 3, 4, 5] as Difficulty[])(
    'level %i: finishes from a clean board and after typed mistakes',
    (d) => {
      for (let seed = 1; seed <= 4; seed++) {
        for (const junk of [0, 8, 40]) {
          const g = make(def, d, seed * 7717 + d * 13 + junk);
          typeJunk(g, new Rng(seed + junk), junk);
          const log: string[] = [];
          for (let step = 0; step < 400 && !g.outcome(); step++) {
            const before = json(g.inst);
            let t = performance.now();
            const c = g.inst.check!();
            expect(performance.now() - t, 'check() time').toBeLessThan(SLOW_MS);
            expect(json(g.inst), 'check() changed the board').toBe(before);
            if (!junk && c) throw new Error(`check() flagged a guided board: ${c.text}`);
            t = performance.now();
            const h = c ?? g.inst.hint!();
            expect(performance.now() - t, 'hint() time').toBeLessThan(SLOW_MS);
            if (!h) break;
            log.push(`[${h.kind ?? 'step'}] ${h.text}`);
            h.play();
            expect(json(g.inst), `hint did nothing: ${h.text}`).not.toBe(before);
          }
          expect(g.outcome(), `seed ${seed} junk ${junk}:\n${log.slice(-5).join('\n')}`).toBe('solved');
          g.destroy();
        }
      }
    },
    120_000,
  );
});
