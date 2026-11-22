import { L, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { h, s } from '../core/ui';
import { capture } from './pathkit/grid';
import { crossingEdges, genUntangle, type Pt } from './pathkit/untangle-gen';
import './untangle.css';

export const untangle: PuzzleDef = {
  id: 'untangle',
  get name() {
    return L('Untangle', 'Démêler');
  },
  category: 'paths',
  undo: true,
  get rules() {
    return L('Drag the points until no lines cross.', 'Glissez les points pour qu’aucune ligne ne se croise.');
  },
  help: () => ({
    goal: L(
      'Move the points so that no two lines cross. Each line stays attached to its two points.',
      'Déplacez les points pour qu’aucune ligne n’en croise une autre. Chaque ligne reste attachée à ses deux points.',
    ),
    steps: [
      L(
        'Drag a point anywhere in the square; its lines follow it.',
        'Glissez un point n’importe où dans le carré : ses lignes le suivent.',
      ),
      L('Lines that cross another line are shown in red.', 'Les lignes qui en croisent une autre sont en rouge.'),
      L('The status line counts the crossing lines left.', 'La ligne d’état compte les lignes croisées restantes.'),
      L(
        'The puzzle is solved when you let go of a point and nothing crosses.',
        'Le casse-tête est résolu quand vous relâchez un point et que plus rien ne se croise.',
      ),
    ],
    tips: [
      L(
        'Pull a point with few lines out of the tangle first, then place the busier points around it.',
        'Sortez d’abord du fouillis un point qui a peu de lignes, puis placez les points plus chargés autour.',
      ),
      L(
        'Use the whole square: spread the points out, then tidy up.',
        'Servez-vous de tout le carré : étalez les points, puis faites le ménage.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [15, 30, 50, 80, 130]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const { edges, start, solution } = genUntangle(rng, d);
    const V = start.length;
    const pos: Pt[] = start.map((p) => ({ ...p }));
    const sv = ctx.saved as { pos?: unknown } | undefined;
    if (Array.isArray(sv?.pos) && sv.pos.length === V) {
      const ok = sv.pos.every((p) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && v >= 0 && v <= 100));
      if (ok) (sv.pos as number[][]).forEach(([x, y], i) => (pos[i] = { x, y }));
    }

    const r = byLevel(d, [4.2, 3.9, 3.6, 3.3, 3]);
    const svg = s('svg', { class: 'untangle', viewBox: '0 0 100 100' });
    const lineG = s('g');
    const dotG = s('g');
    // Dashed marker for where the guide is about to move a dot.
    const ghost = s('circle', { r: r + 1.5, class: 'ghost', style: 'display:none' });
    svg.append(lineG, dotG, ghost);
    const lines = edges.map(() => {
      const l = s('line');
      lineG.append(l);
      return l;
    });
    const dots = pos.map((_, i) => {
      const c = s('circle', { r, 'data-v': i, class: 'v' });
      dotG.append(c);
      return c;
    });

    let finished = false;
    let drag = -1;
    const render = () => {
      const bad = crossingEdges(pos, edges);
      edges.forEach(([a, b], k) => {
        const l = lines[k];
        l.setAttribute('x1', String(pos[a].x));
        l.setAttribute('y1', String(pos[a].y));
        l.setAttribute('x2', String(pos[b].x));
        l.setAttribute('y2', String(pos[b].y));
        l.setAttribute('class', bad.has(k) ? 'bad' : '');
      });
      dots.forEach((c, i) => {
        c.setAttribute('cx', String(pos[i].x));
        c.setAttribute('cy', String(pos[i].y));
        c.setAttribute('class', `v${i === drag ? ' on' : ''}`);
      });
      const crossings = bad.size;
      ctx.status(
        crossings
          ? P(crossings, ['crossing line', 'crossing lines'], ['ligne croisée', 'lignes croisées'])
          : L('No crossings', 'Aucun croisement'),
      );
      return crossings === 0;
    };

    const toSvg = (e: PointerEvent) => {
      const rc = svg.getBoundingClientRect();
      const clamp = (v: number) => Math.round(Math.max(r, Math.min(100 - r, v)) * 10) / 10;
      return { x: clamp(((e.clientX - rc.left) / (rc.width || 1)) * 100), y: clamp(((e.clientY - rc.top) / (rc.height || 1)) * 100) };
    };
    let grabDx = 0,
      grabDy = 0;
    svg.addEventListener('pointerdown', (e) => {
      if (finished) return;
      let v = Number((e.target as Element | null)?.getAttribute?.('data-v') ?? -1);
      const p = toSvg(e);
      if (!(v >= 0)) {
        // forgiving hit test for fingers
        let bd = r * 2.6;
        v = -1;
        pos.forEach((q, i) => {
          const dd = Math.hypot(q.x - p.x, q.y - p.y);
          if (dd < bd) {
            bd = dd;
            v = i;
          }
        });
      }
      if (v < 0) return;
      ctx.touch();
      drag = v;
      grabDx = pos[v].x - p.x;
      grabDy = pos[v].y - p.y;
      dotG.append(dots[v]); // draw on top
      capture(svg, e.pointerId);
      e.preventDefault();
      render();
    });
    svg.addEventListener('pointermove', (e) => {
      if (drag < 0) return;
      const p = toSvg(e);
      pos[drag] = {
        x: Math.round(Math.max(r, Math.min(100 - r, p.x + grabDx)) * 10) / 10,
        y: Math.round(Math.max(r, Math.min(100 - r, p.y + grabDy)) * 10) / 10,
      };
      render();
    });
    const end = () => {
      if (drag < 0) return;
      drag = -1;
      if (render() && !finished) {
        finished = true;
        ctx.solved();
      }
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);

    // ---- guide: greedy moves that cut the most crossings ----
    let lastRule = '';
    /** Set once greedy moves stop helping: the guide then places dots where the hidden layout has them. */
    let planMode = false;
    const showGhost = (to: Pt) => {
      ghost.setAttribute('cx', String(to.x));
      ghost.setAttribute('cy', String(to.y));
      ghost.style.display = '';
    };
    /** Same path as a drag: grab, move, let go. */
    const moveDot = (v: number, to: Pt) => {
      ghost.style.display = 'none';
      if (finished) return;
      ctx.touch();
      drag = v;
      dotG.append(dots[v]);
      pos[v] = to;
      render();
      end();
    };
    const near = (a: Pt, b: Pt, k: number) => Math.hypot(a.x - b.x, a.y - b.y) < k;
    const home = (v: number) => near(pos[v], solution[v], 2);
    /** Put a dot on its spot of the untangled layout, moving a dot out of the way first if needed. */
    const planHint = (red: number): Hint | null => {
      const away = [...Array(V).keys()].filter((v) => !home(v));
      if (!away.length) return null;
      const blockers = (v: number) => [...Array(V).keys()].filter((j) => j !== v && !home(j) && near(pos[j], solution[v], r * 2.2));
      const free = away.find((v) => !blockers(v).length);
      if (free != null) {
        const to = solution[free];
        showGhost(to);
        return {
          text: L(
            `${red} red lines left. Drag this dot to the dashed circle: there it fits a layout where nothing crosses.`,
            `Il reste ${red} lignes rouges. Glissez ce point dans le cercle pointillé : il y trouve sa place dans un tracé sans croisement.`,
          ),
          why: [dots[free]],
          at: [ghost],
          play: () => moveDot(free, to),
        };
      }
      // Every spot is taken by a dot that isn't home yet: park one of them in an empty corner.
      const v = away[0];
      const j = blockers(v)[0];
      let to: Pt | null = null;
      for (let y = 6; y <= 94 && !to; y += 4)
        for (let x = 6; x <= 94 && !to; x += 4) {
          const p = { x, y };
          if (!pos.some((q) => near(q, p, r * 2.2)) && !solution.some((q) => near(q, p, r * 2.2))) to = p;
        }
      if (!to) return null;
      const spot = to;
      showGhost(spot);
      return {
        text: L(
          'This dot sits where another one belongs. Move it aside to the dashed circle first.',
          'Ce point occupe la place d’un autre. Déplacez-le d’abord dans le cercle pointillé.',
        ),
        why: [dots[j]],
        at: [ghost],
        play: () => moveDot(j, spot),
      };
    };
    const hint = (): Hint | null => {
      ghost.style.display = 'none';
      if (finished) return null;
      const bad = crossingEdges(pos, edges);
      if (!bad.size) return null;
      const deg = pos.map((_, v) => edges.filter((e) => e.includes(v)).length);
      const redAt = (v: number) => edges.filter((e, k) => bad.has(k) && e.includes(v)).length;
      const clampPt = (p: Pt) => ({
        x: Math.round(Math.max(r, Math.min(100 - r, p.x)) * 10) / 10,
        y: Math.round(Math.max(r, Math.min(100 - r, p.y)) * 10) / 10,
      });
      type Move = { v: number; to: Pt; after: number; between: boolean };
      let best: Move | null = null;
      for (let v = 0; v < V; v++) {
        const nbs = edges.filter((e) => e.includes(v)).map((e) => (e[0] === v ? e[1] : e[0]));
        const mid = nbs.length
          ? { x: nbs.reduce((t, j) => t + pos[j].x, 0) / nbs.length, y: nbs.reduce((t, j) => t + pos[j].y, 0) / nbs.length }
          : null;
        const tries: [Pt, boolean][] = [[solution[v], false]];
        if (mid && nbs.length <= 3) tries.push([mid, true]);
        for (const [raw, between] of tries) {
          const to = clampPt(raw);
          if (Math.hypot(to.x - pos[v].x, to.y - pos[v].y) < 2) continue;
          if (pos.some((q, j) => j !== v && Math.hypot(q.x - to.x, q.y - to.y) < r * 2.2)) continue;
          const trial = pos.map((q, j) => (j === v ? to : q));
          const after = crossingEdges(trial, edges).size;
          const score = after * 100 - redAt(v) - (between ? 0 : 0.5);
          if (!best || score < best.after * 100 - redAt(best.v) - (best.between ? 0 : 0.5)) best = { v, to, after, between };
        }
      }
      // Only take a greedy move that really cuts crossings; else (and from then on) rebuild the hidden
      // untangled layout dot by dot, which always finishes.
      if (!best || best.after >= bad.size) planMode = true;
      if (planMode || !best) return planHint(bad.size);
      const { v, to, after, between } = best;
      showGhost(to);
      const red = redAt(v);
      const rule = after === 0 ? 'last' : between && lastRule !== 'between' ? 'between' : 'most';
      lastRule = rule;
      const text =
        rule === 'last'
          ? L(
              `Only this dot is still in the way. Drag it to the dashed circle and all ${bad.size} red lines clear.`,
              `Seul ce point gêne encore. Glissez-le dans le cercle pointillé et les ${bad.size} lignes rouges disparaissent.`,
            )
          : rule === 'between'
            ? L(
                `This dot links to just ${deg[v]} others. Tuck it between them so its lines stay short: red lines drop from ${bad.size} to ${after}.`,
                `Ce point n’est relié qu’à ${deg[v]} autres. Placez-le entre eux pour garder ses lignes courtes : les lignes rouges passent de ${bad.size} à ${after}.`,
              )
            : after >= bad.size
              ? L(
                  'No single move clears a crossing yet. Pull this dot toward the dashed circle to open up room.',
                  'Aucun déplacement ne règle encore de croisement. Tirez ce point vers le cercle pointillé pour faire de la place.',
                )
              : L(
                  `Red lines cross. ${red ? `This dot touches ${red} of them: drag it` : 'Drag this dot'} to the dashed circle and the count drops from ${bad.size} to ${after}.`,
                  `Les lignes rouges se croisent. ${red ? `Ce point en touche ${red} : glissez-le` : 'Glissez ce point'} dans le cercle pointillé et leur nombre passe de ${bad.size} à ${after}.`,
                );
      return { text, why: [dots[v]], at: [ghost], play: () => moveDot(v, to) };
    };

    root.append(h('div', { class: 'untangle-wrap' }, svg));
    render();
    return { hint, snapshot: () => ({ pos: pos.map((p) => [p.x, p.y]) }) };
  },
};
