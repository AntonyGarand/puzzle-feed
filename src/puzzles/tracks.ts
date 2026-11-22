import { L, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, clearBtn, countClue, h, s, setCountClue } from '../core/ui';
import { solveTracks, tracksDead, type TracksSolve } from './pathkit/tracks-solve';
import { adjacent, capture, cellAt, stepsToward } from './pathkit/grid';
import { genTracks } from './pathkit/tracks-gen';
import './tracks.css';

export const tracks: PuzzleDef = {
  id: 'tracks',
  get name() {
    return L('Tracks', 'Tracé');
  },
  category: 'paths',
  undo: true,
  get rules() {
    return L('Draw A to B. Edge numbers count path cells per line.', 'Tracez de A à B. Les chiffres comptent les cases par ligne.');
  },
  help: () => ({
    goal: L(
      'Draw one track from A to B. The numbers around the grid say how many track cells each row and column must hold.',
      'Tracez un seul chemin de A à B. Les chiffres autour de la grille indiquent combien de cases du tracé compte chaque rangée et chaque colonne.',
    ),
    steps: [
      L(
        'Drag from A (or from the end of your track) through neighbouring cells to lay track.',
        'Glissez à partir de A (ou du bout de votre tracé) de case voisine en case voisine.',
      ),
      L(
        'The track can’t cross itself or branch, and it stops once it reaches B.',
        'Le tracé ne peut ni se croiser ni bifurquer, et il s’arrête en atteignant B.',
      ),
      L('Cells with a small square must be on the track.', 'Les cases marquées d’un petit carré doivent faire partie du tracé.'),
      L(
        'A number fades when its line is right and turns red when it has too many cells.',
        'Un chiffre pâlit quand sa ligne est juste et devient rouge si elle a trop de cases.',
      ),
      L(
        'Tap a cell on your track to cut it back there. Clear restarts from A.',
        'Touchez une case du tracé pour le couper à cet endroit. Effacer repart de A.',
      ),
    ],
    tips: [
      L(
        'A 0 means the track never enters that line; a number equal to the grid size means the whole line is used.',
        'Un 0 veut dire que le tracé n’entre jamais dans cette ligne; un chiffre égal à la taille de la grille, qu’elle est remplie au complet.',
      ),
      L(
        'Plan how to pass through the marked cells before you start drawing.',
        'Prévoyez comment passer par les cases marquées avant de tracer.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [35, 60, 90, 140, 210]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const pz = genTracks(rng, d);
    const { n, a, b, exitSide } = pz;
    const N = n * n;
    const given = new Set(pz.givens);
    const trail: number[] = [a];

    const colEls = pz.colCounts.map((v) => countClue('clue', v));
    const rowEls = pz.rowCounts.map((v) => countClue('clue', v));
    const grid = board(n, n, 'tracks-grid');
    const cells = Array.from({ length: N }, (_, i) => {
      const el = h('div', { class: 'cell', 'data-i': i }, i === a ? 'A' : i === b ? 'B' : '');
      grid.append(el);
      return el;
    });
    const svg = s('svg', { class: 'tracks-line', viewBox: `0 0 ${n} ${n}`, 'aria-hidden': 'true' });
    const under = s('polyline', { class: 'under' });
    const over = s('polyline', { class: 'over' });
    svg.append(under, over);
    grid.append(svg);
    const wrap = h(
      'div',
      { class: 'tracks-wrap', style: `--cols:${n}` },
      h('div', { class: 'corner' }),
      h('div', { class: 'cols' }, ...colEls),
      h('div', { class: 'rows' }, ...rowEls),
      grid,
    );

    const xy = (i: number) => [(i % n) + 0.5, Math.floor(i / n) + 0.5];
    let finished = false;
    const render = () => {
      const on = new Set(trail);
      cells.forEach((el, i) => {
        el.className = `cell${on.has(i) ? ' on' : ''}${given.has(i) ? ' given' : ''}${i === a || i === b ? ' end' : ''}`;
      });
      const rc = new Array<number>(n).fill(0),
        cc = new Array<number>(n).fill(0);
      for (const i of trail) {
        rc[Math.floor(i / n)]++;
        cc[i % n]++;
      }
      let ok = true;
      const mark = (el: HTMLElement, have: number, want: number) => {
        ok = setCountClue(el, have, want) && ok;
      };
      rowEls.forEach((el, r) => mark(el, rc[r], pz.rowCounts[r]));
      colEls.forEach((el, c) => mark(el, cc[c], pz.colCounts[c]));
      const ptsList = trail.map(xy);
      ptsList.unshift([0, Math.floor(a / n) + 0.5]);
      const atB = trail[trail.length - 1] === b;
      if (atB) ptsList.push(exitSide === 'bottom' ? [(b % n) + 0.5, n] : [n, Math.floor(b / n) + 0.5]);
      const str = ptsList.map((p) => p.join(',')).join(' ');
      under.setAttribute('points', str);
      over.setAttribute('points', str);
      const missing = pz.givens.filter((g) => !on.has(g)).length;
      const len = trail.length;
      ctx.status(
        atB
          ? ok && !missing
            ? L('Done!', 'Terminé!')
            : missing
              ? P(missing, ['marked cell missed', 'marked cells missed'], ['case marquée oubliée', 'cases marquées oubliées'])
              : L('Counts don’t match', 'Les chiffres ne collent pas')
          : P(len, ['cell', 'cells'], ['case', 'cases']),
      );
      return atB && ok && !missing;
    };
    const check = () => {
      if (render() && !finished) {
        finished = true;
        drawing = false;
        ctx.solved();
      }
    };

    // ---- drawing (a trail that always starts at A) ----
    let drawing = false;
    const tryAdd = (j: number) => {
      const last = trail[trail.length - 1];
      if (last === b || trail.includes(j) || !adjacent(last, j, n)) return false;
      trail.push(j);
      return true;
    };
    const dragTo = (j: number) => {
      if (!drawing || j < 0) return;
      for (let guard = 0; guard < N; guard++) {
        const last = trail[trail.length - 1];
        if (j === last) break;
        const at = trail.indexOf(j);
        if (at >= 0) {
          trail.length = at + 1;
          break;
        }
        if (!stepsToward(last, j, n).some(tryAdd)) break;
      }
      check();
    };
    /** Press on cell i: cut the trail back to it, or start extending from the end. */
    const press = (i: number) => {
      if (finished || i < 0) return false;
      const at = trail.indexOf(i);
      if (at >= 0) trail.length = at + 1;
      else if (!adjacent(trail[trail.length - 1], i, n)) return false;
      ctx.touch();
      drawing = true;
      return true;
    };
    grid.addEventListener('pointerdown', (e) => {
      const i = cellAt(grid, n, n, e.clientX, e.clientY);
      if (!press(i)) return;
      capture(grid, e.pointerId);
      e.preventDefault();
      dragTo(i);
      check();
    });
    grid.addEventListener('pointermove', (e) => dragTo(cellAt(grid, n, n, e.clientX, e.clientY)));
    const end = () => (drawing = false);
    grid.addEventListener('pointerup', end);
    grid.addEventListener('pointercancel', end);

    ctx.controls(
      clearBtn(() => {
        if (finished) return;
        trail.length = 1;
        render();
      }),
    );

    const sv = ctx.saved as { trail?: unknown } | undefined;
    if (Array.isArray(sv?.trail) && sv.trail[0] === a) {
      const t = sv.trail as number[];
      const seen = new Set<number>();
      const ok = t.every(
        (v, i) =>
          Number.isInteger(v) &&
          v >= 0 &&
          v < N &&
          !seen.has(v) &&
          (seen.add(v), i === 0 || adjacent(t[i - 1], v, n)) &&
          (v !== b || i === t.length - 1),
      );
      if (ok) trail.splice(0, trail.length, ...t);
    }
    root.append(wrap);
    render();

    // ---- guide: lay the solution one straight run at a time, explained from the edge counts ----
    const rowOf = (i: number) => Math.floor(i / n);
    const colOf = (i: number) => i % n;
    let lastReason = '';
    const R = { n, b, rowCounts: pz.rowCounts, colCounts: pz.colCounts, givens: pz.givens };
    const BUDGET = 2000;
    /** Solver result for the current trail, kept while the trail follows it. */
    let memo: (TracksSolve & { key: string }) | null = null;
    const solveHere = (): TracksSolve => {
      if (memo?.path && trail.every((c, k) => memo!.path![k] === c)) return memo;
      const key = trail.join(',');
      if (memo?.key !== key) memo = { key, ...solveTracks(R, trail, BUDGET, pz.path) };
      return memo;
    };
    const cutTo = (i: number) => {
      press(i);
      dragTo(i);
      drawing = false;
    };
    /** A trail that can't be finished any more: say why, and cut it back to where it still can. */
    const checkHint = (): Hint | null => {
      if (finished) return null;
      let k0 = 0;
      while (k0 < trail.length && trail[k0] === pz.path[k0]) k0++;
      if (k0 === trail.length) return null;
      const res = solveHere();
      if (res.path || res.capped) return null;
      let k = trail.length - 1;
      const t0 = performance.now();
      while (k > k0 && (performance.now() - t0 > 25 || !solveTracks(R, trail.slice(0, k), BUDGET, pz.path).path)) k--;
      const dead = tracksDead(R, trail);
      const lineEl = (row: boolean, l: number) => (row ? rowEls[l] : colEls[l]);
      const name = (row: boolean, l: number) => L(`${row ? 'Row' : 'Column'} ${l + 1}`, `${row ? 'La rangée' : 'La colonne'} ${l + 1}`);
      const atB = trail[trail.length - 1] === b;
      let text: string;
      let why: Element[] = [];
      if (!dead)
        text = L(
          'This track leads to a dead end: no way to match every count from here.',
          'Ce tracé mène à une impasse : impossible de respecter tous les chiffres d’ici.',
        );
      else if (dead.kind === 'over') {
        text = L(
          `${name(dead.row, dead.line)} needs ${dead.want} track cells, but the track has ${dead.have} in it.`,
          `${name(dead.row, dead.line)} demande ${dead.want} cases, mais le tracé en a ${dead.have}.`,
        );
        why = [lineEl(dead.row, dead.line)];
      } else if (dead.kind === 'short') {
        text = atB
          ? L(
              `The track reached B, but ${name(dead.row, dead.line).toLowerCase()} has only ${dead.have} of its ${dead.want} cells.`,
              `Le tracé a atteint B, mais ${name(dead.row, dead.line).toLowerCase()} n’a que ${dead.have} de ses ${dead.want} cases.`,
            )
          : L(
              `${name(dead.row, dead.line)} needs ${dead.want} cells, but the track can no longer reach enough of them.`,
              `${name(dead.row, dead.line)} demande ${dead.want} cases, mais le tracé ne peut plus en atteindre assez.`,
            );
        why = [lineEl(dead.row, dead.line)];
      } else {
        const toB = dead.cells.includes(b);
        text = atB
          ? L('The track reached B without passing through this marked cell.', 'Le tracé a atteint B sans passer par cette case marquée.')
          : toB
            ? L(
                'The track can no longer reach B: full rows and columns wall it off.',
                'Le tracé ne peut plus atteindre B : des rangées et des colonnes pleines le bloquent.',
              )
            : L(
                'The track can no longer reach this marked cell: full rows and columns wall it off.',
                'Le tracé ne peut plus atteindre cette case marquée : des rangées et des colonnes pleines le bloquent.',
              );
        why = (toB ? [b] : dead.cells).map((i) => cells[i]);
      }
      const back = trail[k - 1];
      return {
        kind: 'fix',
        text: `${text} ${L('Cut it back.', 'Coupez-le.')}`,
        why,
        at: trail.slice(k).map((i) => cells[i]),
        action: L('Cut it back', 'Le couper'),
        play: () => cutTo(back),
      };
    };
    const hint = (): Hint | null => {
      if (finished) return null;
      const sol = solveHere().path ?? pz.path;
      let k = 0;
      while (k < trail.length && trail[k] === sol[k]) k++;
      if (k < trail.length) {
        const back = sol[k - 1];
        return {
          text: L(
            'This part of the track leads nowhere useful. Tap a cell on the track to cut it back there.',
            'Ce bout de tracé ne mène nulle part. Touchez une case du tracé pour le couper à cet endroit.',
          ),
          why: trail.slice(k).map((i) => cells[i]),
          at: [cells[back]],
          play: () => cutTo(back),
        };
      }
      const from = sol[k - 1];
      const dir = sol[k] - from;
      const seg: number[] = [];
      for (let j = k; j < sol.length; j++) {
        if (sol[j] - sol[j - 1] !== dir) break;
        seg.push(sol[j]);
      }
      const tail = seg[seg.length - 1];
      const horiz = Math.abs(dir) === 1;
      const rc = new Array<number>(n).fill(0),
        cc = new Array<number>(n).fill(0);
      for (const i of [...trail, ...seg]) {
        rc[rowOf(i)]++;
        cc[colOf(i)]++;
      }
      const dirEn = dir === 1 ? 'right' : dir === -1 ? 'left' : dir > 0 ? 'down' : 'up';
      const dirFr = dir === 1 ? 'vers la droite' : dir === -1 ? 'vers la gauche' : dir > 0 ? 'vers le bas' : 'vers le haut';
      const play = () => {
        press(from);
        for (const i of seg) dragTo(i);
        drawing = false;
      };
      const at = seg.map((i) => cells[i]);
      const reasons: [string, Hint][] = [];
      const g = seg.find((i) => given.has(i));
      if (g != null)
        reasons.push([
          'given',
          {
            text: L(
              `Cells with a small square must be on the track: run ${dirEn} through this one.`,
              `Les cases marquées d’un petit carré font partie du tracé : passez ${dirFr} par celle-ci.`,
            ),
            why: [cells[g]],
            at,
            play,
          },
        ]);
      // The line we run along fills up: the track has to turn out of it.
      const line = horiz ? rowOf(tail) : colOf(tail);
      const have = horiz ? rc[line] : cc[line];
      const want = horiz ? pz.rowCounts[line] : pz.colCounts[line];
      const lineEl = horiz ? rowEls[line] : colEls[line];
      const lineEn = `${horiz ? 'Row' : 'Column'} ${line + 1}`;
      const lineFr = `${horiz ? 'La rangée' : 'La colonne'} ${line + 1}`;
      if (tail === b)
        reasons.unshift([
          'b',
          {
            text: L(
              `${lineEn} needs ${want}: run ${dirEn} into B to finish the track.`,
              `${lineFr} demande ${want} : allez ${dirFr} jusqu’à B pour terminer le tracé.`,
            ),
            why: [lineEl],
            at,
            play,
          },
        ]);
      if (tail !== b && have === want && seg.length > 1)
        reasons.push([
          'full',
          {
            text: L(
              `${lineEn} needs ${want} track cells: run ${dirEn} to fill them, then turn out of it.`,
              `${lineFr} demande ${want} cases : avancez ${dirFr} pour les remplir, puis sortez-en.`,
            ),
            why: [lineEl],
            at,
            play,
          },
        ]);
      // The cell straight ahead is off-limits: wall, or a crossing line that's already full.
      const ahead = tail + dir;
      const wall = horiz ? ahead < 0 || rowOf(ahead) !== rowOf(tail) : ahead < 0 || ahead >= N;
      if (tail !== b && !wall) {
        const cross = horiz ? colOf(ahead) : rowOf(ahead);
        const cHave = horiz ? cc[cross] : rc[cross];
        const cWant = horiz ? pz.colCounts[cross] : pz.rowCounts[cross];
        const cEl = horiz ? colEls[cross] : rowEls[cross];
        const cEn = `${horiz ? 'Column' : 'Row'} ${cross + 1}`;
        const cFr = `${horiz ? 'colonne' : 'rangée'} ${cross + 1}`;
        if (cHave >= cWant)
          reasons.push([
            'blocked',
            {
              text:
                cWant === 0
                  ? L(
                      `${cEn} shows 0: the track never enters it. Go ${dirEn} up to it, then turn.`,
                      `La ${cFr} affiche 0 : le tracé n’y entre jamais. Allez ${dirFr} jusqu’à elle, puis tournez.`,
                    )
                  : L(
                      `${cEn} wants ${cWant} and this run brings it to ${cWant}, so the track turns before going further.`,
                      `La ${cFr} demande ${cWant} et ce trajet l’amène à ${cWant} : le tracé tourne avant d’aller plus loin.`,
                    ),
              why: [cEl],
              at,
              play,
            },
          ]);
      } else if (tail !== b && wall && seg.length > 1)
        reasons.push([
          'wall',
          {
            text: L(
              `Run ${dirEn} to the edge of the grid; there the track has to turn.`,
              `Allez ${dirFr} jusqu’au bord de la grille; le tracé doit y tourner.`,
            ),
            why: [lineEl],
            at,
            play,
          },
        ]);
      const pick = reasons.find(([r]) => r !== lastReason) ?? reasons[0];
      if (pick) {
        lastReason = pick[0];
        return pick[1];
      }
      lastReason = 'count';
      const left = want - have + seg.length;
      return {
        text:
          k === 1
            ? L(
                `The track enters at A. ${lineEn} needs ${want} cells: start ${dirEn} from A.`,
                `Le tracé entre par A. ${lineFr} demande ${want} cases : partez ${dirFr} à partir de A.`,
              )
            : L(
                `${lineEn} still needs ${P(left, ['cell', 'cells'], ['case', 'cases'])}: go ${dirEn}, keeping the other counts in check.`,
                `${lineFr} demande encore ${P(left, ['cell', 'cells'], ['case', 'cases'])} : allez ${dirFr} en surveillant les autres chiffres.`,
              ),
        why: k === 1 ? [cells[a], lineEl] : [lineEl],
        at,
        play,
      };
    };
    return { hint, check: checkHint, snapshot: () => ({ trail }) };
  },
};
