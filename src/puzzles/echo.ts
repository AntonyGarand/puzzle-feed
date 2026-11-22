import { L } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, btn, dpad, h, restartBtn, s, shake, undoBtn } from '../core/ui';
import { ACTS, at, enterable, generate, isOpen, nbr, search, track, trimWaits, walk, type GenOpts } from './echokit/gen';
import { anim, keyDir, onSwipe, POP } from './movekit/kit';
import './echo.css';

const OPTS: readonly [GenOpts, GenOpts, GenOpts, GenOpts, GenOpts] = [
  { w: 5, h: 6, doors: 1, runs: 2, slack: 5, loops: 1, minT: 7, maxT: 18 },
  { w: 6, h: 6, doors: 2, runs: 2, slack: 3, loops: 2, minT: 11, maxT: 24 },
  { w: 6, h: 7, doors: 2, runs: 2, slack: 2, loops: 2, minT: 14, maxT: 28 },
  { w: 7, h: 7, doors: 3, runs: 2, slack: 1, loops: 3, minT: 17, maxT: 34 },
  { w: 7, h: 7, doors: 3, runs: 3, slack: 2, loops: 3, minT: 14, maxT: 34 },
];

/** Door/plate colours, with their names (feminine in French: « la porte bleue »). */
const COLOURS = [
  { v: 'var(--p2)', en: 'blue', fr: 'bleue' },
  { v: 'var(--p1)', en: 'orange', fr: 'orange' },
  { v: 'var(--p5)', en: 'purple', fr: 'mauve' },
];
const colName = (c: number) => L(COLOURS[c].en, COLOURS[c].fr);

