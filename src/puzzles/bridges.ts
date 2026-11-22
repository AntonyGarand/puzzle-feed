import { L } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { h, s, shake } from '../core/ui';
import { connected, genBridges } from './logickit/bridgesgen';
import './bridges.css';

const R = 0.42; // island radius in cell units

export const bridges: PuzzleDef = {
  id: 'bridges',
  get name() {
    return L('Bridges', 'Ponts');
  },
  category: 'logic',
  get rules() {
    return L('Link islands with up to 2 straight bridges; join them all.', 'Reliez toutes les îles avec 1 ou 2 ponts droits.');
  },
  help: () => ({
    goal: L(
      'Connect all the islands into one network. Each island’s number is how many bridges end at it.',
      'Reliez toutes les îles en un seul réseau. Le nombre de chaque île indique combien de ponts y aboutissent.',
    ),
    steps: [
      L(
        'Bridges run straight across or down between two islands. They can’t cross each other.',
        'Les ponts vont en ligne droite, horizontale ou verticale, entre deux îles. Ils ne peuvent pas se croiser.',
      ),
      L('Two islands can share at most 2 bridges.', 'Deux îles peuvent partager au plus 2 ponts.'),
      L(
        'Drag from an island toward a neighbour, or tap one island then the other. Repeat to go 1 → 2 → none.',
        'Glissez d’une île vers une voisine, ou touchez une île puis l’autre. Répétez pour passer de 1 à 2, puis à aucun.',
      ),
      L('You can also tap a bridge to change it the same way.', 'Vous pouvez aussi toucher un pont pour le modifier de la même façon.'),
      L(
        'Complete islands change colour; islands with too many bridges are marked.',
        'Les îles complètes changent de couleur; celles qui ont trop de ponts sont signalées.',
      ),
    ],
    tips: [
      L(
        'Start with islands that have few neighbours: a 4 with only two neighbours needs a double bridge to each.',
        'Commencez par les îles qui ont peu de voisines : un 4 avec seulement deux voisines a besoin d’un pont double vers chacune.',
      ),
      L(
        'Don’t close off a small group: every island must end up connected.',
        'Ne fermez pas un petit groupe sur lui-même : toutes les îles doivent être reliées.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [45, 80, 130, 200, 320]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const n = byLevel(d, [7, 9, 10, 11, 13]);
    const target = byLevel(d, [8, 12, 16, 21, 28]);
    const p = genBridges(n, target, rng);
    const { islands, edges, cross, inc } = p;
    const b = new Array<number>(edges.length).fill(0);
    let sel = -1;
    let done = false;

    const pairKey = (a: number, c: number) => `${Math.min(a, c)},${Math.max(a, c)}`;
    const edgeOf = new Map(edges.map((e, k) => [pairKey(e.a, e.b), k]));

    const pad = 0.72;
    const vb = { x: -pad, y: -pad, w: n - 1 + 2 * pad };
    const svg = s('svg', { viewBox: `${vb.x} ${vb.y} ${vb.w} ${vb.w}`, class: 'lk-bsvg' });
    const gHit = s('g', { class: 'hits' });
    const gBr = s('g', { class: 'brs' });
    const gIsl = s('g', { class: 'isls' });
    svg.append(gHit, gBr, gIsl);
    edges.forEach((e, k) => {
      const A = islands[e.a],
        B = islands[e.b];
      gHit.append(s('line', { x1: A.c, y1: A.r, x2: B.c, y2: B.r, class: 'hit', 'data-e': k }));
    });
    // Invisible copies of each bridge's span, for the guide to point at.
    const gSpan = s('g', { class: 'spans', 'pointer-events': 'none' });
    svg.append(gSpan);
    const spanEls = edges.map((e) => {
      const A = islands[e.a],
        B = islands[e.b];
      const [x1, y1, x2, y2] = e.horiz ? [A.c + R, A.r, B.c - R, B.r] : [A.c, A.r + R, B.c, B.r - R];
      const el = s('line', { x1, y1, x2, y2 });
      gSpan.append(el);
      return el;
    });
    const islEls = islands.map((isl, i) => {
      const g = s(
        'g',
        { class: 'isl', 'data-i': i },
        s('circle', { cx: isl.c, cy: isl.r, r: R }),
        s('text', { x: isl.c, y: isl.r, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, isl.need),
      );
      gIsl.append(g);
      return g;
    });
    const wrap = h('div', { class: 'lk-bridges' }, svg);

    const render = () => {
      gBr.replaceChildren();
      edges.forEach((e, k) => {
        if (!b[k]) return;
        const A = islands[e.a],
          B = islands[e.b];
        const offs = b[k] === 2 ? [-0.11, 0.11] : [0];
        for (const o of offs) {
          const [x1, y1, x2, y2] = e.horiz ? [A.c + R, A.r + o, B.c - R, B.r + o] : [A.c + o, A.r + R, B.c + o, B.r - R];
          gBr.append(s('line', { x1, y1, x2, y2, class: 'br' }));
        }
      });
      let ok = 0;
      islEls.forEach((g, i) => {
        const sum = inc[i].reduce((t, e) => t + b[e], 0);
        const need = islands[i].need;
        ok += sum === need ? 1 : 0;
        g.setAttribute('class', `isl${sum === need ? ' done' : sum > need ? ' err' : ''}${sel === i ? ' sel' : ''}`);
      });
      ctx.status(L(`${ok} / ${islands.length} islands`, `${ok} / ${islands.length} îles`));
      return ok === islands.length && connected(islands.length, edges, b);
    };

    const cycle = (k: number) => {
      const nv = (b[k] + 1) % 3;
      if (nv > 0 && cross[k].some((f) => b[f] > 0)) {
        shake(wrap);
        return;
      }
      b[k] = nv;
    };
    const after = () => {
      if (render() && !done) {
        done = true;
        sel = -1;
        render();
        ctx.solved();
      }
    };
    const tapIsland = (i: number) => {
      if (sel < 0 || sel === i) sel = sel === i ? -1 : i;
      else {
        const k = edgeOf.get(pairKey(sel, i));
        if (k == null) sel = i;
        else {
          cycle(k);
          sel = -1;
        }
      }
      after();
    };
    /** Neighbour edge of island `i` in the drag direction. */
    const edgeToward = (i: number, dx: number, dy: number) => {
      const horiz = Math.abs(dx) >= Math.abs(dy);
      const sign = Math.sign(horiz ? dx : dy);
      return inc[i].find((k) => {
        const e = edges[k];
        if (e.horiz !== horiz) return false;
        const o = islands[e.a === i ? e.b : e.a],
          me = islands[i];
        return Math.sign(horiz ? o.c - me.c : o.r - me.r) === sign;
      });
    };

    // Pointer handling: tap island → tap neighbour, or drag island → island; tap a bridge to cycle it.
    const toUnits = (e: PointerEvent) => {
      const rect = svg.getBoundingClientRect();
      if (!(rect.width > 0) || !(e.clientX || e.clientY)) return null;
      return { x: vb.x + ((e.clientX - rect.left) / rect.width) * vb.w, y: vb.y + ((e.clientY - rect.top) / rect.height) * vb.w };
    };
    const islandAt = (e: PointerEvent) => {
      const pt = toUnits(e);
      if (!pt) {
        const t = (e.target as Element | null)?.closest?.('[data-i]');
        return t ? Number(t.getAttribute('data-i')) : -1;
      }
      let best = -1,
        bd = 0.62;
      islands.forEach((isl, i) => {
        const dd = Math.hypot(isl.c - pt.x, isl.r - pt.y);
        if (dd < bd) {
          bd = dd;
          best = i;
        }
      });
      return best;
    };
    let down = -1,
      downEdge = -1,
      start: { x: number; y: number } | null = null;
    svg.addEventListener('pointerdown', (e) => {
      if (done || (e.pointerType === 'mouse' && e.button !== 0)) return;
      ctx.touch();
      down = islandAt(e);
      const t = (e.target as Element | null)?.closest?.('[data-e]');
      downEdge = down < 0 && t ? Number(t.getAttribute('data-e')) : -1;
      start = toUnits(e);
      if (down >= 0 || downEdge >= 0) {
        e.preventDefault();
        try {
          svg.setPointerCapture(e.pointerId);
        } catch {
          /* not capturable */
        }
      }
    });
    svg.addEventListener('pointerup', (e) => {
      if (done) return;
      const a = down,
        k0 = downEdge;
      down = downEdge = -1;
      if (a < 0) {
        if (k0 >= 0) {
          sel = -1;
          cycle(k0);
          after();
        }
        return;
      }
      const up = islandAt(e);
      const pt = toUnits(e);
      const moved = start && pt ? Math.hypot(pt.x - start.x, pt.y - start.y) : 0;
      if (up === a || (up < 0 && moved < 0.45)) return tapIsland(a);
      if (up >= 0) {
        const k = edgeOf.get(pairKey(a, up));
        if (k != null) {
          cycle(k);
          sel = -1;
          after();
          return;
        }
        return tapIsland(up);
      }
      const k = start && pt ? edgeToward(a, pt.x - start.x, pt.y - start.y) : undefined;
      if (k != null) {
        cycle(k);
        sel = -1;
        after();
      }
    });
    svg.addEventListener('pointercancel', () => {
      down = downEdge = -1;
    });

    const sv = ctx.saved as { b?: unknown; sel?: unknown } | undefined;
    if (Array.isArray(sv?.b) && sv.b.length === b.length) {
      sv.b.forEach((v, k) => (b[k] = v === 1 || v === 2 ? v : 0));
      // Drop any crossing pairs from a corrupt save.
      b.forEach((v, k) => {
        if (v && cross[k].some((f) => f < k && b[f])) b[k] = 0;
      });
    }
    if (Number.isInteger(sv?.sel) && (sv!.sel as number) >= -1 && (sv!.sel as number) < islands.length) sel = sv!.sel as number;
    root.append(wrap);
    render();
    /** Too many bridges somewhere (the answer is unique): a broken rule first, else a dead end. */
    const check = (): Hint | null => {
      if (done) return null;
      const extra = b.flatMap((v, k) => (v > p.sol[k] ? [k] : []));
      if (!extra.length) return null;
      const have = (i: number) => inc[i].reduce((t, k) => t + b[k], 0);
      const fix = (k: number, text: string, why: Element[]): Hint => {
        const to = p.sol[k];
        return {
          kind: 'fix',
          text,
          why,
          at: [spanEls[k]],
          action: to === 0 ? L('Remove the bridge', 'Enlever le pont') : L('Make it a single bridge', 'En faire un pont simple'),
          play: () => {
            for (let t = 0; t < 3 && b[k] !== to; t++) cycle(k);
            sel = -1;
            after();
          },
        };
      };
      for (let i = 0; i < islands.length; i++) {
        const got = have(i),
          need = islands[i].need;
        const k = extra.find((x) => inc[i].includes(x));
        if (got > need && k != null)
          return fix(k, L(`This ${need} has ${got} bridges: one too many.`, `Ce ${need} a ${got} ponts : c’est trop.`), [islEls[i]]);
      }
      // A group of complete islands closed off from the rest.
      const comp = new Array<number>(islands.length).fill(-1);
      for (let s0 = 0; s0 < islands.length; s0++) {
        if (comp[s0] >= 0) continue;
        const members = [s0];
        comp[s0] = s0;
        for (let q = 0; q < members.length; q++)
          for (const k of inc[members[q]]) {
            const j = edges[k].a === members[q] ? edges[k].b : edges[k].a;
            if (b[k] && comp[j] < 0) {
              comp[j] = s0;
              members.push(j);
            }
          }
        if (members.length === islands.length || !members.every((i) => have(i) === islands[i].need)) continue;
        const k = extra.find((x) => comp[edges[x].a] === s0);
        if (k != null)
          return fix(
            k,
            L(
              'These islands are complete but cut off from the rest: every island must connect to all the others.',
              'Ces îles sont complètes mais coupées du reste : toutes les îles doivent être reliées entre elles.',
            ),
            members.map((i) => islEls[i]),
          );
      }
      const k = extra[0];
      const e = edges[k];
      return fix(
        k,
        L(
          `This bridge between the ${islands[e.a].need} and the ${islands[e.b].need} breaks no rule yet, but it leads to a dead end.`,
          `Ce pont entre le ${islands[e.a].need} et le ${islands[e.b].need} ne brise encore aucune règle, mais il mène à une impasse.`,
        ),
        [islEls[e.a], islEls[e.b]],
      );
    };
    // Guide: forced bridges from one island's point of view, simplest reason first.
    let lastKind = '';
    const hint = (): Hint | null => {
      if (done) return null;
      const have = (i: number) => inc[i].reduce((t, k) => t + b[k], 0);
      const other = (k: number, i: number) => (edges[k].a === i ? edges[k].b : edges[k].a);
      /** Most bridges edge `k` can end up with, seen from island `i`, and what limits it from the far side. */
      const cap = (k: number, i: number): { v: number; why: 'cross' | 'full' | 'pair' | '' } => {
        const j = other(k, i);
        if (!b[k] && cross[k].some((f) => b[f] > 0)) return { v: 0, why: 'cross' };
        if (islands.length > 2 && islands[i].need === 1 && islands[j].need === 1 && !b[k]) return { v: 0, why: 'pair' };
        const own = b[k] + islands[i].need - have(i);
        const far = b[k] + islands[j].need - have(j);
        let v = Math.min(2, own, far);
        let why: 'full' | 'pair' | '' = far < Math.min(2, own) ? 'full' : '';
        if (islands.length > 2 && islands[i].need === 2 && islands[j].need === 2 && v > 1) {
          v = 1;
          why = 'pair';
        }
        return { v, why };
      };
      const cands: { kind: string; hint: Hint }[] = [];
      islands.forEach((isl, i) => {
        const rem = isl.need - have(i);
        if (rem <= 0) return;
        const caps = inc[i].map((k) => cap(k, i));
        const total = caps.reduce((t, c) => t + c.v, 0);
        const forced = inc[i].map((k, x) => ({ k, lb: Math.max(b[k], isl.need - (total - caps[x].v)) })).filter((f) => f.lb > b[f.k]);
        if (!forced.length) return;
        const live = inc[i].filter((_, x) => caps[x].v > 0);
        const lims = inc[i].map((k, x) => ({ k, ...caps[x] })).filter((c) => c.why && c.v < 2 && !forced.some((f) => f.k === c.k));
        const lim = lims.find((c) => !b[c.k]) ?? lims[0];
        const name = (k: number) => islands[other(k, i)].need;
        const N = isl.need;
        let kind: string;
        let text: string;
        if (live.length === 1) {
          const f = forced[0];
          kind = 'one';
          text = L(
            `This ${N} can only reach one island, the ${name(f.k)}, so ${f.lb === 2 ? 'it needs a double bridge there' : 'its bridge goes there'}.`,
            `Ce ${N} ne peut atteindre qu’une île, le ${name(f.k)} : ${f.lb === 2 ? 'il lui faut un pont double vers elle' : 'son pont va là'}.`,
          );
        } else if (total === isl.need) {
          kind = 'all';
          text =
            rem === isl.need && live.length * 2 === N
              ? L(
                  `This ${N} has only ${live.length} neighbours, and two islands share at most 2 bridges: it needs a double bridge to each.`,
                  `Ce ${N} n’a que ${live.length} voisines, et deux îles partagent au plus 2 ponts : il lui faut un pont double vers chacune.`,
                )
              : rem === isl.need
                ? L(
                    `This ${N} can get at most ${total} bridges from its ${live.length} neighbours, exactly what it needs: build them all.`,
                    `Ce ${N} peut recevoir au plus ${total} ponts de ses ${live.length} voisines, exactement ce qu’il lui faut : construisez-les tous.`,
                  )
                : L(
                    `This ${N} still needs ${rem}, and its neighbours can take exactly ${rem} more: build ${forced.length === 1 ? 'it' : 'them all'}.`,
                    `Ce ${N} demande encore ${rem} pont${rem > 1 ? 's' : ''}, et ses voisines peuvent en prendre exactement ${rem} : construisez-${forced.length === 1 ? 'le' : 'les tous'}.`,
                  );
        } else {
          const f = forced[0];
          const x = inc[i].reduce((t, k, y) => t + (k === f.k ? 0 : caps[y].v - b[k]), 0);
          kind = 'some';
          text =
            rem === isl.need
              ? L(
                  `This ${N} can get at most ${x} from its other neighbours, so at least ${f.lb === 1 ? 'one bridge goes' : 'two bridges go'} to the ${name(f.k)}.`,
                  `Ce ${N} peut recevoir au plus ${x} pont${x > 1 ? 's' : ''} de ses autres voisines : au moins ${f.lb === 1 ? 'un pont va' : 'deux ponts vont'} vers le ${name(f.k)}.`,
                )
              : L(
                  `This ${N} still needs ${rem}, but its other neighbours can take only ${x} more, so the ${name(f.k)} gets ${f.lb === 2 ? 'a double bridge' : 'a bridge'}.`,
                  `Ce ${N} demande encore ${rem} pont${rem > 1 ? 's' : ''}, mais ses autres voisines n’en prennent que ${x} de plus : le ${name(f.k)} reçoit ${f.lb === 2 ? 'un pont double' : 'un pont'}.`,
                );
        }
        const why: Element[] = [islEls[i]];
        if (lim) {
          const j = other(lim.k, i);
          kind = lim.why;
          if (lim.why === 'cross') {
            const f = cross[lim.k].find((x) => b[x] > 0)!;
            why.push(spanEls[f]);
            text = L('A bridge already blocks one way. ', 'Un pont bloque déjà un passage. ') + text;
          } else if (lim.why === 'full') {
            why.push(islEls[j]);
            const left = islands[j].need - have(j);
            text =
              (left
                ? L(
                    `The ${islands[j].need} next to it can take only one more bridge. `,
                    `Le ${islands[j].need} voisin ne peut prendre qu’un pont de plus. `,
                  )
                : L(`The ${islands[j].need} next to it is already complete. `, `Le ${islands[j].need} voisin est déjà complet. `)) + text;
          } else {
            why.push(islEls[j]);
            text =
              (N === 1
                ? L(
                    'Two 1s can’t be joined: they’d be cut off from the rest. ',
                    'Deux 1 ne peuvent pas être reliés : ils seraient coupés du reste. ',
                  )
                : L(
                    'Two 2s can’t share a double bridge: they’d be cut off. ',
                    'Deux 2 ne peuvent pas partager un pont double : ils seraient isolés. ',
                  )) + text;
          }
        }
        cands.push({
          kind,
          hint: {
            text,
            why,
            at: forced.map((f) => spanEls[f.k]),
            play: () => {
              for (const f of forced) while (b[f.k] < f.lb) cycle(f.k);
              sel = -1;
              after();
            },
          },
        });
      });
      const order = ['one', 'all', 'full', 'cross', 'pair', 'some'];
      cands.sort((x, y) => order.indexOf(x.kind) - order.indexOf(y.kind));
      const pick = cands.find((c) => c.kind !== lastKind) ?? cands[0];
      if (pick) {
        lastKind = pick.kind;
        return pick.hint;
      }
      // No single island decides: lean on the intended solution and say so.
      const k = p.sol.findIndex((v, x) => b[x] < v);
      if (k < 0) return null;
      lastKind = '';
      const e = edges[k];
      return {
        text: L(
          `No island decides alone here. Try the options: only a bridge between this ${islands[e.a].need} and ${islands[e.b].need} keeps everything connected.`,
          `Aucune île ne décide seule ici. Essayez les options : seul un pont entre ce ${islands[e.a].need} et ce ${islands[e.b].need} garde tout relié.`,
        ),
        why: [islEls[e.a], islEls[e.b]],
        at: [spanEls[k]],
        play: () => {
          cycle(k);
          sel = -1;
          after();
        },
      };
    };
    return { snapshot: () => ({ b, sel }), hint, check };
  },
};
