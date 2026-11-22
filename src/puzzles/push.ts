import { L, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, dpad, h, restartBtn, s, shake, undoBtn } from '../core/ui';
import { anim, keyDir, type Dir } from './movekit/kit';
import { deadCrates, planPush, type PushPlan } from './movekit/push-hint';
import { generateRoom, liveCells, stepper, stuckCrates } from './movekit/pushgen';
import './push.css';

const LETTERS = 'urdl';

export const push: PuzzleDef = {
  id: 'push',
  get name() {
    return L('Push', 'Pousser');
  },
  category: 'moves',
  get rules() {
    return L('Push every crate onto a target. You can only push.', 'Poussez les caisses sur les cibles. Impossible de tirer.');
  },
  help: () => ({
    goal: L('Push every crate onto a target square.', 'Poussez chaque caisse sur une case cible.'),
    steps: [
      L(
        'Drag from your ball to trace a path: it follows your finger square by square. Drag back over the path to retrace your steps.',
        'Glissez à partir de votre bille pour tracer un chemin : elle suit votre doigt case par case. Revenez sur le tracé pour reculer.',
      ),
      L(
        'Walk into a crate to push it one square, if the square behind it is free.',
        'Avancez contre une caisse pour la pousser d’une case, si la case derrière est libre.',
      ),
      L('You can’t pull a crate, and you can’t push two at once.', 'Impossible de tirer une caisse ou d’en pousser deux à la fois.'),
      L(
        'Shortcuts: tap a square to walk there, swipe, or use the arrow buttons, the arrow keys or WASD for one step.',
        'Raccourcis : touchez une case pour vous y rendre, balayez, ou utilisez les flèches à l’écran, les touches fléchées ou WASD pour un pas.',
      ),
      L(
        'Undo (Z) takes back a walk or a push; Restart (R) resets the room.',
        'Annuler (Z) reprend un déplacement ou une poussée; Repartir (R) remet tout à zéro.',
      ),
    ],
    tips: [
      L(
        'Never push a crate into a corner that isn’t a target: it’s stuck for good.',
        'Ne poussez jamais une caisse dans un coin sans cible : elle y restera coincée.',
      ),
      L(
        'Before each push, check where you’ll need to stand for the next one.',
        'Avant chaque poussée, vérifiez où vous devrez vous placer pour la suivante.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [25, 50, 90, 140, 220]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const [w, hh] = byLevel<[number, number]>(d, [
      [6, 6],
      [7, 6],
      [7, 7],
      [8, 7],
      [8, 8],
    ]);
    const nBoxes = byLevel(d, [1, 2, 3, 3, 4]);
    const minPush = byLevel(d, [5, 9, 12, 14, 16]);
    const room = generateRoom(rng, w, hh, nBoxes, minPush, 20000, nBoxes >= 3 ? 150 : 300);
    const { floor, targets } = room;
    const nb = stepper(w, hh);
    const tset = new Set(targets);
    const live = liveCells(w, hh, floor, targets);

    let player = room.player;
    let boxes = room.boxes.slice();
    /** One string per action (a tap-walk can be several steps); lowercase = walk, uppercase = push. */
    let history: string[] = [];
    let done = false;

    /** Apply one step; returns the letter recorded, or '' if blocked. */
    const step = (dir: Dir): string => {
      const nx = nb(player, dir);
      if (nx < 0 || !floor[nx]) return '';
      const bi = boxes.indexOf(nx);
      if (bi >= 0) {
        const to = nb(nx, dir);
        if (to < 0 || !floor[to] || boxes.includes(to)) return '';
        boxes[bi] = to;
        player = nx;
        return LETTERS[dir].toUpperCase();
      }
      player = nx;
      return LETTERS[dir];
    };
    const unstep = (ch: string) => {
      const dir = LETTERS.indexOf(ch.toLowerCase());
      const back = nb(player, (dir + 2) % 4);
      if (ch !== ch.toLowerCase()) {
        const bi = boxes.indexOf(nb(player, dir));
        if (bi >= 0) boxes[bi] = player;
      }
      player = back;
    };
    const restart = () => {
      player = room.player;
      boxes = room.boxes.slice();
    };

    // Restore by replaying the saved actions (stops at the first one that no longer applies).
    const sv = ctx.saved as { h?: unknown } | undefined;
    if (Array.isArray(sv?.h)) {
      outer: for (const a of sv.h) {
        if (typeof a !== 'string' || !a) break;
        for (const ch of a) {
          const dir = LETTERS.indexOf(ch.toLowerCase());
          if (dir < 0 || step(dir as Dir) !== ch) {
            restart();
            history = [];
            break outer;
          }
        }
        history.push(a);
      }
    }

    // Crop to the floor's bounding box.
    let r0 = hh,
      r1 = 0,
      c0 = w,
      c1 = 0;
    floor.forEach((f, i) => {
      if (!f) return;
      const r = Math.floor(i / w),
        c = i % w;
      r0 = Math.min(r0, r);
      r1 = Math.max(r1, r);
      c0 = Math.min(c0, c);
      c1 = Math.max(c1, c);
    });
    const cols = c1 - c0 + 1,
      rows = r1 - r0 + 1;
    const grid = board(cols, rows, 'push-grid');
    const els = new Map<number, HTMLElement>();
    const idx = new Map<Element, number>();
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        const i = r * w + c;
        const el = floor[i] ? h('button', { type: 'button', class: 'cell', onclick: () => click(i) }) : h('div', { class: 'cell wall' });
        els.set(i, el);
        idx.set(el, i);
        grid.append(el);
      }

    const solved = () => boxes.every((b) => tset.has(b));
    /** Path being traced by a drag from the ball: `cur` is the unsaved tail of the action (pushes close an action). */
    let drag: { id: number; cur: string; path: number[] } | null = null;
    const render = () => {
      els.forEach((el, i) => {
        if (!floor[i]) return;
        const box = boxes.includes(i);
        el.className = `cell ${tset.has(i) ? 'tg' : ''} ${box ? 'bx' : ''} ${box && tset.has(i) ? 'on' : ''} ${i === player ? 'me' : ''}`
          .replace(/\s+/g, ' ')
          .trim();
      });
      const moves = history.reduce((a, act) => a + act.length, drag?.cur.length ?? 0);
      const home = boxes.filter((b) => tset.has(b)).length;
      const ms = P(moves, ['move', 'moves'], ['coup', 'coups']);
      // A crate wedged where it can never reach a target: say so (Undo/Restart get out of it).
      const stuck = stuckCrates(w, hh, floor, targets, boxes, live).length;
      ctx.status(
        stuck
          ? `${P(stuck, ['crate stuck', 'crates stuck'], ['caisse coincée', 'caisses coincées'])} · ${L('undo', 'annulez')}`
          : L(`${home} / ${boxes.length} home · ${ms}`, `${home} / ${boxes.length} placées · ${ms}`),
      );
    };
    const after = (rec: string) => {
      if (!rec) return;
      ctx.touch();
      history.push(rec);
      render();
      const pushed = rec[rec.length - 1];
      if (pushed !== pushed.toLowerCase()) {
        const b = els.get(nb(player, LETTERS.indexOf(pushed.toLowerCase())));
        if (b) anim(b, [{ transform: 'scale(0.9)' }, { transform: 'scale(1)' }], 120);
      }
      if (solved()) {
        done = true;
        ctx.solved();
      }
    };
    const move = (dir: Dir) => {
      if (done || drag) return;
      const rec = step(dir);
      if (!rec) {
        shake(grid);
        return;
      }
      after(rec);
    };
    /** Tap: adjacent cell = one step (push if a crate), otherwise walk there if reachable. */
    const tap = (i: number) => {
      if (done || drag) return;
      for (let dd = 0; dd < 4; dd++)
        if (nb(player, dd) === i) {
          move(dd as Dir);
          return;
        }
      if (boxes.includes(i) || i === player) return;
      // BFS path without pushing
      const prev = new Map<number, number>([[player, -1]]);
      const q = [player];
      for (let k = 0; k < q.length && !prev.has(i); k++) {
        for (let dd = 0; dd < 4; dd++) {
          const y = nb(q[k], dd);
          if (y < 0 || !floor[y] || boxes.includes(y) || prev.has(y)) continue;
          prev.set(y, q[k]);
          q.push(y);
        }
      }
      if (!prev.has(i)) {
        shake(grid);
        return;
      }
      const path: number[] = [];
      for (let x = i; x !== player; x = prev.get(x)!) path.unshift(x);
      let rec = '';
      for (const x of path) {
        const dir = [0, 1, 2, 3].find((dd) => nb(player, dd) === x)!;
        rec += step(dir as Dir);
      }
      after(rec);
    };
    /** A cell's click, unless it ends a drag or a swipe. */
    const click = (i: number) => {
      if (swiped) swiped = false;
      else tap(i);
    };
    const undo = () => {
      if (done || drag) return;
      const a = history.pop();
      if (!a) return;
      for (let k = a.length - 1; k >= 0; k--) unstep(a[k]);
      render();
    };
    const reset = () => {
      if (done || drag || !history.length) return;
      restart();
      history = [];
      render();
    };

    /** Solver result for the current position, kept until it changes (check() then hint() solve once). */
    let memo: { key: string; plan: PushPlan } | null = null;
    const solveHere = () => {
      const key = `${boxes.join(',')}|${player}`;
      if (memo?.key !== key) memo = { key, plan: planPush(w, hh, floor, targets, boxes, player, 30000, live) };
      return memo.plan;
    };
    const stuckHint = (text: string, at: number[]): Hint => ({
      kind: 'stuck',
      text,
      at: at.map((i) => els.get(i)!).filter(Boolean),
      action: history.length ? L('Undo', 'Annuler') : L('Restart', 'Repartir'),
      play: () => (history.length ? undo() : reset()),
    });
    /** Dead ends: a crate that can never reach a target any more, or no solution left at all. */
    const check = (): Hint | null => {
      if (done || drag || !history.length) return null;
      const dc = deadCrates(w, hh, floor, targets, boxes, live);
      if (dc.length) {
        const b = dc[0].box;
        const wallAt = (dd: number) => {
          const y = nb(b, dd);
          return y < 0 || !floor[y];
        };
        const corner = (wallAt(0) || wallAt(2)) && (wallAt(1) || wallAt(3));
        return stuckHint(
          dc[0].why === 'frozen'
            ? L(
                'This crate is wedged against walls and other crates: none of them can move again, and it isn’t on a target. Undo.',
                'Cette caisse est coincée contre des murs et d’autres caisses : plus rien ne bouge, et elle n’est pas sur une cible. Annulez.',
              )
            : corner
              ? L(
                  'This crate is in a corner with no target: you can never push it out again. Undo.',
                  'Cette caisse est dans un coin sans cible : vous ne pourrez plus jamais l’en sortir. Annulez.',
                )
              : L(
                  'This crate is against a wall with no target along it: it can only slide along that wall and never reach a target. Undo.',
                  'Cette caisse est contre un mur sans cible : elle ne peut que glisser le long de ce mur, sans jamais atteindre une cible. Annulez.',
                ),
          dc.map((x) => x.box),
        );
      }
      const r = solveHere();
      if (!r.sol && !r.capped)
        return stuckHint(
          L(
            'No way to finish from here: the crates block each other. Undo a move or two.',
            'Impossible de finir d’ici : les caisses se bloquent entre elles. Annulez un pas ou deux.',
          ),
          boxes.filter((b) => !tset.has(b)),
        );
      return null;
    };
    /** Guide: follow a fewest-pushes solution; walking behind a crate and pushing it are separate steps. */
    const hint = (): Hint | null => {
      if (done || drag) return null;
      const sol = solveHere().sol;
      if (!sol?.length) return null;
      const { box, dir } = sol[0];
      const el = (i: number) => els.get(i)!;
      const dirName = [L('up', 'vers le haut'), L('right', 'vers la droite'), L('down', 'vers le bas'), L('left', 'vers la gauche')][dir];
      const behind = nb(box, (dir + 2) % 4);
      if (player !== behind) {
        const side = [
          L('below it', 'sous elle'),
          L('on its left', 'à sa gauche'),
          L('above it', 'au-dessus d’elle'),
          L('on its right', 'à sa droite'),
        ][dir];
        return {
          text: L(
            `You can only push, never pull. To push this crate ${dirName}, first stand ${side}: drag your ball there, or tap that square.`,
            `On peut seulement pousser, jamais tirer. Pour pousser cette caisse ${dirName}, placez-vous d’abord ${side} : glissez-y votre bille, ou touchez cette case.`,
          ),
          why: [el(box)],
          at: [el(behind)],
          play: () => tap(behind),
        };
      }
      let k = 1,
        end = nb(box, dir);
      while (k < sol.length && sol[k].box === end && sol[k].dir === dir) {
        k++;
        end = nb(end, dir);
      }
      const sq = k === 1 ? L('one square', 'd’une case') : L(`${k} squares`, `de ${k} cases`);
      const row = (i: number) => Math.floor(i / w),
        col = (i: number) => i % w;
      const free = targets.filter((t) => !boxes.includes(t));
      const lined = free.some((t) => (row(t) === row(end) || col(t) === col(end)) && row(t) !== row(box) && col(t) !== col(box));
      const text = tset.has(end)
        ? L(`Push the crate ${sq} ${dirName}, right onto the target.`, `Poussez la caisse ${sq} ${dirName}, jusque sur la cible.`)
        : lined
          ? L(
              `Push the crate ${sq} ${dirName}: now it lines up with a target, so straight pushes can bring it home.`,
              `Poussez la caisse ${sq} ${dirName} : elle est alors alignée avec une cible, et des poussées en ligne droite l’y amèneront.`,
            )
          : L(
              `Push the crate ${sq} ${dirName}. Plan ahead: a crate pushed into a corner can never be pulled back out.`,
              `Poussez la caisse ${sq} ${dirName}. Prévoyez la suite : une caisse poussée dans un coin ne peut plus en sortir.`,
            );
      return {
        text,
        why: [el(player), el(box)],
        at: [el(end)],
        play: () => {
          for (let j = 0; j < k; j++) move(dir as Dir);
        },
      };
    };

    // Drag from the ball: it follows the pointer square by square (pushing crates on the way), and going
    // back over the last square retraces a plain step. Elsewhere, a tap walks there and a swipe takes one step.
    const pin = (i: number) => {
      const g = grid.getBoundingClientRect(),
        r = els.get(i)!.getBoundingClientRect();
      return `${r.left + r.width / 2 - g.left},${r.top + r.height / 2 - g.top}`;
    };
    const trail = s('svg', { class: 'push-trail', 'aria-hidden': 'true' });
    const drawTrail = () => {
      if (!drag || drag.path.length < 2) {
        trail.replaceChildren();
        return;
      }
      const pts = drag.path.map(pin).join(' ');
      const [x, y] = pin(drag.path[0]).split(',');
      trail.replaceChildren(
        s('polyline', { class: 'under', points: pts }),
        s('polyline', { class: 'over', points: pts }),
        s('circle', { class: 'start', cx: x, cy: y }),
      );
    };
    /** One traced step: retrace the last plain step if `dir` goes back over it, else walk or push. */
    const trace = (dir: Dir): boolean => {
      const tr = drag!;
      const last = tr.cur[tr.cur.length - 1];
      if (last && last === last.toLowerCase() && nb(player, dir) === tr.path[tr.path.length - 2]) {
        unstep(last);
        tr.cur = tr.cur.slice(0, -1);
        tr.path.pop();
        return true;
      }
      const rec = step(dir);
      if (!rec) return false;
      ctx.touch();
      tr.cur += rec;
      tr.path.push(player);
      if (rec !== rec.toLowerCase()) {
        // A push is its own action for Undo, and can't be retraced by dragging back.
        history.push(tr.cur);
        tr.cur = '';
        const b = els.get(nb(player, dir));
        if (b) anim(b, [{ transform: 'scale(0.9)' }, { transform: 'scale(1)' }], 120);
      }
      return true;
    };
    const endDrag = () => {
      if (!drag) return;
      if (drag.cur) history.push(drag.cur);
      drag = null;
      trail.replaceChildren();
      trail.remove();
      swiped = true; // the click that ends the gesture is not a tap
      render();
      if (solved()) {
        done = true;
        ctx.solved();
      }
    };
    /** Walk toward cell `t` one square at a time, preferring the longer axis and plain steps over pushes. */
    const follow = (t: number) => {
      let moved = false;
      for (let guard = 0; guard < 64; guard++) {
        if (!drag || t === player) break;
        const dr = Math.floor(t / w) - Math.floor(player / w),
          dc = (t % w) - (player % w);
        const v = dr > 0 ? 2 : 0,
          hz = dc > 0 ? 1 : 3;
        let order: Dir[] = !dr ? [hz] : !dc ? [v] : Math.abs(dr) >= Math.abs(dc) ? [v, hz] : [hz, v];
        if (order.length > 1 && boxes.includes(nb(player, order[0]))) order = [order[1], order[0]];
        if (!order.some((dd) => trace(dd))) break;
        moved = true;
        if (solved()) break;
      }
      if (!moved) return;
      render();
      drawTrail();
      if (solved()) endDrag();
    };
    const cellAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)?.closest('.cell');
      return el ? (idx.get(el) ?? -1) : -1;
    };

    let swiped = false;
    let down: { id: number; x: number; y: number } | null = null;
    grid.addEventListener('pointerdown', (e) => {
      swiped = false;
      if (done || drag || down) return;
      if (e.button === 0 && cellAt(e.clientX, e.clientY) === player) {
        drag = { id: e.pointerId, cur: '', path: [player] };
        grid.setPointerCapture?.(e.pointerId);
        grid.append(trail);
      } else down = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    grid.addEventListener('pointermove', (e) => {
      if (drag?.id !== e.pointerId) return;
      const t = cellAt(e.clientX, e.clientY);
      if (t >= 0) follow(t);
    });
    grid.addEventListener('pointerup', (e) => {
      if (drag?.id === e.pointerId) {
        endDrag();
        return;
      }
      if (down?.id !== e.pointerId) return;
      const dx = e.clientX - down.x,
        dy = e.clientY - down.y;
      down = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return; // a tap: the click walks there
      swiped = true;
      move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
    });
    grid.addEventListener('pointercancel', (e) => {
      if (drag?.id === e.pointerId) endDrag();
      if (down?.id === e.pointerId) down = null;
    });

    const arrows = dpad((dir) => move(dir as Dir));
    ctx.controls(undoBtn(undo), restartBtn(reset));
    root.append(grid, arrows);
    render();

    return {
      snapshot: () => ({ h: drag?.cur ? [...history, drag.cur] : history }),
      check,
      hint,
      onKey(e) {
        const k = keyDir(e);
        if (k != null) {
          move(k);
          return true;
        }
        if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace' || e.key === 'u') {
          undo();
          return true;
        }
        if (e.key === 'r' || e.key === 'R') {
          reset();
          return true;
        }
        return false;
      },
    };
  },
};