export const echo: PuzzleDef = {
  id: 'echo',
  get name() {
    return L('Echo', 'Écho');
  },
  category: 'moves',
  offByDefault: true,
  get rules() {
    return L('Your echo replays your earlier run. Use it to open doors.', 'Votre écho rejoue votre boucle et vous ouvre les portes.');
  },
  help: () => ({
    goal: L(
      'Reach the exit flag. Doors only open while someone stands on a plate of their colour, so let your echo, a replay of your earlier run, hold the plates for you.',
      'Atteignez le drapeau de sortie. Une porte s’ouvre seulement quand quelqu’un se tient sur une plaque de sa couleur : laissez votre écho, la reprise de votre boucle précédente, tenir les plaques pour vous.',
    ),
    steps: [
      L(
        'A plate keeps the doors of its colour open while someone stands on it. You can’t hold a plate and walk through its door at the same time.',
        'Une plaque garde ouvertes les portes de sa couleur tant que quelqu’un s’y tient. Impossible de tenir une plaque et de franchir sa porte en même temps.',
      ),
      L(
        'Your first run is recorded: move or wait, turn by turn, then press End run (or run out of turns).',
        'Votre première boucle est enregistrée : bougez ou attendez, tour par tour, puis touchez Arrêter (ou épuisez vos tours).',
      ),
      L(
        'You restart at the start while your echo replays that run in step with you. Once its recording ends, it stays put. You can share a square with it.',
        'Vous repartez du début pendant que votre écho rejoue cette boucle en même temps que vous. À la fin de son enregistrement, il reste sur place. Vous pouvez partager une case avec lui.',
      ),
      L(
        'The dashed line shows where your echo goes next; a number shows how many turns it waits there.',
        'La ligne pointillée montre où votre écho ira; un nombre indique combien de tours il attend à cet endroit.',
      ),
      L(
        'Controls: swipe, tap a neighbouring square, or use the arrows, the arrow keys or WASD. Tap yourself or press Wait (Space) to wait; End run is Enter.',
        'Commandes : balayez, touchez une case voisine, ou utilisez les flèches à l’écran, les touches fléchées ou WASD. Touchez-vous ou appuyez sur Attendre (Espace) pour attendre; Entrée termine la boucle.',
      ),
      L(
        'Undo (Z) takes back a turn, even across the end of a run or a restart; Restart (R) starts over from the first run.',
        'Annuler (Z) reprend un tour, même après la fin d’une boucle ou un retour au départ; Repartir (R) reprend tout depuis la première boucle.',
      ),
    ],
    tips: [
      L(
        'Count turns: work out when you’ll reach each door, and have your echo on its plate on that exact turn.',
        'Comptez les tours : calculez quand vous arriverez à chaque porte, et placez votre écho sur sa plaque à ce tour précis.',
      ),
      L(
        'Two doors in a row need the echo to hold one plate, then hurry to the next: wait on the first plate just long enough.',
        'Deux portes de suite : l’écho tient une plaque, puis file vers l’autre. Attendez sur la première juste assez longtemps.',
      ),
      L(
        'On Master you get three runs: two echoes can hold two plates at once.',
        'Au niveau Maître, vous avez trois boucles : deux échos peuvent tenir deux plaques à la fois.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [45, 80, 120, 180, 240]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const room = generate(rng, byLevel(d, OPTS));
    const { w, h: hh, floor, door, plate, start, exit, runs: R, T } = room;

    /** One action string per run; the last one is the run being played. */
    let runs: string[] = [''];
    /** Squares of each finished run (its echo), and of the current run. */
    let tracks: number[][] = [];
    let me: number[] = [start];
    let done = false;
    const sync = () => {
      tracks = [];
      for (let k = 0; k < runs.length - 1; k++) tracks.push(track(room, runs[k], tracks)!);
      me = track(room, runs[runs.length - 1], tracks)!;
    };
    const others = (t: number) => tracks.map((tr) => at(tr, t));

    // Restore: every run must replay legally, without having reached the exit.
    /** Runs as saved by the player (each replays without reaching the exit), or null. */
    const validRuns = (v: unknown): string[] | null => {
      if (!Array.isArray(v) || v.length < 1 || v.length > R || !v.every((x) => typeof x === 'string' && x.length <= T)) return null;
      const tr: number[][] = [];
      for (const rec of v as string[]) {
        const t = track(room, rec, tr);
        if (!t || t.includes(exit)) return null;
        tr.push(t);
      }
      return (v as string[]).slice();
    };
    /** Runs before each restart, so undo can step back across it. */
    let before: string[][] = [];
    const sv = ctx.saved as { r?: unknown; b?: unknown } | undefined;
    const svRuns = validRuns(sv?.r);
    if (svRuns) {
      runs = svRuns;
      if (Array.isArray(sv?.b)) {
        const b = sv.b.map(validRuns);
        if (b.every(Boolean)) before = b as string[][];
      }
    }
    sync();

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
    const grid = board(c1 - c0 + 1, r1 - r0 + 1, 'echo-grid');
    const els = new Map<number, HTMLElement>();
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        const i = r * w + c;
        const col = door[i] >= 0 ? door[i] : plate[i];
        const el = floor[i]
          ? h(
              'button',
              { type: 'button', class: 'cell', style: col >= 0 ? `--c:${COLOURS[col].v}` : null, onclick: () => click(i) },
              h('span', { class: 'gst' }),
            )
          : h('div', { class: 'cell wall' });
        els.set(i, el);
        grid.append(el);
      }
    const paths = s('svg', { class: 'echo-paths', 'aria-hidden': 'true' });
    grid.append(paths);

    const runDots = h('div', { class: 'dots' });
    const phase = h('span', { class: 'echo-phase' });
    const bar = h('div', { class: 'echo-bar' }, h('span', { class: 'echo-runs' }, L('Run', 'Boucle'), runDots), phase);

    // Not « Terminer »: that's the Finish button of endless games.
    const endBtn = btn(L('End run', 'Arrêter'), () => endRun(), 'primary');

    const centre = (i: number) => {
      const el = els.get(i)!;
      return `${el.offsetLeft + el.offsetWidth / 2},${el.offsetTop + el.offsetHeight / 2}`;
    };
    /** Squares of a stretch of track, without repeats while standing still. */
    const line = (tr: number[]) => tr.filter((x, k) => k === 0 || x !== tr[k - 1]).map(centre);
    const draw = () => {
      const t = runs[runs.length - 1].length;
      const out: SVGElement[] = [];
      for (const tr of tracks) {
        const k = Math.min(t, tr.length - 1);
        const past = line(tr.slice(0, k + 1)),
          next = line(tr.slice(k));
        if (past.length > 1) out.push(s('polyline', { class: 'past', points: past.join(' ') }));
        if (next.length > 1) out.push(s('polyline', { class: 'next', points: next.join(' ') }));
        // waits still ahead: how many turns the echo stands on each square
        for (let j = k; j < tr.length - 1;) {
          let e = j;
          while (e + 1 < tr.length && tr[e + 1] === tr[j]) e++;
          if (e > j) {
            const [x, y] = centre(tr[j]).split(',');
            out.push(s('g', { class: 'wait' }, s('circle', { cx: x, cy: y }), s('text', { x, y }, String(e - j))));
          }
          j = e + 1;
        }
        const [x, y] = centre(tr[tr.length - 1]).split(',');
        out.push(s('circle', { class: 'stop', cx: x, cy: y }));
      }
      if (runs.length < R && t > 0) {
        const mine = line(me);
        if (mine.length > 1) out.push(s('polyline', { class: 'mine', points: mine.join(' ') }));
      }
      paths.replaceChildren(...out);
    };
    const ro = new ResizeObserver(() => draw());
    ro.observe(grid);

    const render = () => {
      const cur = runs.length - 1,
        t = runs[cur].length,
        pos = me[t];
      const ghosts = others(t);
      const who = [pos, ...ghosts];
      els.forEach((el, i) => {
        if (!floor[i]) return;
        const cls = ['cell'];
        if (plate[i] >= 0) cls.push('pl', who.includes(i) ? 'held' : '');
        if (door[i] >= 0) cls.push('dr', isOpen(room, i, who) ? 'open' : '');
        if (i === start) cls.push('st');
        if (i === exit) cls.push('ex');
        if (ghosts.includes(i)) cls.push('gh');
        if (i === pos) cls.push('me');
        el.className = cls.filter(Boolean).join(' ');
      });
      runDots.replaceChildren(
        ...Array.from({ length: R }, (_, k) => h('i', { class: k < cur ? 'dot on' : k === cur ? 'dot cur' : 'dot' })),
      );
      phase.textContent = done
        ? L('Out!', 'Sorti!')
        : cur === R - 1 && t >= T
          ? L('Out of turns: undo', 'Plus de tours : annulez')
          : cur < R - 1
            ? L('Recording', 'Enregistrement')
            : L('Reach the exit', 'Rejoignez la sortie');
      // the last run can't be ended: there's no echo to make after it
      endBtn.hidden = done || cur >= R - 1;
      const turn = L(`Turn ${t} / ${T}`, `Tour ${t} / ${T}`);
      ctx.status(!done && cur === R - 1 && t >= T ? L(`${turn} · out of turns · undo`, `${turn} · plus de tours · annulez`) : turn);
      draw();
    };

    /** One turn: a step (0–3) or a wait (4). Returns false if it didn't happen or the run changed. */
    const act = (a: number): boolean => {
      if (done) return false;
      const cur = runs.length - 1,
        t = runs[cur].length;
      if (t >= T) {
        shake(grid);
        return false;
      }
      const nx = nbr(w, hh, me[t], a);
      if (a !== 4 && !enterable(room, nx, others(t + 1))) {
        shake(grid);
        return false;
      }
      ctx.touch();
      runs[cur] += ACTS[a];
      me.push(nx);
      if (nx === exit) {
        done = true;
        render();
        ctx.solved();
        return false;
      }
      if (cur < R - 1 && runs[cur].length >= T) {
        runs.push('');
        sync();
        render();
        anim(els.get(start)!, POP);
        return false;
      }
      render();
      return true;
    };
    const endRun = () => {
      if (done || runs.length >= R) return;
      ctx.touch();
      runs.push('');
      sync();
      render();
      anim(els.get(start)!, POP);
    };
    const undo = () => {
      if (done) return;
      const cur = runs.length - 1;
      if (runs[cur]) runs[cur] = runs[cur].slice(0, -1);
      else if (cur > 0) runs.pop();
      else if (before.length) runs = before.pop()!;
      else return;
      sync();
      render();
    };
    const reset = () => {
      if (done || (runs.length === 1 && !runs[0])) return;
      before.push(runs);
      runs = [''];
      sync();
      render();
    };
    /** Tap: yourself = wait, a neighbour = step, farther = walk there turn by turn. */
    const tap = (i: number) => {
      if (done) return;
      const cur = runs.length - 1,
        t = runs[cur].length,
        pos = me[t];
      for (let a = 0; a < 5; a++)
        if (nbr(w, hh, pos, a) === i) {
          act(a);
          return;
        }
      if (!floor[i]) return;
      const p = walk(room, tracks, pos, t, i, T);
      if (p == null) {
        shake(grid);
        return;
      }
      for (const ch of p) if (!act(ACTS.indexOf(ch))) break;
    };
    let swiped = false;
    const click = (i: number) => {
      if (swiped) swiped = false;
      else tap(i);
    };
    grid.addEventListener('pointerdown', () => (swiped = false));
    onSwipe(grid, (dir) => {
      swiped = true;
      act(dir);
    });

    /** Search results per position (all runs so far), so check() and hint() don't search twice. */
    const memo = new Map<string, string | null>();
    /**
     * The full recording for the current run in a working plan, or null if there's none (proven when
     * `proven()` says so: the searches cover the last two runs; earlier ones only follow the stored plan).
     */
    const plan = (): string | null => {
      const cur = runs.length - 1,
        mine = runs[cur];
      const onTrack = runs.slice(0, cur).every((r, k) => trimWaits(r) === room.sol[k]);
      if (onTrack && (room.sol[cur].startsWith(mine) || trimWaits(mine) === room.sol[cur])) return room.sol[cur];
      if (cur === R - 2) {
        const key = runs.join('|');
        if (!memo.has(key)) {
          if (memo.size > 100) memo.clear();
          const f = search(room, tracks, T, true, mine);
          memo.set(key, f ? trimWaits(f.echo) : null);
        }
        return memo.get(key)!;
      }
      return null;
    };
    /** No way out is proven for the last two runs; an earlier run off the stored plan proves nothing. */
    const proven = () => runs.length >= R - 1;
    /** Dead end: no timing reaches the exit any more (proven by search). `play()` undoes a turn. */
    const check = (): Hint | null => {
      if (done || (runs.length === 1 && !runs[0])) return null;
      const cur = runs.length - 1,
        t = runs[cur].length,
        pos = me[t];
      const el = (i: number) => els.get(i)!;
      const stuck = (text: string): Hint => ({ kind: 'stuck', text, at: [el(pos)], action: L('Undo', 'Annuler'), play: undo });
      if (cur === R - 1) {
        if (walk(room, tracks, pos, t, exit, T) != null) return null;
        if (t >= T)
          return stuck(
            L(
              `All ${T} turns of this run are used up and you aren’t at the exit. Undo a few turns.`,
              `Les ${T} tours de cette boucle sont écoulés et vous n’êtes pas à la sortie. Annulez quelques tours.`,
            ),
          );
        return stuck(
          L(
            `With ${T - t} ${T - t === 1 ? 'turn' : 'turns'} left, no route reaches the exit: your ${R > 2 ? 'echoes don’t' : 'echo doesn’t'} hold the plates when you get to the doors. Undo, and if that’s not enough, undo into the earlier run.`,
            `Avec ${T - t} ${T - t === 1 ? 'tour restant' : 'tours restants'}, aucun trajet n’atteint la sortie : ${R > 2 ? 'vos échos ne tiennent' : 'votre écho ne tient'} pas les plaques quand vous arrivez aux portes. Annulez, et au besoin revenez dans la boucle précédente.`,
          ),
        );
      }
      if (!proven() || plan() != null) return null;
      return stuck(
        L(
          'Whatever you do next in this run, your echo can’t hold the plates at the turns you’ll need them in the next one. Undo a turn and try another timing.',
          'Quoi que vous fassiez ensuite dans cette boucle, votre écho ne pourra pas tenir les plaques aux tours où vous en aurez besoin à la suivante. Annulez un tour et essayez un autre minutage.',
        ),
      );
    };
    const hint = (): Hint | null => {
      if (done) return null;
      const cur = runs.length - 1,
        t = runs[cur].length,
        pos = me[t];
      const el = (i: number) => els.get(i)!;
      const back: Hint = proven()
        ? {
            kind: 'stuck',
            text: L(
              'From here, no timing gets the doors open when you need them. Undo a turn and try another timing.',
              'À partir d’ici, aucun minutage n’ouvre les portes au bon moment. Annulez un tour et essayez un autre minutage.',
            ),
            at: [el(pos)],
            action: L('Undo', 'Annuler'),
            play: undo,
          }
        : {
            text: L(
              'This run has left the plan that works for your later echoes. Undo this turn and follow it again.',
              'Cette boucle s’écarte du plan qui fonctionne pour vos échos suivants. Annulez ce tour et reprenez-le.',
            ),
            at: [el(pos)],
            action: L('Undo', 'Annuler'),
            play: undo,
          };
      /** Play a stretch of actions as one guide step. */
      const run = (acts: string) => () => {
        for (const ch of acts) if (!act(ACTS.indexOf(ch))) break;
      };
      const waits = (acts: string) => acts.length - acts.replace(/^w+/, '').length;
      const turns = (n: number) => L(`${n} ${n > 1 ? 'turns' : 'turn'}`, `${n} ${n > 1 ? 'tours' : 'tour'}`);
      if (cur === R - 1) {
        const p = walk(room, tracks, pos, t, exit, T);
        if (!p) return back;
        const a = ACTS.indexOf(p[0]);
        const nx = nbr(w, hh, pos, a);
        if (a === 4) {
          // the next door on the way, and how long until it opens
          let x = pos,
            dr = -1;
          for (const ch of p) {
            x = nbr(w, hh, x, ACTS.indexOf(ch));
            if (door[x] >= 0) {
              dr = x;
              break;
            }
          }
          const n = waits(p);
          const col = dr >= 0 ? colName(door[dr]) : '';
          return {
            text:
              dr >= 0
                ? L(
                    `Wait here for ${turns(n)}: the ${col} door only opens once your echo reaches the ${col} plate.`,
                    `Attendez ici pendant ${turns(n)} : la porte ${col} s’ouvrira seulement quand votre écho atteindra la plaque ${col}.`,
                  )
                : L(`Wait here for ${turns(n)}: your echo needs time.`, `Attendez ici pendant ${turns(n)} : votre écho a besoin de temps.`),
            why: dr >= 0 ? [el(dr)] : [],
            at: [el(pos)],
            play: run('w'.repeat(n)),
          };
        }
        if (door[nx] >= 0) {
          const holder = others(t + 1).find((o) => plate[o] === door[nx]);
          const col = colName(door[nx]);
          return {
            text: L(
              `Your echo stands on the ${col} plate on this turn, so the ${col} door is open. Step through now.`,
              `Votre écho se tient sur la plaque ${col} à ce tour : la porte ${col} est ouverte. Franchissez-la maintenant.`,
            ),
            why: holder != null ? [el(holder)] : [],
            at: [el(nx)],
            play: run(p[0]),
          };
        }
        // walk on until the next wait, door or the exit
        let k = 0,
          x = pos;
        while (k < p.length && p[k] !== 'w') {
          const y = nbr(w, hh, x, ACTS.indexOf(p[k]));
          if (door[y] >= 0) break;
          x = y;
          k++;
        }
        const ahead = k < p.length ? nbr(w, hh, x, ACTS.indexOf(p[k])) : -1;
        return {
          text:
            x === exit
              ? L('Walk to the exit flag: you’re through!', 'Marchez jusqu’au drapeau de sortie : vous y êtes!')
              : ahead >= 0 && door[ahead] >= 0
                ? L(
                    `Walk up to the ${colName(door[ahead])} door. Your echo replays your earlier run in step with you, so it reaches each plate on the same turn as before.`,
                    `Avancez jusqu’à la porte ${colName(door[ahead])}. Votre écho rejoue votre boucle précédente en même temps que vous : il atteint chaque plaque au même tour qu’avant.`,
                  )
                : L(
                    'Head for the exit. Your echo replays your earlier run in step with you.',
                    'Dirigez-vous vers la sortie. Votre écho rejoue votre boucle précédente en même temps que vous.',
                  ),
          why: [el(exit)],
          at: [el(x)],
          play: run(p.slice(0, k)),
        };
      }
      const rec = plan();
      if (rec == null) return back;
      if (rec.length <= t)
        return {
          text: L(
            'That’s all your echo needs to do: once its recording ends, it stays on this square. End the run to start again alongside it.',
            'Votre écho n’a rien d’autre à faire : à la fin de l’enregistrement, il reste sur cette case. Finissez la boucle pour repartir avec lui.',
          ),
          at: [el(pos)],
          play: endRun,
        };
      const rest = rec.slice(t);
      // the plate this run is heading for next (where the echo will stop)
      const tr = track(room, rec, tracks)!;
      let goal = -1;
      for (let k = t + 1; k < tr.length && goal < 0; k++)
        if (plate[tr[k]] >= 0 && (k === tr.length - 1 || tr[k + 1] === tr[k])) goal = tr[k];
      if (rest[0] === 'w') {
        const n = waits(rest);
        const col = plate[pos] >= 0 ? colName(plate[pos]) : '';
        return {
          text:
            plate[pos] >= 0
              ? L(
                  `Stay on the ${col} plate for ${turns(n)}. Next run, your echo stands here on those same turns, holding the ${col} door open for you.`,
                  `Restez sur la plaque ${col} pendant ${turns(n)}. À la prochaine boucle, votre écho sera ici à ces mêmes tours et tiendra la porte ${col} ouverte pour vous.`,
                )
              : L(
                  `Wait ${turns(n)}: your echo copies this timing exactly, so it reaches the next plate just when you need it.`,
                  `Attendez ${turns(n)} : votre écho copiera ce minutage exactement et atteindra la prochaine plaque au bon moment.`,
                ),
          at: [el(pos)],
          play: run('w'.repeat(n)),
        };
      }
      let k = 1;
      while (k < rest.length && rest[k] !== 'w' && tr[t + k] !== goal) k++;
      const col = goal >= 0 ? colName(plate[goal]) : '';
      return {
        text:
          goal >= 0
            ? L(
                `Walk to the ${col} plate. Everything you do in this run, your echo repeats next run, turn for turn.`,
                `Marchez jusqu’à la plaque ${col}. Tout ce que vous faites dans cette boucle, votre écho le refera à la suivante, tour pour tour.`,
              )
            : L('Walk on: your echo will repeat this run turn for turn.', 'Continuez : votre écho refera cette boucle tour pour tour.'),
        why: goal >= 0 ? [el(goal)] : [],
        at: [el(tr[t + k])],
        play: run(rest.slice(0, k)),
      };
    };

    const keys = dpad(act, undefined, { label: L('Wait', 'Attendre'), onclick: () => act(4) });
    ctx.controls(endBtn, undoBtn(undo), restartBtn(reset));
    root.append(bar, grid, keys);
    render();

    return {
      snapshot: () => ({ r: runs, b: before }),
      check,
      hint,
      activate: draw,
      destroy: () => ro.disconnect(),
      onKey(e) {
        const k = keyDir(e);
        if (k != null) {
          act(k);
          return true;
        }
        if (e.key === ' ' || e.key === '.') {
          act(4);
          return true;
        }
        if (e.key === 'Enter' || e.key === 'e' || e.key === 'E') {
          endRun();
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
