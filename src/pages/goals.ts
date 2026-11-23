import { GOAL_GROUPS, goalStates, weekly, type GoalState } from '../core/goals';
import { L, localeTag, P } from '../core/i18n';
import type { PuzzleDef } from '../core/types';
import { h } from '../ui/dom';

const bar = (v: number) => h('div', { class: 'goal-bar', 'aria-hidden': 'true' }, h('i', { style: `--v:${Math.max(0, Math.min(1, v))}` }));

/** "This week: 12 / 20 solved", or null when the weekly target is off. */
export function weeklyBar(): HTMLElement | null {
  const w = weekly();
  if (!w.target) return null;
  const done = w.solved >= w.target;
  return h(
    'div',
    { class: `weekly ${done ? 'done' : ''}` },
    h(
      'div',
      { class: 'weekly-head' },
      h('span', null, L('This week', 'Cette semaine')),
      h(
        'span',
        { class: done ? 'good' : '' },
        `${w.solved} / ${P(w.target, ['solved', 'solved'], ['réussie', 'réussies'])}${done ? ' ✓' : ''}`,
      ),
    ),
    bar(w.solved / w.target),
  );
}

function goalItem(s: GoalState): HTMLElement {
  const date = s.at ? new Date(s.at).toLocaleDateString(localeTag(), { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  return h(
    'li',
    { class: `goal ${s.done ? 'done' : ''}`, 'data-goal': s.goal.id },
    h(
      'div',
      { class: 'goal-head' },
      h('span', null, s.goal.name()),
      h('span', { class: 'num' }, s.done ? `✓ ${date}` : `${s.have} / ${s.need}`),
    ),
    h('div', { class: 'goal-desc' }, s.goal.desc()),
    s.done ? null : bar(s.have / s.need),
  );
}

/** Goals in progress grouped by theme, then the earned ones folded away. */
export function goalsSection(defs: PuzzleDef[]): HTMLElement[] {
  const all = goalStates(defs);
  const earned = all.filter((s) => s.done).sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  // Of a series of tiers (solve 10, 100, 500…), only the next one to earn.
  const series = new Set<string>();
  const next = all.filter((s) => {
    if (s.done) return false;
    const key = s.goal.id.replace(/-\d+$/, '');
    if (series.has(key)) return false;
    series.add(key);
    return true;
  });
  const groups = GOAL_GROUPS.map((g) => ({ g, open: next.filter((s) => s.goal.group === g.id) })).filter((x) => x.open.length);
  const out: (HTMLElement | null)[] = [
    h('h3', null, L('Goals', 'Objectifs'), h('span', { class: 'muted small' }, ` · ${earned.length} / ${all.length}`)),
    ...groups.map(({ g, open }) =>
      h('div', { class: 'goal-group' }, h('h4', null, g.name()), h('ul', { class: 'goals' }, ...open.map(goalItem))),
    ),
    earned.length
      ? h(
          'details',
          { class: 'goals-done' },
          h('summary', null, L(`Earned (${earned.length})`, `Obtenus (${earned.length})`)),
          h('ul', { class: 'goals' }, ...earned.map(goalItem)),
        )
      : null,
  ];
  return out.filter((x): x is HTMLElement => !!x);
}
