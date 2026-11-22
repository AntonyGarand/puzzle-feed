import { L, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { h, s } from '../core/ui';
import { capture } from './pathkit/grid';
import { loopFault } from './gridkit/loopcheck';
import { genLoop, isSingleLoop } from './gridkit/slither';
import './loop.css';

const PAD = 0.38; // board margin around the dots, in cell units

export const loop: PuzzleDef = {
  id: 'loop',
  get name() {
    return L('Loop', 'Boucle');
  },
  category: 'paths',
  get rules() {
    return L('Draw one loop. Numbers count the sides it uses.', 'Tracez une boucle. Les nombres comptent ses côtés utilisés.');
  },
  help: () => ({
    goal: L(
      'Draw a single closed loop along the lines between the dots, so that every number is right.',
      'Tracez une seule boucle fermée en reliant les points, de sorte que chaque nombre soit juste.',
    ),
    steps: [
      L(
        'A number tells how many of the 4 sides of its cell the loop uses. Cells without a number can have any count.',
        'Un nombre indique combien des 4 côtés de sa case la boucle utilise. Les cases sans nombre peuvent en avoir n’importe combien.',
      ),
      L(
        'The loop never crosses or touches itself and never branches: each dot has 0 or 2 lines.',
        'La boucle ne se croise pas, ne se touche pas et ne se divise pas : chaque point a 0 ou 2 lignes.',
      ),
      L(
        'Tap a side to draw a line, again for a ✕ (surely no line), and once more to clear it.',
        'Touchez un côté pour tracer une ligne, encore pour un ✕ (aucune ligne), puis une autre fois pour l’effacer.',
      ),
      L(
        'Or press and hold a side (or right-click it) to put a ✕ straight away; hold again to remove it.',
        'Ou maintenez le doigt sur un côté (ou faites un clic droit) pour y mettre un ✕ directement; maintenez de nouveau pour l’enlever.',
      ),
      L(
        'Drag from dot to dot to draw several lines at once; start a drag on a line to erase instead.',
        'Glissez de point en point pour tracer plusieurs lignes d’un coup; commencez sur une ligne pour effacer plutôt.',
      ),
      L(
        'Numbers fade once they have exactly enough lines (a 0 once its sides are ✕) and turn red with too many.',
        'Les nombres pâlissent quand ils ont juste assez de lignes (un 0, quand ses côtés sont en ✕) et rougissent s’ils en ont trop.',
      ),
    ],
    tips: [
      L(
        'A 0 has no lines around it: put ✕ on its four sides. Two 3s side by side share a line between them.',
        'Un 0 n’a aucune ligne autour : mettez des ✕ sur ses quatre côtés. Deux 3 côte à côte partagent la ligne qui les sépare.',
      ),
      L(
        'A dot with one line must continue: if only one way is open, the line goes there.',
        'Un point avec une seule ligne doit continuer : si un seul chemin est libre, la ligne passe par là.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [45, 80, 140, 220, 360]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const n = byLevel(d, [5, 6, 7, 8, 10]);
    const { g, clue, sol, unique } = genLoop(n, n, byLevel(d, [0.6, 0.45, 0.3, 0.15, 0]), rng);
    const { E, ea, eb, ve, ce } = g;
    const W = n + 1; // vertices per row
    const vx = (v: number) => v % W,
      vy = (v: number) => Math.floor(v / W);

    // 0 empty, 1 line, 2 ✕
    const st = new Array<number>(E).fill(0);
    let done = false;

    const size = n + 2 * PAD;
    const svg = s('svg', { viewBox: `${-PAD} ${-PAD} ${size} ${size}`, class: 'lo-svg' });
    const gEdges = s('g');
    const gDots = s('g');
    const gNums = s('g');
    svg.append(gNums, gEdges, gDots);
    const edgeEls = Array.from({ length: E }, (_, e) => {
      const x1 = vx(ea[e]),
        y1 = vy(ea[e]),
        x2 = vx(eb[e]),
        y2 = vy(eb[e]);
      const mx = (x1 + x2) / 2,
        my = (y1 + y2) / 2,
        k = 0.09;
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
      const el = s('circle', { cx: vx(v), cy: vy(v), r: 0.075, class: 'vx' });
      gDots.append(el);
      return el;
    });
    const numEls = clue.map((k, c) => {
      if (k < 0) return null;
      const el = s(
        'text',
        { x: (c % n) + 0.5, y: Math.floor(c / n) + 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'lo-n' },
        k,
      );
      gNums.append(el);
      return el;
    });
    const wrap = h('div', { class: 'lo-board' }, svg);

    /** Set an SVG class only when it changes (render runs after every mark). */
    const setCls = (el: Element, c: string) => el.getAttribute('class') !== c && el.setAttribute('class', c);
    const render = () => {
      edgeEls.forEach((el, e) => setCls(el, `edge${st[e] === 1 ? ' on' : st[e] === 2 ? ' x' : ''}`));
      dotEls.forEach((el, v) => {
        const deg = ve[v].filter((e) => st[e] === 1).length;
        setCls(el, `vx${deg > 2 ? ' err' : deg ? ' on' : ''}`);
      });
      let good = 0,
        total = 0,
        ok = true;
      numEls.forEach((el, c) => {
        if (!el) return;
        total++;
        const k = ce[c].filter((e) => st[e] === 1).length;
        if (k === clue[c]) good++;
        else ok = false;
        // A 0 only fades once its four sides are crossed out, so it stays visible as a hint.
        const settled = clue[c] > 0 || ce[c].every((e) => st[e] === 2);
        setCls(el, `lo-n${k === clue[c] && settled ? ' done' : k > clue[c] ? ' err' : ''}`);
      });
      ctx.status(`${good} / ${P(total, ['number', 'numbers'], ['nombre', 'nombres'])}`);
      return ok && isSingleLoop(g, (e) => st[e] === 1);
    };

    const after = () => {
      if (!done && render()) {
        done = true;
        wrap.classList.add('won');
        ctx.solved();
      }
    };

    // Geometry: pointer position in board units, nearest edge, nearest dot.
    const toUnits = (e: PointerEvent) => {
      const rect = svg.getBoundingClientRect();
      if (!(rect.width > 0) || !(e.clientX || e.clientY)) return null;
      return { x: -PAD + ((e.clientX - rect.left) / rect.width) * size, y: -PAD + ((e.clientY - rect.top) / rect.height) * size };
    };
    const H = (n + 1) * n;
    const edgeAt = (x: number, y: number) => {
      const cl = (v: number, hi: number) => Math.max(0, Math.min(hi, v));
      const hr = cl(Math.round(y), n),
        hc = cl(Math.floor(x), n - 1);
      const hd = Math.abs(y - hr) + Math.max(0, -x, x - n);
      const vc = cl(Math.round(x), n),
        vr = cl(Math.floor(y), n - 1);
      const vd = Math.abs(x - vc) + Math.max(0, -y, y - n);
      return hd <= vd ? hr * n + hc : H + vr * (n + 1) + vc;
    };
    const dotAt = (x: number, y: number, within: number) => {
      const c = Math.round(x),
        r = Math.round(y);
      if (c < 0 || r < 0 || c > n || r > n || Math.hypot(x - c, y - r) > within) return -1;
      return r * W + c;
    };
    const edgeBetween = (a: number, b: number) => ve[a].find((e) => ea[e] === b || eb[e] === b) ?? -1;

    // Long-press (or right-click) on a side toggles its ✕ directly; a plain tap still cycles line → ✕ → empty.
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
      x: number;
      y: number;
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
        x: pt?.x ?? 0,
        y: pt?.y ?? 0,
        cx: e.clientX,
        cy: e.clientY,
        edge,
        anchor: pt ? dotAt(pt.x, pt.y, 0.36) : -1,
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
      const v = dotAt(pt.x, pt.y, 0.3);
      if (v < 0 || v === g0.anchor) return;
      const k = g0.anchor >= 0 ? edgeBetween(g0.anchor, v) : -1;
      g0.anchor = v;
      if (k < 0) return;
      stopHold();
      // The first edge decides: drawing over a line erases, anything else draws.
      if (g0.mode < 0) g0.mode = st[k] === 1 ? 0 : 1;
      g0.drew = true;
      if (g0.mode === 1) st[k] = 1;
      else if (st[k] === 1) st[k] = 0;
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
    // Guide: numbers first (0, two 3s, corners, full or settled counts), then what each dot allows.
    let lastKind = '';
    const hint = (): Hint | null => {
      if (done) return null;
      const set = (es: number[], v: number) => () => {
        es.forEach((e) => (st[e] = v));
        after();
        if (!done) render();
      };
      const eEls = (es: number[]) => es.map((e) => edgeEls[e]);
      const cands: { kind: string; hint: Hint }[] = [];
      const add = (kind: string, text: string, why: Element[], es: number[], v: number) =>
        cands.push({ kind, hint: { text, why, at: eEls(es), play: set(es, v) } });
      const free = (es: number[]) => es.filter((e) => st[e] === 0);
      clue.forEach((k, c) => {
        if (k < 0) return;
        const open = free(ce[c]);
        if (!open.length) return;
        const lines = ce[c].filter((e) => st[e] === 1).length;
        const el = numEls[c]!;
        if (k === 0)
          add(
            'zero',
            L(
              'A 0 has no line around it. Press and hold each side (or tap it twice) to cross it out with ✕.',
              'Un 0 n’a aucune ligne autour. Maintenez le doigt sur chaque côté (ou touchez-le deux fois) pour le barrer d’un ✕.',
            ),
            [el],
            open,
            2,
          );
        else if (lines === k)
          add(
            'sat',
            L(
              `This ${k} already has its ${k} line${k > 1 ? 's' : ''}, so its other sides get ✕.`,
              `Ce ${k} a déjà ${k > 1 ? `ses ${k} lignes` : 'sa ligne'} : ses autres côtés reçoivent un ✕.`,
            ),
            [el],
            open,
            2,
          );
        else if (lines + open.length === k)
          add(
            'fill',
            L(
              `This ${k} has exactly ${k} sides that aren’t crossed out, so the loop uses all of them.`,
              `Ce ${k} a exactement ${k} côtés non barrés : la boucle les utilise tous.`,
            ),
            [el],
            open,
            1,
          );
        // A 3 or 1 in a board corner: the corner dot has just two sides, used together or not at all.
        const r = Math.floor(c / n),
          col = c % n;
        if ((r === 0 || r === n - 1) && (col === 0 || col === n - 1) && (k === 3 || k === 1)) {
          const outer = [r === 0 ? ce[c][0] : ce[c][2], col === 0 ? ce[c][3] : ce[c][1]];
          const fo = free(outer);
          if (fo.length === 2)
            add(
              'corner',
              k === 3
                ? L(
                    'The loop can’t turn back at a corner dot, so its two sides go together. This 3 must use at least one, so it uses both.',
                    'La boucle ne peut pas rebrousser chemin à un point de coin : ses deux côtés vont ensemble. Ce 3 en utilise au moins un, donc les deux.',
                  )
                : L(
                    'The loop can’t turn back at a corner dot, so its two sides go together. This 1 can’t use both, so it uses neither.',
                    'La boucle ne peut pas rebrousser chemin à un point de coin : ses deux côtés vont ensemble. Ce 1 ne peut pas utiliser les deux, donc aucun.',
                  ),
              [el],
              fo,
              k === 3 ? 1 : 2,
            );
        }
        // Two 3s side by side share the line between them and use both far sides.
        if (k === 3)
          for (const [step, mid, a, b] of [
            [1, 1, 3, 1],
            [n, 2, 0, 2],
          ] as const) {
            const c2 = c + step;
            if (c2 >= n * n || (step === 1 && col === n - 1) || clue[c2] !== 3) continue;
            const es = free([ce[c][mid], ce[c][a], ce[c2][b]]);
            if (es.length)
              add(
                'pair3',
                L(
                  'Two 3s side by side: the loop always uses the line between them and both their far sides.',
                  'Deux 3 côte à côte : la boucle passe toujours entre eux et sur leurs deux côtés extérieurs.',
                ),
                [el, numEls[c2]!],
                es,
                1,
              );
          }
      });
      ve.forEach((es, v) => {
        const open = free(es);
        if (!open.length) return;
        const lines = es.filter((e) => st[e] === 1).length;
        const dot = dotEls[v];
        if (lines === 2)
          add(
            'dot2',
            L(
              'This dot already has two lines. The loop never branches, so its other sides get ✕.',
              'Ce point a déjà deux lignes. La boucle ne se divise jamais : ses autres côtés reçoivent un ✕.',
            ),
            [dot],
            open,
            2,
          );
        else if (lines === 1 && open.length === 1)
          add(
            'dot1',
            L(
              'The line reaching this dot has to keep going, and only one way is still open.',
              'La ligne qui arrive à ce point doit continuer, et un seul chemin est encore libre.',
            ),
            [dot],
            open,
            1,
          );
        else if (lines === 0 && open.length === 1)
          add(
            'dot0',
            L(
              'A line here would hit a dead end at this dot, since every other way is crossed out: ✕ it.',
              'Une ligne ici finirait en cul-de-sac à ce point, car les autres chemins sont barrés : mettez un ✕.',
            ),
            [dot],
            open,
            2,
          );
      });
      // Dead ends are dull one by one: cross them all out together.
      const dead = cands.filter((c) => c.kind === 'dot0');
      if (dead.length > 1) {
        const es = [...new Set(dead.flatMap((c) => c.hint.at.map((el) => edgeEls.indexOf(el as SVGGElement))))];
        cands.splice(cands.indexOf(dead[0]), 1, {
          kind: 'dot0',
          hint: {
            text: L(
              'A line on any of these sides would end at a dot whose other ways are all crossed out. The loop can’t dead-end, so ✕ them.',
              'Une ligne sur l’un de ces côtés finirait à un point dont les autres chemins sont barrés. La boucle n’a pas de cul-de-sac : mettez des ✕.',
            ),
            why: dead.flatMap((c) => c.hint.why ?? []),
            at: eEls(es),
            play: set(es, 2),
          },
        });
        for (const c of dead.slice(1)) cands.splice(cands.indexOf(c), 1);
      }
      const order = ['zero', 'pair3', 'corner', 'sat', 'fill', 'dot1', 'dot2', 'dot0'];
      cands.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
      const pick = cands.find((c) => c.kind !== lastKind) ?? cands[0];
      if (pick) {
        lastKind = pick.kind;
        return pick.hint;
      }
      // One step deeper: assume the wrong choice for a side and follow the simple rules until something breaks.
      const stuck = (t: number[]): { bad: Element; steps: number } | null => {
        let steps = 0;
        for (let changed = true; changed;) {
          changed = false;
          for (let c = 0; c < clue.length; c++) {
            const k = clue[c];
            if (k < 0) continue;
            const lines = ce[c].filter((e) => t[e] === 1).length;
            const open = ce[c].filter((e) => t[e] === 0);
            if (lines > k || lines + open.length < k) return { bad: numEls[c]!, steps };
            if (open.length && (lines === k || lines + open.length === k)) {
              open.forEach((e) => (t[e] = lines === k ? 2 : 1));
              steps += open.length;
              changed = true;
            }
          }
          for (let v = 0; v < ve.length; v++) {
            const lines = ve[v].filter((e) => t[e] === 1).length;
            const open = ve[v].filter((e) => t[e] === 0);
            if (lines > 2 || (lines === 1 && !open.length)) return { bad: dotEls[v], steps };
            if (open.length && (lines === 2 || open.length === 1)) {
              open.forEach((e) => (t[e] = lines === 1 ? 1 : 2));
              steps += open.length;
              changed = true;
            }
          }
        }
        return null;
      };
      const touching = (e: number) => [ea[e], eb[e]].some((v) => ve[v].some((f) => st[f] === 1));
      const tries = st.map((v, e) => (v === 0 ? e : -1)).filter((e) => e >= 0);
      let best: { e: number; bad: Element; cost: number } | null = null;
      for (const e of tries) {
        const t = st.slice();
        t[e] = sol[e] ? 2 : 1;
        const r = stuck(t);
        const cost = r ? r.steps * 2 + (touching(e) ? 0 : 1) : Infinity;
        if (r && (!best || cost < best.cost)) best = { e, bad: r.bad, cost };
      }
      if (best) {
        const { e, bad } = best;
        lastKind = 'trial';
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
          why: [bad],
          at: eEls([e]),
          play: set([e], sol[e] ? 1 : 2),
        };
      }
      lastKind = '';
      // Nothing simple: extend the intended loop from a dot that already has a line.
      const next = sol.findIndex((on, e) => on && st[e] === 0 && [ea[e], eb[e]].some((v) => ve[v].some((f) => st[f] === 1)));
      const e = next >= 0 ? next : sol.findIndex((on, f) => on && st[f] === 0);
      if (e < 0) return null;
      const dots = [ea[e], eb[e]].filter((v) => ve[v].some((f) => st[f] === 1));
      return {
        text: L(
          'No single rule decides here. Try both ways: only this line lets the loop close as one piece and keep every number right.',
          'Aucune règle ne décide seule ici. Essayez les deux : seule cette ligne permet de fermer une seule boucle et de respecter les nombres.',
        ),
        why: dots.map((v) => dotEls[v]),
        at: eEls([e]),
        play: set([e], 1),
      };
    };
    /** A mark that breaks a visible rule (branch, dead end, wrong count, early loop), else one off the unique loop. */
    const check = (): Hint | null => {
      if (done) return null;
      const wrong = (e: number) => (st[e] === 1 && !sol[e]) || (st[e] === 2 && sol[e]);
      const fix = (e: number, text: string, why: Element[]): Hint => ({
        kind: 'fix',
        text,
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
      const f = loopFault(g, st, sol);
      if (f?.kind === 'branch')
        return fix(
          f.e,
          L(
            `${f.es.length} lines meet at this dot, but the loop never branches. This one has to go.`,
            `${f.es.length} lignes se rejoignent à ce point, mais la boucle ne se divise jamais. Celle-ci doit partir.`,
          ),
          [dotEls[f.v]],
        );
      for (let c = 0; c < clue.length; c++) {
        const k = clue[c];
        if (k < 0) continue;
        const lines = ce[c].filter((e) => st[e] === 1).length;
        const room = ce[c].filter((e) => st[e] !== 2).length;
        const e =
          lines > k ? ce[c].find((x) => st[x] === 1 && wrong(x)) : room < k ? ce[c].find((x) => st[x] === 2 && wrong(x)) : undefined;
        if (e === undefined) continue;
        return fix(
          e,
          lines > k
            ? L(
                `This ${k} has ${lines} lines around it, more than ${k}. This line doesn’t belong.`,
                `Ce ${k} a ${lines} lignes autour de lui, plus que ${k}. Cette ligne est de trop.`,
              )
            : L(
                `This ${k} can no longer get ${k} lines: too many of its sides are crossed out. This ✕ is the mistake.`,
                `Ce ${k} ne peut plus avoir ${k} lignes : trop de ses côtés sont barrés. Ce ✕ est l’erreur.`,
              ),
          [numEls[c]!],
        );
      }
      if (f?.kind === 'end')
        return fix(
          f.e,
          st[f.e] === 1
            ? L(
                'This line ends at a dot where every other way is crossed out, and the loop never dead-ends. Remove it.',
                'Cette ligne finit à un point dont les autres chemins sont barrés, et la boucle n’a pas de cul-de-sac. Enlevez-la.',
              )
            : L(
                'The line reaching this dot has nowhere to go: every other way is crossed out. This ✕ is the mistake.',
                'La ligne qui arrive à ce point n’a nulle part où aller : les autres chemins sont barrés. Ce ✕ est l’erreur.',
              ),
          [dotEls[f.v]],
        );
      if (f?.kind === 'closed')
        return fix(
          f.e,
          L(
            'These lines close a loop of their own, but there is only one loop and it must agree with every number. This line doesn’t belong.',
            'Ces lignes ferment leur propre boucle, mais il n’y a qu’une boucle et elle doit respecter tous les nombres. Cette ligne est de trop.',
          ),
          f.es.map((e) => edgeEls[e]),
        );
      if (!unique) return null;
      const e = st.findIndex((_, x) => wrong(x));
      if (e < 0) return null;
      return fix(
        e,
        st[e] === 1
          ? L(
              'This line breaks no rule yet, but it leads to a dead end: the loop doesn’t pass here. Remove it.',
              'Cette ligne ne brise encore aucune règle, mais elle mène à une impasse : la boucle ne passe pas ici. Enlevez-la.',
            )
          : L(
              'This ✕ breaks no rule yet, but it leads to a dead end: the loop does pass here. Clear it.',
              'Ce ✕ ne brise encore aucune règle, mais il mène à une impasse : la boucle passe bien ici. Effacez-le.',
            ),
        [],
      );
    };
    return { snapshot: () => ({ st }), hint, check, destroy: stopHold };
  },
};
