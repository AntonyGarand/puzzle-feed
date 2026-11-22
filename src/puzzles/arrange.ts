import { L } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, btn, h, PALETTE, shake } from '../core/ui';
import { genArrange, rotated, type Shape } from './pathkit/arrange-gen';
import { innerRect } from './pathkit/grid';
import './arrange.css';

type Drag = {
  p: number;
  /** Pointer that holds the piece; any other pointer going down turns it. */
  id: number;
  /** Last pointer position, to redraw the ghost after a turn. */
  x: number;
  y: number;
  dr: number;
  dc: number;
  from: [number, number] | null;
  sx: number;
  sy: number;
  moved: boolean;
  ghost?: HTMLElement;
};

export const arrange: PuzzleDef = {
  id: 'arrange',
  get name() {
    return L('Arrange', 'Assembler');
  },
  category: 'moves',
  undo: true,
  get rules() {
    return L('Drag every piece onto the board to fill it exactly.', 'Glissez les pièces pour remplir toute la grille.');
  },
  help: () => ({
    goal: L(
      'Fit every piece into the board so that it is filled exactly, with no gaps and no overlaps.',
      'Placez toutes les pièces dans la grille pour la remplir exactement, sans trou ni chevauchement.',
    ),
    steps: [
      L(
        'Drag a piece from the tray onto the board; a dashed outline shows where it will land.',
        'Glissez une pièce du bac vers la grille : un contour pointillé montre où elle se posera.',
      ),
      L('Drop it where it doesn’t fit and it goes back where it came from.', 'Si elle ne rentre pas, elle retourne d’où elle vient.'),
      L(
        'Drag a placed piece to move it. Tap it, or drag it off the board, to send it back to the tray.',
        'Glissez une pièce placée pour la déplacer. Touchez-la, ou sortez-la de la grille, pour la renvoyer au bac.',
      ),
      L(
        'From Hard up, pieces come turned. Tap one in the tray to turn it; while dragging, tap with a second finger, scroll or press R.',
        'À partir de Difficile, les pièces arrivent tournées. Touchez-en une dans le bac pour la tourner; en la glissant, touchez avec un 2e doigt, utilisez la molette ou appuyez sur R.',
      ),
      L('Clear sends every piece back to the tray.', 'Vider renvoie toutes les pièces au bac.'),
    ],
    tips: [
      L(
        'Place the biggest, most awkward pieces first, starting with the corners.',
        'Placez d’abord les pièces les plus grosses et les plus biscornues, en commençant par les coins.',
      ),
      L(
        'If a gap is smaller than every piece left, something has to move.',
        'Si un trou est plus petit que toutes les pièces restantes, il faut déplacer quelque chose.',
      ),
      L(
        'From Hard up, turn a piece until it matches the gap you’re aiming for, then drag it in.',
        'À partir de Difficile, tournez une pièce jusqu’à ce qu’elle épouse le trou visé, puis glissez-la dedans.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [25, 45, 75, 110, 170]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const P = genArrange(rng, d);
    const { rows, cols, pieces } = P;
    const K = pieces.length;
    const N = rows * cols;
    const rot = pieces.map(() => (P.rotate ? rng.int(0, 3) : 0));
    const place: ([number, number] | null)[] = pieces.map(() => null);
    const order = rng.shuffle(pieces.map((_, i) => i));
    const shapeOf = (p: number): Shape => rotated(pieces[p].shape, rot[p]);

    const owner = new Int16Array(N);
    const recompute = () => {
      owner.fill(-1);
      place.forEach((o, p) => o && shapeOf(p).forEach(([r, c]) => (owner[(o[0] + r) * cols + o[1] + c] = p)));
    };
    const fits = (p: number, r0: number, c0: number) =>
      shapeOf(p).every(([r, c]) => {
        const rr = r0 + r,
          cc = c0 + c;
        return rr >= 0 && rr < rows && cc >= 0 && cc < cols && owner[rr * cols + cc] < 0;
      });

    // ---- DOM ----
    const grid = board(cols, rows, 'arrange-grid');
    const cells = Array.from({ length: N }, () => {
      const el = h('div', { class: 'cell' });
      grid.append(el);
      return el;
    });
    const tray = h('div', { class: 'arrange-tray', style: `--bc:${Math.max(rows, cols)}` });
    const fillMini = (el: HTMLElement, sh: Shape) => {
      const key = sh.join(' ');
      if (el.dataset.sh === key) return;
      el.dataset.sh = key;
      const hgt = Math.max(...sh.map((q) => q[0])) + 1,
        wid = Math.max(...sh.map((q) => q[1])) + 1;
      el.style.setProperty('--pr', String(hgt));
      el.style.setProperty('--pc', String(wid));
      el.replaceChildren(...sh.map(([r, c]) => h('i', { style: `grid-row:${r + 1};grid-column:${c + 1}` })));
    };
    const trayEls = pieces.map((pc, p) => {
      const el = h('button', { type: 'button', class: 'arr-piece', style: `--c:${PALETTE[pc.colour]}`, 'data-p': p });
      // Pointer taps are handled in `onUp`; this only catches keyboard activation (Enter / Space).
      el.addEventListener('click', (e) => {
        if (e.detail > 0 || finished) return;
        if (!P.rotate) {
          shake(el);
          return;
        }
        turnPiece(p);
      });
      return el;
    });
    order.forEach((p) => tray.append(trayEls[p]));

    let finished = false;
    const turnPiece = (p: number) => {
      ctx.touch();
      rot[p] = (rot[p] + 1) % 4;
      render();
      trayEls[p].animate?.([{ rotate: '-90deg' }, { rotate: '0deg' }], { duration: 160, easing: 'ease-out' });
    };
    /** Turn the piece being dragged a quarter turn clockwise, about the cell under the finger. */
    const turnHeld = () => {
      const g = drag;
      if (!P.rotate || !g?.moved || !g.ghost) return;
      const raw = shapeOf(g.p).map(([r, c]) => [c, -r]);
      const r0 = Math.min(...raw.map((q) => q[0])),
        c0 = Math.min(...raw.map((q) => q[1]));
      [g.dr, g.dc] = [g.dc - r0, -g.dr - c0];
      rot[g.p] = (rot[g.p] + 1) % 4;
      fillMini(g.ghost, shapeOf(g.p));
      g.ghost.animate?.([{ rotate: '-90deg' }, { rotate: '0deg' }], { duration: 140, easing: 'ease-out' });
      follow(g.x, g.y);
    };
    let preview: number[] = [];
    const render = () => {
      recompute();
      const pv = new Set(preview);
      cells.forEach((el, i) => {
        const p = owner[i];
        let cls = 'cell';
        if (p >= 0) {
          const r = Math.floor(i / cols),
            c = i % cols;
          const diff = (rr: number, cc: number) => rr < 0 || rr >= rows || cc < 0 || cc >= cols || owner[rr * cols + cc] !== p;
          cls += ' on';
          if (diff(r - 1, c)) cls += ' et';
          if (diff(r, c + 1)) cls += ' er';
          if (diff(r + 1, c)) cls += ' eb';
          if (diff(r, c - 1)) cls += ' el';
          el.setAttribute('style', `--c:${PALETTE[pieces[p].colour]}`);
        } else el.removeAttribute('style');
        if (pv.has(i)) cls += ' hint';
        el.className = cls;
      });
      trayEls.forEach((el, p) => {
        fillMini(el, shapeOf(p));
        el.hidden = !!place[p];
        el.classList.toggle('lifted', drag?.p === p && drag.moved);
      });
      const n = place.filter(Boolean).length;
      ctx.status(L(`${n}/${K} placed${P.rotate ? ' · tap to turn' : ''}`, `${n}/${K} placées${P.rotate ? ' · touchez pour tourner' : ''}`));
      return n === K;
    };

    // ---- dragging ----
    let drag: Drag | null = null;
    const boardCell = (x: number, y: number) => {
      const r = innerRect(grid);
      const cs = r.width / cols;
      return { R: Math.floor((y - r.top) / cs), C: Math.floor((x - r.left) / cs), cs };
    };
    const ghostAt = (x: number, y: number) => {
      if (!drag?.ghost) return;
      const { cs } = boardCell(x, y);
      drag.ghost.style.left = `${x - (drag.dc + 0.5) * cs}px`;
      drag.ghost.style.top = `${y - (drag.dr + 0.5) * cs}px`;
    };
    const target = (x: number, y: number) => {
      if (!drag) return null;
      const { R, C } = boardCell(x, y);
      const r0 = R - drag.dr,
        c0 = C - drag.dc;
      return fits(drag.p, r0, c0) ? ([r0, c0] as [number, number]) : null;
    };
    /** Move the ghost to the pointer and outline where the piece would land. */
    const follow = (x: number, y: number) => {
      if (!drag) return;
      drag.x = x;
      drag.y = y;
      ghostAt(x, y);
      const t = target(x, y);
      preview = t ? shapeOf(drag.p).map(([r, c]) => (t[0] + r) * cols + t[1] + c) : [];
      render();
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved) {
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
        drag.moved = true;
        ctx.touch();
        place[drag.p] = null;
        const { cs } = boardCell(e.clientX, e.clientY);
        const ghost = h('div', { class: 'arr-ghost', style: `--c:${PALETTE[pieces[drag.p].colour]};--cs:${cs}px` });
        fillMini(ghost, shapeOf(drag.p));
        drag.ghost = ghost;
        root.append(ghost);
      }
      follow(e.clientX, e.clientY);
      e.preventDefault();
    };
    /** A second finger (or the wheel) while a piece is held turns it. */
    const onOtherDown = (e: PointerEvent) => {
      if (!drag || e.pointerId === drag.id) return;
      e.preventDefault();
      e.stopPropagation();
      turnHeld();
    };
    let lastWheel = 0;
    const onWheel = (e: WheelEvent) => {
      if (!drag?.moved) return;
      e.preventDefault();
      // trackpads fire a burst of wheel events per swipe: one turn per gesture
      if (e.timeStamp - lastWheel > 250) turnHeld();
      lastWheel = e.timeStamp;
    };
    const unlisten = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('pointerdown', onOtherDown, true);
      window.removeEventListener('wheel', onWheel);
    };
    const onUp = (e: PointerEvent) => {
      if (drag && e.pointerId !== drag.id) return;
      unlisten();
      const dg = drag;
      if (!dg) return;
      drag = null;
      preview = [];
      if (dg.moved) {
        dg.ghost?.remove();
        const t = e.type === 'pointerup' ? (recompute(), dragTarget(dg, e.clientX, e.clientY)) : null;
        if (t) place[dg.p] = t;
        else {
          const { R, C } = boardCell(e.clientX, e.clientY);
          const onBoard = R >= 0 && R < rows && C >= 0 && C < cols;
          place[dg.p] = onBoard ? dg.from : null; // bad spot on the board: put it back; off the board: to the tray
        }
      } else if (dg.from) {
        // tap on a placed piece: send it back to the tray
        ctx.touch();
        place[dg.p] = null;
      } else if (e.type === 'pointerup') {
        // tap on a tray piece: turn it (from Hard up)
        if (P.rotate) turnPiece(dg.p);
        else shake(trayEls[dg.p]);
        return;
      }
      settle();
    };
    /** Redraw and check for the win after a piece lands or leaves. */
    const settle = () => {
      if (render() && !finished) {
        finished = true;
        ctx.solved();
      }
    };
    const dragTarget = (dg: Drag, x: number, y: number) => {
      const prev = drag;
      drag = dg;
      const t = target(x, y);
      drag = prev;
      return t;
    };
    const begin = (e: PointerEvent, dg: Drag) => {
      if (finished) return;
      drag = dg;
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      if (P.rotate) {
        window.addEventListener('pointerdown', onOtherDown, true);
        window.addEventListener('wheel', onWheel, { passive: false });
      }
      e.preventDefault();
    };
    tray.addEventListener('pointerdown', (e) => {
      const el = (e.target as Element | null)?.closest?.('.arr-piece') as HTMLElement | null;
      if (!el || e.button > 0 || drag) return;
      const p = Number(el.dataset.p);
      const sh = shapeOf(p);
      const rc = innerRect(el);
      const hgt = Math.max(...sh.map((q) => q[0])) + 1,
        wid = Math.max(...sh.map((q) => q[1])) + 1;
      const fr = Math.min(hgt - 1, Math.max(0, Math.floor(((e.clientY - rc.top) / (rc.height || 1)) * hgt)));
      const fc = Math.min(wid - 1, Math.max(0, Math.floor(((e.clientX - rc.left) / (rc.width || 1)) * wid)));
      // grab the nearest real cell of the piece
      const [dr, dc] = sh.reduce(
        (b, q) => (Math.abs(q[0] - fr) + Math.abs(q[1] - fc) < Math.abs(b[0] - fr) + Math.abs(b[1] - fc) ? q : b),
        sh[0],
      );
      begin(e, { p, id: e.pointerId, x: e.clientX, y: e.clientY, dr, dc, from: null, sx: e.clientX, sy: e.clientY, moved: false });
    });
    grid.addEventListener('pointerdown', (e) => {
      if (drag) return;
      const { R, C } = boardCell(e.clientX, e.clientY);
      if (R < 0 || R >= rows || C < 0 || C >= cols) return;
      const p = owner[R * cols + C];
      if (p < 0 || !place[p]) return;
      const [r0, c0] = place[p]!;
      const at = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY };
      begin(e, { p, ...at, dr: R - r0, dc: C - c0, from: [r0, c0], moved: false });
    });

    ctx.controls(
      btn(
        L('Clear', 'Vider'),
        () => {
          if (finished) return;
          place.fill(null);
          render();
        },
        'ghost',
      ),
    );

    // ---- resume ----
    const sv = ctx.saved as { rot?: unknown; place?: unknown } | undefined;
    if (Array.isArray(sv?.rot) && sv.rot.length === K && sv.rot.every((v) => v === 0 || v === 1 || v === 2 || v === 3)) {
      (sv.rot as number[]).forEach((v, p) => (rot[p] = P.rotate ? v : 0));
    }
    if (Array.isArray(sv?.place) && sv.place.length === K) {
      (sv.place as unknown[]).forEach((o, p) => {
        recompute();
        if (Array.isArray(o) && o.length === 2 && o.every(Number.isInteger) && fits(p, o[0], o[1])) place[p] = [o[0], o[1]];
      });
      recompute();
      if (place.every(Boolean)) place[K - 1] = null; // never resume already solved
    }
    // ---- guide ----
    const shapeKey = (sh: Shape) =>
      sh
        .map((q) => q.join(','))
        .sort()
        .join(' ');
    const solCells = (p: number) => pieces[p].shape.map(([r, c]) => (pieces[p].r + r) * cols + pieces[p].c + c);
    let lastRule = '';
    const hint = (): Hint | null => {
      if (finished) return null;
      recompute();
      for (let p = 0; p < K; p++) {
        const o = place[p];
        if (!o) continue;
        if (o[0] === pieces[p].r && o[1] === pieces[p].c && shapeKey(shapeOf(p)) === shapeKey(pieces[p].shape)) continue;
        const own = cells.filter((_, i) => owner[i] === p);
        return {
          text: L(
            'This piece leaves gaps no other piece can fill. Tap it to send it back to the tray.',
            'Cette pièce laisse des trous qu’aucune autre ne peut combler. Touchez-la pour la renvoyer au bac.',
          ),
          at: own,
          play: () => {
            ctx.touch();
            place[p] = null;
            settle();
          },
        };
      }
      const left = pieces.map((_, p) => p).filter((p) => !place[p]);
      if (!left.length) return null;
      const drop = (p: number) => () => {
        place[p] = [pieces[p].r, pieces[p].c];
        settle();
      };
      const spot = (p: number) => solCells(p).map((i) => cells[i]);
      // Empty regions of the board.
      const seen = new Uint8Array(N);
      const regions: number[][] = [];
      for (let i = 0; i < N; i++) {
        if (seen[i] || owner[i] >= 0) continue;
        const reg = [i];
        seen[i] = 1;
        for (let k = 0; k < reg.length; k++) {
          const j = reg[k],
            r = Math.floor(j / cols),
            c = j % cols;
          for (const [rr, cc] of [
            [r - 1, c],
            [r + 1, c],
            [r, c - 1],
            [r, c + 1],
          ])
            if (rr >= 0 && rr < rows && cc >= 0 && cc < cols && !seen[rr * cols + cc] && owner[rr * cols + cc] < 0) {
              seen[rr * cols + cc] = 1;
              reg.push(rr * cols + cc);
            }
        }
        regions.push(reg);
      }
      const rules: Record<string, () => Hint | null> = {
        gap: () => {
          for (const reg of regions)
            for (const p of left) {
              const want = solCells(p);
              if (want.length !== reg.length || !want.every((i) => reg.includes(i))) continue;
              if (shapeKey(shapeOf(p)) !== shapeKey(pieces[p].shape)) continue;
              return {
                text:
                  left.length === 1
                    ? L(
                        'Last piece: the hole left has exactly its shape. Drag it in.',
                        'Dernière pièce : le trou restant a exactement sa forme. Glissez-la dedans.',
                      )
                    : L(
                        `This ${reg.length}-cell gap is walled off and has exactly this piece’s shape, so only it can fill it.`,
                        `Ce trou de ${reg.length} cases est fermé et a exactement la forme de cette pièce : elle seule peut le remplir.`,
                      ),
                why: [trayEls[p]],
                at: spot(p),
                play: drop(p),
              };
            }
          return null;
        },
        corner: () => {
          const corners = [0, cols - 1, (rows - 1) * cols, N - 1].filter((i) => owner[i] < 0);
          for (const i of corners) {
            const p = left.find((q) => solCells(q).includes(i));
            if (p == null || shapeKey(shapeOf(p)) !== shapeKey(pieces[p].shape)) continue;
            return {
              text: L(
                'Fill the corners first: they’re the hardest cells to reach, and this piece tucks in snugly with no gap.',
                'Remplissez d’abord les coins : ce sont les cases les plus difficiles à atteindre, et cette pièce s’y loge sans laisser de trou.',
              ),
              why: [trayEls[p]],
              at: spot(p),
              play: drop(p),
            };
          }
          return null;
        },
        big: () => {
          const p = [...left]
            .filter((q) => shapeKey(shapeOf(q)) === shapeKey(pieces[q].shape))
            .sort((a, b) => pieces[b].shape.length - pieces[a].shape.length)[0];
          if (p == null) return null;
          const size = pieces[p].shape.length;
          const edge = solCells(p).some((i) => i < cols || i >= N - cols || i % cols === 0 || i % cols === cols - 1);
          return {
            text: L(
              `Place big pieces early: this ${size}-cell one has the fewest spots where it fits${edge ? ', and here it hugs the edge' : ''}.`,
              `Placez tôt les grosses pièces : celle-ci, de ${size} cases, a le moins d’endroits où elle entre${edge ? ', et ici elle longe le bord' : ''}.`,
            ),
            why: [trayEls[p]],
            at: spot(p),
            play: drop(p),
          };
        },
      };
      const ruleOrder = ['gap', 'corner', 'big'];
      for (const r of [...ruleOrder.filter((o) => o !== lastRule), lastRule]) {
        const found = rules[r]?.();
        if (found) {
          lastRule = r;
          return found;
        }
      }
      // Every piece left needs turning first.
      const p = left[0];
      return {
        text: L(
          'This piece has to turn to fit: tap it in the tray to rotate it a quarter turn.',
          'Cette pièce doit tourner pour entrer : touchez-la dans le bac pour lui faire faire un quart de tour.',
        ),
        at: [trayEls[p]],
        play: () => turnPiece(p),
      };
    };

    root.append(grid, tray);
    render();
    return {
      hint,
      snapshot: () => ({ rot, place }),
      onKey(e) {
        if (!P.rotate || finished || (e.key !== 'r' && e.key !== 'R')) return false;
        if (drag?.moved) turnHeld();
        else {
          // a tray piece with keyboard focus
          const p = trayEls.indexOf(document.activeElement as HTMLButtonElement);
          if (p < 0 || drag) return false;
          turnPiece(p);
        }
        return true;
      },
      destroy() {
        unlisten();
        drag?.ghost?.remove();
      },
    };
  },
};
