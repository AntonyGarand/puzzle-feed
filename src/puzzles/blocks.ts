import { confetti } from '../core/confetti';
import { L, P } from '../core/i18n';
import { byLevel, type Difficulty, type Hint, type PuzzleDef } from '../core/types';
import { board, btn, h, PALETTE, shake } from '../core/ui';
import { anim, baseSeed, int, isIntArr, subRng } from './movekit/kit';
import { drawPiece, fits, fitsAnywhere, fullLines, PIECES, type Piece } from './movekit/pieces';
import { planTray, type TrayPlan } from './playkit/blocks-plan';
import './blocks.css';

const colour = (p: Piece) => PALETTE[p.fam % PALETTE.length];

/** Best score per difficulty, kept on this device. */
const BEST_KEY = 'puzzle-feed:blocks:best:v1';
const readBests = (): Record<string, number> => {
  try {
    const v = JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
};
const getBest = (d: Difficulty) => {
  const v = readBests()[d];
  return typeof v === 'number' && v > 0 ? Math.floor(v) : 0;
};
const putBest = (d: Difficulty, score: number) => {
  if (score <= getBest(d)) return;
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify({ ...readBests(), [d]: score }));
  } catch {
    /* private mode / quota: the best just isn't kept */
  }
};

/** Points for one placement: 1 per cell, plus 10 × lines² for a clear, multiplied by the combo (clears in a row). */
const pointsFor = (cells: number, lines: number, combo: number) => cells + (lines ? 10 * lines * lines * combo : 0);

