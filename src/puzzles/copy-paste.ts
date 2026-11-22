import { L, P } from '../core/i18n';
import type { Rng } from '../core/rng';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, btn, h, shake } from '../core/ui';
import './copy-paste.css';

/** A rectangular block of colours, row-major. */
interface Block {
  w: number;
  h: number;
  v: number[];
}
interface Rect {
  r: number;
  c: number;
  w: number;
  h: number;
}
/** One generator move: copy `src`, flip then rotate `rot` quarter turns clockwise, paste at (r, c). */
interface Op {
  src: Rect;
  rot: number;
  flip: boolean;
  r: number;
  c: number;
}

/** Cell colours: blank, blue, yellow. */
const COLS = ['var(--cell)', 'var(--p2)', 'var(--p4)'];

const extract = (g: number[], n: number, s: Rect): Block => {
  const v: number[] = [];
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) v.push(g[(s.r + y) * n + s.c + x]);
  return { w: s.w, h: s.h, v };
};
/** Quarter turn clockwise. */
const rot90 = (b: Block): Block => {
  const v: number[] = [];
  for (let y = 0; y < b.w; y++) for (let x = 0; x < b.h; x++) v.push(b.v[(b.h - 1 - x) * b.w + y]);
  return { w: b.h, h: b.w, v };
};
/** Mirror left ↔ right. */
const flipH = (b: Block): Block => {
  const v: number[] = [];
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) v.push(b.v[y * b.w + b.w - 1 - x]);
  return { w: b.w, h: b.h, v };
};
const orient = (b: Block, rot: number, flip: boolean) => {
  let o = flip ? flipH(b) : b;
  for (let k = 0; k < rot; k++) o = rot90(o);
  return o;
};
const sameBlock = (a: Block, b: Block) => a.w === b.w && a.h === b.h && a.v.every((x, i) => x === b.v[i]);
const sameGrid = (a: number[], b: number[]) => a.every((x, i) => x === b[i]);
/** Paste `b` with its top-left at (r, c), clipped at the edges. */
const pasteAt = (g: number[], n: number, b: Block, r: number, c: number): number[] => {
  const out = [...g];
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (r + y < n && c + x < n) out[(r + y) * n + c + x] = b.v[y * b.w + x];
  return out;
};
const applyOp = (g: number[], n: number, o: Op) => pasteAt(g, n, orient(extract(g, n, o.src), o.rot, o.flip), o.r, o.c);
const diff = (a: number[], b: number[]) => a.reduce((s, x, i) => s + (x === b[i] ? 0 : 1), 0);

/** Can `target` be reached from `start` with a single paste (any allowed orientation)? */
function oneShot(start: number[], target: number[], n: number, turns: boolean, flips: boolean): boolean {
  return sameGrid(start, target) || !!findShot(start, target, n, turns, flips);
}

/** A single paste turning `start` into `target` (any allowed orientation), or null. */
function findShot(start: number[], target: number[], n: number, turns: boolean, flips: boolean): Op | null {
  let r0 = n,
    r1 = -1,
    c0 = n,
    c1 = -1;
  for (let i = 0; i < n * n; i++)
    if (start[i] !== target[i]) {
      const r = Math.floor(i / n),
        c = i % n;
      r0 = Math.min(r0, r);
      r1 = Math.max(r1, r);
      c0 = Math.min(c0, c);
      c1 = Math.max(c1, c);
    }
  if (r1 < 0) return null;
  const orients: [number, boolean][] = [];
  for (const f of flips ? [false, true] : [false]) for (let k = 0; k < (turns ? 4 : 1); k++) orients.push([k, f]);
  // Every paste footprint that covers all changed cells.
  for (let ph = r1 - r0 + 1; ph <= n; ph++)
    for (let pw = c1 - c0 + 1; pw <= n; pw++)
      for (let pr = Math.max(0, r1 - ph + 1); pr <= Math.min(r0, n - ph); pr++)
        for (let pc = Math.max(0, c1 - pw + 1); pc <= Math.min(c0, n - pw); pc++) {
          const want = extract(target, n, { r: pr, c: pc, w: pw, h: ph });
          for (const [k, f] of orients) {
            const sw = k % 2 ? ph : pw,
              sh = k % 2 ? pw : ph;
            for (let sr = 0; sr + sh <= n; sr++)
              for (let sc = 0; sc + sw <= n; sc++)
                if (sameBlock(orient(extract(start, n, { r: sr, c: sc, w: sw, h: sh }), k, f), want))
                  return { src: { r: sr, c: sc, w: sw, h: sh }, rot: k, flip: f, r: pr, c: pc };
          }
        }
  return null;
}

