import './black-box.css';
import { L, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, btn, h, PALETTE, shake } from '../core/ui';
import { allResults, HIT, invisible, layouts, REFL, trace, type Trail } from './blackboxkit/rays';

const MAX_CHECKS = 3;

/** Board size, balls and ray budget per level. */
const blackBoxLevel = (d: 1 | 2 | 3 | 4 | 5) => ({
  n: byLevel(d, [5, 6, 7, 8, 8]),
  balls: byLevel(d, [3, 3, 4, 4, 5]),
  rays: byLevel(d, [12, 14, 17, 20, 24]),
});

export const blackBox: PuzzleDef = {
  id: 'black-box',
  get name() {
    return L('Black Box', 'Boîte noire');
  },
  category: 'logic',
  get rules() {
    return L('Fire rays from the edge to find the hidden balls.', 'Lancez des rayons du bord pour trouver les billes cachées.');
  },
  help: () => ({
    goal: L(
      'Balls are hidden in the box. Fire rays from the edge, read where they come out, and place a ball on every hidden spot.',
      'Des billes sont cachées dans la boîte. Lancez des rayons du bord, voyez où ils ressortent et placez une bille sur chaque cachette.',
    ),
    steps: [
      L(
        'Tap an edge cell to fire a ray straight in. A ball right in its path absorbs it: H.',
        'Touchez une case du bord pour lancer un rayon tout droit. Une bille sur son chemin l’absorbe : A.',
      ),
      L(
        'A ball diagonally ahead turns the ray 90° away from it; balls on both diagonals send it back.',
        'Une bille en diagonale devant fait tourner le rayon de 90° à l’opposé; une bille de chaque côté le renvoie.',
      ),
      L(
        'R: the ray came back out where it went in (also when a ball sits diagonally next to the entry).',
        'R : le rayon ressort par où il est entré (aussi quand une bille est en diagonale juste à côté de l’entrée).',
      ),
      L(
        'Otherwise its entry and exit get the same number and colour.',
        'Sinon, son entrée et sa sortie reçoivent le même numéro et la même couleur.',
      ),
      L(
        'Tap inside the box to place or remove a ball, then press Check once all are placed.',
        'Touchez l’intérieur de la boîte pour placer ou retirer une bille, puis appuyez sur Vérifier quand elles y sont toutes.',
      ),
      L(
        `Rays are limited. Any layout that gives the same result for every ray counts. ${MAX_CHECKS} wrong checks, or a wrong check with no rays left, end the game.`,
        `Les rayons sont limités. Toute disposition qui donne le même résultat pour chaque rayon est acceptée. ${MAX_CHECKS} erreurs, ou une erreur sans rayon restant, mettent fin à la partie.`,
      ),
    ],
    tips: [
      L(
        'Fire your first rays near the middle of the edges: each result rules out many cells at once.',
        'Lancez vos premiers rayons près du milieu des bords : chaque résultat élimine bien des cases d’un coup.',
      ),
      L(
        'An R right at the edge means a ball sits one cell in, diagonally beside the entry.',
        'Un R tout au bord veut dire qu’une bille est juste à l’intérieur, en diagonale de l’entrée.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [60, 100, 170, 230, 320]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const { n, balls: count, rays: budget } = blackBoxLevel(d);
    const NP = 4 * n;

    // Hidden balls: random spots, but every ball must change some ray (an invisible ball can't be found).
    let hidden: number[] = [];
    for (let t = 0; t < 60; t++) {
      hidden = rng
        .shuffle([...Array(n * n).keys()])
        .slice(0, count)
        .sort((a, b) => a - b);
      if (!invisible(n, hidden).length) break;
    }
    const truth = allResults(n, hidden);

    const fired: number[] = [];
    /** Result of a ray from each port, once known (an exit's result is its entry, rays run both ways). */
    const known: (number | null)[] = new Array(NP).fill(null);
    const pairNo: number[] = new Array(NP).fill(0);
    let pairs = 0;
    const guess = new Set<number>();
    let checks = 0;
    let over: 'won' | 'lost' | null = null;

    const side = (k: number) => Math.floor(k / n);
    const grid = board(n + 2, n + 2, 'bb');
    const portEls: HTMLButtonElement[] = [];
    const cellEls: HTMLButtonElement[] = [];
    const sideName = (k: number) =>
      [L('top', 'haut'), L('right', 'droite'), L('bottom', 'bas'), L('left', 'gauche')][side(k)] + ` ${(k % n) + 1}`;
    for (let k = 0; k < NP; k++)
      portEls[k] = h('button', {
        type: 'button',
        class: 'cell',
        'aria-label': L(`Fire from ${sideName(k)}`, `Lancer depuis ${sideName(k)}`),
        onclick: () => fire(k),
      });
    for (let i = 0; i < n * n; i++)
      cellEls[i] = h('button', {
        type: 'button',
        class: 'cell',
        'aria-label': L(`Row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}`, `Rangée ${Math.floor(i / n) + 1}, colonne ${(i % n) + 1}`),
        onclick: () => toggle(i),
      });
    const corner = () => h('div', { class: 'bb-corner' });
    grid.append(corner(), ...portEls.slice(0, n), corner());
    for (let r = 0; r < n; r++) grid.append(portEls[3 * n + r], ...cellEls.slice(r * n, r * n + n), portEls[n + r]);
    grid.append(corner(), ...portEls.slice(2 * n, 3 * n), corner());

    const raysLeft = () => budget - fired.length;
    const label = (k: number) => {
      const v = known[k];
      return v === HIT ? L('H', 'A') : v === REFL ? 'R' : String(pairNo[k]);
    };

    const render = () => {
      portEls.forEach((el, k) => {
        const v = known[k];
        const cls = ['cell', 'bb-port', `s${side(k)}`];
        let txt = '';
        if (v !== null) {
          cls.push(v === HIT ? 'hit' : v === REFL ? 'refl' : 'pair');
          txt = label(k);
        }
        el.className = cls.join(' ');
        if (el.textContent !== txt) el.textContent = txt;
        if (v !== null && v >= 0) el.style.setProperty('--c', PALETTE[(pairNo[k] - 1) % PALETTE.length]);
        else el.removeAttribute('style');
      });
      cellEls.forEach((el, i) => {
        const g = guess.has(i),
          b = hidden.includes(i);
        const cls = ['cell', 'bb-in'];
        if (over === 'lost') {
          if (g && !b) cls.push('err');
          if (b) cls.push(g ? 'on' : 'miss', 'bb-ball');
        } else if (g) cls.push('on');
        el.className = cls.join(' ');
      });
      if (over) return;
      const parts = [
        P(raysLeft(), ['ray left', 'rays left'], ['rayon restant', 'rayons restants']),
        L(`balls ${guess.size}/${count}`, `billes ${guess.size}/${count}`),
      ];
      if (checks) parts.push(P(MAX_CHECKS - checks, ['check left', 'checks left'], ['vérification restante', 'vérifications restantes']));
      ctx.status(parts.join(' · '));
    };

    /** Record a ray's result (no budget or game checks: shared by taps and resume). */
    const shoot = (k: number) => {
      const res = truth[k];
      fired.push(k);
      known[k] = res;
      if (res >= 0) {
        known[res] = k;
        pairNo[k] = pairNo[res] = ++pairs;
      }
    };
    const fire = (k: number) => {
      if (over) return;
      if (known[k] !== null || raysLeft() <= 0) return shake(grid);
      ctx.touch();
      shoot(k);
      render();
    };
    const toggle = (i: number) => {
      if (over) return;
      if (!guess.has(i) && guess.size >= count) return shake(grid);
      ctx.touch();
      if (guess.has(i)) guess.delete(i);
      else guess.add(i);
      render();
    };
    const check = () => {
      if (over) return;
      if (guess.size !== count) return shake(grid);
      ctx.touch();
      if (allResults(n, guess).join() === truth.join()) {
        over = 'won';
        render();
        ctx.solved();
        return;
      }
      checks++;
      ctx.mistake();
      shake(grid);
      if (checks >= MAX_CHECKS || raysLeft() <= 0) {
        over = 'lost';
        render();
        ctx.failed();
        return;
      }
      render();
    };
    ctx.controls(btn(L('Check', 'Vérifier'), check, 'primary'));

    const sv = ctx.saved as { rays?: unknown; guess?: unknown; checks?: unknown } | undefined;
    if (sv) {
      const ints = (v: unknown, max: number) =>
        Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x) && x >= 0 && x < max) : [];
      for (const k of ints(sv.rays, NP)) if (known[k] === null && raysLeft() > 0) shoot(k);
      for (const i of ints(sv.guess, n * n)) if (guess.size < count) guess.add(i);
      if (typeof sv.checks === 'number' && sv.checks > 0 && sv.checks < MAX_CHECKS) checks = Math.floor(sv.checks);
    }
    root.append(grid);
    render();

    // ---------- guide ----------
    /** Ports of the fired rays that the cell `i` matters to in layout `lay` (both ends of a detour). */
    const raysAbout = (lay: number[], i: number, how: keyof Trail) => {
      const g = new Uint8Array(n * n);
      for (const b of lay) g[b] = 1;
      const at = (r: number, c: number) => g[r * n + c];
      const ks = fired.filter((k) => {
        const t: Trail = { acts: [], pass: [] };
        trace(n, k, at, t);
        return t[how].includes(i);
      });
      return ks.flatMap((k) => (known[k]! >= 0 ? [k, known[k]!] : [k]));
    };
    const results = (ks: number[]) => [...new Set(ks.filter((k) => known[k] !== null).map(label))].join(', ');
    const place = (i: number): Pick<Hint, 'at' | 'play'> => ({ at: [cellEls[i]], play: () => toggle(i) });

    const lastPorts = () => {
      const f = fired[fired.length - 1];
      return (known[f]! >= 0 ? [f, known[f]!] : [f]).map((k) => portEls[k]);
    };
    /** What the last ray's result says, in words. */
    const lastNote = (list: number[][]) => {
      const f = fired[fired.length - 1],
        v = known[f]!;
      const across = v >= 0 && (side(f) + 2) % 4 === side(v) && v % n === f % n;
      // The cells of the ray's line, from its entry; the two cells diagonally inside the entry.
      const p = f % n;
      const line = Array.from({ length: n }, (_, t) => [t * n + p, p * n + n - 1 - t, (n - 1 - t) * n + p, p * n + t][side(f)]);
      const first = line[0],
        vert = side(f) % 2 === 0;
      const diag = (vert ? [first - 1, first + 1] : [first - n, first + n]).filter(
        (i) => i >= 0 && i < n * n && (!vert || Math.floor(i / n) === Math.floor(first / n)),
      );
      const all = (pred: (lay: number[]) => boolean) => list.length > 0 && list.every(pred);
      return v === HIT
        ? L(
            'That ray was absorbed (H): a ball sits somewhere along its path.',
            'Ce rayon a été absorbé (A) : une bille est quelque part sur son chemin.',
          )
        : v === REFL
          ? all((lay) => diag.some((i) => lay.includes(i)))
            ? L(
                'That ray bounced back (R) right at the edge: a ball sits in a cell diagonally inside its entry.',
                'Ce rayon a rebondi (R) dès le bord : une bille est dans une case en diagonale de l’entrée.',
              )
            : L(
                'That ray came back (R): a ball diagonally beside its entry, or balls inside, turned it around.',
                'Ce rayon est revenu (R) : une bille en diagonale de l’entrée, ou des billes à l’intérieur, l’ont renvoyé.',
              )
          : across
            ? all((lay) => !line.some((i) => lay.includes(i)))
              ? L(
                  `That ray came straight across (${pairNo[f]}): its whole line is empty.`,
                  `Ce rayon a traversé tout droit (${pairNo[f]}) : toute sa ligne est vide.`,
                )
              : L(
                  `That ray came straight across (${pairNo[f]}): its line is probably empty.`,
                  `Ce rayon a traversé tout droit (${pairNo[f]}) : sa ligne est sans doute vide.`,
                )
            : L(
                `That ray came out elsewhere (${pairNo[f]}): balls turned it on the way.`,
                `Ce rayon est ressorti ailleurs (${pairNo[f]}) : des billes l’ont dévié en chemin.`,
              );
    };

    const hint = (): Hint | null => {
      if (over) return null;
      const shots = fired.map((port) => ({ port, res: known[port]! }));
      let seed = 0x9e3779b1 ^ n;
      for (const k of fired) seed = Math.imul(seed ^ (k + 1), 0x01000193) >>> 0;
      const { list, complete } = layouts(n, count, shots, seed);
      if (!list.length) {
        // Search came up empty-handed: fall back to an unused edge cell near the middle.
        const mid = (n - 1) / 2;
        const free = [...Array(NP).keys()].filter((k) => known[k] === null);
        if (raysLeft() <= 0 || !free.length) return null;
        const k = free.sort((a, b) => Math.abs((a % n) - mid) - Math.abs((b % n) - mid))[0];
        return {
          text: L(
            'Lots of layouts still fit your rays. A ray into the middle of an edge crosses the most cells, so it tells you the most.',
            'Bien des dispositions respectent encore vos rayons. Un rayon au milieu d’un bord traverse le plus de cases : il vous en apprend le plus.',
          ),
          at: [portEls[k]],
          play: () => fire(k),
        };
      }
      const outs = list.map((lay) => allResults(n, lay));
      const sigs = outs.map((o) => o.join());
      const classes = new Set(sigs).size;
      const nLay = complete ? L(`${list.length} layouts`, `${list.length} dispositions`) : L('Many layouts', 'Beaucoup de dispositions');

      if (complete) {
        // A guess no fitting layout uses: take it back.
        for (const i of guess) {
          if (list.some((lay) => lay.includes(i))) continue;
          const why = raysAbout(list[0], i, 'pass');
          return {
            text: why.length
              ? L(
                  `No layout that fits your rays has a ball here: the outlined ray (${results(why)}) passes right through this cell. Remove it.`,
                  `Aucune disposition qui respecte vos rayons n’a de bille ici : le rayon encadré (${results(why)}) traverse cette case. Retirez-la.`,
                )
              : L(
                  'No layout that fits your rays has a ball here. Remove it.',
                  'Aucune disposition qui respecte vos rayons n’a de bille ici. Retirez-la.',
                ),
            why: why.map((k) => portEls[k]),
            ...place(i),
          };
        }
        // A ball every fitting layout needs.
        for (let i = 0; i < n * n; i++) {
          if (guess.has(i) || guess.size >= count || !list.every((lay) => lay.includes(i))) continue;
          const why = raysAbout(list[0], i, 'acts');
          return {
            text:
              list.length === 1
                ? L(
                    `Only one layout fits all your rays, and it has a ball here${why.length ? `: that’s what explains the outlined results (${results(why)})` : ''}.`,
                    `Une seule disposition respecte tous vos rayons, et elle a une bille ici${why.length ? ` : c’est ce qui explique les résultats encadrés (${results(why)})` : ''}.`,
                  )
                : L(
                    `All ${list.length} layouts that fit your rays have a ball here${why.length ? `: nothing else explains the outlined results (${results(why)})` : ''}.`,
                    `Les ${list.length} dispositions qui respectent vos rayons ont toutes une bille ici${why.length ? ` : rien d’autre n’explique les résultats encadrés (${results(why)})` : ''}.`,
                  ),
            why: why.map((k) => portEls[k]),
            ...place(i),
          };
        }
      }

      // Enough rays (or none left): build the likeliest answer and check it.
      if ((complete && classes === 1) || raysLeft() <= 0) {
        const tally = new Map<string, number>();
        for (const s of sigs) tally.set(s, (tally.get(s) ?? 0) + 1);
        const best = [...tally].sort((a, b) => b[1] - a[1])[0][0];
        const overlap = (lay: number[]) => lay.filter((i) => guess.has(i)).length;
        const target = list.filter((_, j) => sigs[j] === best).sort((a, b) => overlap(b) - overlap(a))[0];
        const sure = classes === 1;
        const lead = sure
          ? L(
              'Every layout that still fits gives the same result for every ray, so any of them counts.',
              'Toutes les dispositions qui restent donnent le même résultat pour chaque rayon : n’importe laquelle compte.',
            )
          : L(
              `No rays left and ${classes} different answers still fit: this one fits the most layouts.`,
              `Plus de rayons et ${classes} réponses possibles : celle-ci correspond au plus de dispositions.`,
            );
        const extra = [...guess].find((i) => !target.includes(i));
        if (extra !== undefined)
          return { text: `${lead} ${L('This guess isn’t part of it.', 'Cette bille n’en fait pas partie.')}`, ...place(extra) };
        const miss = target.find((i) => !guess.has(i));
        if (miss !== undefined) return { text: `${lead} ${L('It has a ball here.', 'Elle a une bille ici.')}`, ...place(miss) };
        return {
          text: sure
            ? L(
                'Your balls explain every ray you fired, and no other answer fits. Check it!',
                'Vos billes expliquent chaque rayon lancé, et aucune autre réponse ne tient. Vérifiez!',
              )
            : L('Your best guess is in place. Check it!', 'Votre meilleure hypothèse est en place. Vérifiez!'),
          at: [...guess].map((i) => cellEls[i]),
          play: check,
        };
      }

      // Pick the ray whose outcome splits the fitting layouts best (smallest expected leftover).
      let bestK = -1,
        bestScore = Infinity,
        bestOut = 0;
      const mid = (n - 1) / 2;
      for (let k = 0; k < NP; k++) {
        if (known[k] !== null) continue;
        const buckets = new Map<number, number>();
        for (const o of outs) buckets.set(o[k], (buckets.get(o[k]) ?? 0) + 1);
        let score = 0;
        for (const c of buckets.values()) score += c * c;
        score += Math.abs((k % n) - mid) * 1e-3; // ties: rays into the middle see more
        if (score < bestScore) {
          bestScore = score;
          bestK = k;
          bestOut = buckets.size;
        }
      }
      if (bestK < 0) return null;
      const k = bestK;
      const open = () => new Set(list.flat()).size;
      return {
        text: !fired.length
          ? L(
              'Start with a ray near the middle of an edge: whether it’s absorbed (H), reflected (R) or comes out elsewhere, it rules out many spots.',
              'Commencez par un rayon près du milieu d’un bord : absorbé (A), réfléchi (R) ou ressorti ailleurs, il élimine bien des cases.',
            )
          : `${lastNote(list)} ${
              complete
                ? L(
                    `${nLay} still fit, with balls in only ${open()} cells. A ray from here has ${bestOut} possible outcomes: the best split.`,
                    `${nLay} tiennent encore, avec des billes dans ${open()} cases seulement. Un rayon d’ici a ${bestOut} résultats possibles : le meilleur tri.`,
                  )
                : L(
                    `${nLay} still fit; a ray from here could give ${bestOut} different results, the most informative.`,
                    `${nLay} tiennent encore; un rayon d’ici peut donner ${bestOut} résultats différents, le plus instructif.`,
                  )
            }`,
        why: fired.length ? [...lastPorts(), ...(complete && open() < n * n ? [...new Set(list.flat())].map((i) => cellEls[i]) : [])] : [],
        at: [portEls[k]],
        play: () => fire(k),
      };
    };

    return {
      hint,
      snapshot: () => ({ rays: fired, guess: [...guess], checks }),
      onKey(e) {
        if (e.key !== 'Enter' || (document.activeElement as Element | null)?.closest?.('.bb')) return false;
        check();
        return true;
      },
    };
  },
};
