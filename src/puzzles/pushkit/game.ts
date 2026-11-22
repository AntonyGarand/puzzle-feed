import { L, P } from '../../core/i18n';
import type { Hint, PuzzleCtx, PuzzleInstance } from '../../core/types';
import { board, btn, h, pad, s, shake } from '../../core/ui';
import { anim, type Dir, keyDir } from '../movekit/kit';
import { type Board, caught, front, frozen, isGoal, type Moved, nbr, type Rules, solve, type St, step } from './engine';
import type { Level } from './gen';
import './pushkit.css';

const LETTERS = 'urdl';
/** Which gimmick the guide talks about. */
export type Kind = 'ice' | 'count' | 'wrap' | 'wall';

/**
 * The shared play surface for the gimmick crate games: same controls as the plain push game (drag the
 * ball, tap to walk, swipe, arrows, keys, Undo/Restart), with rendering for ice, counts, wrap and wall.
 */
export function playPush(ctx: PuzzleCtx, lv: Level, R: Rules, kind: Kind): PuzzleInstance {
  const { root } = ctx;
  const { w, h: hh, floor, targets } = lv;
  const B: Board = { w, h: hh, floor, targets };
  const nb = nbr(w, hh, R.wrap);
  const tset = new Set(targets);
  const start: St = { p: lv.player, b: lv.boxes.slice(), c: lv.counts.slice(), t: 0 };

  /** trail[k] = state after k steps; history = actions (lowercase walk, uppercase push). */
  let trail: St[] = [start];
  let history: string[] = [];
  let done = false;
  const cur = () => trail[trail.length - 1];
  const dead = () => caught(B, R, cur());

  /** Apply one step; returns the move, or null if blocked (or already caught by the wall). */
  const stepOnce = (dir: Dir): Moved | null => {
    if (dead()) return null;
    const m = step(B, R, nb, cur(), dir);
    if (m) trail.push(m.st);
    return m;
  };
  const letter = (m: Moved, dir: number) => (m.box >= 0 ? LETTERS[dir].toUpperCase() : LETTERS[dir]);

  // Restore by replaying the saved actions (stops at the first one that no longer applies).
  const sv = ctx.saved as { h?: unknown } | undefined;
  if (Array.isArray(sv?.h)) {
    outer: for (const a of sv.h) {
      if (typeof a !== 'string' || !a) break;
      for (const ch of a) {
        const dir = LETTERS.indexOf(ch.toLowerCase());
        const m = dir < 0 ? null : stepOnce(dir as Dir);
        if (!m || letter(m, dir) !== ch) {
          trail = [start];
          history = [];
          break outer;
        }
      }
      history.push(a);
    }
  }

  // Layout: crop to the floor for walled rooms; wrapped rooms show a ring of "ghost" cells from the
  // opposite edge so it's obvious the sides connect.
  let r0 = 0,
    r1 = hh - 1,
    c0 = 0,
    c1 = w - 1;
  if (!R.wrap && !R.every) {
    r0 = hh;
    r1 = 0;
    c0 = w;
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
  }
  const ring = R.wrap ? 1 : 0;
  const cols = c1 - c0 + 1 + 2 * ring,
    rows = r1 - r0 + 1 + 2 * ring;
  const grid = board(cols, rows, `pk-grid${R.wrap ? ' pk-wrap' : ''}`);
  const els = new Map<number, HTMLElement>();
  const ghosts: [number, HTMLElement][] = [];
  const idx = new Map<Element, number>();
  for (let r = r0 - ring; r <= r1 + ring; r++)
    for (let c = c0 - ring; c <= c1 + ring; c++) {
      const inside = r >= 0 && r < hh && c >= 0 && c < w;
      if (!inside) {
        const corner = (r < 0 || r >= hh) && (c < 0 || c >= w);
        const el = h('div', { class: corner ? 'pk-corner' : 'cell ghost', 'aria-hidden': 'true' });
        if (!corner) {
          const i = ((r + hh) % hh) * w + ((c + w) % w);
          ghosts.push([i, el]);
          idx.set(el, i);
        }
        grid.append(el);
        continue;
      }
      const i = r * w + c;
      const el = floor[i] ? h('button', { type: 'button', class: 'cell', onclick: () => click(i) }) : h('div', { class: 'cell wall' });
      els.set(i, el);
      idx.set(el, i);
      grid.append(el);
    }

  // Advancing wall: a countdown strip above the board.
  const wallBar = R.every ? h('div', { class: 'pk-wallbar' }) : null;
  /** Moves until the wall swallows the next column. */
  const wallIn = (t: number) => (front(R, t) + R.lead + 1) * R.every - t;

  const solved = () => isGoal(tset, cur());
  /** Path being traced by a drag from the ball: `cur` is the unsaved tail of the action (pushes close an action). */
  let drag: { id: number; cur: string; path: number[] } | null = null;
  const classOf = (i: number, st: St, lim: number, warn: boolean) => {
    const col = i % w;
    const doom = R.every && col < lim ? ' doom' : warn && col === lim ? ' warn' : '';
    if (!floor[i]) return `cell wall${doom}`;
    const bi = st.b.indexOf(i);
    const box = bi >= 0;
    const z = box && R.counted && st.c[bi] === 0 ? ' z' : '';
    const hit = R.every && col < lim && (box || i === st.p) ? ' dead' : '';
    return `cell${tset.has(i) ? ' tg' : ''}${box ? ' bx' : ''}${box && tset.has(i) ? ' on' : ''}${z}${i === st.p ? ' me' : ''}${doom}${hit}`;
  };
  const render = () => {
    const st = cur();
    const lim = front(R, st.t);
    const left = R.every ? wallIn(st.t) : 0;
    const warn = R.every > 0 && left <= R.every && lim < w;
    const text = (i: number) => {
      const bi = st.b.indexOf(i);
      return bi >= 0 && R.counted ? String(st.c[bi]) : '';
    };
    els.forEach((el, i) => {
      el.className = classOf(i, st, lim, warn);
      el.textContent = text(i);
    });
    for (const [i, el] of ghosts) {
      el.className = `${classOf(i, st, lim, warn)} ghost`;
      el.textContent = text(i);
    }
    const moves = trail.length - 1;
    const home = st.b.filter((b) => tset.has(b)).length;
    const ms = P(moves, ['move', 'moves'], ['pas', 'pas']);
    let msg = L(`${home}/${st.b.length} home · ${ms}`, `${home}/${st.b.length} · ${ms}`);
    const stuck = st.b.filter((b, k) => !tset.has(b) && ((R.counted && st.c[k] === 0) || frozen(B, nb, b))).length;
    if (stuck) msg = `${P(stuck, ['crate stuck', 'crates stuck'], ['caisse coincée', 'caisses coincées'])} · ${L('undo', 'annulez')}`;
    if (R.every) {
      if (dead()) msg = L('Caught by the wall · undo', 'Rattrapé par le mur · annulez');
      else if (!stuck) msg = `${L(`Wall in ${left}`, `Mur dans ${left}`)} · ${msg}`;
      if (wallBar) {
        const pips = Math.min(left, R.every);
        wallBar.replaceChildren(
          h('b', { class: 'pk-wallnum' }, dead() ? '✕' : String(left)),
          h(
            'span',
            { class: 'pk-walllbl' },
            dead() ? L('caught!', 'rattrapé!') : L('moves before the wall advances', 'pas avant que le mur avance'),
          ),
          h('span', { class: 'pk-pips' }, ...Array.from({ length: R.every }, (_, k) => h('i', { class: k < pips ? 'on' : '' }))),
        );
        wallBar.classList.toggle('low', !dead() && left <= 2);
        wallBar.classList.toggle('dead', dead());
      }
    }
    ctx.status(msg);
  };
  const animate = (m: Moved, dir: number) => {
    if (m.box < 0) return;
    const b = els.get(m.to);
    if (!b) return;
    if (m.dist > 1 && !m.wrapped) {
      const dx = dir === 1 ? -1 : dir === 3 ? 1 : 0,
        dy = dir === 2 ? -1 : dir === 0 ? 1 : 0;
      anim(b, [{ transform: `translate(${dx * m.dist * 100}%, ${dy * m.dist * 100}%)` }, { transform: 'none' }], 60 + 40 * m.dist);
    } else anim(b, [{ transform: 'scale(0.9)' }, { transform: 'scale(1)' }], 120);
  };
  const finish = () => {
    if (!dead() && solved()) {
      done = true;
      ctx.solved();
    }
  };
  const after = (rec: string, m: Moved | null, dir: number) => {
    if (!rec) return;
    ctx.touch();
    history.push(rec);
    render();
    if (m) animate(m, dir);
    if (dead()) shake(grid);
    finish();
  };
  const move = (dir: Dir) => {
    if (done || drag) return;
    const m = stepOnce(dir);
    if (!m) {
      shake(grid);
      return;
    }
    after(letter(m, dir), m, dir);
  };
  /** Tap: adjacent cell = one step (push if a crate), otherwise walk there if reachable in time. */
  const tap = (i: number) => {
    if (done || drag) return;
    const st = cur();
    for (let dd = 0; dd < 4; dd++)
      if (nb(st.p, dd) === i) {
        move(dd as Dir);
        return;
      }
    if (st.b.includes(i) || i === st.p || dead()) return;
    // BFS by steps (so the wall's advance is respected on the way), without pushing.
    const prev = new Map<number, number>([[st.p, -1]]);
    const depth = new Map<number, number>([[st.p, 0]]);
    const q = [st.p];
    for (let k = 0; k < q.length && !prev.has(i); k++) {
      const x = q[k];
      const t = st.t + depth.get(x)! + 1;
      for (let dd = 0; dd < 4; dd++) {
        const y = nb(x, dd);
        if (y < 0 || !floor[y] || st.b.includes(y) || prev.has(y)) continue;
        if (y % w < front(R, t)) continue; // the wall would catch you there
        prev.set(y, x);
        depth.set(y, depth.get(x)! + 1);
        q.push(y);
      }
    }
    if (!prev.has(i)) {
      shake(grid);
      return;
    }
    const path: number[] = [];
    for (let x = i; x !== st.p; x = prev.get(x)!) path.unshift(x);
    let rec = '';
    for (const x of path) {
      const dir = [0, 1, 2, 3].find((dd) => nb(cur().p, dd) === x)!;
      const m = stepOnce(dir as Dir);
      if (!m) break;
      rec += letter(m, dir);
    }
    after(rec, null, 0);
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
    trail.length -= a.length;
    render();
  };
  const reset = () => {
    if (done || drag || !history.length) return;
    trail = [start];
    history = [];
    render();
  };

  const dirName = (d: number) =>
    [L('up', 'vers le haut'), L('right', 'vers la droite'), L('down', 'vers le bas'), L('left', 'vers la gauche')][d];
  /** Guide: follow a fewest-moves solution; walking into position and pushing are separate steps. */
  const hint = (): Hint | null => {
    if (done || dead()) return null;
    const sol = solve(B, R, cur(), 80000);
    if (!sol?.length) return null;
    const el = (i: number) => els.get(i)!;
    // Leading walk steps (no push): walk there first.
    let st = cur();
    let k = 0;
    const walk: number[] = [];
    while (k < sol.length) {
      const m = step(B, R, nb, st, sol[k])!;
      if (m.box >= 0) break;
      walk.push(sol[k]);
      st = m.st;
      k++;
    }
    if (walk.length) {
      const at = el(st.p);
      const m = step(B, R, nb, st, sol[k]);
      const box = m ? el(m.from) : at;
      return {
        text:
          kind === 'wall'
            ? L(
                `Every step counts: the wall moves in ${wallIn(cur().t)}. Walk the shortest way behind this crate.`,
                `Chaque pas compte : le mur avance dans ${wallIn(cur().t)}. Allez derrière cette caisse par le plus court chemin.`,
              )
            : L(
                'You can only push, never pull. First walk behind the crate on the side opposite to where it must go.',
                'On peut seulement pousser, jamais tirer. Placez-vous d’abord derrière la caisse, du côté opposé à sa destination.',
              ),
        why: [box],
        at: [at],
        play: () => {
          for (const d of walk) move(d as Dir);
        },
      };
    }
    // Pushes of the same crate in the same direction, grouped.
    const first = step(B, R, nb, st, sol[k])!;
    const d = sol[k];
    let n = 1,
      s2 = first.st;
    let last = first;
    let wrapped = first.wrapped;
    while (k + n < sol.length && sol[k + n] === d) {
      const m = step(B, R, nb, s2, d)!;
      if (m.box !== first.box) break;
      last = m;
      wrapped ||= m.wrapped;
      s2 = m.st;
      n++;
    }
    const end = last.to;
    const sq = n === 1 ? L('once', 'une fois') : L(`${n} times`, `${n} fois`);
    const home = tset.has(end);
    const onto = home ? L(' It lands on a target.', ' Elle arrive sur une cible.') : '';
    let text: string;
    if (kind === 'ice')
      text = L(
        `Push the crate ${dirName(d)}: on ice it slides until something stops it, here on the ringed square.${onto}`,
        `Poussez la caisse ${dirName(d)} : sur la glace, elle glisse jusqu’à ce qu’un obstacle l’arrête, ici sur la case encerclée.${onto}`,
      );
    else if (kind === 'count') {
      const c = st.c[first.box];
      text = L(
        `This crate has ${c} ${c === 1 ? 'push' : 'pushes'} left. Push it ${dirName(d)} ${sq}; pushes are scarce, so don't waste any.${onto}`,
        `Cette caisse a encore ${c} ${c === 1 ? 'poussée' : 'poussées'}. Poussez-la ${dirName(d)} ${sq}; elles sont comptées, n’en gaspillez pas.${onto}`,
      );
    } else if (kind === 'wrap' && wrapped)
      text = L(
        `Push the crate ${dirName(d)} ${sq}: past the edge, it comes back in on the opposite side.${onto}`,
        `Poussez la caisse ${dirName(d)} ${sq} : passé le bord, elle revient par le côté opposé.${onto}`,
      );
    else if (kind === 'wall')
      text = L(
        `Push the crate ${dirName(d)} ${sq}. Keep everything ahead of the wall: it moves in ${wallIn(cur().t)}.${onto}`,
        `Poussez la caisse ${dirName(d)} ${sq}. Gardez tout devant le mur : il avance dans ${wallIn(cur().t)}.${onto}`,
      );
    else text = L(`Push the crate ${dirName(d)} ${sq}.${onto}`, `Poussez la caisse ${dirName(d)} ${sq}.${onto}`);
    return {
      text,
      why: [el(cur().p), el(first.from)],
      at: [el(end)],
      play: () => {
        for (let j = 0; j < n; j++) move(d as Dir);
      },
    };
  };

  // Drag from the ball: it follows the pointer square by square (pushing crates on the way), and going
  // back over the last square retraces a plain step. Elsewhere, a tap walks there and a swipe takes one step.
  const pin = (i: number) => {
    const g = grid.getBoundingClientRect(),
      r = els.get(i)!.getBoundingClientRect();
    return [r.left + r.width / 2 - g.left, r.top + r.height / 2 - g.top];
  };
  const trailSvg = s('svg', { class: 'pk-trail', 'aria-hidden': 'true' });
  const drawTrail = () => {
    if (!drag || drag.path.length < 2) {
      trailSvg.replaceChildren();
      return;
    }
    // Split the path where it jumps across a wrapped edge.
    const segs: number[][][] = [[]];
    drag.path.forEach((c, k) => {
      if (k && !adjacent(drag!.path[k - 1], c)) segs.push([]);
      segs[segs.length - 1].push(pin(c));
    });
    const kids: SVGElement[] = [];
    for (const sg of segs) if (sg.length > 1) kids.push(s('polyline', { class: 'under', points: sg.join(' ') }));
    for (const sg of segs) if (sg.length > 1) kids.push(s('polyline', { class: 'over', points: sg.join(' ') }));
    const [x, y] = pin(drag.path[0]);
    kids.push(s('circle', { class: 'start', cx: x, cy: y }));
    trailSvg.replaceChildren(...kids);
  };
  /** Next to each other on screen (not across a wrapped edge). */
  const adjacent = (a: number, b: number) => {
    const dr = Math.abs(Math.floor(a / w) - Math.floor(b / w)),
      dc = Math.abs((a % w) - (b % w));
    return dr + dc === 1;
  };
  /** One traced step: retrace the last plain step if `dir` goes back over it, else walk or push. */
  const trace = (dir: Dir): boolean => {
    const tr = drag!;
    const last = tr.cur[tr.cur.length - 1];
    if (last && last === last.toLowerCase() && nb(cur().p, dir) === tr.path[tr.path.length - 2]) {
      trail.pop();
      tr.cur = tr.cur.slice(0, -1);
      tr.path.pop();
      return true;
    }
    const m = stepOnce(dir);
    if (!m) return false;
    ctx.touch();
    const rec = letter(m, dir);
    tr.cur += rec;
    tr.path.push(cur().p);
    if (m.box >= 0) {
      // A push is its own action for Undo, and can't be retraced by dragging back.
      history.push(tr.cur);
      tr.cur = '';
      animate(m, dir);
    }
    return true;
  };
  const endDrag = () => {
    if (!drag) return;
    if (drag.cur) history.push(drag.cur);
    drag = null;
    trailSvg.replaceChildren();
    trailSvg.remove();
    swiped = true; // the click that ends the gesture is not a tap
    render();
    if (dead()) shake(grid);
    finish();
  };
  /** Shortest signed offset from a to b on an axis of length n (wrapping if the board wraps). */
  const delta = (a: number, b: number, n: number) => {
    let d = b - a;
    if (R.wrap && Math.abs(d) * 2 > n) d -= Math.sign(d) * n;
    return d;
  };
  /** Walk toward cell `t` one square at a time, preferring the longer axis and plain steps over pushes. */
  const follow = (t: number) => {
    let moved = false;
    for (let guard = 0; guard < 64; guard++) {
      const p = cur().p;
      if (!drag || t === p || dead()) break;
      const dr = delta(Math.floor(p / w), Math.floor(t / w), hh),
        dc = delta(p % w, t % w, w);
      const v = dr > 0 ? 2 : 0,
        hz = dc > 0 ? 1 : 3;
      let order: Dir[] = !dr ? [hz] : !dc ? [v] : Math.abs(dr) >= Math.abs(dc) ? [v, hz] : [hz, v];
      if (order.length > 1 && cur().b.includes(nb(p, order[0]))) order = [order[1], order[0]];
      if (!order.some((dd) => trace(dd))) break;
      moved = true;
      if (solved()) break;
    }
    if (!moved) return;
    render();
    drawTrail();
    if (solved() || dead()) endDrag();
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
    if (e.button === 0 && !dead() && cellAt(e.clientX, e.clientY) === cur().p) {
      drag = { id: e.pointerId, cur: '', path: [cur().p] };
      grid.setPointerCapture?.(e.pointerId);
      grid.append(trailSvg);
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

  const arrows = pad(
    [
      { label: '←', value: '3', aria: L('Left', 'Gauche') },
      { label: '↑', value: '0', aria: L('Up', 'Haut') },
      { label: '↓', value: '2', aria: L('Down', 'Bas') },
      { label: '→', value: '1', aria: L('Right', 'Droite') },
    ],
    (v) => move(Number(v) as Dir),
  );
  arrows.classList.add('pk-pad');
  ctx.controls(btn(L('Undo', 'Annuler'), undo, 'ghost'), btn(L('Restart', 'Repartir'), reset, 'ghost'));
  if (wallBar) root.append(wallBar);
  root.append(grid, arrows);
  render();

  return {
    snapshot: () => ({ h: drag?.cur ? [...history, drag.cur] : history }),
    hint,
    onKey(e) {
      const k = keyDir(e);
      if (k != null) {
        move(k);
        return true;
      }
      if (e.key === 'z' || e.key === 'Backspace' || e.key === 'u') {
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
}