interface Level {
  start: number[];
  ops: Op[];
  /** Grid after each op: path[0] = start, path[ops.length] = target. */
  path: number[][];
}

function generate(rng: Rng, n: number, k: number, count: number, turns: boolean, flips: boolean): Level {
  let fallback: Level | null = null;
  for (let attempt = 0; attempt < 150; attempt++) {
    const start = Array.from({ length: n * n }, () => rng.int(0, k - 1));
    // Every colour shows up a fair amount, so patterns are recognisable.
    if (Array.from({ length: k }, (_, c) => start.filter((x) => x === c).length).some((m) => m < (n * n) / (k * 2.5))) continue;
    const ops: Op[] = [];
    const path = [start];
    let g = start;
    for (let i = 0; i < count; i++) {
      let ok = false;
      for (let t = 0; t < 60 && !ok; t++) {
        const w = rng.int(1, n - 1),
          hh = rng.int(1, n - 1);
        if (w * hh < 3 || w * hh > (n * n) / 2) continue;
        const src = { r: rng.int(0, n - hh), c: rng.int(0, n - w), w, h: hh };
        const rot = turns && rng.chance(0.6) ? rng.int(1, 3) : 0;
        const flip = flips && rng.chance(0.5);
        const b = orient(extract(g, n, src), rot, flip);
        const op = { src, rot, flip, r: rng.int(0, n - b.h), c: rng.int(0, n - b.w) };
        const ng = applyOp(g, n, op);
        // Each paste changes a good part of its footprint, and never brings back an earlier board.
        if (diff(g, ng) < Math.max(2, Math.ceil(b.v.length / 3))) continue;
        if (path.some((p) => sameGrid(p, ng))) continue;
        ops.push(op);
        path.push(ng);
        g = ng;
        ok = true;
      }
      if (!ok) break;
    }
    if (ops.length < count) continue;
    const target = g;
    if (!fallback) fallback = { start, ops, path };
    // Every op matters: skipping any one of them misses the target.
    let needed = true;
    for (let s = 0; s < count && needed; s++) {
      let alt = start;
      for (let j = 0; j < count; j++) if (j !== s) alt = applyOp(alt, n, ops[j]);
      if (sameGrid(alt, target)) needed = false;
    }
    if (!needed) continue;
    // With rotation on, at least one paste really needs a turn (or flip).
    if (turns && !ops.some((o, j) => !sameBlock(orient(extract(path[j], n, o.src), o.rot, o.flip), extract(path[j], n, o.src)))) continue;
    if (count > 1 && oneShot(start, target, n, turns, flips)) continue;
    return { start, ops, path };
  }
  if (fallback) return fallback;
  // Practically unreachable: a fixed single paste on a striped board.
  const start = Array.from({ length: n * n }, (_, i) => (Math.floor(i / n) + (i % n)) % k);
  const op: Op = { src: { r: 0, c: 0, w: 1, h: n }, rot: 0, flip: false, r: 0, c: 1 };
  return { start, ops: [op], path: [start, applyOp(start, n, op)] };
}

const okRect = (x: unknown, n: number): x is Rect => {
  const r = x as Rect | null;
  return (
    !!r &&
    [r.r, r.c, r.w, r.h].every((v) => Number.isInteger(v)) &&
    r.r >= 0 &&
    r.c >= 0 &&
    r.w >= 1 &&
    r.h >= 1 &&
    r.r + r.h <= n &&
    r.c + r.w <= n
  );
};
const okCells = (x: unknown, len: number, k: number): x is number[] =>
  Array.isArray(x) && x.length === len && x.every((v) => Number.isInteger(v) && v >= 0 && v < k);

