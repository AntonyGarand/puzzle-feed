import { L, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, btn, h, s, shake } from '../core/ui';
import { anim, keyDir, type Dir } from './movekit/kit';
import { adjacent, capture, cellAt, stepsToward } from './pathkit/grid';
import { blocker, genMow, lawnAdj, movesFrom, solveMow, type Blocker } from './playkit/lawn-gen';
import './lawn.css';

/** Grass blades for one cell (viewBox 0 0 10 10), rooted on the bottom edge; deterministic per cell. */
function blades(i: number) {
  const g = s('g', { class: 'blades' });
  let x = (i * 37) % 7;
  for (let k = 0; k < 5; k++) {
    const bx = 1.2 + k * 1.9 + ((x % 3) - 1) * 0.3;
    const lean = ((x % 5) - 2) * 0.45;
    const top = 2.2 + (x % 4) * 0.5;
    g.append(
      s('path', { d: `M${bx - 0.55} 10 Q${bx + lean * 0.4} ${(top + 10) / 2} ${bx + lean} ${top} Q${bx + 0.2} 7 ${bx + 0.55} 10Z` }),
    );
    x = (x * 5 + 3) % 11;
  }
  return g;
}

export const lawn: PuzzleDef = {
  id: 'lawn',
  get name() {
    return L('Mow', 'Tonte');
  },
  category: 'paths',
  offByDefault: true,
  get rules() {
    return L('Each pass cuts grass by one. Mow the whole lawn.', 'Chaque passage coupe l’herbe d’un cran. Tondez tout.');
  },
  help: () => ({
    goal: L(
      'Drive the mower until every patch of the lawn is cut down to the ground.',
      'Conduisez la tondeuse jusqu’à ce que toute la pelouse soit coupée à ras.',
    ),
    steps: [
      L(
        'The number on a patch is how many more times the mower must drive onto it. Each time it enters, the grass drops by one.',
        'Le chiffre sur une case indique combien de fois la tondeuse doit encore y entrer. Chaque passage baisse l’herbe d’un cran.',
      ),
      L(
        'The mower can’t enter a patch that’s already cut, or a rock. The patch it starts on is already cut.',
        'La tondeuse ne peut pas entrer sur une case déjà tondue ni sur une roche. Sa case de départ est déjà tondue.',
      ),
      L(
        'Tap a patch next to the mower, swipe, or drag from the mower to drive it. Arrow keys and WASD work too.',
        'Touchez une case voisine de la tondeuse, balayez, ou glissez à partir de la tondeuse. Les flèches et WASD fonctionnent aussi.',
      ),
      L(
        'If the mower gets stuck with grass left, Undo (Z) takes back a move and Restart (R) starts over.',
        'Si la tondeuse est coincée avant la fin, Annuler (Z) reprend un coup et Repartir (R) recommence.',
      ),
    ],
    tips: [
      L(
        'A patch with grass left but few uncut neighbours is a trap: you may never get back out of it. Save it for last.',
        'Une case encore haute entourée de cases tondues est un piège : vous risquez de ne plus pouvoir en ressortir. Gardez-la pour la fin.',
      ),
      L(
        'Tall grass needs several visits: go back and forth with a neighbour that is also tall.',
        'L’herbe haute demande plusieurs passages : faites l’aller-retour avec une voisine elle aussi haute.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [25, 60, 80, 150, 240]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const puz = genMow(rng, d);
    const { w, h: rows, rocks, start, walk } = puz;
    const N = w * rows;
    const adj = lawnAdj(w, rows, rocks);
    const g = puz.grass.slice();
    /** Cells entered, in order (undo pops). */
    const hist: number[] = [];
    let pos = start;
    let done = false;
    /** Direction the mower faces (for drawing only). */
    let facing: Dir = 0;

    const grid = board(w, rows, 'lawn-grid');
    const nums: HTMLElement[] = [];
    const cells = Array.from({ length: N }, (_, i) => {
      if (rocks[i]) {
        const el = h('div', { class: 'cell rock' });
        grid.append(el);
        nums.push(el);
        return el;
      }
      const num = h('span', { class: 'n' });
      nums.push(num);
      const el = h(
        'button',
        { type: 'button', class: 'cell', onclick: () => click(i) },
        s('svg', { class: 'grass', viewBox: '0 0 10 10', 'aria-hidden': 'true' }, blades(i)),
        num,
      );
      grid.append(el);
      return el;
    });
    const mower = h(
      'div',
      { class: 'mower', 'aria-hidden': 'true' },
      s(
        'svg',
        { viewBox: '0 0 10 10' },
        s('path', { class: 'handle', d: 'M2.6 9.6 V7.6 M7.4 9.6 V7.6 M2.2 9.6 H7.8' }),
        s('rect', { class: 'deck', x: 1.6, y: 1.4, width: 6.8, height: 6.4, rx: 1.6 }),
        s('circle', { class: 'hub', cx: 5, cy: 4.6, r: 1.5 }),
        s('rect', { class: 'wheel', x: 0.9, y: 1.8, width: 1.1, height: 1.9, rx: 0.4 }),
        s('rect', { class: 'wheel', x: 8, y: 1.8, width: 1.1, height: 1.9, rx: 0.4 }),
        s('rect', { class: 'wheel', x: 0.9, y: 5.5, width: 1.1, height: 1.9, rx: 0.4 }),
        s('rect', { class: 'wheel', x: 8, y: 5.5, width: 1.1, height: 1.9, rx: 0.4 }),
      ),
    );
    grid.append(mower);

    const left = () => g.reduce((a, b) => a + b, 0);
    const stuck = () => left() > 0 && movesFrom(adj, g, pos).length === 0;

    const render = () => {
      for (let i = 0; i < N; i++) {
        if (rocks[i]) continue;
        cells[i].className = `cell h${g[i]}${(i % w) % 2 ? ' odd' : ''}${i === start ? ' st' : ''}${i === pos ? ' me' : ''}`;
        nums[i].textContent = g[i] ? String(g[i]) : '';
      }
      mower.style.transform = `translate(${(pos % w) * 100}%, ${Math.floor(pos / w) * 100}%)`;
      mower.firstElementChild!.setAttribute('style', `transform: rotate(${facing * 90}deg)`);
      const n = left();
      ctx.status(
        !n
          ? L('All mowed!', 'Tout est tondu!')
          : stuck()
            ? L(`Stuck with ${n} to cut · undo`, `Coincée, ${n} à couper · annulez`)
            : `${P(n, ['pass left', 'passes left'], ['passage restant', 'passages restants'])} · ${P(hist.length, ['move', 'moves'], ['coup', 'coups'])}`,
      );
    };

    /** Drive onto neighbouring cell j; false (and a shake) if it isn't allowed. */
    const go = (j: number, quiet = false): boolean => {
      if (done) return false;
      if (j < 0 || !adjacent(pos, j, w) || rocks[j] || !g[j]) {
        if (!quiet) shake(grid);
        return false;
      }
      ctx.touch();
      const r0 = Math.floor(pos / w),
        c0 = pos % w;
      const r1 = Math.floor(j / w),
        c1 = j % w;
      facing = r1 < r0 ? 0 : c1 > c0 ? 1 : r1 > r0 ? 2 : 3;
      g[j]--;
      hist.push(j);
      pos = j;
      render();
      anim(cells[j], [{ transform: 'scale(0.92)' }, { transform: 'scale(1)' }], 140);
      if (!left()) {
        done = true;
        drag = null;
        ctx.solved();
      } else if (stuck()) {
        shake(mower);
        ctx.mistake();
      }
      return true;
    };
    const move = (dir: Dir) => {
      const r = Math.floor(pos / w) + [-1, 0, 1, 0][dir],
        c = (pos % w) + [0, 1, 0, -1][dir];
      if (r < 0 || r >= rows || c < 0 || c >= w) {
        shake(grid);
        return;
      }
      go(r * w + c);
    };
    const undo = () => {
      if (done || !hist.length) return;
      const j = hist.pop()!;
      g[j]++;
      pos = hist.length ? hist[hist.length - 1] : start;
      render();
    };
    const reset = () => {
      if (done || !hist.length) return;
      while (hist.length) g[hist.pop()!]++;
      pos = start;
      facing = 0;
      render();
    };

    // Taps on a neighbour move there; a swipe anywhere moves one step; dragging from the mower drives it
    // along under the finger.
    let swiped = false;
    let drag: { id: number } | null = null;
    let down: { id: number; x: number; y: number } | null = null;
    let lastBump = -1;
    const click = (i: number) => {
      if (swiped) {
        swiped = false;
        return;
      }
      if (i === pos || done) return;
      if (adjacent(pos, i, w)) go(i);
    };
    const follow = (t: number) => {
      for (let guard = 0; guard < 16; guard++) {
        if (!drag || t === pos) return;
        const step = stepsToward(pos, t, w).find((x) => !rocks[x] && g[x] > 0);
        if (step == null) {
          const near = stepsToward(pos, t, w)[0];
          if (near !== lastBump) {
            lastBump = near;
            shake(grid);
          }
          return;
        }
        lastBump = -1;
        go(step, true);
      }
    };
    grid.addEventListener('pointerdown', (e) => {
      swiped = false;
      if (done || drag || down) return;
      const i = cellAt(grid, w, rows, e.clientX, e.clientY);
      if (e.button === 0 && i === pos) {
        drag = { id: e.pointerId };
        lastBump = -1;
        capture(grid, e.pointerId);
        e.preventDefault();
      } else down = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    grid.addEventListener('pointermove', (e) => {
      if (drag?.id !== e.pointerId) return;
      const t = cellAt(grid, w, rows, e.clientX, e.clientY);
      if (t >= 0) follow(t);
    });
    grid.addEventListener('pointerup', (e) => {
      if (drag?.id === e.pointerId) {
        drag = null;
        swiped = true; // the click that ends the drag is not a tap
        return;
      }
      if (down?.id !== e.pointerId) return;
      const dx = e.clientX - down.x,
        dy = e.clientY - down.y;
      down = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return; // a tap: the click handles it
      swiped = true;
      move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
    });
    grid.addEventListener('pointercancel', (e) => {
      if (drag?.id === e.pointerId) drag = null;
      if (down?.id === e.pointerId) down = null;
    });

    ctx.controls(btn(L('Undo', 'Annuler'), undo, 'ghost'), btn(L('Restart', 'Repartir'), reset, 'ghost'));

    // Resume: replay the saved moves while they stay legal.
    const sv = ctx.saved as { m?: unknown } | undefined;
    if (Array.isArray(sv?.m)) {
      for (const j of sv.m) {
        if (!Number.isInteger(j) || j < 0 || j >= N || !adjacent(pos, j, w) || rocks[j] || !g[j] || left() <= 1) break;
        const r0 = Math.floor(pos / w),
          c0 = pos % w;
        facing = Math.floor(j / w) < r0 ? 0 : j % w > c0 ? 1 : Math.floor(j / w) > r0 ? 2 : 3;
        g[j]--;
        hist.push(j);
        pos = j;
      }
    }

    // ---- Guide ----
    const DIRS_EN = ['up', 'right', 'down', 'left'];
    const DIRS_FR = ['vers le haut', 'vers la droite', 'vers le bas', 'vers la gauche'];
    const way = (a: number, b: number) => {
      const k = b === a - w ? 0 : b === a + 1 ? 1 : b === a + w ? 2 : 3;
      return L(DIRS_EN[k], DIRS_FR[k]);
    };
    const passes = (n: number) => P(n, ['pass', 'passes'], ['passage', 'passages']);
    /** The rest of a known solution from here (the generated walk while we follow it), or null/undefined. */
    let memo: { key: string; sol: number[] | null | undefined } | null = null;
    const solution = () => {
      if (hist.every((x, k) => walk[k] === x)) return walk.slice(hist.length);
      const key = hist.join(',');
      if (memo?.key !== key) memo = { key, sol: solveMow(w, adj, g, pos, 40000) };
      return memo.sol;
    };
    const after = (j: number): Blocker | null => {
      g[j]--;
      const b = blocker(w, adj, g, j);
      g[j]++;
      return b;
    };
    const explain = (b: Blocker, dir: string): { en: string; fr: string; why: number[] } => {
      switch (b.kind) {
        case 'cut':
          return {
            en: `Going ${dir} would wall off ${b.cells.length === 1 ? 'a patch' : `${b.cells.length} patches`} behind cut grass, and the mower could never reach ${b.cells.length === 1 ? 'it' : 'them'}.`,
            fr: `Aller ${dir} isolerait ${b.cells.length === 1 ? 'une case' : `${b.cells.length} cases`} derrière de l’herbe tondue, et la tondeuse ne pourrait plus ${b.cells.length === 1 ? 'l’atteindre' : 'les atteindre'}.`,
            why: b.cells,
          };
        case 'starved':
          return {
            en: `Going ${dir} would leave this patch needing ${passes(g[b.cell])} with too little grass around it to come back that often.`,
            fr: `Aller ${dir} laisserait cette case avec ${passes(g[b.cell])} à faire, sans assez d’herbe autour pour y revenir aussi souvent.`,
            why: [b.cell],
          };
        case 'ends':
          return {
            en:
              b.cells.length > 1
                ? `Going ${dir} would turn these patches into dead ends: the mower couldn’t get back out of either, but it can only finish in one of them.`
                : `Going ${dir} would turn this patch into a dead end that the mower can’t finish on.`,
            fr:
              b.cells.length > 1
                ? `Aller ${dir} ferait de ces cases des culs-de-sac : la tondeuse ne pourrait ressortir d’aucune, mais elle ne peut finir que dans une seule.`
                : `Aller ${dir} ferait de cette case un cul-de-sac où la tondeuse ne peut pas finir.`,
            why: b.cells,
          };
        default:
          return {
            en: `Going ${dir} would leave grass that no sequence of moves can finish.`,
            fr: `Aller ${dir} laisserait de l’herbe qu’aucune suite de coups ne peut terminer.`,
            why: [],
          };
      }
    };
    /** Back out of a dead end: undo a move (there's always one: the start can be finished). */
    const stuckHint = (text: string, why: number[]): Hint => ({
      kind: 'stuck',
      text,
      why: why.map((i) => cells[i]),
      at: [cells[pos]],
      action: L('Undo', 'Annuler'),
      play: undo,
    });
    /** Dead ends: boxed in, a reason the grass can't all be cut, or the solver proving it. */
    const check = (): Hint | null => {
      if (done || !hist.length) return null;
      if (stuck())
        return stuckHint(
          L(
            `The mower is boxed in: every patch next to it is already cut, and ${passes(left())} are still to do. Undo.`,
            `La tondeuse est coincée : toutes les cases voisines sont tondues, et il reste ${passes(left())} à faire. Annulez.`,
          ),
          [],
        );
      const b = blocker(w, adj, g, pos);
      if (b?.kind === 'cut')
        return stuckHint(
          L(
            `${b.cells.length === 1 ? 'This patch is' : `These ${b.cells.length} patches are`} walled off behind cut grass: the mower can never reach ${b.cells.length === 1 ? 'it' : 'them'} again. Undo.`,
            `${b.cells.length === 1 ? 'Cette case est isolée' : `Ces ${b.cells.length} cases sont isolées`} derrière de l’herbe tondue : la tondeuse ne pourra plus ${b.cells.length === 1 ? 'l’atteindre' : 'les atteindre'}. Annulez.`,
          ),
          b.cells,
        );
      if (b?.kind === 'starved')
        return stuckHint(
          L(
            `This patch still needs ${passes(g[b.cell])}, but the grass around it can’t bring the mower back that often. Undo.`,
            `Cette case demande encore ${passes(g[b.cell])}, mais l’herbe autour ne permet plus d’y revenir aussi souvent. Annulez.`,
          ),
          [b.cell],
        );
      if (b?.kind === 'ends')
        return stuckHint(
          b.cells.length > 1
            ? L(
                'These patches have become dead ends: the mower couldn’t get back out of either, but it can only finish in one of them. Undo.',
                'Ces cases sont devenues des culs-de-sac : la tondeuse ne pourrait ressortir d’aucune, mais elle ne peut finir que dans une seule. Annulez.',
              )
            : L(
                'This patch has become a dead end that the mower can’t finish on. Undo.',
                'Cette case est devenue un cul-de-sac où la tondeuse ne peut pas finir. Annulez.',
              ),
          b.cells,
        );
      if (b?.kind === 'parity' || solution() === null)
        return stuckHint(
          L(
            'No order of moves finishes the lawn from here any more. Undo and try another way.',
            'Plus aucun ordre de déplacements ne termine la pelouse d’ici. Annulez et essayez autrement.',
          ),
          [],
        );
      return null;
    };
    const hint = (): Hint | null => {
      if (done) return null;
      const sol = solution();
      if (sol === null) {
        // Off track: back up to where the moves last matched the generated walk.
        let k = 0;
        while (k < hist.length && walk[k] === hist[k]) k++;
        const at = k ? walk[k - 1] : start;
        return {
          text: L(
            'This lawn can’t be finished from here any more. Undo back to this patch and try another way.',
            'La pelouse ne peut plus être terminée d’ici. Annulez jusqu’à cette case et essayez autrement.',
          ),
          why: [cells[pos]],
          at: [cells[at]],
          play: () => {
            while (hist.length > k) undo();
          },
        };
      }
      const pre = (en: string, fr: string) =>
        hist.length
          ? L(en, fr)
          : L(
              `Each number is how many more times the mower must enter that patch. ${en}`,
              `Chaque chiffre indique combien de fois la tondeuse doit encore entrer sur la case. ${fr}`,
            );
      const opts = movesFrom(adj, g, pos);
      if (opts.length === 1) {
        const j = opts[0];
        return {
          text: pre(
            `Only one patch next to the mower still has grass: go ${way(pos, j)}.`,
            `Une seule case voisine de la tondeuse a encore de l’herbe : allez ${way(pos, j)}.`,
          ),
          why: [cells[pos]],
          at: [cells[j]],
          play: () => go(j),
        };
      }
      const flaws = opts.map(after);
      const good = opts.filter((_, k) => !flaws[k]);
      const bad = flaws.findIndex((f) => f);
      if (good.length === 1 && bad >= 0) {
        const j = good[0];
        const x = explain(flaws[bad]!, way(pos, opts[bad]));
        return {
          text: pre(`${x.en} Go ${way(pos, j)}.`, `${x.fr} Allez ${way(pos, j)}.`),
          why: x.why.map((i) => cells[i]),
          at: [cells[j]],
          play: () => go(j),
        };
      }
      const j = sol?.[0] ?? good[0] ?? opts[0];
      if (j == null) return null;
      // Patches with a single grassy neighbour left are dead ends: keep them for later.
      const trap = opts.find((o) => o !== j && adj[o].filter((y) => y !== pos && g[y] > 0).length === 0 && g[o] === 1);
      if (trap != null)
        return {
          text: pre(
            `Going ${way(pos, trap)} would trap the mower: that patch has no grass beyond it. Go ${way(pos, j)} instead.`,
            `Aller ${way(pos, trap)} coincerait la tondeuse : il n’y a plus d’herbe au-delà. Allez plutôt ${way(pos, j)}.`,
          ),
          why: [cells[trap]],
          at: [cells[j]],
          play: () => go(j),
        };
      return {
        text:
          g[j] >= 2
            ? pre(
                `This patch still needs ${passes(g[j])}: go ${way(pos, j)} now and plan to come back to it.`,
                `Cette case demande encore ${passes(g[j])} : allez ${way(pos, j)} maintenant et prévoyez d’y revenir.`,
              )
            : pre(
                `Go ${way(pos, j)}, so the grass left behind stays in one piece the mower can still reach.`,
                `Allez ${way(pos, j)} : l’herbe qui reste forme un seul morceau que la tondeuse peut encore atteindre.`,
              ),
        why: [cells[pos]],
        at: [cells[j]],
        play: () => go(j),
      };
    };

    root.append(grid);
    render();
    return {
      snapshot: () => ({ m: hist }),
      check,
      hint,
      onKey(e) {
        const k = keyDir(e);
        if (k != null) {
          if (!done) move(k);
          return true;
        }
        if (e.key === 'z' || e.key === 'u' || e.key === 'Backspace') {
          undo();
          return true;
        }
        if (e.key === 'r') {
          reset();
          return true;
        }
        return false;
      },
    };
  },
};
