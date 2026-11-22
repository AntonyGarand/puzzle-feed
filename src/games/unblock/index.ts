import { L, P } from '../../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../../core/types';
import { h, PALETTE, restartBtn, shake, undoBtn } from '../../ui/dom';
import { int, isIntArr, keyDir } from '../../kits/move/kit';
import { nextUnblockMove } from './hint';
import { EXIT_ROW, generateUnblock, N, range } from './gen';
import './style.css';

// Block colours: the palette without p7 (the key's tone).
const TONES = [PALETTE[1], PALETTE[2], PALETTE[3], PALETTE[4], PALETTE[5], PALETTE[0], PALETTE[7]];

export const unblock: PuzzleDef = {
  id: 'unblock',
  get name() {
    return L('Unblock', 'Débloquer');
  },
  category: 'moves',
  get rules() {
    return L('Slide blocks along their lanes to free the key block.', 'Glissez les blocs dans leur axe pour libérer le bloc clé.');
  },
  help: () => ({
    goal: L(
      'Get the key block out through the exit on the right side of its row.',
      'Faites sortir le bloc clé par la sortie, à droite de sa rangée.',
    ),
    steps: [
      L(
        'Drag a block along its lane: horizontal blocks move left and right, vertical ones up and down.',
        'Glissez un bloc dans son axe : les blocs horizontaux vont à gauche et à droite, les verticaux, en haut et en bas.',
      ),
      L('Blocks can’t turn or pass through each other.', 'Les blocs ne tournent pas et ne passent pas à travers les autres.'),
      L(
        'Moving the same block again counts as one move. “best” is the fewest moves possible.',
        'Déplacer le même bloc de suite compte pour un seul coup. « min. » indique le plus petit nombre de coups possible.',
      ),
      L(
        'Keyboard: Tab or Space picks a block, arrow keys move it, Z undoes, R restarts.',
        'Au clavier : Tab ou Espace choisit un bloc, les flèches le déplacent, Z annule, R fait repartir.',
      ),
      L(
        'Undo steps back; Restart puts every block back where it started.',
        'Annuler revient d’un coup; Repartir remet tous les blocs à leur place de départ.',
      ),
    ],
    tips: [
      L(
        'Work backwards: find what blocks the key block’s row, then what blocks those.',
        'Raisonnez à rebours : trouvez ce qui bloque la rangée du bloc clé, puis ce qui bloque ces blocs-là.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [20, 45, 80, 130, 200]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const [lo, hi] = byLevel<[number, number]>(d, [
      [3, 5],
      [6, 9],
      [10, 13],
      [13, 17],
      [18, 60],
    ]);
    const lay = generateUnblock(rng, lo, hi, byLevel(d, [60000, 100000, 120000, 140000, 140000]));
    const { blocks, optimal } = lay;
    const start = lay.pos.slice();
    let pos = start.slice();
    let moves = 0;
    /** Index of the last block moved: sliding the same block again doesn't count as a new move. */
    let last = -1;
    let sel = -1;
    let history: { pos: number[]; moves: number; last: number }[] = [];
    let done = false;

    const sv = ctx.saved as { pos?: unknown; moves?: unknown; last?: unknown; sel?: unknown; history?: unknown } | undefined;
    const validPos = (p: unknown): p is number[] => {
      if (!isIntArr(p, blocks.length)) return false;
      const occ = new Uint8Array(N * N);
      return blocks.every((b, i) => {
        if (p[i] < 0 || p[i] + b.len > N) return false;
        for (let k = 0; k < b.len; k++) {
          const c = b.hz ? b.line * N + p[i] + k : (p[i] + k) * N + b.line;
          if (occ[c]) return false;
          occ[c] = 1;
        }
        return true;
      });
    };
    if (validPos(sv?.pos) && sv.pos[0] < N - blocks[0].len) {
      pos = sv.pos.slice();
      moves = Math.max(0, int(sv.moves, 0));
      last = int(sv.last, -1);
      sel = int(sv.sel, -1);
      if (sel >= blocks.length) sel = -1;
      if (Array.isArray(sv.history)) {
        history = (sv.history as { pos?: unknown; moves?: unknown; last?: unknown }[])
          .filter((x) => validPos(x?.pos))
          .map((x) => ({ pos: (x.pos as number[]).slice(), moves: int(x.moves, 0), last: int(x.last, -1) }));
      }
    }

    const field = h('div', { class: 'ub-field' });
    /** Faint slot left behind by the block being dragged. */
    const origin = h('div', { class: 'ub-origin', hidden: true });
    field.append(origin);
    const exitEl = h('div', { class: 'ub-exit' });
    const wrap = h('div', { class: 'ub-board', style: `--n:${N};--exit:${EXIT_ROW}` }, exitEl, field);
    const els = blocks.map((b, i) => {
      const el = h('div', {
        // Not `.key`: that's the shared on-screen keyboard style, and it would frame the block twice.
        class: `ub-blk ${i === 0 ? 'ub-key' : ''} ${b.hz ? 'hz' : 'vt'}`,
        style: i === 0 ? '' : `--c:${TONES[(i - 1) % TONES.length]}`,
      });
      field.append(el);
      return el;
    });

    const place = (i: number, p: number) => {
      const b = blocks[i];
      const x = b.hz ? p : b.line,
        y = b.hz ? b.line : p;
      els[i].style.setProperty('--x', String(x));
      els[i].style.setProperty('--y', String(y));
      els[i].style.setProperty('--w', String(b.hz ? b.len : 1));
      els[i].style.setProperty('--h', String(b.hz ? 1 : b.len));
    };
    const render = () => {
      blocks.forEach((_, i) => {
        place(i, pos[i]);
        els[i].classList.toggle('sel', i === sel);
      });
      ctx.status(`${P(moves, ['move', 'moves'], ['coup', 'coups'])} · ${L(`best ${optimal}`, `min. ${optimal}`)}`);
    };

    const commit = (i: number, p: number) => {
      if (p === pos[i]) return;
      ctx.touch();
      history.push({ pos: pos.slice(), moves, last });
      if (i !== last) moves++;
      last = i;
      pos[i] = p;
      if (pos[0] === N - blocks[0].len) {
        done = true;
        sel = -1;
        render();
        // `transform` composes with the `translate` that positions the block; hold the end frame so it stays gone.
        els[0].animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(120%)', opacity: 0 }], {
          duration: 380,
          delay: 120,
          easing: 'ease-in',
          fill: 'forwards',
        });
        ctx.solved();
        return;
      }
      render();
    };
    const undo = () => {
      if (done) return;
      const prev = history.pop();
      if (!prev) return;
      ({ pos, moves, last } = prev);
      pos = pos.slice();
      render();
    };
    const restart = () => {
      if (done || (moves === 0 && pos.every((p, i) => p === start[i]))) return;
      history.push({ pos: pos.slice(), moves, last });
      pos = start.slice();
      moves = 0;
      last = -1;
      render();
    };

    // Dragging: the block follows the finger along its lane, clamped to free space, then snaps.
    let drag: { i: number; id: number; x0: number; y0: number; unit: number; lo: number; hi: number; moved: boolean } | null = null;
    field.addEventListener('pointerdown', (e) => {
      if (done || drag) return;
      const i = els.findIndex((el) => el.contains(e.target as Node));
      if (i < 0) return;
      const [lo2, hi2] = range(blocks, pos, i);
      const unit = field.getBoundingClientRect().width / N;
      drag = { i, id: e.pointerId, x0: e.clientX, y0: e.clientY, unit, lo: lo2, hi: hi2, moved: false };
      field.setPointerCapture?.(e.pointerId);
      els[i].classList.add('drag');
      for (const k of ['--x', '--y', '--w', '--h']) origin.style.setProperty(k, els[i].style.getPropertyValue(k));
    });
    const offset = (e: PointerEvent) => {
      const g = drag!;
      const b = blocks[g.i];
      const raw = (b.hz ? e.clientX - g.x0 : e.clientY - g.y0) / g.unit;
      return Math.max(g.lo - pos[g.i], Math.min(g.hi - pos[g.i], raw));
    };
    field.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const off = offset(e);
      if (Math.abs(off) > 0.08 && !drag.moved) {
        drag.moved = true;
        origin.hidden = false;
      }
      // One custom property per frame: no layout, no re-render; the compositor moves the block.
      els[drag.i].style.setProperty(blocks[drag.i].hz ? '--dx' : '--dy', `${(off * drag.unit).toFixed(1)}px`);
    });
    /** Drop the live drag offset; with `.drag` removed in the same frame the block glides from where the finger left it. */
    const release = (i: number) => {
      els[i].classList.remove('drag');
      origin.hidden = true;
      els[i].style.removeProperty('--dx');
      els[i].style.removeProperty('--dy');
    };
    const end = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const g = drag;
      const off = offset(e);
      drag = null;
      release(g.i);
      if (!g.moved) {
        sel = sel === g.i ? -1 : g.i;
        render();
        return;
      }
      sel = g.i;
      commit(g.i, pos[g.i] + Math.round(off));
      if (!done) render();
    };
    field.addEventListener('pointerup', end);
    field.addEventListener('pointercancel', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      release(drag.i);
      drag = null;
    });

    let chainAlt = false;
    const flip = () => (chainAlt = !chainAlt);
    /** Guide: the first move of a shortest solution, explained by working backwards from the key block. */
    const hint = (): Hint | null => {
      if (done) return null;
      const mv = nextUnblockMove(blocks, pos);
      if (!mv) return null;
      const [m, p] = mv;
      const play = () => {
        sel = m;
        commit(m, p);
        if (!done) render();
      };
      const b = blocks[m];
      const fwd = p > pos[m];
      const dir = b.hz ? (fwd ? L('right', 'à droite') : L('left', 'à gauche')) : fwd ? L('down', 'vers le bas') : L('up', 'vers le haut');
      const k = Math.abs(p - pos[m]);
      const sq = k === 1 ? L('one square', 'd’une case') : L(`${k} squares`, `de ${k} cases`);
      const how = moves === 0 ? L(' Drag blocks along their lane.', ' Glissez les blocs dans leur axe.') : '';
      if (m === 0) {
        if (p === N - b.len)
          return {
            text: L(
              'The key block’s row is clear: slide it out through the exit.',
              'La rangée du bloc clé est libre : faites-le sortir par la sortie.',
            ),
            why: [els[0]],
            at: [exitEl],
            play,
          };
        return { text: L(`Move the key block ${sq} ${dir}.`, `Avancez le bloc clé ${sq} ${dir}.`), at: [els[0]], play };
      }
      /** Vertical blocks crossing the key's row ahead of it. */
      const covers = (i: number, at: number) => !blocks[i].hz && at <= EXIT_ROW && EXIT_ROW < at + blocks[i].len;
      const ahead = (i: number) => blocks[i].line >= pos[0] + blocks[0].len;
      if (covers(m, pos[m]) && ahead(m)) {
        const clears = !covers(m, p);
        return {
          text: clears
            ? L(
                `This block stands in the key block’s row. Move it ${dir} out of the way.${how}`,
                `Ce bloc est dans la rangée du bloc clé. Déplacez-le ${dir} pour libérer le passage.${how}`,
              )
            : L(
                `This block stands in the key block’s row. Move it ${sq} ${dir} for now.${how}`,
                `Ce bloc est dans la rangée du bloc clé. Déplacez-le ${sq} ${dir} pour l’instant.${how}`,
              ),
          why: [els[0]],
          at: [els[m]],
          play,
        };
      }
      // Work backwards: who is in whose lane, starting from the key block's row ahead of it.
      const cellsOf = (i: number) =>
        Array.from({ length: blocks[i].len }, (_, j) =>
          blocks[i].hz ? blocks[i].line * N + pos[i] + j : (pos[i] + j) * N + blocks[i].line,
        );
      const inLane = (i: number, v: number) =>
        cellsOf(i).some((c) => (blocks[v].hz ? Math.floor(c / N) === blocks[v].line : c % N === blocks[v].line));
      const parent = new Map<number, number>();
      const depth = new Map<number, number>();
      const q: number[] = [];
      blocks.forEach((_, i) => {
        if (i > 0 && covers(i, pos[i]) && ahead(i)) {
          depth.set(i, 1);
          q.push(i);
        }
      });
      for (let x = 0; x < q.length && !depth.has(m); x++)
        blocks.forEach((_, i) => {
          if (i > 0 && !depth.has(i) && inLane(i, q[x])) {
            depth.set(i, depth.get(q[x])! + 1);
            parent.set(i, q[x]);
            q.push(i);
          }
        });
      const up = parent.get(m);
      if (up != null)
        return {
          text:
            depth.get(m) === 2
              ? L(
                  `The outlined block stands in the key block’s row, but it can’t get out while this one is in its way. Move this one ${dir} first.${how}`,
                  `Le bloc encadré est dans la rangée du bloc clé, mais il ne peut pas en sortir tant que celui-ci lui barre la route. Déplacez d’abord celui-ci ${dir}.${how}`,
                )
              : flip()
                ? L(
                    `Work backwards: this block is in the way of the outlined one, which must move to help free the key block’s row. Move it ${sq} ${dir}.${how}`,
                    `Raisonnez à rebours : ce bloc gêne le bloc encadré, qui doit bouger pour aider à libérer la rangée du bloc clé. Déplacez-le ${sq} ${dir}.${how}`,
                  )
                : L(
                    `Next link in the chain: moving this block ${sq} ${dir} gives the outlined one room to move.${how}`,
                    `Maillon suivant : déplacer ce bloc ${sq} ${dir} donne au bloc encadré la place de bouger.${how}`,
                  ),
          why: [els[up]],
          at: [els[m]],
          play,
        };
      return {
        text: L(
          `Make room: move this block ${sq} ${dir} so the blocks around the key’s row can shift later.${how}`,
          `Faites de la place : déplacez ce bloc ${sq} ${dir} pour que les blocs autour de la rangée du bloc clé puissent bouger ensuite.${how}`,
        ),
        at: [els[m]],
        play,
      };
    };

    ctx.controls(undoBtn(undo), restartBtn(restart));
    root.append(wrap);
    render();

    // No check(): every slide can be slid back, so a position is never a dead end.
    return {
      snapshot: () => ({ pos, moves, last, sel, history }),
      hint,
      onKey(e) {
        if (done) return false;
        if (e.key === 'Tab' || e.key === ' ') {
          sel = (sel + 1) % blocks.length;
          render();
          return true;
        }
        if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') {
          undo();
          return true;
        }
        if (e.key === 'r' || e.key === 'R') {
          restart();
          return true;
        }
        const k = keyDir(e);
        if (k == null) return false;
        if (sel < 0) {
          sel = 0;
          render();
          return true;
        }
        const b = blocks[sel];
        const step = k === 1 || k === 2 ? 1 : -1;
        const [a, z] = range(blocks, pos, sel);
        const p = pos[sel] + step;
        if (b.hz === (k === 1 || k === 3) && p >= a && p <= z) commit(sel, p);
        else shake(els[sel]);
        return true;
      },
    };
  },
};