export const copyPaste: PuzzleDef = {
  id: 'copy-paste',
  get name() {
    return L('Copy Paste', 'Copier-coller');
  },
  category: 'moves',
  offByDefault: true,
  get rules() {
    return L('Copy blocks and paste them to match the target.', 'Copiez des blocs et collez-les pour imiter la cible.');
  },
  help: () => ({
    goal: L(
      'Make your board look exactly like the small target, using only a few pastes.',
      'Rendez votre grille identique à la petite cible, en quelques collages seulement.',
    ),
    steps: [
      L(
        'Drag across your board to copy a rectangle. It shows up in the clipboard.',
        'Glissez sur votre grille pour copier un rectangle. Il apparaît dans le presse-papiers.',
      ),
      L(
        'Tap a cell to paste the clipboard with its top-left corner there. Pasted cells replace what was under them; anything past the edge is cut off.',
        'Touchez une case pour y coller le presse-papiers par son coin en haut à gauche. Les cases collées remplacent celles d’en dessous; ce qui dépasse du bord est coupé.',
      ),
      L(
        'On harder levels, turn ↻ or mirror ⇋ the clipboard before pasting.',
        'Aux niveaux plus difficiles, tournez ↻ ou retournez ⇋ le presse-papiers avant de coller.',
      ),
      L(
        'Copying is free, but pastes are limited: the counter shows how many you have left.',
        'Copier est gratuit, mais les collages sont comptés : le compteur indique combien il en reste.',
      ),
      L(
        'Out of pastes? Undo steps back one paste; Reset starts over. Keys: R turns, F mirrors, Z undoes.',
        'Plus de collages? Annuler recule d’un collage; Recommencer repart de zéro. Touches : R tourne, F retourne, Z annule.',
      ),
    ],
    tips: [
      L(
        'Find where the target differs from your board, then look for that pattern elsewhere on your board.',
        'Repérez où la cible diffère de votre grille, puis cherchez ce motif ailleurs sur votre grille.',
      ),
      L(
        'Order matters: a paste can build a pattern that a later copy needs.',
        'L’ordre compte : un collage peut créer un motif dont une copie suivante aura besoin.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [30, 60, 100, 160, 240]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const n = byLevel(d, [4, 5, 6, 6, 7]);
    const k = byLevel(d, [2, 2, 2, 3, 3]);
    const count = byLevel(d, [1, 2, 2, 3, 3]);
    const turns = d >= 3;
    const flips = d >= 4;
    /** Mark cells that still differ from the target (easier levels only). */
    const marks = d <= 3;
    const { start, ops, path } = generate(rng, n, k, count, turns, flips);
    const target = path[path.length - 1];
    const limit = ops.length + byLevel(d, [1, 1, 1, 0, 0]);

    let g = start;
    let hist: number[][] = [];
    let clip: Block | null = null;
    /** Rectangle last copied (outlined until the next paste). */
    let src: Rect | null = null;
    let done = false;
    let drag: { id: number; a: number; b: number; moved: boolean } | null = null;
    let hover = -1;

    // ---- DOM ----
    const mini = (cls: string) => h('div', { class: `cp-mini ${cls}`, style: `--n:${n}` });
    const tgt = mini('cp-tgt');
    for (const v of target) tgt.append(h('i', { style: `background:${COLS[v]}` }));
    const clipEl = mini('cp-clip');
    const leftNum = h('b', { class: 'cp-num' });
    const leftLbl = h('span', { class: 'cp-lbl' });
    const rotBtn = h(
      'button',
      { type: 'button', class: 'key', 'aria-label': L('Turn clipboard', 'Tourner le presse-papiers'), onclick: () => turn() },
      '↻',
    );
    const flipBtn = h(
      'button',
      { type: 'button', class: 'key', 'aria-label': L('Mirror clipboard', 'Retourner le presse-papiers'), onclick: () => mirror() },
      '⇋',
    );
    const tools = h('div', { class: 'cp-tools' }, turns && rotBtn, flips && flipBtn);
    const head = h(
      'div',
      { class: 'cp-head' },
      h('div', { class: 'cp-box' }, h('div', { class: 'cp-cap' }, L('Target', 'Cible')), tgt),
      h(
        'div',
        { class: 'cp-box' },
        h('div', { class: 'cp-cap' }, L('Clipboard', 'Presse-papiers')),
        h('div', { class: 'cp-cliprow' }, clipEl, turns && tools),
      ),
      h('div', { class: 'cp-left' }, leftNum, leftLbl),
    );
    const grid = board(n, n, 'cp-board');
    const cells = g.map((_, i) => {
      const el = h('div', { class: 'cell', 'data-i': i });
      grid.append(el);
      return el;
    });

    const rectOf = (a: number, b: number): Rect => {
      const r = Math.min(Math.floor(a / n), Math.floor(b / n)),
        c = Math.min(a % n, b % n);
      return { r, c, h: Math.abs(Math.floor(a / n) - Math.floor(b / n)) + 1, w: Math.abs((a % n) - (b % n)) + 1 };
    };
    const inRect = (s: Rect | null, i: number) => {
      if (!s) return false;
      const r = Math.floor(i / n),
        c = i % n;
      return r >= s.r && r < s.r + s.h && c >= s.c && c < s.c + s.w;
    };

    const render = () => {
      const sel = drag?.moved ? rectOf(drag.a, drag.b) : src;
      const at = drag && !drag.moved ? drag.a : hover;
      const ghost = clip && at >= 0 ? { r: Math.floor(at / n), c: at % n } : null;
      cells.forEach((el, i) => {
        const r = Math.floor(i / n),
          c = i % n;
        const gy = ghost ? r - ghost.r : -1,
          gx = ghost ? c - ghost.c : -1;
        const gv = clip && gy >= 0 && gx >= 0 && gy < clip.h && gx < clip.w ? clip.v[gy * clip.w + gx] : -1;
        el.className = `cell${inRect(sel, i) ? ' cp-sel' : ''}${gv >= 0 ? ' cp-ghost' : ''}${marks && g[i] !== target[i] ? ' cp-off' : ''}`;
        el.setAttribute('style', `background:${COLS[g[i]]}${gv >= 0 ? `;--g:${COLS[gv]}` : ''}`);
      });
      clipEl.replaceChildren();
      if (clip) {
        clipEl.setAttribute('style', `--n:${n};--w:${clip.w};--h:${clip.h}`);
        for (const v of clip.v) clipEl.append(h('i', { style: `background:${COLS[v]}` }));
      } else clipEl.setAttribute('style', `--n:${n};--w:0;--h:0`);
      clipEl.classList.toggle('empty', !clip);
      rotBtn.disabled = flipBtn.disabled = !clip || done;
      const left = limit - hist.length;
      leftNum.textContent = String(left);
      leftLbl.textContent = L(left === 1 ? 'paste left' : 'pastes left', left < 2 ? 'collage restant' : 'collages restants');
      head.classList.toggle('low', left === 0 && !done);
    };

    const copy = (s: Rect) => {
      if (done) return;
      ctx.touch();
      clip = extract(g, n, s);
      src = s;
      render();
    };
    const turn = () => {
      if (!clip || done) return;
      ctx.touch();
      clip = rot90(clip);
      render();
    };
    const mirror = () => {
      if (!clip || done) return;
      ctx.touch();
      clip = flipH(clip);
      render();
    };
    const paste = (i: number) => {
      if (!clip || done) return;
      ctx.touch();
      if (hist.length >= limit) {
        shake(grid);
        ctx.status(L('No pastes left — undo or reset', 'Plus de collages — annulez ou recommencez'));
        return;
      }
      const ng = pasteAt(g, n, clip, Math.floor(i / n), i % n);
      if (sameGrid(ng, g)) {
        shake(grid);
        return;
      }
      hist.push(g);
      g = ng;
      src = null;
      status();
      render();
      if (sameGrid(g, target)) {
        done = true;
        render();
        ctx.solved();
      } else if (hist.length >= limit) {
        shake(grid);
        ctx.status(L('No pastes left — undo or reset', 'Plus de collages — annulez ou recommencez'));
      }
    };
    const status = () => ctx.status(L(`${hist.length} / ${limit} pastes used`, `${hist.length} / ${limit} collages utilisés`));
    const undo = () => {
      const prev = hist.pop();
      if (!prev || done) return;
      g = prev;
      src = null;
      status();
      render();
    };
    const reset = () => {
      if (!hist.length || done) return;
      g = start;
      hist = [];
      src = null;
      status();
      render();
    };

    // ---- Pointer: drag = copy a rectangle, tap = paste ----
    const cellAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const i = el?.dataset.i;
      return el && grid.contains(el) && i != null ? Number(i) : -1;
    };
    grid.addEventListener('contextmenu', (e) => e.preventDefault());
    grid.addEventListener('pointerdown', (e) => {
      if (done || drag) return;
      const i = cellAt(e.clientX, e.clientY);
      if (i < 0) return;
      e.preventDefault();
      ctx.touch();
      drag = { id: e.pointerId, a: i, b: i, moved: false };
      render();
    });
    grid.addEventListener('pointermove', (e) => {
      const i = cellAt(e.clientX, e.clientY);
      if (!drag) {
        if (e.pointerType === 'mouse' && i !== hover) {
          hover = i;
          render();
        }
        return;
      }
      if (e.pointerId !== drag.id || i < 0 || i === drag.b) return;
      drag.b = i;
      drag.moved ||= i !== drag.a;
      render();
    });
    grid.addEventListener('pointerleave', () => {
      if (hover < 0) return;
      hover = -1;
      render();
    });
    const end = (e: PointerEvent) => {
      const dr = drag;
      if (!dr || e.pointerId !== dr.id) return;
      drag = null;
      if (e.type === 'pointercancel') render();
      else if (dr.moved) copy(rectOf(dr.a, dr.b));
      else if (clip) paste(dr.a);
      else copy(rectOf(dr.a, dr.a));
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);

    // ---- Resume ----
    const sv = ctx.saved as { g?: unknown; hist?: unknown; clip?: unknown; src?: unknown } | undefined;
    if (sv && okCells(sv.g, n * n, k) && Array.isArray(sv.hist) && sv.hist.length <= limit && sv.hist.every((x) => okCells(x, n * n, k))) {
      g = sv.g;
      hist = sv.hist as number[][];
      const c = sv.clip as Block | null;
      if (c && Number.isInteger(c.w) && Number.isInteger(c.h) && c.w >= 1 && c.h >= 1 && c.w <= n && c.h <= n && okCells(c.v, c.w * c.h, k))
        clip = { w: c.w, h: c.h, v: c.v };
      if (okRect(sv.src, n)) src = sv.src;
    }

    // ---- Guide: replay the generator's moves while the board is still on that path ----
    const at = (r: number, c: number) => L(`row ${r + 1}, column ${c + 1}`, `rangée ${r + 1}, colonne ${c + 1}`);
    /**
     * The next paste: the generator's, from wherever the board sits on its path with enough pastes
     * left, else any single paste that finishes the board. Memoised per board (check() then hint()).
     */
    let memo: { key: string; next: { op: Op; after: number[] } | null } | null = null;
    const route = () => {
      const left = limit - hist.length;
      const key = `${g.join('')}:${left}`;
      if (memo?.key === key) return memo.next;
      let next: { op: Op; after: number[] } | null = null;
      for (let j = ops.length - 1; j >= 0 && !next; j--)
        if (ops.length - j <= left && sameGrid(g, path[j])) next = { op: ops[j], after: path[j + 1] };
      if (!next && left > 0 && !sameGrid(g, target)) {
        const op = findShot(g, target, n, turns, flips);
        if (op) next = { op, after: target };
      }
      memo = { key, next };
      return next;
    };
    /** Out of pastes, or no paste left that the guide can see leading to the target: undo. */
    const check = (): Hint | null => {
      if (done || !hist.length || route()) return null;
      const left = limit - hist.length;
      const off = g.reduce((t, v, i) => t + (v === target[i] ? 0 : 1), 0);
      const offCells = cells.filter((_, i) => g[i] !== target[i]);
      const out = { at: offCells, why: [tgt], action: L('Undo', 'Annuler'), play: undo };
      if (left === 0)
        return {
          kind: 'stuck',
          text: L(
            `No pastes left, and ${P(off, ['cell still differs', 'cells still differ'], ['case diffère encore', 'cases diffèrent encore'])} from the target. Undo a paste.`,
            `Plus de collages, et ${P(off, ['cell still differs', 'cells still differ'], ['case diffère encore', 'cases diffèrent encore'])} de la cible. Annulez un collage.`,
          ),
          ...out,
        };
      if (left === 1)
        return {
          kind: 'stuck',
          text: L(
            `One paste left, but no block of your board, turned or not, fixes all ${off} differing cells at once. Undo a paste.`,
            `Un seul collage restant, mais aucun bloc de votre grille, tourné ou non, ne corrige d’un coup les ${off} cases qui diffèrent. Annulez un collage.`,
          ),
          ...out,
        };
      return {
        kind: 'fix',
        text: L(
          `This paste led away from the target: the guide sees no way to finish in the ${left} pastes left. Undo it.`,
          `Ce collage vous a éloigné de la cible : le guide ne voit aucune façon de finir avec les ${left} collages restants. Annulez-le.`,
        ),
        ...out,
      };
    };
    const hint = (): Hint | null => {
      if (done) return null;
      const next = route();
      if (!next) return check();
      const { op, after } = next;
      const raw = extract(g, n, op.src);
      const need = orient(raw, op.rot, op.flip);
      const foot = cells.filter((_, i) => inRect({ r: op.r, c: op.c, w: need.w, h: need.h }, i));
      const srcCells = cells.filter((_, i) => inRect(op.src, i));
      const fixed = foot.filter((el) => {
        const i = Number(el.dataset.i);
        return g[i] !== after[i];
      });
      if (clip && sameBlock(clip, need))
        return {
          text: L(
            `The clipboard matches the target’s block at ${at(op.r, op.c)}. Tap that cell to paste it there; ${P(fixed.length, ['cell changes', 'cells change'], ['case change', 'cases changent'])}.`,
            `Le presse-papiers correspond au bloc de la cible en ${at(op.r, op.c)}. Touchez cette case pour l’y coller; ${P(fixed.length, ['cell changes', 'cells change'], ['case change', 'cases changent'])}.`,
          ),
          why: foot,
          at: [cells[op.r * n + op.c]],
          play: () => paste(op.r * n + op.c),
        };
      // Same block in another orientation: the next ↻ / ⇋ press toward it.
      if (clip && clip.v.length === need.v.length) {
        const seen: Block[] = [clip];
        const queue: { b: Block; first: 'turn' | 'flip' | null }[] = [{ b: clip, first: null }];
        while (queue.length) {
          const q = queue.shift()!;
          if (sameBlock(q.b, need) && q.first) {
            const turnIt = q.first === 'turn';
            return {
              text: turnIt
                ? L(
                    'The clipboard holds the right pattern, but the target shows it turned. Rotate it a quarter turn.',
                    'Le presse-papiers contient le bon motif, mais la cible le montre tourné. Faites-lui un quart de tour.',
                  )
                : L(
                    'The clipboard holds the right pattern, but the target shows it mirrored. Flip it.',
                    'Le presse-papiers contient le bon motif, mais la cible le montre en miroir. Retournez-le.',
                  ),
              why: foot,
              at: [turnIt ? rotBtn : flipBtn],
              play: turnIt ? turn : mirror,
            };
          }
          const moves: ['turn' | 'flip', Block][] = [];
          if (turns) moves.push(['turn', rot90(q.b)]);
          if (flips) moves.push(['flip', flipH(q.b)]);
          for (const [kind, nb] of moves)
            if (!seen.some((s) => sameBlock(s, nb))) {
              seen.push(nb);
              queue.push({ b: nb, first: q.first ?? kind });
            }
        }
      }
      const turned = !sameBlock(raw, need);
      return {
        text: turned
          ? L(
              `The target’s block at ${at(op.r, op.c)} is this ${raw.w}×${raw.h} pattern from your board, turned around. Drag over it to copy it.`,
              `Le bloc de la cible en ${at(op.r, op.c)} est ce motif ${raw.w}×${raw.h} de votre grille, mais tourné. Glissez dessus pour le copier.`,
            )
          : L(
              `The target’s block at ${at(op.r, op.c)} repeats this ${raw.w}×${raw.h} pattern from your board. Drag over it to copy it.`,
              `Le bloc de la cible en ${at(op.r, op.c)} reprend ce motif ${raw.w}×${raw.h} de votre grille. Glissez dessus pour le copier.`,
            ),
        why: foot,
        at: srcCells,
        play: () => copy(op.src),
      };
    };

    root.append(head, grid);
    ctx.controls(btn(L('Undo', 'Annuler'), undo, 'ghost'), btn(L('Reset', 'Recommencer'), reset, 'ghost'));
    status();
    if (hist.length >= limit) ctx.status(L('No pastes left — undo or reset', 'Plus de collages — annulez ou recommencez'));
    render();
    return {
      snapshot: () => ({ g, hist, clip, src }),
      check,
      hint,
      onKey(e) {
        const key = e.key.toLowerCase();
        if (key === 'z' || key === 'backspace') undo();
        else if (key === 'r' && turns) turn();
        else if (key === 'f' && flips) mirror();
        else return false;
        return true;
      },
      destroy() {
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
      },
    };
  },
};