export const blocks: PuzzleDef = {
  id: 'blocks',
  get name() {
    return L('Blocks', 'Blocs');
  },
  category: 'moves',
  get rules() {
    return L('Place the pieces. Fill rows or columns to clear them.', 'Placez les pièces. Une ligne ou colonne pleine s’efface.');
  },
  help: () => ({
    goal: L(
      'Clear the target number of lines by filling complete rows or columns, then keep going for a high score.',
      'Effacez le nombre de lignes demandé en remplissant des rangées ou des colonnes complètes, puis continuez pour battre votre record.',
    ),
    steps: [
      L(
        'Drag a piece from the tray onto the grid; a preview shows where it lands and which lines will clear.',
        'Glissez une pièce du bac vers la grille : un aperçu montre où elle se pose et quelles lignes s’effaceront.',
      ),
      L(
        'Or tap a piece (or press 1, 2 or 3), then tap a cell to centre it there.',
        'Ou touchez une pièce (ou appuyez sur 1, 2 ou 3), puis touchez une case pour la centrer là.',
      ),
      L(
        'A full row or column disappears and counts towards the goal.',
        'Une rangée ou une colonne pleine disparaît et compte pour l’objectif.',
      ),
      L(
        'Each placed cell scores 1 point; lines score much more, especially several at once or clears in a row (combo). After the goal, play on, or tap Finish.',
        'Chaque case posée vaut 1 point; les lignes valent bien plus, surtout plusieurs d’un coup ou à la suite (combo). Après l’objectif, continuez ou touchez Terminer.',
      ),
      L(
        'Pieces don’t rotate. When all three are placed, three new ones arrive.',
        'Les pièces ne tournent pas. Une fois les trois placées, trois nouvelles arrivent.',
      ),
      L(
        'Faded pieces fit nowhere. If none of your pieces fit, the game is over.',
        'Les pièces pâlies ne rentrent nulle part. Si aucune ne rentre, la partie est finie.',
      ),
    ],
    tips: [
      L(
        'Keep the board open and leave room for the big pieces.',
        'Gardez la grille dégagée et laissez de la place pour les grosses pièces.',
      ),
      L(
        'Filling a row and a column at once clears both, and scores far more than clearing them one at a time.',
        'Remplir une rangée et une colonne d’un coup efface les deux et rapporte bien plus que les effacer une à la fois.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [60, 110, 170, 240, 330]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const n = byLevel(d, [7, 8, 8, 8, 8]);
    const goal = byLevel(d, [6, 10, 14, 17, 21]);
    const maxTier = byLevel(d, [3, 4, 4, 5, 5]);
    const bigBias = byLevel(d, [0, 0.2, 0.35, 0.45, 0.6]);
    const prefill = byLevel(d, [0, 0, 3, 5, 7]);
    const base = baseSeed(rng);

    // Board: 0 empty, otherwise colour index + 1.
    let cells = new Array<number>(n * n).fill(0);
    for (let k = 0; k < prefill; k++) {
      const i = rng.int(0, n * n - 1);
      cells[i] = 9; // grey filler
      const { rows, cols } = fullLines(cells, n);
      if (rows.length || cols.length) cells[i] = 0;
    }
    let tray: number[] = [];
    let batch = 0;
    let cleared = 0;
    let score = 0;
    let combo = 0;
    let sel = -1;
    let over = false;

    /** Batch k is drawn from its own sub-seeded rng; a couple of redraws avoid a dead hand when possible. */
    const deal = () => {
      const r = subRng(base, batch++);
      let hand: number[] = [];
      for (let attempt = 0; attempt < 4; attempt++) {
        hand = [0, 1, 2].map(() => drawPiece(r, maxTier, bigBias));
        if (hand.some((p) => fitsAnywhere(cells, n, PIECES[p]))) break;
      }
      tray = hand;
    };

    const sv = ctx.saved as
      | {
          cells?: unknown;
          tray?: unknown;
          batch?: unknown;
          cleared?: unknown;
          sel?: unknown;
          score?: unknown;
          combo?: unknown;
          beat?: unknown;
        }
      | undefined;
    // The best before this game started: beating it is celebrated once.
    const prevBest = getBest(d);
    let beat = false;
    if (
      isIntArr(sv?.cells, n * n) &&
      isIntArr(sv?.tray, 3) &&
      sv.tray.every((p) => p >= -1 && p < PIECES.length) &&
      sv.tray.some((p) => p >= 0)
    ) {
      cells = sv.cells.map((v) => Math.max(0, Math.min(9, v)));
      tray = sv.tray.slice();
      batch = int(sv.batch, 1);
      cleared = int(sv.cleared, 0);
      score = Math.max(0, int(sv.score, 0));
      combo = Math.max(0, int(sv.combo, 0));
      beat = sv.beat === true;
      sel = int(sv.sel, -1);
      if (sel < 0 || sel > 2 || tray[sel] < 0) sel = -1;
    } else deal();

    const scoreEl = h('strong', { class: 'blk-pts' });
    const comboEl = h('span', { class: 'blk-combo' });
    const bestEl = h('span', { class: 'blk-best' });
    const bar = h('div', { class: 'blk-bar' }, h('span', null, L('Score', 'Pointage'), ' ', scoreEl), comboEl, bestEl);
    const finishBtn = btn(L('Finish', 'Terminer'), () => finish(), 'primary');
    finishBtn.title = L('End the game and keep your score', 'Terminer la partie et garder votre pointage');
    ctx.controls(finishBtn);
    const grid = board(n, n, 'blk-grid');
    const els = cells.map((_, i) => {
      const el = h('button', { type: 'button', class: 'cell', onclick: () => tapCell(i) });
      grid.append(el);
      return el;
    });
    const trayEl = h('div', { class: 'blk-tray' });
    const slots = [0, 1, 2].map((k) => {
      const el = h('button', { type: 'button', class: 'key blk-slot', onclick: () => tapSlot(k) });
      el.addEventListener('pointerdown', (e) => startDrag(k, e));
      trayEl.append(el);
      return el;
    });

    let preview: { p: Piece; r: number; c: number } | null = null;
    const render = () => {
      const pv = new Set<number>();
      const clr = new Set<number>();
      if (preview) {
        const { p, r, c } = preview;
        const tmp = cells.slice();
        for (const [dr, dc] of p.cells) {
          pv.add((r + dr) * n + c + dc);
          tmp[(r + dr) * n + c + dc] = 1;
        }
        const { rows, cols } = fullLines(tmp, n);
        for (const rr of rows) for (let j = 0; j < n; j++) clr.add(rr * n + j);
        for (const cc of cols) for (let j = 0; j < n; j++) clr.add(j * n + cc);
      }
      els.forEach((el, i) => {
        const v = cells[i];
        const isPv = pv.has(i);
        el.className = `cell ${v ? 'fill' : ''} ${isPv ? 'pv' : ''} ${clr.has(i) ? 'clr' : ''}`.replace(/\s+/g, ' ').trim();
        const c = v ? (v === 9 ? 'var(--muted)' : PALETTE[v - 1]) : isPv ? colour(preview!.p) : '';
        if (c) el.setAttribute('style', `--c:${c}`);
        else el.removeAttribute('style');
      });
      slots.forEach((el, k) => {
        const p = tray[k];
        el.className = `key blk-slot ${k === sel ? 'sel' : ''} ${p < 0 ? 'used' : ''}`.replace(/\s+/g, ' ').trim();
        if (p < 0) {
          el.replaceChildren();
          return;
        }
        const pc = PIECES[p];
        const fitsNow = fitsAnywhere(cells, n, pc);
        el.classList.toggle('nofit', !fitsNow);
        el.replaceChildren(
          h(
            'span',
            { class: 'blk-mini', style: `--w:${pc.w};--h:${pc.h}` },
            ...pc.cells.map(([r, c]) => h('i', { style: `grid-row:${r + 1};grid-column:${c + 1};--c:${colour(pc)}` })),
          ),
        );
      });
      scoreEl.textContent = String(score);
      comboEl.textContent = combo > 1 ? `Combo ×${combo}` : '';
      const best = Math.max(getBest(d), score);
      bestEl.textContent = beat ? L(`New best! ${best}`, `Nouveau record! ${best}`) : L(`Best ${best}`, `Record ${best}`);
      bestEl.classList.toggle('new', beat);
      finishBtn.hidden = over || cleared < goal;
      if (over) return;
      ctx.status(
        cleared < goal
          ? L(`Lines ${cleared}/${goal}`, `Lignes ${cleared}/${goal}`)
          : `${P(cleared, ['line', 'lines'], ['ligne', 'lignes'])} · ${L('goal reached, keep going!', 'objectif atteint, continuez!')}`,
      );
    };

    /** End the run: closes a solve already recorded at the goal (Finish, or stuck afterwards), or fails before it. */
    const finish = () => {
      if (over) return;
      over = true;
      putBest(d, score);
      render();
      if (cleared >= goal) ctx.solved();
      else ctx.failed();
    };

    const place = (k: number, r: number, c: number): boolean => {
      const p = PIECES[tray[k]];
      if (over || !p || !fits(cells, n, p, r, c)) return false;
      ctx.touch();
      const col = (p.fam % PALETTE.length) + 1;
      const placed = p.cells.map(([dr, dc]) => (r + dr) * n + c + dc);
      for (const i of placed) cells[i] = col;
      const { rows, cols } = fullLines(cells, n);
      const gone = new Set<number>();
      for (const rr of rows) for (let j = 0; j < n; j++) gone.add(rr * n + j);
      for (const cc of cols) for (let j = 0; j < n; j++) gone.add(j * n + cc);
      gone.forEach((i) => (cells[i] = 0));
      const lines = rows.length + cols.length;
      const wasBelow = cleared < goal;
      cleared += lines;
      combo = lines ? combo + 1 : 0;
      score += pointsFor(placed.length, lines, combo);
      if (prevBest > 0 && score > prevBest && !beat) {
        beat = true;
        const gr = grid.getBoundingClientRect();
        if (gr.height) confetti(gr.left + gr.width / 2, gr.top, 40);
      }
      putBest(d, score);
      tray[k] = -1;
      sel = -1;
      preview = null;
      if (tray.every((x) => x < 0)) deal();
      render();
      for (const i of placed) if (!gone.has(i)) anim(els[i], [{ transform: 'scale(0.8)' }, { transform: 'scale(1)' }], 140);
      gone.forEach((i) => anim(els[i], [{ background: 'var(--accent)' }, { background: 'var(--cell)' }], 320));
      if (lines) anim(bar, [{ transform: 'scale(1.06)' }, { transform: 'scale(1)' }], 220);
      if (beat && score - pointsFor(placed.length, lines, combo) <= prevBest)
        anim(bestEl, [{ transform: 'scale(1.3)' }, { transform: 'scale(1)' }], 400);
      if (wasBelow && cleared >= goal) {
        anim(finishBtn, [{ transform: 'scale(1.15)' }, { transform: 'scale(1)' }], 320);
        // Record the solve (and its time) now; the run goes on until Finish or no piece fits.
        ctx.solved({ keepPlaying: true });
      }
      if (!tray.some((x) => x >= 0 && fitsAnywhere(cells, n, PIECES[x]))) {
        shake(grid);
        finish();
      }
      return true;
    };

    let suppressClick = false;
    const tapSlot = (k: number) => {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      if (over || tray[k] < 0) return;
      ctx.touch();
      sel = sel === k ? -1 : k;
      render();
    };
    /** Tap on the board with a piece selected: centre the piece on the tapped cell. */
    const tapCell = (i: number) => {
      if (over || sel < 0) return;
      const p = PIECES[tray[sel]];
      const r = Math.max(0, Math.min(n - p.h, Math.floor(i / n) - Math.floor((p.h - 1) / 2)));
      const c = Math.max(0, Math.min(n - p.w, (i % n) - Math.floor((p.w - 1) / 2)));
      if (!place(sel, r, c)) shake(grid);
    };

    // Drag from the tray: a ghost follows the pointer (lifted above the finger on touch) and snaps to the grid.
    let drag: { k: number; id: number; sx: number; sy: number; active: boolean; ghost: HTMLElement | null; lift: number } | null = null;
    const geom = () => {
      const a = els[0].getBoundingClientRect(),
        b = els[1].getBoundingClientRect();
      return { ox: a.left, oy: a.top, cs: a.width, pitch: b.left - a.left };
    };
    const startDrag = (k: number, e: PointerEvent) => {
      if (over || tray[k] < 0 || drag) return;
      drag = { k, id: e.pointerId, sx: e.clientX, sy: e.clientY, active: false, ghost: null, lift: e.pointerType === 'touch' ? 1 : 0 };
      slots[k].setPointerCapture?.(e.pointerId);
    };
    const moveDrag = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const p = PIECES[tray[drag.k]];
      const g = geom();
      if (!drag.active) {
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
        drag.active = true;
        sel = drag.k;
        drag.ghost = h(
          'div',
          { class: 'blk-ghost', style: `--cs:${g.cs}px;--gap:${g.pitch - g.cs}px;--w:${p.w};--h:${p.h}` },
          ...p.cells.map(([r, c]) => h('i', { style: `grid-row:${r + 1};grid-column:${c + 1};--c:${colour(p)}` })),
        );
        root.append(drag.ghost);
      }
      const gw = p.w * g.pitch,
        gh = p.h * g.pitch;
      const gx = e.clientX - gw / 2,
        gy = e.clientY - gh / 2 - drag.lift * (gh / 2 + g.pitch * 1.2);
      drag.ghost!.style.left = `${gx}px`;
      drag.ghost!.style.top = `${gy}px`;
      const r = Math.round((gy - g.oy) / g.pitch),
        c = Math.round((gx - g.ox) / g.pitch);
      const next = fits(cells, n, p, r, c) ? { p, r, c } : null;
      if (next?.r !== preview?.r || next?.c !== preview?.c || !next !== !preview) {
        preview = next;
        render();
      }
    };
    const endDrag = (e: PointerEvent, cancel = false) => {
      if (!drag || e.pointerId !== drag.id) return;
      const g = drag;
      drag = null;
      if (!g.active) return;
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 0);
      g.ghost?.remove();
      const pv = preview;
      preview = null;
      if (!cancel && pv && place(g.k, pv.r, pv.c)) return;
      sel = -1;
      render();
    };
    for (const el of slots) {
      el.addEventListener('pointermove', moveDrag);
      el.addEventListener('pointerup', (e) => endDrag(e));
      el.addEventListener('pointercancel', (e) => endDrag(e, true));
    }

    /** Guide: plan the whole tray (every order, the most open board after it) and play its first piece. */
    let memo: { key: string; plan: TrayPlan } | null = null;
    const planHere = () => {
      const key = `${cells.map((v) => (v ? 1 : 0)).join('')}:${tray.join(',')}:${cleared}`;
      if (memo?.key !== key) memo = { key, plan: planTray(cells, n, tray, Math.max(1, goal - cleared), maxTier, bigBias) };
      return memo.plan;
    };
    /** Dead end: no order fits every piece left, and they can't clear the lines still needed first. */
    const check = (): Hint | null => {
      if (over || cleared >= goal) return null;
      const plan = planHere();
      if (plan.fitsAll || plan.reachesGoal || plan.capped) return null;
      const left = tray.filter((x) => x >= 0).length;
      const first = plan.steps[0];
      return {
        kind: 'stuck',
        text:
          left === 1
            ? L(
                `Your last piece fits nowhere and the board can’t clear the ${goal - cleared} lines still needed: the game is over. Pieces don’t rotate, so leave room for every shape next time.`,
                `Votre dernière pièce ne rentre nulle part et il manque encore ${goal - cleared} lignes : la partie est finie. Les pièces ne tournent pas : gardez de la place pour toutes les formes la prochaine fois.`,
              )
            : L(
                `However you order them, your ${left} pieces can’t all fit and won’t clear the ${goal - cleared} lines still needed: the game ends before the goal. Place what you can for points.`,
                `Peu importe l’ordre, vos ${left} pièces ne rentrent pas toutes et n’effaceront pas les ${goal - cleared} lignes qui manquent : la partie finira avant l’objectif. Placez ce que vous pouvez pour les points.`,
              ),
        why: slots.filter((_, k) => tray[k] >= 0),
        at: first ? PIECES[tray[first.k]].cells.map(([dr, dc]) => els[(first.r + dr) * n + first.c + dc]) : [],
        action: L('Place a piece', 'Placer une pièce'),
        play: () => {
          if (first) place(first.k, first.r, first.c);
          else finish();
        },
      };
    };
    const hint = (): Hint | null => {
      if (over) return null;
      const step = planHere().steps[0];
      if (!step) return null;
      const { k, r, c } = step;
      const tmp = cells.slice();
      for (const [dr, dc] of PIECES[tray[k]].cells) tmp[(r + dr) * n + c + dc] = 1;
      const { rows, cols } = fullLines(tmp, n);
      const p = PIECES[tray[k]];
      const at = p.cells.map(([dr, dc]) => els[(r + dr) * n + c + dc]);
      const play = () => place(k, r, c);
      const lineName = (isRow: boolean, j: number) =>
        isRow ? L(`row ${j + 1}`, `la rangée ${j + 1}`) : L(`column ${j + 1}`, `la colonne ${j + 1}`);
      const lineCells = (isRow: boolean, j: number) => Array.from({ length: n }, (_, x) => (isRow ? j * n + x : x * n + j));
      const lastOne = tray.filter((x) => x >= 0).length === 1;
      const more = lastOne
        ? L(' It’s your last piece, so three new ones arrive next.', ' C’est votre dernière pièce : trois nouvelles arrivent ensuite.')
        : '';
      if (rows.length || cols.length) {
        const lines = [...rows.map((j) => lineName(true, j)), ...cols.map((j) => lineName(false, j))];
        const filled = [...rows.flatMap((j) => lineCells(true, j)), ...cols.flatMap((j) => lineCells(false, j))].filter((i) => cells[i]);
        return {
          text: L(
            `This piece completes ${lines.join(' and ')}: a full line clears and counts toward the goal.${more}`,
            `Cette pièce complète ${lines.join(' et ')} : une ligne pleine s’efface et compte pour l’objectif.${more}`,
          ),
          why: [...new Set(filled)].map((i) => els[i]),
          at,
          play,
        };
      }
      if (cells.every((v) => !v))
        return {
          text: L(
            'Drag a piece from the tray onto the grid. Start against an edge so the middle stays open for big pieces.',
            'Glissez une pièce du bac vers la grille. Commencez contre un bord pour garder le centre libre pour les grosses pièces.',
          ),
          why: [slots[k]],
          at,
          play,
        };
      // The fullest line this piece adds to.
      let line: { isRow: boolean; j: number; cnt: number } | null = null;
      for (const [dr, dc] of p.cells)
        for (const isRow of [true, false]) {
          const j = isRow ? r + dr : c + dc;
          const cnt = lineCells(isRow, j).filter((i) => tmp[i]).length;
          if (!line || cnt > line.cnt) line = { isRow, j, cnt };
        }
      if (line && line.cnt >= Math.ceil(n / 2)) {
        const gaps = n - line.cnt;
        const old = lineCells(line.isRow, line.j).filter((i) => cells[i]);
        return {
          text: L(
            `Build up ${lineName(line.isRow, line.j)}: after this piece it needs just ${gaps === 1 ? 'one more cell' : `${gaps} more cells`} to clear.${more}`,
            `Remplissez ${lineName(line.isRow, line.j)} : après cette pièce, il ne lui manque ${gaps === 1 ? 'qu’une case' : `que ${gaps} cases`} pour s’effacer.${more}`,
          ),
          why: old.length ? old.map((i) => els[i]) : [slots[k]],
          at,
          play,
        };
      }
      return {
        text: L(
          `Fit this piece snugly against the edge and the other pieces, without leaving single holes that nothing can fill.${more}`,
          `Placez cette pièce bien collée au bord et aux autres pièces, sans laisser de trous isolés impossibles à remplir.${more}`,
        ),
        why: [slots[k]],
        at,
        play,
      };
    };

    root.append(bar, grid, trayEl);
    render();
    return {
      snapshot: () => ({ cells, tray, batch, cleared, sel, score, combo, beat }),
      check,
      hint,
      onKey(e) {
        const k = Number(e.key) - 1;
        if (k >= 0 && k <= 2 && e.key.length === 1) {
          tapSlot(k);
          return true;
        }
        if (e.key === 'Escape') {
          sel = -1;
          render();
          return true;
        }
        return false;
      },
      destroy() {
        drag?.ghost?.remove();
      },
    };
  },
};
