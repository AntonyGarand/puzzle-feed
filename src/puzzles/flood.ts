import { L, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, h, pad, PALETTE, restartBtn, shake, undoBtn } from '../core/ui';
import './flood.css';
import './playkit/moves-left.css';

/** Flood from the top-left corner with colour `c`; returns the new grid. */
function flood(g: number[], n: number, c: number): number[] {
  const out = [...g];
  const from = g[0];
  if (from === c) return out;
  const stack = [0];
  const seen = new Set([0]);
  while (stack.length) {
    const i = stack.pop()!;
    out[i] = c;
    const r = Math.floor(i / n),
      col = i % n;
    for (const j of [r > 0 ? i - n : -1, r < n - 1 ? i + n : -1, col > 0 ? i - 1 : -1, col < n - 1 ? i + 1 : -1]) {
      if (j >= 0 && !seen.has(j) && g[j] === from) {
        seen.add(j);
        stack.push(j);
      }
    }
  }
  return out;
}
function regionSize(g: number[], n: number): number {
  const c = g[0];
  const stack = [0];
  const seen = new Set([0]);
  while (stack.length) {
    const i = stack.pop()!;
    const r = Math.floor(i / n),
      col = i % n;
    for (const j of [r > 0 ? i - n : -1, r < n - 1 ? i + n : -1, col > 0 ? i - 1 : -1, col < n - 1 ? i + 1 : -1]) {
      if (j >= 0 && !seen.has(j) && g[j] === c) {
        seen.add(j);
        stack.push(j);
      }
    }
  }
  return seen.size;
}

/**
 * Every colour still outside the corner area costs at least one more move, so the board is lost when
 * there are more of them than moves left.
 */
export function outOfReach(g: number[], n: number, left: number): boolean {
  const mine = new Set(flood(g, n, g[0] === 0 ? 1 : 0).flatMap((v, i) => (v !== g[i] ? [i] : [])));
  const colours = new Set(g.filter((_, i) => !mine.has(i)));
  return colours.size > left;
}

/**
 * A lower bound on the moves still needed: every colour outside the corner area costs a move, and
 * each move only swallows the patches touching the area, so the farthest patch (counted in patches
 * to cross) needs that many moves too.
 */
export function movesNeeded(g: number[], n: number): { colours: number; far: number; farCell: number } {
  const N = n * n;
  const nb = (i: number) => {
    const r = Math.floor(i / n),
      c = i % n;
    return [r > 0 ? i - n : -1, r < n - 1 ? i + n : -1, c > 0 ? i - 1 : -1, c < n - 1 ? i + 1 : -1].filter((j) => j >= 0);
  };
  // Same-colour patches, then a breadth-first search over touching patches from the corner one.
  const lab = new Int32Array(N).fill(-1);
  let k = 0;
  for (let i = 0; i < N; i++) {
    if (lab[i] >= 0) continue;
    lab[i] = k;
    const st = [i];
    while (st.length)
      for (const j of nb(st.pop()!))
        if (lab[j] < 0 && g[j] === g[i]) {
          lab[j] = k;
          st.push(j);
        }
    k++;
  }
  const adj = Array.from({ length: k }, () => new Set<number>());
  for (let i = 0; i < N; i++) for (const j of nb(i)) if (lab[j] !== lab[i]) adj[lab[i]].add(lab[j]);
  const dist = new Int32Array(k).fill(-1);
  dist[lab[0]] = 0;
  const q = [lab[0]];
  for (let x = 0; x < q.length; x++)
    for (const y of adj[q[x]])
      if (dist[y] < 0) {
        dist[y] = dist[q[x]] + 1;
        q.push(y);
      }
  let far = 0,
    farCell = 0;
  const colours = new Set<number>();
  for (let i = 0; i < N; i++) {
    const d = dist[lab[i]];
    if (d > far) [far, farCell] = [d, i];
    if (d > 0) colours.add(g[i]);
  }
  return { colours: colours.size, far, farCell };
}

/** Colour names for the guide, matching PALETTE (French as nouns: « le vert »). */
const NAMES_EN = ['orange', 'blue', 'green', 'yellow', 'purple', 'teal', 'pink', 'lime'];
const NAMES_FR = ['l’orange', 'le bleu', 'le vert', 'le jaune', 'le violet', 'le turquoise', 'le rose', 'le lime'];

