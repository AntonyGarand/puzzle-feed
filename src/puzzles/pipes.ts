import { L } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, h, s } from '../core/ui';
import './pipes.css';

// Connection bits: N=1 E=2 S=4 W=8
const DIRS = [
  { bit: 1, dr: -1, dc: 0, opp: 4 },
  { bit: 2, dr: 0, dc: 1, opp: 8 },
  { bit: 4, dr: 1, dc: 0, opp: 1 },
  { bit: 8, dr: 0, dc: -1, opp: 2 },
];
const rot = (mask: number, k: number) => {
  let m = mask;
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) m = ((m << 1) | (m >> 3)) & 15;
  return m;
};

export const pipes: PuzzleDef = {
  id: 'pipes',
  get name() {
    return L('Pipes', 'Tuyaux');
  },
  category: 'paths',
  undo: true,
  get rules() {
    return L('Rotate tiles until everything joins the source.', 'Tournez les tuiles pour tout relier à la source.');
  },
  help: () => ({
    goal: L(
      'Rotate the pipe tiles so every one is connected to the source in the centre, with no loose ends.',
      'Tournez les tuiles pour que chacune soit reliée à la source au centre, sans aucun bout libre.',
    ),
    steps: [
      L(
        'Tap a tile to turn it a quarter turn clockwise. Right-click turns it the other way.',
        'Touchez une tuile pour la tourner d’un quart de tour vers la droite. Le clic droit la tourne dans l’autre sens.',
      ),
      L(
        'The source is the big circle in the middle. Tiles joined to it light up.',
        'La source est le gros cercle au centre. Les tuiles qui y sont reliées s’allument.',
      ),
      L(
        'You win when every tile is lit and no pipe points at a wall or a mismatched neighbour.',
        'Vous gagnez quand toutes les tuiles sont allumées et qu’aucun tuyau ne pointe vers un mur ou un voisin mal tourné.',
      ),
      L('The grid grows from 4×4 to 8×8.', 'La grille passe de 4×4 à 8×8.'),
    ],
    tips: [
      L(
        'Start at the edges and corners: pipes there can’t point outward.',
        'Commencez par les bords et les coins : les tuyaux ne peuvent pas pointer vers l’extérieur.',
      ),
      L(
        'End pieces (small dots) have one opening; straight pieces only two useful positions.',
        'Les bouts (petits points) n’ont qu’une ouverture; les droits, seulement deux positions utiles.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [20, 40, 70, 110, 170]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const n = byLevel(d, [4, 5, 6, 7, 8]);
    const base = new Array<number>(n * n).fill(0);
    const src = Math.floor(n / 2) * n + Math.floor(n / 2);

    // Random spanning tree (randomised Prim on edges), avoiding 4-way crosses mostly.
    const inTree = new Array<boolean>(n * n).fill(false);
    inTree[src] = true;
    const frontier: [number, (typeof DIRS)[number]][] = [];
    const pushEdges = (i: number) => {
      const r = Math.floor(i / n),
        c = i % n;
      for (const dd of DIRS) {
        const rr = r + dd.dr,
          cc = c + dd.dc;
        if (rr >= 0 && rr < n && cc >= 0 && cc < n) frontier.push([i, dd]);
      }
    };
    pushEdges(src);
    let added = 1;
    while (added < n * n && frontier.length) {
      const k = rng.int(0, frontier.length - 1);
      const [i, dd] = frontier[k];
      frontier.splice(k, 1);
      const j = (Math.floor(i / n) + dd.dr) * n + (i % n) + dd.dc;
      if (inTree[j]) continue;
      const deg = [1, 2, 4, 8].filter((b) => base[i] & b).length;
      if (deg >= 3 && frontier.length > 2 && rng.chance(0.85)) {
        frontier.push([i, dd]);
        continue;
      }
      base[i] |= dd.bit;
      base[j] |= dd.opp;
      inTree[j] = true;
      added++;
      pushEdges(j);
    }

    const turns = base.map(() => 0);
    // Randomise; keep straight pieces and crosses from being trivially "already right" too often.
    do turns.forEach((_, i) => (turns[i] = rng.int(0, 3)));
    while (turns.every((t, i) => rot(base[i], t) === base[i]));

    const grid = board(n, n, 'pipes');
    const svgs: SVGSVGElement[] = [];
    const cells = base.map((m, i) => {
      const svg = s('svg', { viewBox: '0 0 100 100', class: 'pipe' });
      for (const dd of DIRS) if (m & dd.bit) svg.append(s('line', { x1: 50, y1: 50, x2: 50 + dd.dc * 50, y2: 50 + dd.dr * 50 }));
      const deg = DIRS.filter((dd) => m & dd.bit).length;
      if (i === src) svg.append(s('circle', { cx: 50, cy: 50, r: 20, class: 'src' }));
      else if (deg === 1) svg.append(s('circle', { cx: 50, cy: 50, r: 14 }));
      else svg.append(s('circle', { cx: 50, cy: 50, r: 9 }));
      svgs.push(svg);
      const el = h('button', { type: 'button', class: 'cell', onclick: () => turn(i, 1) }, svg);
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        turn(i, -1);
      });
      grid.append(el);
      return el;
    });

    const cur = (i: number) => rot(base[i], turns[i]);
    const render = () => {
      const lit = new Set<number>([src]);
      const q = [src];
      let loose = 0;
      while (q.length) {
        const i = q.shift()!;
        const r = Math.floor(i / n),
          c = i % n,
          m = cur(i);
        for (const dd of DIRS) {
          if (!(m & dd.bit)) continue;
          const rr = r + dd.dr,
            cc = c + dd.dc;
          if (rr < 0 || rr >= n || cc < 0 || cc >= n) {
            loose++;
            continue;
          }
          const j = rr * n + cc;
          if (!(cur(j) & dd.opp)) {
            loose++;
            continue;
          }
          if (!lit.has(j)) {
            lit.add(j);
            q.push(j);
          }
        }
      }
      cells.forEach((el, i) => el.classList.toggle('lit', lit.has(i)));
      svgs.forEach((svg, i) => (svg.style.transform = `rotate(${turns[i] * 90}deg)`));
      ctx.status(L(`${lit.size} / ${n * n} connected`, `${lit.size} / ${n * n} reliées`));
      return lit.size === n * n && loose === 0;
    };
    let done = false;
    /** Tiles the player (or the guide) has turned: the scramble itself is never a mistake. */
    const turned = new Set<number>();
    const turn = (i: number, k: number) => {
      ctx.touch();
      turned.add(i);
      turns[i] += k;
      if (render()) {
        done = true;
        ctx.solved();
      }
    };

    // ---- guide: deduce orientations from the border and from neighbours already pinned ----
    const degOf = (m: number) => DIRS.filter((dd) => m & dd.bit).length;
    const TYPE_EN = ['end piece', 'straight pipe', 'bend', 'T piece', 'cross'];
    const TYPE_FR = ['ce bout', 'ce tuyau droit', 'ce coude', 'ce té', 'cette croix'];
    const kind = (m: number) => {
      const sd = degOf(m);
      return sd === 1 ? 0 : sd === 2 ? (m === 5 || m === 10 ? 1 : 2) : sd === 3 ? 3 : 4;
    };
    const SIDE_EN = ['above', 'to the right', 'below', 'to the left'];
    const SIDE_FR = ['au-dessus', 'à droite', 'au-dessous', 'à gauche'];
    const nb = (i: number, sd: number) => {
      const r = Math.floor(i / n) + DIRS[sd].dr,
        c = (i % n) + DIRS[sd].dc;
      return r >= 0 && r < n && c >= 0 && c < n ? r * n + c : -1;
    };
    type Fact = { i: number; mask: number; why: 'border' | 'open' | 'closed' | 'pair'; from: number[]; side: number };
    const deduce = () => {
      const N2 = n * n;
      const cand = base.map((m) => [...new Set([0, 1, 2, 3].map((t) => rot(m, t)))]);
      const edge = new Int8Array(N2 * 4).fill(-1);
      const set = (i: number, sd: number, v: number) => {
        edge[i * 4 + sd] = v;
        const j = nb(i, sd);
        if (j >= 0) edge[j * 4 + ((sd + 2) % 4)] = v;
      };
      for (let i = 0; i < N2; i++) for (let sd = 0; sd < 4; sd++) if (nb(i, sd) < 0) edge[i * 4 + sd] = 0;
      const facts: Fact[] = [];
      const fixed = new Uint8Array(N2);
      // Rounds read the edges known at the start of the round, so simple (border) facts come first.
      for (let changed = true, round = 0; changed; round++) {
        changed = false;
        const snap = edge.slice();
        for (let i = 0; i < N2; i++) {
          if (fixed[i]) continue;
          const before = cand[i].length;
          // Neighbour sides already known: these are the clues for this tile.
          const sides = [0, 1, 2, 3].filter((sd) => nb(i, sd) >= 0 && snap[i * 4 + sd] >= 0);
          let pair = -1;
          cand[i] = cand[i].filter((m) =>
            DIRS.every((dd, sd) => {
              const e = snap[i * 4 + sd];
              if (e >= 0 && ((m & dd.bit) > 0 ? 1 : 0) !== e) return false;
              // Two end pieces joined to each other would be cut off from everything else.
              const j = nb(i, sd);
              if (round && m & dd.bit && j >= 0 && N2 > 2 && degOf(base[i]) === 1 && degOf(base[j]) === 1) {
                pair = j;
                return false;
              }
              return true;
            }),
          );
          if (cand[i].length === before) continue;
          changed = true;
          for (let sd = 0; sd < 4; sd++) {
            const v = cand[i].every((m) => m & DIRS[sd].bit) ? 1 : cand[i].every((m) => !(m & DIRS[sd].bit)) ? 0 : -1;
            if (v >= 0 && edge[i * 4 + sd] < 0) set(i, sd, v);
          }
          if (cand[i].length === 1) {
            fixed[i] = 1;
            const openSide = sides.find((sd) => edge[i * 4 + sd] === 1 && fixed[nb(i, sd)]);
            const fact: Fact =
              pair >= 0
                ? { i, mask: cand[i][0], why: 'pair', from: [pair], side: -1 }
                : openSide != null
                  ? { i, mask: cand[i][0], why: 'open', from: [nb(i, openSide)], side: openSide }
                  : sides.length
                    ? { i, mask: cand[i][0], why: 'closed', from: sides.map((sd) => nb(i, sd)), side: sides[0] }
                    : { i, mask: cand[i][0], why: 'border', from: [], side: -1 };
            facts.push(fact);
          }
        }
      }
      return facts;
    };
    const turnsTo = (i: number, mask: number) => [1, -1, 2].find((k) => rot(base[i], turns[i] + k) === mask) ?? 0;
    let lastWhy = '';
    const hint = (): Hint | null => {
      if (done || base.every((m, i) => cur(i) === m)) return null;
      // Tiles pinned by the deduction but turned wrong; their clue tiles must already sit right.
      const facts = deduce();
      const ready = facts.filter(
        (x, k) => cur(x.i) !== x.mask && facts.slice(0, k).every((y) => !x.from.includes(y.i) || cur(y.i) === y.mask),
      );
      const f = ready.find((x) => x.why !== lastWhy) ?? ready[0];
      if (f) lastWhy = f.why;
      const play = (i: number, mask: number) => () => {
        const k = turnsTo(i, mask);
        for (let t = 0; t < Math.abs(k); t++) turn(i, Math.sign(k));
      };
      if (f) {
        const t = kind(base[f.i]);
        const en = TYPE_EN[t];
        const fr = TYPE_FR[t];
        const r = Math.floor(f.i / n),
          c = f.i % n;
        const corner = (r === 0 || r === n - 1) && (c === 0 || c === n - 1);
        const edgy = r === 0 || r === n - 1 || c === 0 || c === n - 1;
        const text =
          f.why === 'border'
            ? L(
                `Pipes can’t point off the board, so this ${en} ${corner ? 'in the corner' : 'on the edge'} fits only one way. Tap to turn it.`,
                `Aucun tuyau ne peut pointer hors de la grille : ${fr} ${corner ? 'dans le coin' : 'sur le bord'} n’a qu’une position. Touchez pour le tourner.`,
              )
            : f.why === 'open'
              ? L(
                  `The tile ${SIDE_EN[f.side]} points into this one, so this ${en} must connect back to it.`,
                  `La tuile ${SIDE_FR[f.side]} pointe vers celle-ci : ${fr} doit donc s’y raccorder.`,
                )
              : f.why === 'pair'
                ? L(
                    `Two end pieces facing each other would be cut off from the source${edgy ? ', and pipes can’t point off the board' : ''}. That leaves one way for this end piece: tap to turn it.`,
                    `Deux bouts face à face seraient coupés de la source${edgy ? ', et aucun tuyau ne pointe hors de la grille' : ''}. Il ne reste qu’une position pour ce bout : touchez pour le tourner.`,
                  )
                : L(
                    `The tile ${SIDE_EN[f.side]} has no opening toward this one${edgy ? ' and nothing may point off the board' : ''}, so this ${en} fits only one way.`,
                    `La tuile ${SIDE_FR[f.side]} n’a pas d’ouverture de ce côté${edgy ? ' et rien ne pointe hors de la grille' : ''} : ${fr} n’a qu’une position.`,
                  );
        return { text, why: f.from.map((j) => cells[j]), at: [cells[f.i]], play: play(f.i, f.mask) };
      }
      // No simple deduction left: join the lit network.
      const lit = cells.map((el) => el.classList.contains('lit'));
      const i = base.findIndex((m, j) => cur(j) !== m && [0, 1, 2, 3].some((sd) => nb(j, sd) >= 0 && lit[nb(j, sd)]));
      const j = i >= 0 ? i : base.findIndex((m, x) => cur(x) !== m);
      return {
        text: L(
          'Turn this tile so it joins the lit pipes without leaving a loose end. Everything must reach the source.',
          'Tournez cette tuile pour la raccorder aux tuyaux allumés sans bout libre. Tout doit rejoindre la source.',
        ),
        why: [cells[src]],
        at: [cells[j]],
        play: play(j, base[j]),
      };
    };
    /** A tile you turned so a pipe points off the board: that can never be right. */
    const check = (): Hint | null => {
      if (done) return null;
      for (const i of turned) {
        const sd = [0, 1, 2, 3].find((x) => cur(i) & DIRS[x].bit && nb(i, x) < 0);
        if (sd == null) continue;
        const k = turnsTo(i, base[i]);
        return {
          kind: 'fix',
          text: L(
            `This tile points ${['up', 'right', 'down', 'left'][sd]}, off the board: no pipe may lead out of the grid.`,
            `Cette tuile pointe ${['vers le haut', 'vers la droite', 'vers le bas', 'vers la gauche'][sd]}, hors de la grille : aucun tuyau ne peut en sortir.`,
          ),
          at: [cells[i]],
          action: L('Turn it', 'La tourner'),
          play: () => {
            for (let t = 0; t < Math.abs(k); t++) turn(i, Math.sign(k));
          },
        };
      }
      return null;
    };
    const sv = ctx.saved as { turns?: number[] } | undefined;
    if (sv?.turns?.length === turns.length) sv.turns.forEach((t, i) => (turns[i] = t));
    root.append(grid);
    render();
    return { hint, check, snapshot: () => ({ turns }) };
  },
};
