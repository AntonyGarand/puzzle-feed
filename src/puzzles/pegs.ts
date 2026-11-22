import { L, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, h, restartBtn, shake, undoBtn } from '../core/ui';
import { anim } from './movekit/kit';
import { genPegs, jumps, pegSolver, type Jump, type PegVerdict } from './playkit/pegs-gen';
import './pegs.css';

export const pegs: PuzzleDef = {
  id: 'pegs',
  get name() {
    return L('Pegs', 'Billes');
  },
  category: 'moves',
  get rules() {
    return L('Jump pegs over each other until only one is left.', 'Sautez les billes par-dessus les autres : gardez-en une.');
  },
  help: () => ({
    goal: L(
      'Remove pegs by jumping over them until a single peg is left. On Master, that last peg must end in the centre hole.',
      'Retirez des billes en sautant par-dessus jusqu’à ce qu’il n’en reste qu’une. En Maître, la dernière doit finir dans le trou du centre.',
    ),
    steps: [
      L(
        'A peg jumps over a neighbouring peg into the empty hole just beyond it; the peg jumped over is removed.',
        'Une bille saute par-dessus une bille voisine et atterrit dans le trou vide juste derrière; la bille sautée est retirée.',
      ),
      L(
        'Jumps go up, down, left or right. On Medium and Expert, diagonal jumps are allowed too.',
        'Les sauts se font vers le haut, le bas, la gauche ou la droite. En Moyen et en Expert, les sauts en diagonale sont aussi permis.',
      ),
      L(
        'Tap a peg to pick it up (its landing holes light up), then tap a lit hole. You can also drag the peg onto the hole.',
        'Touchez une bille pour la prendre (ses trous d’arrivée s’allument), puis touchez un trou allumé. Vous pouvez aussi glisser la bille jusqu’au trou.',
      ),
      L(
        'Undo (Z) takes back a jump; Restart (R) puts every peg back. If no jump is left and more than one peg remains, undo and try another way.',
        'Annuler (Z) reprend un saut; Repartir (R) remet toutes les billes. S’il ne reste aucun saut possible et plus d’une bille, annulez et essayez autrement.',
      ),
    ],
    tips: [
      L(
        'Don’t strand pegs alone at the edges: bring the far ones back toward the middle early.',
        'Ne laissez pas de billes isolées sur les bords : ramenez tôt les plus éloignées vers le centre.',
      ),
      L(
        'On the cross, clear one arm at a time and keep the centre busy until the very end.',
        'Sur la croix, videz un bras à la fois et gardez le centre occupé jusqu’à la toute fin.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [40, 70, 120, 180, 420]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const B = genPegs(rng, d);
    const { cols, rows, holes, goal } = B;
    const N = cols * rows;
    const peg = new Array<boolean>(N).fill(false);
    const reset = () => {
      peg.fill(false);
      for (const i of B.pegs) peg[i] = true;
    };
    reset();
    const done: Jump[] = [];
    let sel = -1;
    let over = false;
    let justPicked = false;

    const grid = board(cols, rows, 'pegs-grid');
    const beads: HTMLElement[] = [];
    const cells = Array.from({ length: N }, (_, i) => {
      if (!holes[i]) {
        const el = h('div', { class: 'cell void', 'aria-hidden': 'true' });
        grid.append(el);
        return el;
      }
      const bead = h('span', { class: 'bead' });
      beads[i] = bead;
      const el = h('button', { class: 'cell hole', type: 'button', 'data-i': i, onclick: () => tap(i) }, bead);
      grid.append(el);
      return el;
    });

    const count = () => peg.filter(Boolean).length;
    const targets = () => (sel >= 0 ? jumps(B, peg, sel) : []);
    const render = () => {
      const tg = new Set(targets().map((j) => j.to));
      cells.forEach((el, i) => {
        if (!holes[i]) return;
        el.className = `cell hole${peg[i] ? ' has' : ''}${i === sel ? ' sel' : ''}${tg.has(i) ? ' hint' : ''}${i === goal ? ' goal' : ''}`;
        el.setAttribute(
          'aria-label',
          peg[i] ? L('peg', 'bille') : tg.has(i) ? L('landing hole', 'trou d’arrivée') : L('empty hole', 'trou vide'),
        );
      });
      const left = count();
      const stuck = !jumps(B, peg).length && !(left === 1 && (goal < 0 || peg[goal]));
      ctx.status(
        `${P(left, ['peg left', 'pegs left'], ['bille restante', 'billes restantes'])}${
          stuck
            ? L(' · no jumps left · undo', ' · plus aucun saut · annulez')
            : goal >= 0
              ? L(' · finish in the centre', ' · finissez au centre')
              : ''
        }`,
      );
    };

    const play = (j: Jump, animate = true) => {
      peg[j.from] = peg[j.over] = false;
      peg[j.to] = true;
      done.push(j);
      sel = -1;
      if (!animate) return;
      render();
      const a = cells[j.from],
        b = cells[j.to];
      const dx = a.offsetLeft - b.offsetLeft,
        dy = a.offsetTop - b.offsetTop;
      anim(
        beads[j.to],
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: `translate(${dx / 2}px, ${dy / 2}px) scale(1.25)`, offset: 0.5 },
          { transform: 'none' },
        ],
        240,
      );
      const left = count();
      if (left === 1 && (goal < 0 || peg[goal])) {
        over = true;
        ctx.solved();
      } else if (!jumps(B, peg).length) shake(grid); // dead end: the status says so, Undo backs out
    };

    const tap = (i: number) => {
      if (over) return;
      if (justPicked && i === sel) {
        justPicked = false;
        return;
      }
      justPicked = false;
      const j = targets().find((t) => t.to === i);
      if (j) {
        ctx.touch();
        play(j);
        return;
      }
      if (peg[i] && i !== sel) {
        sel = i;
        if (!targets().length) shake(cells[i]);
      } else sel = -1;
      render();
    };

    // Drag: press a peg (it gets picked up), release over a lit hole.
    grid.style.touchAction = 'none';
    grid.addEventListener('pointerdown', (e) => {
      if (over) return;
      const el = (e.target as Element).closest<HTMLElement>('[data-i]');
      const i = el ? Number(el.dataset.i) : -1;
      if (i < 0 || !peg[i] || i === sel) return;
      ctx.touch();
      sel = i;
      justPicked = true;
      render();
    });
    grid.addEventListener('pointerup', (e) => {
      if (over || sel < 0) return;
      const el = document.elementFromPoint?.(e.clientX, e.clientY)?.closest<HTMLElement>('[data-i]');
      const i = el && grid.contains(el) ? Number(el.dataset.i) : -1;
      const j = targets().find((t) => t.to === i);
      if (!j) return;
      justPicked = false;
      play(j);
    });

    const undo = () => {
      if (over || !done.length) return;
      const j = done.pop()!;
      peg[j.from] = peg[j.over] = true;
      peg[j.to] = false;
      sel = -1;
      render();
    };
    const restart = () => {
      if (over) return;
      reset();
      done.length = 0;
      sel = -1;
      render();
    };
    ctx.controls(undoBtn(undo), restartBtn(restart));

    const sv = ctx.saved as { moves?: unknown; sel?: unknown } | undefined;
    if (Array.isArray(sv?.moves)) {
      for (const m of sv.moves) {
        if (!Array.isArray(m)) break;
        const j = jumps(B, peg, m[0]).find((t) => t.to === m[1]);
        if (!j) break;
        play(j, false);
      }
      if (Number.isInteger(sv.sel) && peg[sv.sel as number]) sel = sv.sel as number;
    }
    // ---- Guide ----
    /** Solver with memory across calls (solved and hopeless positions stay known). */
    const solver = pegSolver(B);
    let memo: { key: string; v: PegVerdict } | null = null;
    const verdict = () => {
      const key = peg.map((v) => (v ? 1 : 0)).join('');
      if (memo?.key !== key) memo = { key, v: solver(peg, 150000) };
      return memo.v;
    };
    const after = (j: Jump) => {
      const q = peg.slice();
      q[j.from] = q[j.over] = false;
      q[j.to] = true;
      return q;
    };
    /** Pegs with no other peg among their 8 neighbours: nothing can ever jump them or be jumped by them. */
    const alone = (p: boolean[]) =>
      p
        .map((v, i) => {
          if (!v) return -1;
          const r = Math.floor(i / cols),
            c = i % cols;
          for (let dr = -1; dr <= 1; dr++)
            for (let dc = -1; dc <= 1; dc++) {
              const rr = r + dr,
                cc = c + dc;
              if ((dr || dc) && rr >= 0 && rr < rows && cc >= 0 && cc < cols && p[rr * cols + cc]) return -1;
            }
          return i;
        })
        .filter((i) => i >= 0);
    /** Back out of a dead end: undo a jump, or restart when there's none to undo. */
    const backOut = () => (done.length ? undo() : restart());
    /** Dead end: the solver proved that no sequence of jumps leaves a single peg any more. */
    const check = (): Hint | null => {
      if (over || !done.length || verdict().status !== 'dead') return null;
      const left = count();
      const lone = alone(peg);
      return {
        kind: 'stuck',
        text: lone.length
          ? L(
              `No sequence of jumps clears these ${left} pegs down to one${goal >= 0 ? ' in the centre' : ''}: the outlined ${lone.length === 1 ? 'peg is' : 'pegs are'} cut off from the rest. Undo a jump.`,
              `Aucune suite de sauts ne réduit ces ${left} billes à une seule${goal >= 0 ? ' au centre' : ''} : ${lone.length === 1 ? 'la bille encadrée est isolée' : 'les billes encadrées sont isolées'} du reste. Annulez un saut.`,
            )
          : L(
              `No sequence of jumps clears these ${left} pegs down to one${goal >= 0 ? ' in the centre' : ''} any more. Undo a jump and try another.`,
              `Plus aucune suite de sauts ne réduit ces ${left} billes à une seule${goal >= 0 ? ' au centre' : ''}. Annulez un saut et essayez-en un autre.`,
            ),
        why: lone.map((i) => cells[i]),
        at: [cells[done[done.length - 1].to]],
        action: L('Undo', 'Annuler'),
        play: backOut,
      };
    };
    let lastKind = '';
    const hint = (): Hint | null => {
      if (over) return null;
      const all = jumps(B, peg);
      if (!all.length) return null;
      const here = verdict();
      const after1 = all.map((j) => (here.status === 'win' && here.next === j ? 'win' : solver(after(j), 4000).status));
      const good = all.filter((_, k) => after1[k] === 'win');
      const bad = all.filter((_, k) => after1[k] === 'dead');
      const known = good.length + bad.length === all.length;
      const pick = (here.status === 'win' ? here.next : null) ?? good[0] ?? all.find((_, k) => after1[k] !== 'dead') ?? all[0];
      const sure = good.includes(pick);
      const left = count();
      const base = { why: [cells[pick.from], cells[pick.over]], at: [cells[pick.to]], play: () => (tap(pick.from), tap(pick.to)) };
      const kinds: { kind: string; text: string; why?: Element[] }[] = [];
      if (!done.length)
        kinds.push({
          kind: 'start',
          text: L(
            'A peg jumps over a neighbouring peg into the empty hole just beyond it, and the peg it jumps over is removed. Start with this one.',
            'Une bille saute par-dessus une bille voisine et atterrit dans le trou vide juste derrière; la bille sautée est retirée. Commencez par celle-ci.',
          ),
        });
      if (left === 2)
        kinds.push({
          kind: 'last',
          text: L(
            `Two pegs left, side by side: jump one over the other to finish with a single peg${goal >= 0 ? ' in the centre' : ''}.`,
            `Il reste deux billes côte à côte : sautez l’une par-dessus l’autre pour finir avec une seule bille${goal >= 0 ? ' au centre' : ''}.`,
          ),
        });
      if (all.length === 1)
        kinds.push({
          kind: 'only',
          text: L(
            'Only one jump is possible right now: this is the only peg with a neighbour and an empty hole just beyond it.',
            'Un seul saut est possible pour l’instant : c’est la seule bille qui a une voisine et un trou vide juste derrière.',
          ),
        });
      if (good.length && bad.length) {
        // Explain what a wrong jump would do.
        const strand = bad.map((j) => ({ j, lone: alone(after(j)) })).find((x) => x.lone.length);
        const dead = bad.find((j) => !jumps(B, after(j)).length);
        if (strand)
          kinds.push({
            kind: 'strand',
            text: L(
              `Careful: ${all.length} jumps are possible, but ${bad.length === 1 && all.length === 2 ? 'the other would' : 'some would'} leave a peg alone with no neighbour, and it could never be removed. This one keeps the pegs together.`,
              `Attention : ${all.length} sauts sont possibles, mais ${bad.length === 1 && all.length === 2 ? 'l’autre laisserait' : 'certains laisseraient'} une bille seule sans voisine, impossible à retirer. Celui-ci garde les billes ensemble.`,
            ),
          });
        else if (dead)
          kinds.push({
            kind: 'dead',
            text: L(
              `Some jumps here would leave no jump at all, with ${left - 1} pegs still on the board. This one keeps the game going.`,
              `Certains sauts ne laisseraient plus aucun saut possible, avec encore ${left - 1} billes. Celui-ci garde la partie en vie.`,
            ),
          });
        else if (known)
          kinds.push({
            kind: 'plan',
            text: L(
              `${all.length} jumps are possible, but only ${good.length === 1 ? 'this one leaves' : 'some leave'} a way to clear the board. Think a few jumps ahead before you move.`,
              `${all.length} sauts sont possibles, mais ${good.length === 1 ? 'seul celui-ci laisse' : 'seuls certains laissent'} une façon de vider le plateau. Prévoyez quelques sauts d’avance.`,
            ),
          });
      }
      // Does the jump bring the peg closer to the others?
      const others = peg.map((v, i) => (v && i !== pick.from && i !== pick.over ? i : -1)).filter((i) => i >= 0);
      const dist = (i: number) =>
        others.reduce((t, o) => t + Math.abs(Math.floor(o / cols) - Math.floor(i / cols)) + Math.abs((o % cols) - (i % cols)), 0);
      if (others.length && dist(pick.to) < dist(pick.from))
        kinds.push({
          kind: 'gather',
          text: L(
            'Jump toward the other pegs, not away from them: pegs that stay close together can keep jumping each other.',
            'Sautez vers les autres billes, pas loin d’elles : des billes regroupées peuvent continuer à se sauter.',
          ),
        });
      kinds.push({
        kind: 'plain',
        text: sure
          ? L(
              'This jump removes a peg and still leaves a way to clear the board down to one.',
              'Ce saut retire une bille et laisse encore une façon de vider le plateau jusqu’à une seule.',
            )
          : L(
              'This jump removes a peg and keeps the pegs close together, so they can keep jumping each other.',
              'Ce saut retire une bille et garde les billes regroupées, pour qu’elles puissent continuer à se sauter.',
            ),
      });
      const k = kinds.find((x) => x.kind !== lastKind) ?? kinds[0];
      lastKind = k.kind;
      return { ...base, text: k.text, why: k.why ?? base.why };
    };

    root.append(grid);
    render();
    return {
      snapshot: () => ({ moves: done.map((j) => [j.from, j.to]), sel }),
      check,
      hint,
      onKey(e) {
        const k = e.key.toLowerCase();
        if (k === 'z' || k === 'backspace') undo();
        else if (k === 'r') restart();
        else if (k === 'escape' && sel >= 0) {
          sel = -1;
          render();
        } else return false;
        return true;
      },
    };
  },
};
