import { L, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { h, s } from '../core/ui';
import { broken, deductions, genPearls, isSolved, pearlOk, pearlOptions, type Kind, type Move } from './gridkit/pearls';
import { loopFault } from './gridkit/loopcheck';
import { capture, stepsToward } from './pathkit/grid';
import './pearls.css';

const DIR_EN = ['up', 'right', 'down', 'left'];
const DIR_FR = ['vers le haut', 'vers la droite', 'vers le bas', 'vers la gauche'];
const SIDE_EN = ['above', 'to the right', 'below', 'to the left'];
const SIDE_FR = ['en haut', 'à droite', 'en bas', 'à gauche'];

export const pearls: PuzzleDef = {
  id: 'pearls',
  get name() {
    return L('Pearls', 'Perles');
  },
  category: 'paths',
  undo: true,
  get rules() {
    return L('Draw one loop through every pearl.', 'Tracez une boucle qui passe par toutes les perles.');
  },
  help: () => ({
    goal: L(
      'Draw a single closed loop through the centres of the cells so that it passes through every pearl and obeys it.',
      'Tracez une seule boucle fermée par le centre des cases, qui passe par toutes les perles en respectant leurs règles.',
    ),
    steps: [
      L(
        'The loop moves between neighbouring cells, never branches or crosses itself, and may skip cells.',
        'La boucle va d’une case voisine à l’autre, sans se diviser ni se croiser, et peut sauter des cases.',
      ),
      L(
        'On a black pearl the loop turns, then goes straight through the next cell on both sides.',
        'Sur une perle noire, la boucle tourne, puis va tout droit dans la case suivante, des deux côtés.',
      ),
      L(
        'On a white pearl the loop goes straight, and turns in the cell just before or just after it (or both).',
        'Sur une perle blanche, la boucle va tout droit et tourne dans la case juste avant ou juste après (ou les deux).',
      ),
      L(
        'Drag from cell to cell to draw; start a drag on a line to erase instead.',
        'Glissez de case en case pour tracer; commencez sur une ligne pour effacer plutôt.',
      ),
      L(
        'Tap between two cells to cycle line, ✕ (surely no line) and empty. Press and hold (or right-click) for a ✕ right away.',
        'Touchez entre deux cases pour alterner ligne, ✕ (aucune ligne) et vide. Maintenez le doigt (ou faites un clic droit) pour un ✕ directement.',
      ),
    ],
    tips: [
      L(
        'A black pearl needs two straight cells each way it goes, so it always heads away from a nearby edge.',
        'Une perle noire a besoin de deux cases en ligne droite de chaque côté : elle part toujours à l’opposé d’un bord proche.',
      ),
      L(
        'A white pearl on the edge of the grid runs along it. Three whites in a row all cross that line.',
        'Une perle blanche sur le bord de la grille le longe. Trois blanches alignées traversent toutes cette ligne.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [50, 90, 150, 240, 360]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const n = byLevel(d, [6, 7, 8, 9, 10]);
    const P0 = genPearls(n, byLevel(d, [0.45, 0.25, 0.1, 0, 0]), byLevel(d, [0, 0, 0, 0.2, 0.35]), rng);
    const { g, pearl, sol } = P0;
    const { E, ea, eb, ve } = g;
    const m = n - 1; // dots per row minus one, in the slither geometry
    const cx = (v: number) => (v % n) + 0.5,
      cy = (v: number) => Math.floor(v / n) + 0.5;

    // 0 empty, 1 line, 2 ✕
    const st = new Array<number>(E).fill(0);
    let done = false;

    const svg = s('svg', { viewBox: `0 0 ${n} ${n}`, class: 'pe-svg' });
    const gridLines: string[] = [];
    for (let k = 1; k < n; k++) gridLines.push(`M${k} 0V${n}M0 ${k}H${n}`);
    const gEdges = s('g');
    const gPearls = s('g');
    const gDots = s('g');
    svg.append(s('path', { d: gridLines.join(''), class: 'pe-grid' }), gDots, gPearls, gEdges);
    const edgeEls = Array.from({ length: E }, (_, e) => {
      const x1 = cx(ea[e]),
        y1 = cy(ea[e]),
        x2 = cx(eb[e]),
        y2 = cy(eb[e]);
      const mx = (x1 + x2) / 2,
        my = (y1 + y2) / 2,
        k = 0.1;
      const el = s(
        'g',
        { class: 'edge', 'data-e': e },
        s('line', { x1, y1, x2, y2, class: 'ln' }),
        s('path', { d: `M${mx - k} ${my - k}L${mx + k} ${my + k}M${mx + k} ${my - k}L${mx - k} ${my + k}`, class: 'xx' }),
      );
      gEdges.append(el);
      return el;
    });
    const dotEls = ve.map((_, v) => {
      const el = s('circle', { cx: cx(v), cy: cy(v), r: 0.06, class: 'dot' });
      gDots.append(el);
      return el;
    });
    const pearlEls = pearl.map((k, v) => {
      if (!k) return null;
      const el = s('circle', { cx: cx(v), cy: cy(v), r: 0.3, class: `pl ${k === 1 ? 'b' : 'w'}` });
      gPearls.append(el);
      return el;
    });
    /** The pearl if there is one, else the dot: what the guide outlines for cell v. */
    const cellEl = (v: number) => pearlEls[v] ?? dotEls[v];
    const wrap = h('div', { class: 'pe-board' }, svg);

    const on = (e: number) => st[e] === 1;
    /** Set an SVG class only when it changes (render runs after every mark). */
    const setCls = (el: Element, c: string) => el.getAttribute('class') !== c && el.setAttribute('class', c);
    const render = () => {
      edgeEls.forEach((el, e) => setCls(el, `edge${st[e] === 1 ? ' on' : st[e] === 2 ? ' x' : ''}`));
      dotEls.forEach((el, v) => {
        const deg = ve[v].filter(on).length;
        setCls(el, `dot${deg > 2 ? ' err' : deg ? ' on' : ''}`);
      });
      let good = 0,
        total = 0;
      pearlEls.forEach((el, v) => {
        if (!el) return;
        total++;
        const k = pearl[v];
        const ok = pearlOk(P0, v, k, on);
        if (ok) good++;
        // Red once it can't be satisfied any more: too many lines, or lines/✕ that rule out every way through.
        const bad =
          !ok &&
          (ve[v].filter(on).length > 2 ||
            !pearlOptions(P0, v, k).some((o) => o.on.every((e) => st[e] !== 2) && o.off.every((e) => st[e] !== 1)));
        setCls(el, `pl ${k === 1 ? 'b' : 'w'}${ok ? ' done' : bad ? ' err' : ''}`);
      });
      ctx.status(`${good} / ${P(total, ['pearl', 'pearls'], ['perle', 'perles'])}`);
      return isSolved(P0, pearl, on);
    };

    const after = () => {
      if (!done && render()) {
        done = true;
        wrap.classList.add('won');
        ctx.solved();
      }
    };

    // Geometry: pointer position in cell-centre units (cell centres sit on whole numbers), nearest edge, nearest cell.
    const toUnits = (e: PointerEvent) => {
      const rect = svg.getBoundingClientRect();
      if (!(rect.width > 0) || !(e.clientX || e.clientY)) return null;
      return { x: ((e.clientX - rect.left) / rect.width) * n - 0.5, y: ((e.clientY - rect.top) / rect.height) * n - 0.5 };
    };
    const H = (m + 1) * m;
    const edgeAt = (x: number, y: number) => {
      const cl = (v: number, hi: number) => Math.max(0, Math.min(hi, v));
      const hr = cl(Math.round(y), m),
        hc = cl(Math.floor(x), m - 1);
      const hd = Math.abs(y - hr) + Math.max(0, -x, x - m);
      const vc = cl(Math.round(x), m),
        vr = cl(Math.floor(y), m - 1);
      const vd = Math.abs(x - vc) + Math.max(0, -y, y - m);
      return hd <= vd ? hr * m + hc : H + vr * (m + 1) + vc;
    };
    const cellAtPt = (x: number, y: number, within: number) => {
      const c = Math.round(x),
        r = Math.round(y);
      if (c < 0 || r < 0 || c > m || r > m || Math.max(Math.abs(x - c), Math.abs(y - r)) > within) return -1;
      return r * n + c;
    };
    const edgeBetween = (a: number, b: number) => ve[a].find((e) => ea[e] === b || eb[e] === b) ?? -1;

    // Long-press (or right-click) toggles a ✕ directly; a plain tap cycles line → ✕ → empty.
    const HOLD_MS = 400;
    const HOLD_SLOP = 8; // px of movement that cancels a long-press
    const toggleX = (edge: number) => {
      st[edge] = st[edge] === 2 ? 0 : 2;
      after();
      if (!done) render();
    };
    let holdTimer = 0;
    const stopHold = () => {
      clearTimeout(holdTimer);
      holdTimer = 0;
    };
    let drag: {
      id: number;
      cx: number;
      cy: number;
      edge: number;
      anchor: number;
      mode: number;
      drew: boolean;
      held: boolean;
    } | null = null;
    svg.addEventListener('contextmenu', (e) => e.preventDefault());
    svg.addEventListener('pointerdown', (e) => {
      if (done || drag) return;
      const right = e.pointerType === 'mouse' && e.button === 2;
      if (e.pointerType === 'mouse' && e.button !== 0 && !right) return;
      const pt = toUnits(e);
      let edge = -1;
      if (pt) edge = edgeAt(pt.x, pt.y);
      else {
        const t = (e.target as Element | null)?.closest?.('[data-e]');
        edge = t ? Number(t.getAttribute('data-e')) : -1;
      }
      if (edge < 0) return;
      e.preventDefault();
      ctx.touch();
      if (right) {
        toggleX(edge);
        return;
      }
      capture(svg, e.pointerId);
      const g0 = {
        id: e.pointerId,
        cx: e.clientX,
        cy: e.clientY,
        edge,
        anchor: pt ? cellAtPt(pt.x, pt.y, 0.5) : -1,
        mode: -1,
        drew: false,
        held: false,
      };
      drag = g0;
      stopHold();
      holdTimer = window.setTimeout(() => {
        holdTimer = 0;
        if (drag !== g0 || g0.drew || done) return;
        g0.held = true;
        navigator.vibrate?.(15);
        toggleX(g0.edge);
      }, HOLD_MS);
    });
    svg.addEventListener('pointermove', (e) => {
      const g0 = drag;
      if (!g0 || e.pointerId !== g0.id || done || g0.held) return;
      if (holdTimer && Math.hypot(e.clientX - g0.cx, e.clientY - g0.cy) > HOLD_SLOP) stopHold();
      const pt = toUnits(e);
      if (!pt) return;
      // A cell counts once the pointer is well inside it, so a wobbly tap on a side doesn't draw.
      const v = cellAtPt(pt.x, pt.y, 0.36);
      if (v < 0 || v === g0.anchor) return;
      if (g0.anchor < 0) {
        g0.anchor = v;
        return;
      }
      stopHold();
      // Fast drags can skip cells: walk there one step at a time.
      for (let guard = 0; guard < 2 * n && g0.anchor !== v; guard++) {
        const next = stepsToward(g0.anchor, v, n)[0];
        const k = edgeBetween(g0.anchor, next);
        g0.anchor = next;
        if (k < 0) break;
        // The first edge decides: drawing over a line erases, anything else draws.
        if (g0.mode < 0) g0.mode = st[k] === 1 ? 0 : 1;
        g0.drew = true;
        if (g0.mode === 1) st[k] = 1;
        else if (st[k] === 1) st[k] = 0;
      }
      after();
      if (!done) render();
    });
    svg.addEventListener('pointerup', (e) => {
      const g0 = drag;
      if (!g0 || e.pointerId !== g0.id) return;
      drag = null;
      stopHold();
      if (g0.drew || g0.held || done) return;
      st[g0.edge] = (st[g0.edge] + 1) % 3;
      after();
      if (!done) render();
    });
    svg.addEventListener('pointercancel', () => {
      drag = null;
      stopHold();
    });

    const sv = ctx.saved as { st?: unknown } | undefined;
    if (Array.isArray(sv?.st) && sv.st.length === E) sv.st.forEach((v, e) => (st[e] = v === 1 || v === 2 ? v : 0));
    root.append(wrap);
    render();

    // ---- Guide: pearl rules first, then what each cell allows, then a short what-if. ----
    const text = (mv: Move): string => {
      const pk = pearl[mv.why[0]];
      const de = DIR_EN[mv.d],
        df = DIR_FR[mv.d];
      const ax = mv.d ? L('horizontally', 'à l’horizontale') : L('vertically', 'à la verticale');
      switch (mv.kind) {
        case 'bwall':
          return L(
            `A black pearl turns, then runs straight for two cells. There’s no room for that ${SIDE_EN[(mv.d + 2) % 4]}, so it goes ${de} two cells.`,
            `Une perle noire tourne, puis file tout droit sur deux cases. Il n’y a pas assez de place ${SIDE_FR[(mv.d + 2) % 4]} : elle part donc ${df} sur deux cases.`,
          );
        case 'bpair':
          return L(
            `Two black pearls side by side can’t join: the cell after a black pearl goes straight, but a black pearl turns. So this one goes ${de} two cells.`,
            `Deux perles noires voisines ne peuvent pas se relier : la case après une perle noire va tout droit, alors qu’une perle noire tourne. Celle-ci part donc ${df} sur deux cases.`,
          );
        case 'bline':
          return L(
            `This black pearl’s line goes ${de}. It runs straight through the next cell that way, and since the pearl turns, no line goes ${DIR_EN[(mv.d + 2) % 4]}.`,
            `La ligne de cette perle noire part ${df}. Elle traverse tout droit la case suivante de ce côté et, comme la perle tourne, aucune ligne ne part ${DIR_FR[(mv.d + 2) % 4]}.`,
          );
        case 'bblock':
          return L(
            `This black pearl can’t run two straight cells the other way (a ✕ or a turning line is in the way), so it goes ${de} two cells.`,
            `Cette perle noire ne peut pas filer deux cases tout droit de l’autre côté (un ✕ ou une ligne qui tourne bloque) : elle part donc ${df} sur deux cases.`,
          );
        case 'w3':
          return L(
            `Three white pearls in a row: if the loop ran along them, the middle one couldn’t have a turn next to it. So all three go ${ax}.`,
            `Trois perles blanches alignées : si la boucle les longeait, celle du milieu n’aurait aucun virage à côté. Les trois passent donc ${ax}.`,
          );
        case 'wwall':
          return L(
            'A white pearl goes straight through. On the edge of the grid, it can only run along that edge.',
            'Une perle blanche se traverse tout droit. Sur le bord de la grille, elle ne peut que longer ce bord.',
          );
        case 'wblock':
          return L(
            `A white pearl goes straight through, and the other direction is ruled out here, so it runs ${ax}.`,
            `Une perle blanche se traverse tout droit, et l’autre direction est exclue ici : elle passe donc ${ax}.`,
          );
        case 'wturn':
          return L(
            `The loop must turn right before or right after a white pearl. It already goes straight on at one side, so it turns at the other: no line ${de} there.`,
            `La boucle doit tourner juste avant ou juste après une perle blanche. Elle continue déjà tout droit d’un côté : elle tourne donc de l’autre, sans ligne ${df}.`,
          );
        case 'dot2':
          return pk
            ? L(
                'This pearl already has its two lines. The loop never branches, so its other sides get ✕.',
                'Cette perle a déjà ses deux lignes. La boucle ne se divise jamais : ses autres côtés reçoivent un ✕.',
              )
            : L(
                'This cell already has two lines. The loop never branches, so its other sides get ✕.',
                'Cette case a déjà deux lignes. La boucle ne se divise jamais : ses autres côtés reçoivent un ✕.',
              );
        case 'dot1':
          return L(
            'The line reaching this cell has to keep going, and only one way is still open.',
            'La ligne qui arrive dans cette case doit continuer, et un seul chemin est encore libre.',
          );
        case 'dot0':
          return L(
            'A line into any of these cells would hit a dead end: every other way out is crossed out. ✕ them.',
            'Une ligne vers l’une de ces cases finirait en cul-de-sac : toutes les autres sorties sont barrées. Mettez des ✕.',
          );
        case 'close':
          return L(
            'Joining these two ends would close a small loop that leaves other lines or pearls out. There is only one loop, so ✕ the gap.',
            'Relier ces deux bouts fermerait une petite boucle qui laisse d’autres lignes ou perles de côté. Il n’y a qu’une boucle : mettez un ✕ entre les deux.',
          );
      }
    };
    const apply = (lines: number[], off: number[]) => () => {
      lines.forEach((e) => (st[e] = 1));
      off.forEach((e) => (st[e] = 2));
      after();
      if (!done) render();
    };
    const eEls = (es: number[]) => es.map((e) => edgeEls[e]);
    const ORDER: Kind[] = ['bwall', 'w3', 'wwall', 'bpair', 'bline', 'wblock', 'bblock', 'wturn', 'close', 'dot2', 'dot1', 'dot0'];
    // The last two kinds of step shown, so the guide varies its reasoning.
    const recent: string[] = [];
    const note = (k: string) => recent.splice(0, recent.length, k, ...recent.slice(0, 1));
    const hint = (): Hint | null => {
      if (done) return null;
      const moves = deductions(P0, pearl, st).sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
      const pick = moves.find((mv) => !recent.includes(mv.kind)) ?? moves.find((mv) => mv.kind !== recent[0]) ?? moves[0];
      if (pick) {
        note(pick.kind);
        return { text: text(pick), why: pick.why.map(cellEl), at: eEls([...pick.on, ...pick.off]), play: apply(pick.on, pick.off) };
      }
      // One step deeper: assume the wrong choice for an edge and follow the simple rules until something breaks.
      const stuck = (t: number[]): { bad: number; steps: number } | null => {
        let steps = 0;
        for (let round = 0; round < 40; round++) {
          const bad = broken(P0, pearl, t);
          if (bad >= 0) return { bad, steps };
          const ms = deductions(P0, pearl, t);
          if (!ms.length) return null;
          for (const mv of ms) {
            mv.on.forEach((e) => (t[e] = 1));
            mv.off.forEach((e) => (t[e] = 2));
            steps += mv.on.length + mv.off.length;
          }
        }
        return null;
      };
      const touching = (e: number) => [ea[e], eb[e]].some((v) => pearl[v] || ve[v].some((f) => st[f] === 1));
      let best: { e: number; bad: number; cost: number } | null = null;
      for (let e = 0; e < E; e++) {
        if (st[e] !== 0 || !touching(e)) continue;
        const t = st.slice();
        t[e] = sol[e] ? 2 : 1;
        const r = stuck(t);
        if (r && (!best || r.steps < best.cost)) best = { e, bad: r.bad, cost: r.steps };
      }
      if (best) {
        const { e, bad } = best;
        note('trial');
        return {
          text: sol[e]
            ? L(
                'Suppose this side had a ✕: following the simple rules from there, the outlined spot soon breaks. So it’s a line.',
                'Supposez un ✕ sur ce côté : en suivant les règles simples, l’endroit encadré finit par coincer. C’est donc une ligne.',
              )
            : L(
                'Suppose a line went here: following the simple rules from there, the outlined spot soon breaks. So it gets a ✕.',
                'Supposez une ligne ici : en suivant les règles simples, l’endroit encadré finit par coincer. Ce côté reçoit donc un ✕.',
              ),
          why: [cellEl(bad)],
          at: eEls([e]),
          play: sol[e] ? apply([e], []) : apply([], [e]),
        };
      }
      note('');
      // Nothing simple: extend the intended loop from a cell that already has a line.
      const next = sol.findIndex((s0, e) => s0 && st[e] === 0 && [ea[e], eb[e]].some((v) => ve[v].some((f) => st[f] === 1)));
      const e = next >= 0 ? next : sol.findIndex((s0, f) => s0 && st[f] === 0);
      if (e < 0) return null;
      return {
        text: L(
          'No single rule decides here. Try both ways: only this line lets the loop close as one piece through every pearl.',
          'Aucune règle ne décide seule ici. Essayez les deux : seule cette ligne permet de fermer une seule boucle qui passe par toutes les perles.',
        ),
        why: [ea[e], eb[e]].map(cellEl),
        at: eEls([e]),
        play: apply([e], []),
      };
    };
    /** A mark that breaks a visible rule (branch, dead end, impossible pearl, early loop), else one off the unique loop. */
    const check = (): Hint | null => {
      if (done) return null;
      const wrong = (e: number) => (st[e] === 1 && !sol[e]) || (st[e] === 2 && sol[e]);
      const fix = (e: number, msg: string, why: Element[]): Hint => ({
        kind: 'fix',
        text: msg,
        why,
        at: [edgeEls[e]],
        action: st[e] === 1 ? L('Remove the line', 'Enlever la ligne') : L('Clear the ✕', 'Effacer le ✕'),
        play: () => {
          if (!st[e]) return;
          st[e] = 0;
          after();
          if (!done) render();
        },
      });
      const f = loopFault(P0.g, st, sol);
      if (f?.kind === 'branch')
        return fix(
          f.e,
          L(
            `${f.es.length} lines meet in this cell, but the loop never branches. This one has to go.`,
            `${f.es.length} lignes se rejoignent dans cette case, mais la boucle ne se divise jamais. Celle-ci doit partir.`,
          ),
          [cellEl(f.v)],
        );
      // A pearl no way through can satisfy any more: one of the marks around it is wrong.
      for (let v = 0; v < pearl.length; v++) {
        const k = pearl[v];
        if (!k) continue;
        const opts = pearlOptions(P0, v, k);
        if (opts.some((o) => o.on.every((e) => st[e] !== 2) && o.off.every((e) => st[e] !== 1))) continue;
        const e = [...new Set(opts.flatMap((o) => [...o.on, ...o.off]))].find(wrong);
        if (e === undefined) continue;
        return fix(
          e,
          k === 1
            ? L(
                'This black pearl can no longer turn with two straight cells on both sides. This mark is in the way.',
                'Cette perle noire ne peut plus tourner avec deux cases droites de chaque côté. Cette marque bloque.',
              )
            : L(
                'This white pearl can no longer go straight through with a turn right next to it. This mark is in the way.',
                'Cette perle blanche ne peut plus être traversée tout droit avec un virage juste à côté. Cette marque bloque.',
              ),
          [cellEl(v)],
        );
      }
      if (f?.kind === 'end')
        return fix(
          f.e,
          st[f.e] === 1
            ? L(
                'This line ends in a cell where every other way out is crossed out, and the loop never dead-ends. Remove it.',
                'Cette ligne finit dans une case dont les autres sorties sont barrées, et la boucle n’a pas de cul-de-sac. Enlevez-la.',
              )
            : L(
                'The line reaching this cell has nowhere to go: every other way out is crossed out. This ✕ is the mistake.',
                'La ligne qui arrive dans cette case n’a nulle part où aller : les autres sorties sont barrées. Ce ✕ est l’erreur.',
              ),
          [cellEl(f.v)],
        );
      if (f?.kind === 'closed')
        return fix(
          f.e,
          L(
            'These lines close a loop of their own, but there is only one loop and it passes through every pearl. This line doesn’t belong.',
            'Ces lignes ferment leur propre boucle, mais il n’y a qu’une boucle et elle passe par toutes les perles. Cette ligne est de trop.',
          ),
          f.es.map((e) => edgeEls[e]),
        );
      if (!P0.unique) return null;
      const e = st.findIndex((_, x) => wrong(x));
      if (e < 0) return null;
      return fix(
        e,
        st[e] === 1
          ? L(
              'This line breaks no rule yet, but it leads to a dead end: it doesn’t fit the only loop that works with these pearls. Remove it.',
              'Cette ligne ne brise encore aucune règle, mais elle mène à une impasse : elle ne cadre pas avec la seule boucle possible pour ces perles. Enlevez-la.',
            )
          : L(
              'This ✕ breaks no rule yet, but it leads to a dead end: the loop does pass here. Clear it.',
              'Ce ✕ ne brise encore aucune règle, mais il mène à une impasse : la boucle passe bel et bien ici. Effacez-le.',
            ),
        [],
      );
    };
    return { snapshot: () => ({ st }), hint, check, destroy: stopHold };
  },
};
