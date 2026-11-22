import { L, localeTag } from '../core/i18n';
import { dayKey, stats, totalXp, xpByDay } from '../core/store';
import type { PuzzleDef } from '../core/types';
import { h, s, segmented } from '../core/ui';
import { xpLevel } from '../core/xp';

const WEEKS = 26;
type Range = 30 | 90 | 365;

/** Local days (`dayKey`) from `n - 1` days ago up to today, oldest first. */
function lastDays(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const t = new Date();
    t.setDate(t.getDate() - i);
    out.push(dayKey(t.getTime()));
  }
  return out;
}

const dayDate = (k: string) => new Date(`${k}T12:00:00`);
const fmtDay = (k: string, long = false) =>
  dayDate(k).toLocaleDateString(
    localeTag(),
    long ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' },
  );

/**
 * "XP progress" on the Profile page: pick Total or one game, then a calendar heatmap of XP per day
 * (last 26 weeks) and a line of cumulative XP with the level thresholds it crossed.
 */
export function xpProgress(defs: PuzzleDef[]): HTMLElement {
  const games = defs.filter((d) => stats(d.id).xp! > 0).sort((a, b) => stats(b.id).xp! - stats(a.id).xp!);
  let scope = '';
  let range: Range = 90;

  const tip = h('div', { class: 'xp-tip', hidden: true });
  const heat = h('div', { class: 'xp-heat-wrap' });
  const line = h('div', { class: 'xp-line-wrap' });
  const summary = h('p', { class: 'muted small xp-summary' });

  const showTip = (host: HTMLElement, x: number, y: number, lines: (string | HTMLElement)[]) => {
    tip.replaceChildren(...lines.map((l) => h('div', null, l)));
    tip.hidden = false;
    const box = root.getBoundingClientRect();
    const hb = host.getBoundingClientRect();
    const left = Math.min(Math.max(hb.left - box.left + x, 60), box.width - 60);
    tip.style.left = `${left}px`;
    tip.style.top = `${hb.top - box.top + y}px`;
  };
  const hideTip = () => (tip.hidden = true);

  const draw = () => {
    hideTip();
    const byDay = xpByDay(scope || undefined);
    const total = scope ? stats(scope).xp! : totalXp();
    const lv = xpLevel(total);
    const tracked = [...byDay.values()].reduce((a, b) => a + b, 0);
    summary.textContent = L(
      `Level ${lv.level} · ${total} XP · ${lv.need - lv.into} XP to level ${lv.level + 1}`,
      `Niveau ${lv.level} · ${total} XP · encore ${lv.need - lv.into} XP pour le niveau ${lv.level + 1}`,
    );
    drawHeat(byDay);
    drawLine(byDay, total - tracked);
  };

  // ---- calendar heatmap: columns are weeks (Monday first), rows are weekdays ----
  const drawHeat = (byDay: Map<string, number>) => {
    const today = new Date();
    const dow = (today.getDay() + 6) % 7; // 0 = Monday
    const days = lastDays(WEEKS * 7 - (6 - dow)); // ends today, starts on a Monday
    const vals = days.map((k) => byDay.get(k) ?? 0);
    const max = Math.max(1, ...vals);
    // 4 steps of one hue (plus empty), quantised so a single big day doesn't wash the rest out.
    const step = (v: number) => (v <= 0 ? 0 : Math.min(4, Math.ceil((4 * v) / max)));
    const grid = h('div', {
      class: 'xp-heat',
      role: 'img',
      'aria-label': L('XP per day, last 26 weeks', 'XP par jour, 26 dernières semaines'),
    });
    const months = h('div', { class: 'xp-months', 'aria-hidden': 'true' });
    // Month names over the first week of each month, unless the previous label is too close.
    let lastMonth = -1;
    let lastLabel = -9;
    days.forEach((k, i) => {
      const v = vals[i];
      const cell = h('span', { class: 'xp-cell', 'data-step': step(v), 'data-day': k });
      cell.addEventListener('pointerenter', () => showTip(cell, cell.offsetWidth / 2, -6, [h('b', null, `${v} XP`), fmtDay(k, true)]));
      cell.addEventListener('pointerleave', hideTip);
      grid.append(cell);
      if (i % 7 === 0) {
        const m = dayDate(k).getMonth();
        const w = i / 7;
        // Skip a first column whose month ends within the week, and labels closer than 3 weeks.
        const show = m !== lastMonth && w - lastLabel >= 3 && !(w === 0 && dayDate(days[7]).getMonth() !== m);
        months.append(h('span', null, show ? dayDate(k).toLocaleDateString(localeTag(), { month: 'short' }) : ''));
        if (show) lastLabel = w;
        lastMonth = m;
      }
    });
    const legend = h(
      'div',
      { class: 'xp-legend', 'aria-hidden': 'true' },
      L('Less', 'Moins'),
      ...[0, 1, 2, 3, 4].map((n) => h('span', { class: 'xp-cell', 'data-step': n })),
      L('More', 'Plus'),
    );
    heat.replaceChildren(h('div', { class: 'xp-heat-scroll' }, months, grid), legend);
  };

  // ---- cumulative XP line, with dashed level thresholds ----
  const drawLine = (byDay: Map<string, number>, baseline: number) => {
    const W = Math.max(260, line.clientWidth || 340);
    const H = 190;
    const pad = { l: 8, r: 46, t: 12, b: 24 };
    const all = [...byDay.keys()].sort();
    const n = range;
    const days = lastDays(n);
    // XP before the window: baseline plus every tracked day before it.
    let run = baseline;
    for (const k of all) if (k < days[0]) run += byDay.get(k)!;
    const pts = days.map((k) => (run += byDay.get(k) ?? 0));
    const lo = Math.min(...pts);
    const hi = Math.max(...pts, lo + 50);
    const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / (n - 1);
    const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);

    const svg = s('svg', { class: 'xp-line', width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img' });
    svg.setAttribute('aria-label', L(`Total XP over the last ${n} days`, `XP total sur les ${n} derniers jours`));
    // Level thresholds inside the visible band (recessive grid lines, labelled on the right).
    let acc = 0;
    for (let level = 1; acc <= hi; level++) {
      if (acc >= lo && acc <= hi) {
        svg.append(
          s('line', { class: 'xp-grid', x1: pad.l, x2: W - pad.r, y1: y(acc), y2: y(acc) }),
          s('text', { class: 'xp-axis', x: W - pad.r + 6, y: y(acc) + 4 }, `${L('Lv', 'Niv.')} ${level}`),
        );
      }
      acc += 100 + 50 * (level - 1);
    }
    svg.append(s('line', { class: 'xp-base', x1: pad.l, x2: W - pad.r, y1: H - pad.b, y2: H - pad.b }));
    const path = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    svg.append(
      s('path', { class: 'xp-area', d: `${path}L${x(n - 1)},${H - pad.b}L${x(0)},${H - pad.b}Z` }),
      s('path', { class: 'xp-path', d: path }),
    );
    for (const i of [0, Math.floor((n - 1) / 2), n - 1])
      svg.append(
        s(
          'text',
          { class: 'xp-axis', x: x(i), y: H - 6, 'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' },
          fmtDay(days[i]),
        ),
      );
    svg.append(s('text', { class: 'xp-axis strong', x: W - pad.r + 6, y: y(pts[n - 1]) + 4 }, String(pts[n - 1])));

    // Crosshair + dot + tooltip on hover/drag.
    const cross = s('line', { class: 'xp-cross', y1: pad.t, y2: H - pad.b, visibility: 'hidden' });
    const dot = s('circle', { class: 'xp-dot', r: 5, visibility: 'hidden' });
    svg.append(cross, dot);
    const hit = s('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent' });
    const move = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      const i = Math.round(((e.clientX - r.left - pad.l) / (W - pad.l - pad.r)) * (n - 1));
      if (i < 0 || i >= n) return;
      for (const el of [cross, dot]) el.setAttribute('visibility', 'visible');
      cross.setAttribute('x1', String(x(i)));
      cross.setAttribute('x2', String(x(i)));
      dot.setAttribute('cx', String(x(i)));
      dot.setAttribute('cy', String(y(pts[i])));
      const gained = byDay.get(days[i]) ?? 0;
      showTip(line, x(i), y(pts[i]) - 10, [
        h('b', null, `${pts[i]} XP · ${L('Lv', 'Niv.')} ${xpLevel(pts[i]).level}`),
        `${fmtDay(days[i], true)} · +${gained}`,
      ]);
    };
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', () => {
      for (const el of [cross, dot]) el.setAttribute('visibility', 'hidden');
      hideTip();
    });
    svg.append(hit);
    line.replaceChildren(svg);
  };

  const select = h(
    'select',
    { class: 'select', 'aria-label': L('Show XP for', 'Afficher l’XP de') },
    h('option', { value: '' }, L('All games', 'Tous les jeux')),
    ...games.map((d) => h('option', { value: d.id }, `${d.name} · ${L('Lv', 'Niv.')} ${xpLevel(stats(d.id).xp!).level}`)),
  );
  select.addEventListener('change', () => {
    scope = select.value;
    draw();
  });
  const ranges = segmented<Range>(
    [
      { label: L('30 days', '30 jours'), value: 30 },
      { label: L('90 days', '90 jours'), value: 90 },
      { label: L('1 year', '1 an'), value: 365 },
    ],
    range,
    (v) => {
      range = v;
      draw();
    },
  );

  const root = h(
    'section',
    { class: 'xp-progress' },
    h('div', { class: 'xp-filters' }, select),
    summary,
    heat,
    h('div', { class: 'xp-filters' }, ranges),
    line,
    tip,
  );
  // The line chart is drawn at its real width: redraw once attached and whenever that width changes.
  let lastW = 0;
  new ResizeObserver(() => {
    if (line.clientWidth && line.clientWidth !== lastW) {
      lastW = line.clientWidth;
      draw();
    }
  }).observe(line);
  draw();
  return root;
}
