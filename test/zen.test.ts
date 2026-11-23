// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { lostCard, winCard } from '../src/ui/win';
import { mountGame } from './support/mount';

/** Answer every Hidden Rule pattern wrong: the opposite of the key the hint points at. */
function answerAllWrong(zen: boolean) {
  const g = mountGame('hidden-rule', 1, 7, { zen });
  for (let i = 0; i < 50 && !g.outcome; i++) {
    const right = g.inst.hint?.()?.at[0] as HTMLElement | undefined;
    if (!right) break;
    const wrong = g.root.querySelector<HTMLElement>(right.classList.contains('hr-yes') ? '.hr-no' : '.hr-yes')!;
    wrong.click();
  }
  return g;
}

describe('Zen mode', () => {
  it('lives never run out', () => {
    expect(answerAllWrong(false).outcome).toBe('failed');
    const zen = answerAllWrong(true);
    expect(zen.outcome).toBe('solved');
    expect(zen.events.filter((e) => e === 'mistake').length).toBeGreaterThan(3);
  });

  it('win and loss panels show no scores', () => {
    const common = { name: 'Sudoku', level: 'Easy', ms: 61_000, mistakes: 2, hints: 1, zen: true };
    const win = winCard({ ...common, parMs: 90_000, solved: 4, res: { best: true, prevBest: 70_000 } });
    expect(win.querySelector('.win-time, .win-stats, .win-xp')).toBeNull();
    expect(win.querySelector('.win-sub')!.textContent).toBe('Sudoku · Easy');
    const lost = lostCard({ ...common, best: 50_000, played: 3, solved: 2 });
    expect(lost.querySelector('.win-time, .win-stats')).toBeNull();
    expect(winCard({ ...common, zen: false, parMs: 90_000, solved: 4, res: null }).querySelector('.win-stats')).not.toBeNull();
  });
});
