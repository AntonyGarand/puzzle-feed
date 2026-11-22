import { L, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, h } from '../core/ui';
import { nb8 } from './logickit/kit';
import { flood, genMines, mineCounts } from './logickit/minesgen';
import { wrongFlag } from './sweepkit/check';
import './mines.css';

export const mines: PuzzleDef = {
  id: 'mines',
  get name() {
    return L('Mines', 'Démineur');
  },
  category: 'logic',
  get rules() {
    return L('Open every safe tile. Numbers count mines around.', 'Ouvrez toutes les cases sûres. Un chiffre = mines autour.');
  },
  help: () => ({
    goal: L(
      'Open every tile that doesn’t hide a mine. Numbers tell you how many mines touch each tile.',
      'Ouvrez toutes les cases qui ne cachent pas de mine. Les chiffres indiquent combien de mines touchent chaque case.',
    ),
    steps: [
      L(
        'Tap a tile to open it. Your first tap is always safe.',
        'Touchez une case pour l’ouvrir. Votre première case est toujours sans danger.',
      ),
      L(
        'A number counts the mines in the 8 tiles around it. Opening a mine ends the game.',
        'Un chiffre compte les mines dans les 8 cases autour. Ouvrir une mine met fin à la partie.',
      ),
      L(
        'Long-press a closed tile (or right-click it) to plant or remove a flag where you think a mine is.',
        'Appuyez longuement sur une case fermée (ou cliquez droit) pour poser ou retirer un drapeau là où vous croyez qu’il y a une mine.',
      ),
      L(
        'Tap an open number whose mines are all flagged to open the rest of its neighbours at once.',
        'Touchez un chiffre ouvert dont toutes les mines sont marquées pour ouvrir ses autres voisines d’un coup.',
      ),
      L('Keyboard: Tab to a tile, Enter opens it, F flags it.', 'Au clavier : Tab va à une case, Entrée l’ouvre, F y pose un drapeau.'),
    ],
    tips: [
      L(
        'If a number has as many closed neighbours as its value, they are all mines.',
        'Si un chiffre a autant de voisines fermées que sa valeur, ce sont toutes des mines.',
      ),
      L(
        'If a number already has all its flags, its other neighbours are safe. No guessing is ever needed.',
        'Si un chiffre a déjà tous ses drapeaux, ses autres voisines sont sûres. Vous n’avez jamais à deviner.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [30, 60, 100, 160, 240]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const cols = byLevel(d, [8, 9, 9, 10, 10]);
    const rows = byLevel(d, [8, 9, 11, 12, 13]);
    let total = byLevel(d, [9, 13, 18, 23, 28]);
    const N = cols * rows;

    // Mines are generated lazily on the first dig, from the untouched rng, so resume can rebuild them.
    let first = -1;
    let mine: boolean[] = new Array<boolean>(N).fill(false);
    let count: number[] = new Array<number>(N).fill(0);
    const open = new Array<boolean>(N).fill(false);
    const flag = new Array<boolean>(N).fill(false);
    let over: 'won' | 'lost' | null = null;
    let hit = -1;

    const grid = board(cols, rows, 'lk-mines');
    const cells = Array.from({ length: N }, (_, i) => {
      const el = h('button', { type: 'button', class: 'cell', 'data-i': i, onclick: () => tap(i) });
      grid.append(el);
      return el;
    });

    const lay = (i: number) => {
      first = i;
      mine = genMines(cols, rows, total, i, rng);
      total = mine.filter(Boolean).length; // the generator may drop a mine to avoid a forced guess
      count = mineCounts(mine, cols, rows);
    };

    const render = () => {
      cells.forEach((el, i) => {
        const cls = ['cell'];
        let txt = '';
        if (open[i]) {
          cls.push('open');
          if (count[i]) {
            cls.push(`m${count[i]}`);
            txt = String(count[i]);
          }
        } else if (over === 'lost' && mine[i]) {
          cls.push('mine');
          if (i === hit) cls.push('err');
        } else if (flag[i]) {
          cls.push(over === 'lost' && !mine[i] ? 'x' : 'flag');
        }
        el.className = cls.join(' ');
        if (el.textContent !== txt) el.textContent = txt;
      });
      const flags = flag.filter(Boolean).length;
      ctx.status(
        first < 0
          ? `${P(total, ['mine', 'mines'], ['mine', 'mines'])} · ${L('tap any tile', 'touchez une case')}`
          : P(total - flags, ['mine left', 'mines left'], ['mine restante', 'mines restantes']),
      );
    };

    const won = () => open.filter(Boolean).length === N - total;

    const boom = (i: number) => {
      over = 'lost';
      hit = i;
      render();
      ctx.failed();
    };

    const dig = (i: number) => {
      if (flag[i]) return;
      if (first < 0) lay(i);
      if (open[i]) {
        // Chord: open the rest once enough flags surround a number.
        const nb = nb8(i, cols, rows);
        if (!count[i] || nb.filter((j) => flag[j]).length !== count[i]) return;
        const bad = nb.find((j) => !flag[j] && !open[j] && mine[j]);
        if (bad != null) return boom(bad);
        for (const j of nb) if (!flag[j]) flood(j, open, mine, count, cols, rows);
      } else if (mine[i]) {
        return boom(i);
      } else {
        flood(i, open, mine, count, cols, rows);
      }
      for (let k = 0; k < N; k++) if (open[k]) flag[k] = false;
      if (won()) {
        over = 'won';
        mine.forEach((m, k) => (flag[k] = m));
        render();
        ctx.solved();
        return;
      }
      render();
    };

    const toggleFlag = (i: number) => {
      if (over || open[i]) return;
      ctx.touch();
      flag[i] = !flag[i];
      render();
    };

    // Long-press / right-click flags.
    let pressTimer = 0,
      pressCell = -1,
      px = 0,
      py = 0,
      suppress = false;
    const cellOf = (target: EventTarget | null) => {
      const t = (target as Element | null)?.closest?.('[data-i]') as HTMLElement | null;
      return t && grid.contains(t) ? Number(t.dataset.i) : -1;
    };
    const cancelPress = () => {
      clearTimeout(pressTimer);
      pressTimer = 0;
      if (pressCell >= 0) cells[pressCell]?.classList.remove('lp');
    };
    grid.addEventListener('pointerdown', (e) => {
      suppress = false;
      cancelPress();
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pressCell = cellOf(e.target);
      px = e.clientX;
      py = e.clientY;
      if (pressCell < 0 || over || open[pressCell]) return;
      // Progress hint while holding (transient class, gone before the next render/snapshot).
      cells[pressCell].classList.add('lp');
      pressTimer = window.setTimeout(() => {
        pressTimer = 0;
        cells[pressCell].classList.remove('lp');
        if (over || open[pressCell]) return;
        suppress = true;
        toggleFlag(pressCell);
        try {
          navigator.vibrate?.(15);
        } catch {
          /* not allowed */
        }
      }, 350);
    });
    grid.addEventListener('pointermove', (e) => {
      if (pressTimer && Math.hypot(e.clientX - px, e.clientY - py) > 10) cancelPress();
    });
    grid.addEventListener('pointerup', cancelPress);
    grid.addEventListener('pointercancel', cancelPress);
    grid.addEventListener('pointerleave', cancelPress);
    grid.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      cancelPress();
      if (suppress) return;
      const i = cellOf(e.target);
      if (i >= 0) toggleFlag(i);
    });

    const tap = (i: number) => {
      if (suppress) {
        suppress = false;
        return;
      }
      if (over) return;
      ctx.touch();
      dig(i);
    };

    const sv = ctx.saved as { first?: unknown; open?: unknown; flag?: unknown } | undefined;
    if (sv && typeof sv.first === 'number' && Number.isInteger(sv.first) && sv.first >= 0 && sv.first < N) {
      lay(sv.first);
      const idx = (v: unknown) => (Array.isArray(v) ? v.filter((k): k is number => Number.isInteger(k) && k >= 0 && k < N) : []);
      for (const k of idx(sv.open)) if (!mine[k]) open[k] = true;
      for (const k of idx(sv.flag)) if (!open[k]) flag[k] = true;
    }
    root.append(grid);
    render();

    let lastRule = -1;
    /** The next deduction a person can make, for the guide. Flags are taken as given. */
    const hint = (): Hint | null => {
      if (over) return null;
      if (first < 0) {
        const mid = Math.floor(rows / 2) * cols + Math.floor(cols / 2);
        return {
          text: L(
            'Start anywhere: the first tile is always safe, and a blank tile opens the area around it.',
            'Commencez n’importe où : la première case est toujours sûre, et une case vide ouvre la zone autour.',
          ),
          at: [cells[mid]],
          play: () => dig(mid),
        };
      }
      const cons: { i: number; unk: number[]; flags: number[]; m: number }[] = [];
      for (let i = 0; i < N; i++) {
        if (!open[i] || !count[i]) continue;
        const nb = nb8(i, cols, rows);
        const unk = nb.filter((j) => !open[j] && !flag[j]);
        if (!unk.length) continue;
        const flags = nb.filter((j) => flag[j]);
        cons.push({ i, unk, flags, m: count[i] - flags.length });
      }
      const els = (ix: number[]) => ix.map((j) => cells[j]);
      const openAll = (ix: number[]) => () => ix.forEach((j) => !open[j] && dig(j));
      const flagAll = (ix: number[]) => () => ix.forEach((j) => !flag[j] && toggleFlag(j));
      // Rules, simplest first; the guide avoids repeating the same rule twice in a row when it can.
      const mineRule = (): Hint | null => {
        // A number with as many closed tiles as missing mines: they're all mines.
        for (const c of cons)
          if (c.m === c.unk.length)
            return {
              text: L(
                `This ${count[c.i]} touches exactly ${c.unk.length === 1 ? 'one closed tile' : `${c.unk.length} closed tiles`}${c.flags.length ? ' besides its flags' : ''}, so ${c.unk.length === 1 ? 'it must be a mine' : 'they must all be mines'}. Flag ${c.unk.length === 1 ? 'it' : 'them'}.`,
                `Ce ${count[c.i]} touche exactement ${c.unk.length === 1 ? 'une case fermée' : `${c.unk.length} cases fermées`}${c.flags.length ? ' en plus de ses drapeaux' : ''} : ${c.unk.length === 1 ? 'c’est forcément une mine' : 'ce sont toutes des mines'}. Posez ${c.unk.length === 1 ? 'un drapeau' : 'des drapeaux'}.`,
              ),
              why: els([c.i]),
              at: els(c.unk),
              play: flagAll(c.unk),
            };
        return null;
      };
      const safe = (): Hint | null => {
        // A number whose mines are all flagged: the rest is safe.
        for (const c of cons)
          if (c.m === 0)
            return {
              text: L(
                `This ${count[c.i]} already has its ${c.flags.length === 1 ? 'mine flagged' : `${c.flags.length} mines flagged`}, so every other tile around it is safe to open.`,
                `Ce ${count[c.i]} a déjà ${c.flags.length === 1 ? 'sa mine marquée' : `ses ${c.flags.length} mines marquées`} : toutes les autres cases autour peuvent être ouvertes.`,
              ),
              why: els([c.i, ...c.flags]),
              at: els(c.unk),
              play: openAll(c.unk),
            };
        return null;
      };
      const shared = (): Hint | null => {
        // Two numbers sharing tiles: the difference tells the rest.
        for (const a of cons)
          for (const b of cons) {
            if (a === b || a.unk.length >= b.unk.length || !a.unk.every((x) => b.unk.includes(x))) continue;
            const rest = b.unk.filter((x) => !a.unk.includes(x));
            const m = b.m - a.m;
            if (m === 0)
              return {
                text: L(
                  `The ${count[a.i]}’s ${a.m === 1 ? 'mine is' : `${a.m} mines are`} among the tiles it shares with this ${count[b.i]}, which needs no more than that, so its other tiles are safe.`,
                  `${a.m === 1 ? 'La mine' : `Les ${a.m} mines`} du ${count[a.i]} ${a.m === 1 ? 'est' : 'sont'} dans les cases qu’il partage avec ce ${count[b.i]}, qui n’en demande pas plus : ses autres cases sont sûres.`,
                ),
                why: els([a.i, b.i, ...a.unk]),
                at: els(rest),
                play: openAll(rest),
              };
            if (m === rest.length)
              return {
                text: L(
                  `The ${count[a.i]} can put at most ${a.m} mine${a.m === 1 ? '' : 's'} in the tiles it shares with this ${count[b.i]}, so the ${count[b.i]}’s other ${rest.length === 1 ? 'tile is a mine' : `${rest.length} tiles are mines`}.`,
                  `Le ${count[a.i]} met au plus ${a.m} mine${a.m === 1 ? '' : 's'} dans les cases partagées avec ce ${count[b.i]} : ${rest.length === 1 ? 'l’autre case du ' + count[b.i] + ' est une mine' : `les ${rest.length} autres cases du ${count[b.i]} sont des mines`}.`,
                ),
                why: els([a.i, b.i, ...a.unk]),
                at: els(rest),
                play: flagAll(rest),
              };
          }
        return null;
      };
      const rules = [mineRule, safe, shared];
      // The rule functions are rebuilt on every call, so remember the last one by index.
      for (const k of [0, 1, 2].filter((r) => r !== lastRule).concat(lastRule < 0 ? [] : [lastRule])) {
        const found = rules[k]();
        if (found) {
          lastRule = k;
          return found;
        }
      }
      // Counting what's left.
      const unknown = [...Array(N).keys()].filter((i) => !open[i] && !flag[i]);
      const left = total - flag.filter(Boolean).length;
      if (unknown.length && (left === 0 || left === unknown.length))
        return {
          text:
            left === 0
              ? L(
                  'Every mine is flagged, so all the remaining tiles are safe.',
                  'Toutes les mines sont marquées : les cases restantes sont sûres.',
                )
              : L(
                  'Only as many closed tiles as mines are left: they are all mines.',
                  'Il reste autant de cases fermées que de mines : ce sont toutes des mines.',
                ),
          at: els(unknown),
          play: left === 0 ? openAll(unknown) : flagAll(unknown),
        };
      return null;
    };

    // Mines is partly luck, so check() only covers flags: one on a tile without a mine is a mistake.
    const nbAll = Array.from({ length: N }, (_, i) => nb8(i, cols, rows));
    const check = (): Hint | null =>
      over || first < 0
        ? null
        : wrongFlag({ flag, mine, count, nbs: nbAll, cells, open: (i) => open[i], name: (i) => String(count[i]), unflag: toggleFlag });

    const list = (a: boolean[]) => a.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    return {
      snapshot: () => ({ first, open: list(open), flag: list(flag) }),
      hint,
      check,
      onKey(e) {
        if (e.key !== 'f' && e.key !== 'F') return false;
        const i = cellOf(document.activeElement);
        if (i >= 0) toggleFlag(i);
        return i >= 0;
      },
      destroy: cancelPress,
    };
  },
};
