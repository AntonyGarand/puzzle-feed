import { L } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { btn, h, s, shake } from '../core/ui';
import { genBeehive } from './pathkit/beehive-gen';
import { capture } from './pathkit/grid';
import { deadEnd, solvePath, type PathSolve } from './pathkit/number-path';
import './beehive.css';

const SQ3 = Math.sqrt(3);

export const beehive: PuzzleDef = {
  id: 'beehive',
  get name() {
    return L('Beehive', 'Ruche');
  },
  category: 'paths',
  get rules() {
    return L('Count 1 to N through touching hexes. Tap to step.', 'Comptez de 1 à N d’un hexagone voisin à l’autre.');
  },
  help: () => ({
    goal: L(
      'Fill every hex with the numbers 1 to N so that each number touches the next one. Some numbers are already given.',
      'Remplissez chaque hexagone avec les nombres de 1 à N : chaque nombre doit toucher le suivant. Certains nombres sont déjà donnés.',
    ),
    steps: [
      L(
        'Your chain starts at 1. Tap a neighbouring hex to place the next number there.',
        'Votre chaîne part de 1. Touchez un hexagone voisin pour y placer le nombre suivant.',
      ),
      L('You can also drag across several hexes in a row.', 'Vous pouvez aussi glisser le doigt sur plusieurs hexagones d’affilée.'),
      L(
        'A given number must be reached exactly on its turn: you can’t pass it early, and when it’s next, you must step onto it.',
        'Un nombre donné doit être atteint pile à son tour : impossible d’y passer trop tôt, et quand c’est lui le suivant, vous devez y aller.',
      ),
      L('Highlighted hexes show where the next number can go.', 'Les hexagones en surbrillance montrent où peut aller le prochain nombre.'),
      L(
        'Tap a placed number to rewind to it. Undo removes the last number; Reset starts over from 1.',
        'Touchez un nombre placé pour revenir à lui. Annuler retire le dernier nombre; Repartir revient à 1.',
      ),
    ],
    tips: [
      L(
        'Aim for the next given number: your path must reach it in exactly the right number of steps.',
        'Visez le prochain nombre donné : votre chemin doit l’atteindre en exactement le bon nombre de pas.',
      ),
      L(
        'Don’t leave a lone hex behind you; you can never come back for it.',
        'Ne laissez pas d’hexagone isolé derrière vous : vous ne pourrez plus y revenir.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [30, 60, 90, 150, 220]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const P = genBeehive(rng, d);
    const { cells, adj, givens } = P;
    const N = cells.length;
    const givenAt = new Map<number, number>(); // number -> cell
    givens.forEach((g, i) => g && givenAt.set(g, i));
    const chain: number[] = [givenAt.get(1)!];

    // ---- layout ----
    const cx = cells.map((c) => SQ3 * (c.q + c.r / 2));
    const cy = cells.map((c) => 1.5 * c.r);
    const pad = 0.25;
    const minX = Math.min(...cx) - SQ3 / 2 - pad,
      maxX = Math.max(...cx) + SQ3 / 2 + pad;
    const minY = Math.min(...cy) - 1 - pad,
      maxY = Math.max(...cy) + 1 + pad;
    const vw = maxX - minX,
      vh = maxY - minY;
    const svg = s('svg', { class: 'beehive', viewBox: `${minX} ${minY} ${vw} ${vh}`, style: `aspect-ratio:${vw}/${vh}` });
    const corners = Array.from({ length: 6 }, (_, k) => {
      const a = (Math.PI / 180) * (60 * k + 30);
      return [Math.cos(a) * 0.93, Math.sin(a) * 0.93];
    });
    const fs = N > 40 ? 0.78 : 0.86;
    const groups = cells.map((_, i) => {
      const t = s('text', { x: cx[i], y: cy[i], 'font-size': fs, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
      const g = s(
        'g',
        { class: 'hex', 'data-i': i },
        s('polygon', { points: corners.map(([x, y]) => `${(cx[i] + x).toFixed(3)},${(cy[i] + y).toFixed(3)}`).join(' ') }),
        t,
      );
      svg.append(g);
      return { g, t };
    });

    let finished = false;
    const render = () => {
      const pos = new Map<number, number>();
      chain.forEach((c, k) => pos.set(c, k));
      const end = chain[chain.length - 1];
      const next = chain.length + 1;
      groups.forEach(({ g, t }, i) => {
        const k = pos.get(i);
        const num = givens[i] || (k != null ? k + 1 : 0);
        t.textContent = num ? String(num) : '';
        const canStep = !finished && k == null && adj[end].includes(i) && (givens[i] ? givens[i] === next : !givenAt.has(next));
        g.setAttribute(
          'class',
          `hex${givens[i] ? ' given' : ''}${k != null ? ' placed' : ''}${i === end ? ' end' : ''}${canStep ? ' next' : ''}`,
        );
      });
      ctx.status(`${chain.length} / ${N}`);
      return chain.length === N;
    };
    const check = () => {
      if (render() && !finished) {
        finished = true;
        render();
        ctx.solved();
      }
    };

    /** Act on a hex; `drag` is true for cells entered while dragging (no rewinds except one step back). */
    const act = (i: number, drag: boolean): boolean => {
      if (finished || i < 0) return false;
      const at = chain.indexOf(i);
      const end = chain[chain.length - 1];
      if (at >= 0) {
        if (at === chain.length - 1) return true;
        if (drag && at !== chain.length - 2) return false;
        chain.length = at + 1;
        return true;
      }
      if (!adj[end].includes(i)) return false;
      const next = chain.length + 1;
      if (givens[i] ? givens[i] !== next : givenAt.has(next)) return false;
      chain.push(i);
      return true;
    };

    // ---- pointer: tap or drag across hexes ----
    let dragging = false;
    const hexAt = (e: PointerEvent): number => {
      const el = (e.target as Element | null)?.closest?.('[data-i]');
      if (el && svg.contains(el) && e.type === 'pointerdown') return Number(el.getAttribute('data-i'));
      const r = svg.getBoundingClientRect();
      if (!r.width) return -1;
      const x = minX + ((e.clientX - r.left) / r.width) * vw;
      const y = minY + ((e.clientY - r.top) / r.height) * vh;
      let best = -1,
        bd = 0.8;
      for (let i = 0; i < N; i++) {
        const dd = Math.hypot(cx[i] - x, cy[i] - y);
        if (dd < bd) {
          bd = dd;
          best = i;
        }
      }
      return best;
    };
    svg.addEventListener('pointerdown', (e) => {
      const i = hexAt(e);
      if (i < 0 || finished) return;
      ctx.touch();
      e.preventDefault();
      if (act(i, false)) {
        dragging = true;
        capture(svg, e.pointerId);
      } else {
        shake(svg);
      }
      check();
    });
    svg.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const i = hexAt(e);
      if (i >= 0 && i !== chain[chain.length - 1] && act(i, true)) check();
    });
    const end = () => (dragging = false);
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);

    ctx.controls(
      btn(
        L('Undo', 'Annuler'),
        () => {
          if (!finished && chain.length > 1) {
            chain.pop();
            render();
          }
        },
        'ghost',
      ),
      btn(
        L('Reset', 'Repartir'),
        () => {
          if (!finished) {
            chain.length = 1;
            render();
          }
        },
        'ghost',
      ),
    );

    // ---- resume: replay the saved chain through the same rules ----
    const sv = ctx.saved as { chain?: unknown } | undefined;
    if (Array.isArray(sv?.chain) && sv.chain[0] === chain[0]) {
      for (const v of sv.chain.slice(1)) if (!Number.isInteger(v) || chain.includes(v as number) || !act(v as number, false)) break;
      if (chain.length === N) chain.pop(); // never resume into an already-solved state
    }
    root.append(h('div', { class: 'beehive-wrap' }, svg));
    render();

    // ---- guide: one number at a time, with the simplest rule that pins it ----
    const hexEl = (i: number) => groups[i].g;
    let lastRule = '';
    /** Solver result for the current chain, kept while the chain follows it. */
    let memo: (PathSolve & { key: string }) | null = null;
    const BUDGET = 6000;
    const solveHere = (): PathSolve => {
      const key = chain.join(',');
      if (memo?.path && chain.every((c, k) => memo!.path![k] === c)) return memo;
      if (memo?.key !== key) memo = { key, ...solvePath(adj, givenAt, chain, BUDGET, P.path) };
      return memo;
    };
    /** Length of the chain's common start with the stored solution. */
    const onTrack = () => {
      let k = 0;
      while (k < chain.length && chain[k] === P.path[k]) k++;
      return k;
    };
    const rewind = (k: number) => {
      act(chain[k - 1], false);
      check();
    };
    /** A chain that can no longer cover the board: say why, and go back to the last number that still can. */
    const checkHint = (): Hint | null => {
      if (finished) return null;
      const k0 = onTrack();
      if (k0 === chain.length) return null;
      const res = solveHere();
      if (res.path || res.capped) return null;
      let k = chain.length - 1;
      const t0 = performance.now();
      while (k > k0 && (performance.now() - t0 > 25 || !solvePath(adj, givenAt, chain.slice(0, k), BUDGET, P.path).path)) k--;
      const dead = deadEnd(adj, givenAt, chain);
      const text = !dead
        ? L(
            `This route leads to a dead end: there is no way to visit every hex from here. Go back to ${k}.`,
            `Ce chemin mène à une impasse : impossible de visiter tous les hexagones d’ici. Revenez au ${k}.`,
          )
        : dead.kind === 'isolated'
          ? L(
              `This empty hex is walled in by used hexes: the path can never reach it. Go back to ${k}.`,
              `Cet hexagone libre est entouré d’hexagones utilisés : le chemin ne pourra jamais l’atteindre. Revenez au ${k}.`,
            )
          : dead.kind === 'ends'
            ? L(
                `These hexes each have a single way in, so each would have to be the last number. Only one can be. Go back to ${k}.`,
                `Ces hexagones n’ont chacun qu’une seule entrée : chacun devrait être le dernier nombre, mais un seul peut l’être. Revenez au ${k}.`,
              )
            : dead.kind === 'split'
              ? L(
                  `The path has cut these hexes off from the rest: it can’t visit both sides. Go back to ${k}.`,
                  `Le chemin a coupé ces hexagones du reste : il ne peut pas visiter les deux côtés. Revenez au ${k}.`,
                )
              : L(
                  `${dead.num} must come ${dead.steps} step${dead.steps > 1 ? 's' : ''} after ${chain.length}, but ${dead.dist < 0 ? 'it can’t be reached any more' : `it is ${dead.dist} steps away`}. Go back to ${k}.`,
                  `Le ${dead.num} doit venir ${dead.steps} pas après le ${chain.length}, mais ${dead.dist < 0 ? 'il est devenu inaccessible' : `il est à ${dead.dist} pas`}. Revenez au ${k}.`,
                );
      const why = !dead ? [] : dead.kind === 'isolated' || dead.kind === 'far' ? [dead.cell] : dead.cells;
      return {
        kind: 'fix',
        text,
        why: why.map(hexEl),
        at: chain.slice(k).map(hexEl),
        action: L(`Back to ${k}`, `Revenir au ${k}`),
        play: () => rewind(k),
      };
    };
    const hint = (): Hint | null => {
      if (finished) return null;
      const res = solveHere();
      if (!res.path) {
        // The search gave up on this route (too many options): go back to where a known route continues.
        const k = Math.max(1, onTrack());
        return {
          text: L(
            `This route is hard to finish from here. Tap ${k} to go back to where a known route continues.`,
            `Ce chemin est difficile à terminer d’ici. Touchez ${k} pour revenir là où un chemin connu continue.`,
          ),
          why: chain.slice(k).map(hexEl),
          at: [hexEl(chain[k - 1])],
          play: () => rewind(k),
        };
      }
      const sol = res.path;
      const len = chain.length;
      const tip = chain[len - 1];
      const next = len + 1;
      const x = sol[len];
      const play = () => {
        act(x, false);
        check();
      };
      const at = [hexEl(x)];
      const used = new Set(chain);
      const free = (i: number) => !used.has(i) && !givens[i];
      if (givenAt.has(next)) {
        // Printed numbers in a row: walk onto all of them.
        let upto = next;
        while (givenAt.has(upto + 1)) upto++;
        const run = sol.slice(len, upto);
        lastRule = 'given';
        return {
          text:
            upto > next
              ? L(
                  `${upto === next + 1 ? `${next} and ${upto}` : `${next} to ${upto}`} are already printed, one after the other: step onto them in order. Given numbers must be reached exactly on their turn.`,
                  `Les nombres ${next} ${upto === next + 1 ? 'et' : 'à'} ${upto} sont déjà inscrits à la suite : passez-y dans l’ordre. Un nombre donné doit être atteint pile à son tour.`,
                )
              : L(
                  `${next} is already printed next to ${len}: step onto it. Given numbers must be reached exactly on their turn.`,
                  `Le ${next} est déjà inscrit à côté du ${len} : allez-y. Un nombre donné doit être atteint pile à son tour.`,
                ),
          why: [hexEl(tip)],
          at: run.map(hexEl),
          play: () => {
            for (const i of run) act(i, false);
            check();
          },
        };
      }
      const cands = adj[tip].filter(free);
      // Next given number ahead, and how many steps are left to reach it.
      let g = next + 1;
      while (g <= N && !givenAt.has(g)) g++;
      const G = givenAt.get(g);
      const dist = (from: number) => {
        // Steps from `from` to G through free hexes.
        const seen = new Map([[from, 0]]);
        const q = [from];
        while (q.length) {
          const i = q.shift()!;
          if (i === G) return seen.get(i)!;
          for (const j of adj[i])
            if (!seen.has(j) && (free(j) || j === G) && j !== tip) {
              seen.set(j, seen.get(i)! + 1);
              q.push(j);
            }
        }
        return Infinity;
      };
      const rules: Record<string, () => Hint | null> = {
        only: () =>
          cands.length === 1 && cands[0] === x
            ? {
                text: L(
                  `Only one empty hex touches ${len}, so ${next} has to go there.`,
                  `Un seul hexagone libre touche le ${len} : le ${next} doit donc y aller.`,
                ),
                why: [hexEl(tip)],
                at,
                play,
              }
            : null,
        stranded: () => {
          // An empty neighbour with no other way in or out must be visited now, or it's lost.
          // (Only sound when N is printed elsewhere: otherwise a skipped dead tip could be the last hex.)
          const other = adj[x].filter((j) => !used.has(j));
          if (cands.length < 2 || other.length > 1 || !givenAt.has(N) || givenAt.get(N) === x) return null;
          return {
            text: L(
              `This hex touches only ${other.length ? 'one other open hex' : 'no other open hex'}. Skip it now and it gets stranded, so ${next} goes there.`,
              `Cet hexagone ne touche ${other.length ? 'qu’un seul autre hexagone ouvert' : 'aucun autre hexagone ouvert'}. Si vous le sautez, il restera isolé : le ${next} va donc là.`,
            ),
            why: [hexEl(tip), ...other.map(hexEl)],
            at,
            play,
          };
        },
        reach: () => {
          if (G == null || cands.length < 2) return null;
          const steps = g - next;
          const ok = cands.filter((c) => dist(c) <= steps);
          if (ok.length !== 1 || ok[0] !== x) return null;
          return {
            text: L(
              `${g} must come ${steps} step${steps > 1 ? 's' : ''} after ${next}. Only this hex is close enough to ${g}.`,
              `Le ${g} doit venir ${steps} pas après le ${next}. Seul cet hexagone est assez près du ${g}.`,
            ),
            why: [hexEl(G), hexEl(tip)],
            at,
            play,
          };
        },
      };
      const order = ['only', 'stranded', 'reach'];
      for (const r of [...order.filter((o) => o !== lastRule), lastRule]) {
        const found = rules[r]?.();
        if (found) {
          lastRule = r;
          return found;
        }
      }
      lastRule = '';
      return {
        text:
          G != null
            ? L(
                `Head for ${g} without cutting off any empty hexes: ${next} goes here so every hex can still be visited.`,
                `Visez le ${g} sans isoler d’hexagone libre : le ${next} va ici pour que tous restent accessibles.`,
              )
            : L(
                `Sweep up the remaining hexes without leaving one behind: ${next} goes here.`,
                `Ramassez les hexagones restants sans en laisser derrière : le ${next} va ici.`,
              ),
        why: G != null ? [hexEl(G)] : [hexEl(tip)],
        at,
        play,
      };
    };
    return { hint, check: checkHint, snapshot: () => ({ chain }) };
  },
};
