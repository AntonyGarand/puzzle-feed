import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { genMaze, mazeStats } from '../src/puzzles/pathkit/maze-gen';

// Same tuning as src/puzzles/maze.ts.
const LEVELS = [
  { size: 6, newest: 0.8, braid: 0 },
  { size: 9, newest: 0.75, braid: 0 },
  { size: 12, newest: 0.7, braid: 0.06 },
  { size: 15, newest: 0.65, braid: 0.1 },
  { size: 19, newest: 0.6, braid: 0.15 },
];

const STEPS = [
  { bit: 1, d: (n: number) => -n },
  { bit: 2, d: () => 1 },
  { bit: 4, d: (n: number) => n },
  { bit: 8, d: () => -1 },
];

/** Length of the shortest cycle in the passage graph (Infinity for a perfect maze). */
function girth(open: number[], n: number): number {
  let best = Infinity;
  for (let s = 0; s < n * n; s++) {
    const dist = new Array<number>(n * n).fill(-1);
    const parent = new Array<number>(n * n).fill(-1);
    dist[s] = 0;
    const q = [s];
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      for (const { bit, d } of STEPS) {
        if (!(open[i] & bit)) continue;
        const j = i + d(n);
        if (dist[j] < 0) {
          dist[j] = dist[i] + 1;
          parent[j] = i;
          q.push(j);
        } else if (parent[i] !== j) best = Math.min(best, dist[i] + dist[j] + 1);
      }
    }
  }
  return best;
}

/** Extra passages beyond a spanning tree = independent loops. */
const loops = (open: number[], n: number) => open.reduce((a, v) => a + (v & 2 ? 1 : 0) + (v & 4 ? 1 : 0), 0) - (n * n - 1);

describe('maze generator', () => {
  it.each(LEVELS.map((t, i) => [i + 1, t] as const))('level %i offers real choices along the route', (_lvl, t) => {
    let decisions = 0;
    let length = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const open = genMaze(new Rng(seed), { ...t, tries: 8 });
      const st = mazeStats(open, t.size);
      decisions += st.decisions;
      length += st.pathLength;
    }
    // The old recursive backtracker averaged ~1 decision per 10–12 route cells; require at least 1 per 4.
    expect(decisions / length).toBeGreaterThan(0.25);
  });

  it.each(LEVELS.filter((t) => t.braid > 0).map((t) => [t.size, t] as const))(
    'size %i: loops are real detours, never two parallel corridors around a wall stub',
    (_size, t) => {
      let total = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const open = genMaze(new Rng(seed), { ...t, tries: 8 });
        expect(girth(open, t.size)).toBeGreaterThan(Math.max(8, t.size));
        total += loops(open, t.size);
      }
      // Still braided: at least one loop per maze on average.
      expect(total / 40).toBeGreaterThanOrEqual(1);
    },
  );
});
