import { L, P } from '../../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../../core/types';
import { h, PALETTE, s, shake } from '../../ui/dom';
import { blocker, DC, DR, genArrows, ray } from './gen';
import './style.css';

const LIVES = 3;
/** Milliseconds per cell travelled. */
const SPEED = 45;
const DIR_EN = ['up', 'right', 'down', 'left'];
const DIR_FR = ['vers le haut', 'vers la droite', 'vers le bas', 'vers la gauche'];

export const arrowsPuzzle: PuzzleDef = {
  id: 'arrows',
  get name() {
    return L('Arrows', 'Flèches');
  },
  category: 'moves',
  get rules() {
    return L('Tap the arrows in the right order to clear them.', 'Touchez les flèches dans le bon ordre pour les sortir.');
  },
  help: () => ({
    goal: L(
      'Send every arrow off the board without crashing into the others.',
      'Faites sortir toutes les flèches de la grille sans les cogner les unes aux autres.',
    ),
    steps: [
      L(
        'Tap an arrow: it slides forward the way its head points, its body following the same track, until it leaves the board.',
        'Touchez une flèche : elle avance dans le sens de sa pointe, le corps suivant le même tracé, jusqu’à sortir de la grille.',
      ),
      L(
        'An arrow can only leave if nothing stands between its head and the edge, in a straight line.',
        'Une flèche ne peut sortir que si rien ne se trouve entre sa pointe et le bord, en ligne droite.',
      ),
      L(
        'If another arrow is in the way, it bumps into it and comes back, and you lose a heart.',
        'Si une autre flèche bloque le chemin, elle la cogne et revient, et vous perdez un cœur.',
      ),
      L(`Clear the board before you lose all ${LIVES} hearts.`, `Videz la grille avant de perdre vos ${LIVES} cœurs.`),
    ],
    tips: [
      L('Start with arrows near the edge that point outward.', 'Commencez par les flèches près du bord qui pointent vers l’extérieur.'),
      L(
        'Look straight ahead of each head: the arrow in the way has to go first.',
        'Regardez droit devant chaque pointe : la flèche qui bloque doit partir avant.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [20, 35, 60, 150, 240]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const n = byLevel(d, [5, 6, 8, 13, 16]);
    const maxLen = byLevel(d, [4, 5, 6, 8, 9]);
    const arrows = genArrows(n, maxLen, byLevel(d, [10, 20, 30, 40, 40]), rng);
    const occ = new Int16Array(n * n).fill(-1);
    arrows.forEach((a, id) => a.cells.forEach((j) => (occ[j] = id)));
    // Touching arrows never share a colour, so each one reads as its own shape.
    const colours: number[] = [];
    arrows.forEach((a, id) => {
      const near = new Set<number>();
      for (const j of a.cells)
        for (let k = 0; k < 4; k++) {
          const r = Math.floor(j / n) + DR[k],
            c = (j % n) + DC[k];
          const o = r >= 0 && r < n && c >= 0 && c < n ? occ[r * n + c] : -1;
          if (o >= 0 && o < id) near.add(colours[o]);
        }
      const free = [...PALETTE.keys()].filter((c) => !near.has(c));
      colours.push(free.length ? rng.pick(free) : rng.int(0, PALETTE.length - 1));
    });
    const gone = new Set<number>();
    let lives = LIVES;
    let over = false;

    // ---- View: one SVG in board units (1 = one cell), dots on empty spots, each arrow a <g>.
    const at = (i: number) => [(i % n) + 0.5, Math.floor(i / n) + 0.5];
    const svg = s('svg', { class: 'ar-svg', viewBox: `0 0 ${n} ${n}` });
    const dots = [...Array(n * n).keys()].map((i) => {
      const [x, y] = at(i);
      const el = s('circle', { class: 'ar-dot', cx: x, cy: y, r: 0.07 });
      svg.append(el);
      return el;
    });
    interface View {
      g: SVGGElement;
      lines: SVGPathElement[];
      heads: SVGGElement[];
      /** Invisible wide stroke over the body: the tap target. */
      hit: SVGPathElement;
      /** Distance travelled when fully off the board. */
      out: number;
    }
    const views: View[] = arrows.map((a, id) => {
      const pts = [...a.cells].reverse().map(at);
      const [hx, hy] = at(a.cells[0]);
      const out = ray(n, a.cells[0], a.dir).length + a.cells.length + 1;
      const track = `M${pts.map((p) => p.join(' ')).join('L')}L${hx + DC[a.dir] * out} ${hy + DR[a.dir] * out}`;
      const len = a.cells.length - 1;
      const dash = `${len} ${out + len + 2}`;
      const lines = [
        s('path', { class: 'ar-edge', d: track, 'stroke-dasharray': dash }),
        s('path', { class: 'ar-body', d: track, 'stroke-dasharray': dash }),
      ];
      const hit = s('path', { class: 'ar-hit', d: `M${pts.map((p) => p.join(' ')).join('L')}` });
      // Outline and fill are separate layers (outlines under bodies) so no seam shows where the head meets the body.
      const tipAt = `translate(${hx} ${hy}) rotate(${a.dir * 90 - 90})`;
      const tip = (cls: string) =>
        s('g', { class: 'ar-head' }, s('g', { transform: tipAt }, s('polygon', { class: cls, points: '0.42,0 -0.12,-0.34 -0.12,0.34' })));
      const heads = [tip('ar-tip-edge'), tip('ar-tip')];
      const g = s('g', {
        class: 'ar',
        style: `--c:${PALETTE[colours[id]]}`,
        role: 'button',
        'aria-label': L(`Arrow pointing ${DIR_EN[a.dir]}`, `Flèche ${DIR_FR[a.dir]}`),
        onclick: () => tap(id),
      });
      g.append(lines[0], heads[0], lines[1], heads[1], hit);
      return { g, lines, heads, hit, out };
    });
    for (const v of views) svg.append(v.g);
    const wrap = h('div', { class: 'ar-board' }, svg);

    /** Slide `v` forward by `t` cells over `ms` (0 = instantly). */
    const slide = (v: View, a: (typeof arrows)[number], t: number, ms: number, ease = 'linear') => {
      const tr = ms ? `${ms}ms ${ease}` : 'none';
      for (const l of v.lines) {
        l.style.transition = ms ? `stroke-dashoffset ${tr}` : 'none';
        l.style.strokeDashoffset = String(-t);
      }
      for (const hd of v.heads) {
        hd.style.transition = ms ? `transform ${tr}` : 'none';
        hd.style.transform = `translate(${DC[a.dir] * t}px, ${DR[a.dir] * t}px)`;
      }
    };

    const render = () => {
      for (let i = 0; i < n * n; i++) dots[i].classList.toggle('lit', occ[i] < 0);
      ctx.lives(lives, LIVES);
      ctx.status(P(arrows.length - gone.size, ['arrow left', 'arrows left'], ['flèche restante', 'flèches restantes']));
    };

    const remove = (id: number, animate: boolean) => {
      gone.add(id);
      for (const j of arrows[id].cells) occ[j] = -1;
      const v = views[id];
      v.g.classList.add('gone');
      if (!animate) {
        v.g.remove();
        return;
      }
      const ms = Math.max(260, v.out * SPEED);
      slide(v, arrows[id], v.out, ms, 'cubic-bezier(.5,0,.9,.6)');
      setTimeout(() => v.g.remove(), ms + 30);
    };

    const tap = (id: number) => {
      if (over || gone.has(id)) return;
      ctx.touch();
      const a = arrows[id];
      const b = blocker(n, a, occ);
      if (b.by < 0) {
        remove(id, true);
        render();
        if (gone.size === arrows.length) {
          over = true;
          ctx.solved();
        }
        return;
      }
      // Bump into the blocker and come back.
      const v = views[id];
      const t = b.at + 0.4;
      const ms = Math.max(120, t * SPEED * 1.5);
      slide(v, a, t, ms, 'ease-in');
      const other = views[b.by].g;
      setTimeout(() => {
        slide(v, a, 0, 220, 'ease-out');
        other.classList.remove('bumped');
        void other.getBoundingClientRect();
        other.classList.add('bumped');
      }, ms);
      v.g.classList.add('err');
      setTimeout(() => v.g.classList.remove('err'), ms + 400);
      ctx.mistake();
      lives--;
      shake(wrap);
      render();
      if (lives <= 0) {
        over = true;
        ctx.failed();
      }
    };

    const sv = ctx.saved as { gone?: number[]; lives?: number } | undefined;
    if (Array.isArray(sv?.gone)) {
      for (const id of sv.gone) if (Number.isInteger(id) && id >= 0 && id < arrows.length && !gone.has(id)) remove(id, false);
      if (typeof sv.lives === 'number') lives = Math.max(1, Math.min(LIVES, Math.floor(sv.lives)));
    }

    // ---- Guide ----
    let lastKind = '';
    const hint = (): Hint | null => {
      if (over) return null;
      const free = arrows.map((_, id) => id).filter((id) => !gone.has(id) && blocker(n, arrows[id], occ).by < 0);
      if (!free.length) return null;
      /** How many remaining arrows have `id` as the first thing in their way. */
      const blocks = (id: number) => arrows.filter((a, k) => !gone.has(k) && blocker(n, a, occ).by === id).length;
      const scored = free.map((id) => ({ id, blocks: blocks(id), way: ray(n, arrows[id].cells[0], arrows[id].dir) }));
      const kinds: { kind: string; id: number; text: string }[] = [];
      const edge = scored.find((x) => !x.way.length);
      if (edge)
        kinds.push({
          kind: 'edge',
          id: edge.id,
          text: L(
            'This arrow’s head already sits on the edge, pointing out: tap it and it slides straight off.',
            'La pointe de cette flèche touche déjà le bord et pointe vers l’extérieur : touchez-la et elle sort tout droit.',
          ),
        });
      const key = scored.reduce((x, y) => (y.blocks > x.blocks ? y : x));
      if (key.blocks > 0)
        kinds.push({
          kind: 'key',
          id: key.id,
          text: L(
            `This arrow stands in the way of ${P(key.blocks, ['other', 'others'], ['autre', 'autres'])}, and its own path to the edge is clear: send it out first.`,
            `Cette flèche bloque ${P(key.blocks, ['autre flèche', 'autres flèches'], ['autre flèche', 'autres flèches'])}, et son propre chemin jusqu’au bord est libre : sortez-la d’abord.`,
          ),
        });
      const far = scored.reduce((x, y) => (y.way.length > x.way.length ? y : x));
      kinds.push({
        kind: 'clear',
        id: far.id,
        text: L(
          `Follow this head ${DIR_EN[arrows[far.id].dir]}: nothing stands between it and the edge, so the arrow can leave.`,
          `Suivez cette pointe ${DIR_FR[arrows[far.id].dir]} : rien ne la sépare du bord, alors la flèche peut sortir.`,
        ),
      });
      const pick = kinds.find((x) => x.kind !== lastKind) ?? kinds[0];
      lastKind = pick.kind;
      const a = arrows[pick.id];
      return {
        text: pick.text,
        why: ray(n, a.cells[0], a.dir).map((j) => dots[j]),
        at: [views[pick.id].hit],
        play: () => tap(pick.id),
      };
    };

    root.append(wrap);
    render();
    // No check(): sending an arrow off only ever clears paths, so no position is a dead end (only lives can run out).
    return {
      snapshot: () => ({ gone: [...gone], lives }),
      hint,
    };
  },
};
