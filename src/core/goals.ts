import { CATEGORIES, type CategoryId } from './categories';
import { dailyStats, shiftDate } from './daily';
import { L, P } from './i18n';
import { dayKey, getProfile, setGoalState, totalXp, type Profile } from './store';
import type { PuzzleDef } from './types';
import { xpLevel } from './xp';

/**
 * Goals (achievements): long-term targets computed from what the profile already records, so a
 * profile from before goals existed starts with everything it already earned. Unlocks are stored
 * once (`profile.goals`), with when they happened.
 */

type Defs = Pick<PuzzleDef, 'id' | 'category'>[];

export type GoalGroup = 'solves' | 'variety' | 'category' | 'master' | 'daily' | 'xp';

export interface Goal {
  id: string;
  group: GoalGroup;
  name(): string;
  desc(): string;
  target: number;
  /** Current count towards `target` (may go past it). */
  progress(p: Profile, defs: Defs): number;
}

/** Group headings, in display order. */
export const GOAL_GROUPS: { id: GoalGroup; name: () => string }[] = [
  { id: 'solves', name: () => L('Puzzles solved', 'Parties réussies') },
  { id: 'variety', name: () => L('Variety', 'Variété') },
  { id: 'category', name: () => L('Categories', 'Catégories') },
  { id: 'master', name: () => L('Master', 'Maître') },
  { id: 'daily', name: () => L('Daily challenges', 'Défis du jour') },
  { id: 'xp', name: () => L('Player level', 'Niveau joueur') },
];

const solvedGames = (p: Profile, defs: Defs) => defs.filter((d) => (p.stats[d.id]?.solved ?? 0) > 0);
const totalSolved = (p: Profile) => Object.values(p.stats).reduce((a, s) => a + s.solved, 0);

function tiers(
  group: GoalGroup,
  targets: number[],
  progress: Goal['progress'],
  name: (n: number, i: number) => string,
  desc: (n: number) => string,
): Goal[] {
  return targets.map((target, i) => ({
    id: `${group}-${target}`,
    group,
    target,
    progress,
    name: () => name(target, i),
    desc: () => desc(target),
  }));
}

function buildGoals(): Goal[] {
  const out: Goal[] = [
    ...tiers(
      'solves',
      [10, 100, 500, 1000],
      totalSolved,
      (_, i) =>
        [
          L('Warming up', 'Réchauffement'),
          L('Regular', 'Habitué'),
          L('Devoted', 'Passionné'),
          L('Puzzle machine', 'Machine à casse-têtes'),
        ][i],
      (n) => L(`Solve ${n} puzzles.`, `Réussissez ${n} parties.`),
    ),
    ...tiers(
      'variety',
      [10, 25],
      (p, defs) => solvedGames(p, defs).length,
      (_, i) => [L('Sampler', 'Dégustation'), L('Explorer', 'Explorateur')][i],
      (n) => L(`Solve ${n} different games.`, `Réussissez ${n} jeux différents.`),
    ),
    {
      id: 'variety-all',
      group: 'variety',
      target: 0, // every game: resolved against the registered games in goalTarget()
      progress: (p, defs) => solvedGames(p, defs).length,
      name: () => L('Completionist', 'Collectionneur'),
      desc: () => L('Solve every game at least once.', 'Réussissez chaque jeu au moins une fois.'),
    },
    ...CATEGORIES.map((c): Goal => ({
      id: `category-${c.id}`,
      group: 'category',
      target: 0, // every game of the category
      progress: (p, defs) => solvedGames(p, defs).filter((d) => d.category === c.id).length,
      name: () => c.name,
      desc: () => L(`Solve every ${c.name} game.`, `Réussissez tous les jeux « ${c.name} ».`),
    })),
    ...tiers(
      'master',
      [1, 10, 25],
      (p, defs) => defs.filter((d) => p.stats[d.id]?.best[5] != null).length,
      (_, i) => [L('Master', 'Maître'), L('Grandmaster', 'Grand maître'), L('Legend', 'Légende')][i],
      (n) =>
        n === 1
          ? L('Solve a puzzle on Master.', 'Réussissez une partie au niveau Maître.')
          : L(`Solve ${n} different games on Master.`, `Réussissez ${n} jeux différents au niveau Maître.`),
    ),
    ...tiers(
      'daily',
      [1, 10, 50],
      () => dailyStats().completed,
      (_, i) => [L('Daily player', 'Joueur du jour'), L('Daily regular', 'Habitué des défis'), L('Daily devotee', 'Mordu des défis')][i],
      (n) => {
        const lists = P(n, ['daily list', 'daily lists'], ['liste de défis', 'listes de défis']);
        return L(`Complete ${lists}.`, `Terminez ${lists}.`);
      },
    ),
  ];
  // Daily streaks have their own ids (the `daily-<n>` ids are taken by the list counts).
  for (const [target, name] of [
    [7, () => L('Week of dailies', 'Semaine de défis')],
    [30, () => L('Month of dailies', 'Mois de défis')],
  ] as const)
    out.push({
      id: `daily-streak-${target}`,
      group: 'daily',
      target,
      progress: () => dailyStats().bestStreak,
      name,
      desc: () => L(`Complete a daily list ${target} days in a row.`, `Terminez une liste de défis ${target} jours de suite.`),
    });
  out.push(
    ...tiers(
      'xp',
      [5, 10, 25],
      () => xpLevel(totalXp()).level,
      (n) => L(`Level ${n}`, `Niveau ${n}`),
      (n) => L(`Reach player level ${n}.`, `Atteignez le niveau joueur ${n}.`),
    ),
  );
  return out;
}

