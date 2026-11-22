import { L } from '../core/i18n';
import { byLevel, type Difficulty, type Hint, type PuzzleDef } from '../core/types';
import { board, btn, h, shake } from '../core/ui';
import { anim, baseSeed, GROW, int, isIntArr, keyDir, onSwipe, POP, subRng, type Dir } from './movekit/kit';
import { mergeAI } from './playkit/merge-ai';
import './merge.css';

/** Fill colour per exponent (2 = 2^1 …). Low values are tints so they stay readable in both themes. */
const TONES: Record<number, { c: string; lo?: boolean }> = {
  1: { c: 'color-mix(in srgb, var(--p4) 22%, var(--cell))', lo: true },
  2: { c: 'color-mix(in srgb, var(--p4) 48%, var(--cell))', lo: true },
  3: { c: 'var(--p4)' },
  4: { c: 'var(--p1)' },
  5: { c: 'var(--p7)' },
  6: { c: 'var(--p5)' },
  7: { c: 'var(--p2)' },
  8: { c: 'var(--p6)' },
  9: { c: 'var(--p3)' },
};

/** Slide a board in a direction. Pure: returns the new board, points gained and merged cell indexes. */
export function slideBoard(b: number[], n: number, dir: Dir) {
  const out = b.slice();
  const merged: number[] = [];
  let gained = 0;
  for (let line = 0; line < n; line++) {
    const idx: number[] = [];
    for (let k = 0; k < n; k++) {
      const p = dir === 0 || dir === 3 ? k : n - 1 - k;
      idx.push(dir === 0 || dir === 2 ? p * n + line : line * n + p);
    }
    const vals = idx.map((i) => b[i]).filter((v) => v);
    const res: number[] = [];
    for (let k = 0; k < vals.length; k++) {
      if (k + 1 < vals.length && vals[k] === vals[k + 1]) {
        res.push(vals[k] * 2);
        gained += vals[k] * 2;
        merged.push(idx[res.length - 1]);
        k++;
      } else res.push(vals[k]);
    }
    idx.forEach((i, k) => (out[i] = res[k] ?? 0));
  }
  const moved = out.some((v, i) => v !== b[i]);
  return { b: out, moved, gained, merged };
}

/** Best score per difficulty, kept on this device. */
const BEST_KEY = 'puzzle-feed:merge:best:v1';
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

export const canMove = (b: number[], n: number) =>
  b.some((v, i) => !v || (i % n < n - 1 && b[i + 1] === v) || (i + n < n * n && b[i + n] === v));