export const floodPuzzle: PuzzleDef = {
  id: 'flood',
  get name() {
    return L('Flood', 'Inondation');
  },
  category: 'moves',
  get rules() {
    return L('Flood the whole board with one colour.', 'Couvrez toute la grille d’une seule couleur.');
  },
  help: () => ({
    goal: L(
      'Turn the whole board into a single colour before you run out of moves.',
      'Couvrez toute la grille d’une seule couleur avant d’épuiser vos coups.',
    ),
    steps: [
      L('Your area starts in the top-left corner.', 'Votre zone part du coin en haut à gauche.'),
      L(
        'Pick a colour from the palette (or tap a tile of that colour, or press 1, 2, 3…). Your area takes that colour and swallows the touching tiles of the same colour.',
        'Choisissez une couleur dans la palette (ou touchez une case de cette couleur, ou appuyez sur 1, 2, 3…). Votre zone prend cette couleur et absorbe les cases voisines de la même couleur.',
      ),
      L(
        'The counter above the board shows how many moves you have left; it turns red near the end.',
        'Le compteur au-dessus de la grille indique combien de coups il vous reste; il devient rouge vers la fin.',
      ),
      L(
        'Cover the board before the counter reaches 0 to win. Once more colours are left than moves, undo (Z) or restart (R).',
        'Couvrez la grille avant que le compteur tombe à 0 pour gagner. S’il reste plus de couleurs que de coups, annulez (Z) ou repartez (R).',
      ),
    ],
    tips: [
      L(
        'Pick the colour that grabs the most tiles, but think one move ahead.',
        'Choisissez la couleur qui gagne le plus de cases, mais pensez un coup d’avance.',
      ),
      L(
        'Push toward the middle and far corner early: a longer border gives bigger captures.',
        'Avancez tôt vers le centre et le coin opposé : une frontière plus longue donne de plus grosses prises.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [20, 30, 45, 60, 80]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const n = byLevel(d, [6, 8, 10, 12, 14]);
    const k = byLevel(d, [3, 4, 5, 6, 6]);
    // Slack over a 2-ply greedy solve: a plain greedy player still fits the limit ~93% of the time on
    // Expert and ~80% on Master (checked over 120 boards per level).
    const slack = byLevel(d, [4, 4, 3, 3, 2]);
    let g = Array.from({ length: n * n }, () => rng.int(0, k - 1));

    // Greedy solve (with a one-move lookahead) to set a fair move limit.
    let sim = g,
      greedy = 0;
    while (regionSize(sim, n) < n * n && greedy < 200) {
      let best = sim,
        bestS = -1;
      for (let c = 0; c < k; c++) {
        if (c === sim[0]) continue;
        const a = flood(sim, n, c);
        let s = regionSize(a, n) * 4;
        for (let c2 = 0; c2 < k; c2++) if (c2 !== c) s = Math.max(s, regionSize(a, n) * 3 + regionSize(flood(a, n, c2), n));
        if (s > bestS) {
          bestS = s;
          best = a;
        }
      }
      sim = best;
      greedy++;
    }
    const limit = greedy + slack;
    let moves = 0;
    /** Positions before each move or restart, for undo (undo gives the move back). */
    let hist: { g: number[]; m: number }[] = [];
    const g0 = g;

    const grid = board(n, n, 'flood');
    const cells = g.map((_, i) => {
      const el = h('div', { class: 'cell', onclick: () => choose(g[i]) });
      grid.append(el);
      return el;
    });
    const palette = pad(
      Array.from({ length: k }, (_, c) => ({
        label: '',
        value: String(c),
        class: 'swatch',
        style: `--c:${PALETTE[c]}`,
        aria: L(`colour ${c + 1}`, `couleur ${c + 1}`),
      })),
      (v) => choose(Number(v)),
    );

    // Moves-left counter above the board: big number + a draining bar, red when 2 or fewer remain.
    const leftNum = h('b', { class: 'fl-num' });
    const leftLbl = h('span', { class: 'fl-lbl' });
    const bar = h('i', { class: 'fl-fill' });
    const head = h(
      'div',
      { class: 'fl-head' },
      h('div', { class: 'fl-left moves-left' }, leftNum, leftLbl),
      h('div', { class: 'fl-bar' }, bar),
    );

    const render = () => {
      cells.forEach((el, i) => (el.style.background = PALETTE[g[i]]));
      const left = Math.max(0, limit - moves);
      leftNum.textContent = String(left);
      leftLbl.textContent = L(left === 1 ? 'move left' : 'moves left', left < 2 ? 'coup restant' : 'coups restants');
      bar.style.width = `${(100 * left) / limit}%`;
      head.classList.toggle('low', left <= 2);
      // The meter above the board already counts the moves left: the status tracks the area.
      const size = regionSize(g, n);
      const tiles = `${size} / ${n * n} ${L('tiles', 'cases')}`;
      ctx.status(
        size < n * n && outOfReach(g, n, left)
          ? L(`${tiles} · too many colours left · undo`, `${tiles} · trop de couleurs restantes · annulez`)
          : tiles,
      );
    };
    const choose = (c: number) => {
      if (moves >= limit || regionSize(g, n) === n * n) return;
      if (c === g[0]) return shake(grid);
      ctx.touch();
      hist.push({ g, m: moves });
      g = flood(g, n, c);
      moves++;
      render();
      if (regionSize(g, n) === n * n) ctx.solved();
      else if (moves >= limit) ctx.failed();
    };
    const undo = () => {
      const prev = hist.pop();
      if (!prev) return;
      ({ g, m: moves } = prev);
      render();
    };
    /** Back to the starting board with every move back; undoable. */
    const restart = () => {
      if (!moves) return;
      hist.push({ g, m: moves });
      g = g0;
      moves = 0;
      render();
    };
    const isBoard = (v: unknown): v is number[] =>
      Array.isArray(v) && v.length === g.length && v.every((x) => Number.isInteger(x) && x >= 0 && x < k);
    const sv = ctx.saved as { g?: unknown; moves?: unknown; hist?: unknown } | undefined;
    const isMoves = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < limit;
    if (sv && isBoard(sv.g) && isMoves(sv.moves)) {
      g = sv.g;
      moves = sv.moves;
      // Older saves had no history: undo then starts from the resumed position.
      if (Array.isArray(sv.hist)) hist = sv.hist.filter((e): e is { g: number[]; m: number } => isBoard(e?.g) && isMoves(e?.m));
    }
    // ---- Guide ----
    /** Cells of the top-left area. */
    const area = (b: number[]) => {
      const a = flood(b, n, b[0] === 0 ? 1 : 0);
      return b.map((_, i) => i).filter((i) => a[i] !== b[i]);
    };
    const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
    const need = (b: number[]) => {
      const m = movesNeeded(b, n);
      return Math.max(m.colours, m.far);
    };
    /** A sequence of colours that covers the board within `left` moves (beam search), or null. */
    const plans = new Map<string, number[]>();
    const planFor = (b: number[], left: number): number[] | null => {
      const key = b.join('');
      const known = plans.get(key);
      if (known && known.length <= left) return known;
      type St = { b: number[]; seq: number[]; score: number };
      let beam: St[] = [{ b, seq: [], score: 0 }];
      for (let depth = 0; depth < left && beam.length; depth++) {
        const next: St[] = [];
        const seen = new Set<string>();
        for (const st of beam)
          for (let c = 0; c < k; c++) {
            if (c === st.b[0]) continue;
            const a = flood(st.b, n, c);
            const size = regionSize(a, n);
            if (size === n * n) {
              const seq = [...st.seq, c];
              // Remember the rest of the plan for each position along it.
              let x = b;
              for (let i = 0; i < seq.length; i++) {
                plans.set(x.join(''), seq.slice(i));
                x = flood(x, n, seq[i]);
              }
              return seq;
            }
            const lb = need(a);
            if (depth + 1 + lb > left) continue;
            const id = a.join('');
            if (seen.has(id)) continue;
            seen.add(id);
            next.push({ b: a, seq: [...st.seq, c], score: size - 6 * lb });
          }
        next.sort((x, y) => y.score - x.score);
        beam = next.slice(0, 16);
      }
      return null;
    };
    /** Dead end: more moves needed than are left (a proven lower bound). Back out with undo. */
    const check = (): Hint | null => {
      const size = regionSize(g, n);
      if (size === n * n || moves >= limit) return null;
      const left = limit - moves;
      const m = movesNeeded(g, n);
      const want = Math.max(m.colours, m.far);
      if (want <= left) return null;
      const ml = P(left, ['move left', 'moves left'], ['coup restant', 'coups restants']);
      return {
        kind: 'stuck',
        text:
          m.far >= m.colours
            ? L(
                `You’d need at least ${want} more moves: the outlined tile is ${m.far} colour patches away from your area, and each move crosses only one. You have ${ml}, so undo a move.`,
                `Il vous faudrait au moins ${want} coups de plus : la case encadrée est à ${m.far} zones de couleur de votre zone, et chaque coup n’en franchit qu’une. Il vous reste ${ml} : annulez un coup.`,
              )
            : L(
                `You’d need at least ${want} more moves: ${m.colours} colours are still outside your area and each takes a move. You have ${ml}, so undo a move.`,
                `Il vous faudrait au moins ${want} coups de plus : ${m.colours} couleurs restent hors de votre zone et chacune coûte un coup. Il vous reste ${ml} : annulez un coup.`,
              ),
        why: m.far >= m.colours ? [cells[m.farCell]] : [],
        at: [undoEl],
        play: undo,
      };
    };
    let lastKind = '';
    const hint = (): Hint | null => {
      const size = regionSize(g, n);
      if (size === n * n || moves >= limit) return null;
      const plan = planFor(g, limit - moves);
      const mine = new Set(area(g));
      // Score each colour the way the move limit was set: grab now, plus the best follow-up.
      const opts = [...Array(k).keys()]
        .filter((c) => c !== g[0])
        .map((c) => {
          const a = flood(g, n, c);
          const now = regionSize(a, n);
          let next = now;
          for (let c2 = 0; c2 < k; c2++) if (c2 !== c) next = Math.max(next, regionSize(flood(a, n, c2), n));
          const reg = new Set(area(a));
          const gone = !a.some((v, i) => v === c && !reg.has(i));
          return { c, gain: now - size, more: next - now, score: Math.max(now * 4, now * 3 + next), gone, reg };
        });
      opts.sort((x, y) => y.score - x.score);
      const best = (plan && opts.find((o) => o.c === plan[0])) || opts[0];
      const most = opts.reduce((x, y) => (y.gain > x.gain ? y : x));
      const grabbed = [...best.reg].filter((i) => !mine.has(i));
      const en = NAMES_EN[best.c],
        fr = NAMES_FR[best.c];
      const tiles = (m: number) => P(m, ['tile', 'tiles'], ['case', 'cases']);
      const kinds: { kind: string; text: string }[] = [];
      const left = new Set(g.filter((_, i) => !mine.has(i)));
      if (left.size === 1)
        kinds.push({
          kind: 'last',
          text: L(
            `Only ${en} is left outside your area: pick it to cover the whole board.`,
            `Il ne reste que ${fr} hors de votre zone : choisissez-le pour couvrir toute la grille.`,
          ),
        });
      if (!moves)
        kinds.push({
          kind: 'start',
          text: L(
            `Your area starts in the top-left corner. Pick ${en}: your area turns ${en} and swallows the ${tiles(best.gain)} of that colour touching it.`,
            `Votre zone part du coin en haut à gauche. Choisissez ${fr} : votre zone prend cette couleur et absorbe les ${tiles(best.gain)} voisines de cette couleur.`,
          ),
        });
      if (best.gone && left.size > 1)
        kinds.push({
          kind: 'gone',
          text: L(
            `Pick ${en}: it takes every ${en} tile still on the board, so you never need that colour again.`,
            `Choisissez ${fr} : vous prenez toutes les cases de cette couleur encore sur la grille, et vous n’en aurez plus besoin.`,
          ),
        });
      if (best.c !== most.c && best.more > 0)
        kinds.push({
          kind: 'ahead',
          text: L(
            `${cap(NAMES_EN[most.c])} grabs more right now, but ${en} reaches deeper: it adds ${tiles(best.gain)} and sets up ${tiles(best.more)} more on the next move.`,
            `${cap(NAMES_FR[most.c])} rapporte plus tout de suite, mais ${fr} va plus loin : ${tiles(best.gain)} maintenant et ${tiles(best.more)} de plus au coup suivant.`,
          ),
        });
      kinds.push({
        kind: 'most',
        text:
          best.c === most.c
            ? L(
                `Pick the colour that grabs the most: ${en} brings in ${tiles(best.gain)} from along your border.`,
                `Prenez la couleur qui rapporte le plus : ${fr} ajoute ${tiles(best.gain)} le long de votre frontière.`,
              )
            : L(
                `${cap(en)} adds ${tiles(best.gain)} and opens the way toward the far side of the board.`,
                `${cap(fr)} ajoute ${tiles(best.gain)} et ouvre le chemin vers l’autre bout de la grille.`,
              ),
      });
      if (best.c === most.c && moves)
        kinds.push({
          kind: 'border',
          text: L(
            `A bigger area has a longer border, so each pick grabs more: ${en} now brings in ${tiles(best.gain)} at once.`,
            `Plus la zone grandit, plus sa frontière s’allonge et plus chaque choix rapporte : ${fr} ajoute maintenant ${tiles(best.gain)} d’un coup.`,
          ),
        });
      const pick = kinds.find((x) => x.kind !== lastKind) ?? kinds[0];
      lastKind = pick.kind;
      return {
        text: pick.text,
        why: grabbed.map((i) => cells[i]),
        at: [palette.children[best.c]],
        play: () => choose(best.c),
      };
    };

    const undoEl = undoBtn(undo);
    ctx.controls(undoEl, restartBtn(restart));
    root.append(head, grid, palette);
    render();
    return {
      snapshot: () => ({ g, moves, hist }),
      check,
      hint,
      onKey(e) {
        if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') {
          undo();
          return true;
        }
        if (e.key === 'r' || e.key === 'R') {
          restart();
          return true;
        }
        const v = Number(e.key);
        if (v >= 1 && v <= k) {
          choose(v - 1);
          return true;
        }
        return false;
      },
    };
  },
};