/** Every goal. New features (puzzle rush, packs…) add their goals to `buildGoals()`. */
const GOALS: Goal[] = buildGoals();

export const allGoals = (): readonly Goal[] => GOALS;

/** The target of `g` among `defs` (goals over "every game" depend on the registered games). */
export function goalTarget(g: Goal, defs: Defs): number {
  if (g.target) return g.target;
  if (g.id === 'variety-all') return defs.length;
  const cat = g.id.startsWith('category-') ? (g.id.slice('category-'.length) as CategoryId) : null;
  return cat ? defs.filter((d) => d.category === cat).length : 0;
}

export interface GoalState {
  goal: Goal;
  have: number;
  need: number;
  done: boolean;
  /** When it was unlocked (0: before goals existed), if it was. */
  at?: number;
}

/** Every goal with its progress (goals over an empty set of games, e.g. a category without games, are left out). */
export function goalStates(defs: Defs, p: Profile = getProfile()): GoalState[] {
  return GOALS.flatMap((goal) => {
    const need = goalTarget(goal, defs);
    if (need <= 0) return [];
    const have = Math.min(need, goal.progress(p, defs));
    const at = p.goals?.[goal.id];
    return [{ goal, have, need, done: have >= need, ...(at != null ? { at } : {}) }];
  });
}

// ---------- weekly target ----------

/** Weekly target choices; 0 turns it off. */
export const WEEKLY_CHOICES = [0, 10, 20, 40] as const;
export const DEFAULT_WEEKLY = 20;

/** The seven `dayKey` days (Monday first) of the week holding time `t`. */
export function weekDays(t = Date.now()): string[] {
  const today = dayKey(t);
  const [y, m, d] = today.split('-').map(Number);
  const back = (new Date(y, m - 1, d).getDay() + 6) % 7; // Monday = 0
  const monday = shiftDate(today, -back);
  return Array.from({ length: 7 }, (_, i) => shiftDate(monday, i));
}

export interface Weekly {
  /** Monday's day key: identifies the week. */
  week: string;
  solved: number;
  target: number;
}

export function weekly(t = Date.now(), p: Profile = getProfile()): Weekly {
  const days = weekDays(t);
  return {
    week: days[0],
    solved: days.reduce((a, k) => a + (p.days[k] ?? 0), 0),
    target: p.weekly ?? DEFAULT_WEEKLY,
  };
}

// ---------- unlocks ----------

export interface GoalNews {
  unlocked: Goal[];
  /** The weekly target was just reached. */
  weekly?: Weekly;
}

/**
 * Store newly completed goals and a newly reached weekly target, and return them (for a toast).
 * The first check on a profile records what it already earned silently (dated 0); a `quiet` check
 * (at startup, e.g. goals added by a new version) records without announcing.
 */
export function checkGoals(defs: Defs, t = Date.now(), quiet = false): GoalNews {
  const p = getProfile();
  const first = !p.goals;
  const goals = { ...p.goals };
  const unlocked: Goal[] = [];
  let changed = first;
  for (const s of goalStates(defs, p)) {
    if (!s.done || goals[s.goal.id] != null) continue;
    goals[s.goal.id] = first ? 0 : t;
    changed = true;
    if (!first && !quiet) unlocked.push(s.goal);
  }
  const w = weekly(t, p);
  const reached = w.target > 0 && w.solved >= w.target && p.weeklyDone !== w.week;
  if (changed || reached) setGoalState(goals, reached ? w.week : p.weeklyDone);
  return { unlocked, ...(reached && !first && !quiet ? { weekly: w } : {}) };
}