export const merge: PuzzleDef = {
  id: 'merge',
  get name() {
    return '2048';
  },
  category: 'numbers',
  get rules() {
    return L('Merge equal tiles. Reach the goal, then keep going.', 'Fusionnez les tuiles égales. Atteignez l’objectif, et plus.');
  },
  help: () => ({
    goal: L(
      'Slide the tiles to merge equal numbers and build the goal tile, from 64 on Easy up to 1024 on Master. Then keep going as long as you can for a higher score.',
      'Faites glisser les tuiles pour fusionner les nombres égaux et obtenir la tuile objectif, de 64 en Facile à 1024 en Maître. Continuez ensuite aussi longtemps que possible pour hausser votre pointage.',
    ),
    steps: [
      L(
        'Swipe on the board or press the arrow keys / WASD: every tile slides as far as it can that way.',
        'Balayez le plateau ou utilisez les touches fléchées / WASD : toutes les tuiles glissent le plus loin possible.',
      ),
      L(
        'Two equal tiles that meet merge into one worth double, and the sum is added to your score.',
        'Deux tuiles égales qui se rencontrent fusionnent en une seule de valeur double, ajoutée à votre pointage.',
      ),
      L('After each move, a new 2 or 4 appears in an empty cell.', 'Après chaque coup, un 2 ou un 4 apparaît dans une case vide.'),
      L(
        'If the board is full and nothing can merge, the game is over: lost before the goal tile, won after it.',
        'Si le plateau est plein et que rien ne peut fusionner, la partie se termine : perdue avant la tuile objectif, gagnée après.',
      ),
      L(
        'Once the goal is reached the game goes on: tap Finish to stop and keep your score.',
        'Une fois l’objectif atteint, la partie continue : touchez Terminer pour arrêter et garder votre pointage.',
      ),
    ],
    tips: [
      L(
        'Keep your biggest tile in a corner and build towards it.',
        'Gardez votre plus grosse tuile dans un coin et construisez vers elle.',
      ),
      L(
        'Mostly use two or three directions; avoid the one that pulls your big tile out of its corner.',
        'Jouez surtout dans deux ou trois directions; évitez celle qui sort votre grosse tuile de son coin.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [60, 120, 240, 480, 900]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const n = byLevel(d, [5, 4, 4, 4, 4]);
    const goal = byLevel(d, [64, 128, 256, 512, 1024]);
    const base = baseSeed(rng);
    let cells = new Array<number>(n * n).fill(0);
    let score = 0;
    let spawns = 0;
    let over = false;
    let reached = false;
    const prevBest = getBest(d);

    /** Spawn number k always lands on the same choice for the same board, so resumes replay exactly. */
    const spawn = (): number => {
      const empties = cells.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
      const r = subRng(base, spawns++);
      if (!empties.length) return -1;
      const at = empties[r.int(0, empties.length - 1)];
      cells[at] = r.chance(0.9) ? 2 : 4;
      return at;
    };

    const sv = ctx.saved as { cells?: unknown; score?: unknown; spawns?: unknown } | undefined;
    if (isIntArr(sv?.cells, n * n) && sv.cells.every((v) => v === 0 || (v >= 2 && (v & (v - 1)) === 0))) {
      cells = sv.cells.slice();
      score = int(sv.score, 0);
      spawns = int(sv.spawns, 2);
      reached = Math.max(...cells) >= goal;
    } else {
      spawn();
      spawn();
    }

    const finishBtn = btn(L('Finish', 'Terminer'), () => finish(), 'primary');
    finishBtn.title = L('End the game and keep your score', 'Terminer la partie et garder votre pointage');
    ctx.controls(finishBtn);
    const grid = board(n, n, 'merge-grid');
    const els = cells.map(() => {
      const el = h('div', { class: 'cell' });
      grid.append(el);
      return el;
    });
    const best = () => Math.max(...cells);
    const render = () => {
      cells.forEach((v, i) => {
        const el = els[i];
        if (!v) {
          el.className = 'cell';
          el.textContent = '';
          el.removeAttribute('style');
          return;
        }
        const e = Math.round(Math.log2(v));
        const t = TONES[e];
        const digits = String(v).length;
        el.className = `cell mg ${t ? (t.lo ? 'lo' : '') : 'top'} ${digits >= 3 ? `d${Math.min(digits, 5)}` : ''}`
          .replace(/\s+/g, ' ')
          .trim();
        el.textContent = String(v);
        if (t) el.setAttribute('style', `--c:${t.c}`);
        else el.removeAttribute('style');
      });
      finishBtn.hidden = over || !reached;
      if (over) return;
      const record = Math.max(prevBest, score);
      ctx.status(
        reached
          ? L(`Score ${score} · best ${record} · keep going!`, `Pointage ${score} · record ${record} · continuez!`)
          : L(`Score ${score} · goal ${goal}`, `Pointage ${score} · objectif ${goal}`),
      );
    };

    /** End the run: closes a solve already recorded at the goal (Finish, or stuck afterwards), or fails before it. */
    const finish = () => {
      if (over) return;
      over = true;
      putBest(d, score);
      render();
      const tail = score > prevBest && prevBest > 0 ? L(' · new best!', ' · nouveau record!') : '';
      if (reached) {
        ctx.status(L(`Final score ${score} · top tile ${best()}${tail}`, `Pointage final ${score} · plus grosse tuile ${best()}${tail}`));
        ctx.solved();
      } else {
        shake(grid);
        ctx.status(L(`No moves left · score ${score}`, `Plus aucun coup · pointage ${score}`));
        ctx.failed();
      }
    };

    const move = (dir: Dir) => {
      if (over) return;
      const res = slideBoard(cells, n, dir);
      if (!res.moved) {
        shake(grid);
        return;
      }
      ctx.touch();
      cells = res.b;
      score += res.gained;
      const born = spawn();
      render();
      for (const i of res.merged) anim(els[i], POP, 150);
      if (born >= 0) anim(els[born], GROW, 140);
      putBest(d, score);
      if (!reached && best() >= goal) {
        reached = true;
        render();
        anim(finishBtn, [{ transform: 'scale(1.15)' }, { transform: 'scale(1)' }], 320);
        // Record the solve (and its time) now; the run goes on until Finish or no move is left.
        ctx.solved({ keepPlaying: true });
      }
      if (!canMove(cells, n)) finish();
    };

    onSwipe(grid, move);
    root.append(grid);
    render();

    // ---- Guide ----
    const DIRS_EN = ['up', 'right', 'down', 'left'];
    const DIRS_FR = ['vers le haut', 'vers la droite', 'vers le bas', 'vers la gauche'];
    /** Where each tile goes in a slide: merges as [from, from, to], and plain moves as [from, to]. */
    const track = (dir: Dir) => {
      const merges: { a: number; b: number; to: number; v: number }[] = [];
      const moves: { from: number; to: number }[] = [];
      for (let line = 0; line < n; line++) {
        const idx: number[] = [];
        for (let k = 0; k < n; k++) {
          const p = dir === 0 || dir === 3 ? k : n - 1 - k;
          idx.push(dir === 0 || dir === 2 ? p * n + line : line * n + p);
        }
        const full = idx.filter((i) => cells[i]);
        let slot = 0;
        for (let k = 0; k < full.length; k++, slot++) {
          if (k + 1 < full.length && cells[full[k]] === cells[full[k + 1]]) {
            merges.push({ a: full[k], b: full[k + 1], to: idx[slot], v: cells[full[k]] * 2 });
            k++;
          } else moves.push({ from: full[k], to: idx[slot] });
        }
      }
      return { merges, moves };
    };
    const ai = mergeAI(n);
    /** The corner the guide builds in: the one holding the biggest tile (bottom-left until one does). */
    const corner = () => {
      const top = best();
      const corners = [(n - 1) * n, n * n - 1, 0, n - 1];
      const idx = corners.find((i) => cells[i] === top) ?? (n - 1) * n;
      const dirs: Dir[] = [idx >= n ? 2 : 0, idx % n ? 1 : 3];
      return { top, at: corners.includes(cells.lastIndexOf(top)) ? idx : cells.lastIndexOf(top), dirs, idx };
    };
    let lastKind = '';
    const hint = (): Hint | null => {
      if (over) return null;
      const cn = corner();
      const opts = ([0, 1, 2, 3] as Dir[])
        .map((dir) => {
          const res = slideBoard(cells, n, dir);
          const empty = res.b.filter((v) => !v).length;
          const keeps = res.b[cn.idx] >= cn.top;
          return { dir, res, empty, keeps, pref: cn.dirs.includes(dir) };
        })
        .filter((o) => o.res.moved);
      if (!opts.length) return null;
      const want = ai(cells);
      const pick = opts.find((o) => o.dir === want) ?? opts[0];
      const dir = pick.dir;
      const t = track(dir);
      const way = L(DIRS_EN[dir], DIRS_FR[dir]);
      const cornerName = L(
        `${cn.idx >= n ? 'bottom' : 'top'}-${cn.idx % n ? 'right' : 'left'}`,
        `en ${cn.idx >= n ? 'bas' : 'haut'} à ${cn.idx % n ? 'droite' : 'gauche'}`,
      );
      const big = t.merges.reduce((m, x) => (!m || x.v > m.v ? x : m), null as (typeof t.merges)[number] | null);
      const kinds: { kind: string; text: string; why: Element[]; at: Element[] }[] = [];
      const mergeEls = { why: t.merges.flatMap((m) => [els[m.a], els[m.b]]), at: t.merges.map((m) => els[m.to]) };
      if (spawns <= 2 && score === 0)
        kinds.push({
          kind: 'start',
          text: big
            ? L(
                `Swipe and every tile slides as far as it can. Slide ${way}: the two ${big.v / 2}s meet and merge into a ${big.v}.`,
                `Balayez et toutes les tuiles glissent le plus loin possible. Glissez ${way} : les deux ${big.v / 2} se rencontrent et fusionnent en un ${big.v}.`,
              )
            : L(
                `Swipe and every tile slides as far as it can. Slide ${way} to gather the tiles in the ${cornerName} corner; a new 2 or 4 then appears.`,
                `Balayez et toutes les tuiles glissent le plus loin possible. Glissez ${way} pour regrouper les tuiles dans le coin ${cornerName}; un nouveau 2 ou 4 apparaît ensuite.`,
              ),
          ...(big ? mergeEls : { why: [], at: t.moves.map((m) => els[m.to]) }),
        });
      if (big)
        kinds.push({
          kind: 'merge',
          text: L(
            `Equal tiles that meet merge into one worth double: sliding ${way} turns ${t.merges.length > 1 ? `${t.merges.length} pairs into bigger tiles, including two ${big.v / 2}s into a ${big.v}` : `these two ${big.v / 2}s into a ${big.v}`}.`,
            `Deux tuiles égales qui se rencontrent fusionnent en une tuile double : glisser ${way} ${t.merges.length > 1 ? `fusionne ${t.merges.length} paires, dont deux ${big.v / 2} en un ${big.v}` : `change ces deux ${big.v / 2} en un ${big.v}`}.`,
          ),
          ...mergeEls,
        });
      if (cn.top >= 8 && pick.pref && pick.keeps) {
        const other = L(DIRS_EN[cn.dirs.find((d2) => d2 !== dir)!], DIRS_FR[cn.dirs.find((d2) => d2 !== dir)!]);
        kinds.push({
          kind: 'corner',
          text: L(
            `Keep your biggest tile, the ${cn.top}, in the ${cornerName} corner: stick to sliding ${way} or ${other}, so it never gets pulled out.`,
            `Gardez votre plus grosse tuile, le ${cn.top}, dans le coin ${cornerName} : glissez surtout ${way} ou ${other}, pour qu’elle n’en sorte jamais.`,
          ),
          why: [els[cn.at]],
          at: [els[cn.idx]],
        });
      }
      if (!pick.pref)
        kinds.push({
          kind: 'detour',
          text: opts.some((o) => o.pref)
            ? L(
                `Slide ${way} this time: ${DIRS_EN[cn.dirs[0]]} or ${DIRS_EN[cn.dirs[1]]} would scatter the tiles you’ve lined up toward the ${cornerName} corner. Next move, push back toward the corner.`,
                `Glissez ${way} cette fois : ${DIRS_FR[cn.dirs[0]]} ou ${DIRS_FR[cn.dirs[1]]}, vous dérangeriez les tuiles alignées vers le coin ${cornerName}. Au prochain coup, revenez vers le coin.`,
              )
            : L(
                `Neither of your corner directions moves anything, so slide ${way}${pick.keeps ? `: the ${cn.top} stays put` : ''}. Next move, push back toward the corner.`,
                `Aucune des deux directions vers votre coin ne bouge rien : glissez ${way}${pick.keeps ? `; le ${cn.top} ne bouge pas` : ''}. Au prochain coup, revenez vers le coin.`,
              ),
          why: [els[cn.at]],
          at: t.moves.length ? t.moves.map((m) => els[m.to]) : mergeEls.at,
        });
      // No merge now, but the slide lines up equal tiles for the next move.
      if (!big) {
        const b2 = pick.res.b;
        let pair: [number, number] | null = null;
        for (let i = 0; i < n * n && !pair; i++)
          for (const j of [i % n < n - 1 ? i + 1 : -1, i + n < n * n ? i + n : -1])
            if (j >= 0 && b2[i] && b2[i] === b2[j] && !(cells[i] === b2[i] && cells[j] === b2[j])) {
              pair = [i, j];
              break;
            }
        if (pair)
          kinds.push({
            kind: 'setup',
            text: L(
              `Nothing merges yet, but sliding ${way} brings two ${b2[pair[0]]}s side by side, ready to merge on the next move.`,
              `Rien ne fusionne encore, mais glisser ${way} place deux ${b2[pair[0]]} côte à côte, prêts à fusionner au prochain coup.`,
            ),
            why: t.moves.filter((m) => m.to === pair[0] || m.to === pair[1]).map((m) => els[m.from]),
            at: pair.map((x) => els[x]),
          });
      }
      kinds.push({
        kind: 'space',
        text: L(
          `Each move adds a new 2 or 4, so free space matters: sliding ${way} leaves ${pick.empty} empty cell${pick.empty === 1 ? '' : 's'}${cn.top >= 8 && pick.keeps ? ` and keeps the ${cn.top} in its corner` : ''}.`,
          `Chaque coup ajoute un 2 ou un 4 : l’espace libre compte. Glisser ${way} laisse ${pick.empty} case${pick.empty > 1 ? 's' : ''} vide${pick.empty > 1 ? 's' : ''}${cn.top >= 8 && pick.keeps ? ` et garde le ${cn.top} dans son coin` : ''}.`,
        ),
        ...(big ? mergeEls : { why: [], at: t.moves.filter((m) => m.from !== m.to).map((m) => els[m.to]) }),
      });
      const k = kinds.find((x) => x.kind !== lastKind) ?? kinds[0];
      lastKind = k.kind;
      return { text: k.text, why: k.why, at: k.at.length ? k.at : [els[cn.at]], play: () => move(dir) };
    };

    return {
      snapshot: () => ({ cells, score, spawns }),
      hint,
      onKey(e) {
        const k = keyDir(e);
        if (k == null) return false;
        move(k);
        return true;
      },
    };
  },
};
