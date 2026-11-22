import { L, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, clearBtn, h, ruleBreaks } from '../core/ui';
import './queens.css';

function allSolutions(n: number): number[][] {
  const out: number[][] = [];
  const cols: number[] = [];
  const rec = (r: number) => {
    if (r === n) {
      out.push([...cols]);
      return;
    }
    for (let c = 0; c < n; c++) {
      if (cols.some((cc, rr) => cc === c || Math.abs(cc - c) === r - rr)) continue;
      cols[r] = c;
      rec(r + 1);
    }
    cols.length = r;
  };
  rec(0);
  return out;
}

export const queens: PuzzleDef = {
  id: 'queens',
  get name() {
    return L('Queens', 'Dames');
  },
  category: 'logic',
  undo: true,
  get rules() {
    return L('One queen per row. No shared columns or diagonals.', 'Une dame par rangée, sans colonne ni diagonale commune.');
  },
  help: () => ({
    goal: L(
      'Place one queen in every row so that no two queens attack each other.',
      'Placez une dame dans chaque rangée sans que deux dames se menacent.',
    ),
    steps: [
      L(
        'Tap a square to put that row’s queen there. Tap another square in the row to move it, or the same one to remove it. Clear takes your queens back.',
        'Touchez une case pour y mettre la dame de la rangée. Touchez une autre case de la rangée pour la déplacer, ou la même pour l’enlever. Effacer retire vos dames.',
      ),
      L('Two queens may not share a column or a diagonal.', 'Deux dames ne peuvent pas partager une colonne ni une diagonale.'),
      L(
        'Queens that attack each other turn red, and placing one there counts as a mistake.',
        'Les dames qui se menacent passent au rouge, et un tel placement compte comme une erreur.',
      ),
      L(
        'One queen is placed for you and can’t be moved. The board grows from 4×4 to 8×8.',
        'Une dame est déjà placée et ne peut pas bouger. La grille passe de 4×4 à 8×8.',
      ),
    ],
    tips: [
      L(
        'Start from the fixed queen: cross off its column and both diagonals.',
        'Partez de la dame fixe : éliminez sa colonne et ses deux diagonales.',
      ),
      L('Fill first the rows that have the fewest safe squares left.', 'Remplissez d’abord les rangées qui ont le moins de cases sûres.'),
    ],
  }),
  par: (d) => byLevel(d, [15, 30, 60, 100, 160]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const n = byLevel(d, [4, 5, 6, 7, 8]);
    const sols = allSolutions(n);
    const sol = rng.pick(sols);
    // One locked queen gives every board a different starting point.
    const lockedRow = rng.int(0, n - 1);
    const q: (number | null)[] = Array.from({ length: n }, (_, r) => (r === lockedRow ? sol[r] : null));

    const grid = board(n);
    const cells = Array.from({ length: n * n }, (_, i) => {
      const r = Math.floor(i / n),
        c = i % n;
      const el = h('button', { type: 'button', class: `cell ${(r + c) % 2 ? 'alt' : ''}`, onclick: () => tap(r, c) });
      grid.append(el);
      return el;
    });
    /** Counts a mistake when a queen lands under attack. */
    const watch = ruleBreaks(grid, ctx.mistake);
    let done = false;

    const attacks = (r1: number, c1: number, r2: number, c2: number) => c1 === c2 || r1 === r2 || Math.abs(c1 - c2) === Math.abs(r1 - r2);
    const render = () => {
      const bad = new Set<number>();
      for (let a = 0; a < n; a++)
        for (let b = a + 1; b < n; b++) {
          if (q[a] == null || q[b] == null) continue;
          if (attacks(a, q[a]!, b, q[b]!)) {
            bad.add(a);
            bad.add(b);
          }
        }
      cells.forEach((el, i) => {
        const r = Math.floor(i / n),
          c = i % n;
        const has = q[r] === c;
        el.classList.toggle('queen', has);
        el.classList.toggle('given', has && r === lockedRow);
        el.classList.toggle('err', has && bad.has(r));
      });
      const placed = q.filter((x) => x != null).length;
      ctx.status(`${placed} / ${P(n, ['queen', 'queens'], ['dame', 'dames'])}`);
      return bad.size === 0 && placed === n;
    };
    const tap = (r: number, c: number) => {
      if (done || r === lockedRow) return;
      ctx.touch();
      q[r] = q[r] === c ? null : c;
      const won = render();
      watch(q[r] === c);
      if (won) {
        done = true;
        ctx.solved();
      }
    };
    const sv = ctx.saved as { q?: unknown } | undefined;
    if (Array.isArray(sv?.q) && sv.q.length === n)
      sv.q.forEach((c, r) => {
        if (r !== lockedRow) q[r] = typeof c === 'number' && Number.isInteger(c) && c >= 0 && c < n ? c : null;
      });
    root.append(grid);
    render();
    watch(false);
    ctx.controls(
      clearBtn(() => {
        if (done || q.every((x, r) => r === lockedRow || x == null)) return;
        ctx.touch();
        q.forEach((_, r) => r !== lockedRow && (q[r] = null));
        render();
        watch(false);
      }),
    );

    /** Placed queens attacking square (r, c). */
    const attackers = (r: number, c: number) => q.flatMap((x, rr) => (x != null && rr !== r && attacks(rr, x, r, c) ? [rr * n + x] : []));
    let last = -1;
    /** The next deduction for the guide: a row or column with a single safe square. */
    const hint = (): Hint | null => {
      if (done || q.every((x) => x != null)) return null;
      const free = [...Array(n).keys()].filter((r) => q[r] == null);
      const safe = (r: number, c: number) => !attackers(r, c).length;
      const why = (sq: [number, number][]) => [...new Set(sq.flatMap(([r, c]) => attackers(r, c)))].map((i) => cells[i]);
      const byRow = (): Hint | null => {
        for (const r of free) {
          const ok = [...Array(n).keys()].filter((c) => safe(r, c));
          if (ok.length !== 1) continue;
          const c = ok[0];
          return {
            text: L(
              `Every square of row ${r + 1} but one is attacked by a queen (same column or diagonal). Row ${r + 1}’s queen must go in column ${c + 1}.`,
              `Toutes les cases de la rangée ${r + 1} sauf une sont menacées par une dame (même colonne ou diagonale). Sa dame va donc dans la colonne ${c + 1}.`,
            ),
            why: why([...Array(n).keys()].filter((cc) => cc !== c).map((cc) => [r, cc])),
            at: [cells[r * n + c]],
            play: () => tap(r, c),
          };
        }
        return null;
      };
      const byCol = (): Hint | null => {
        for (let c = 0; c < n; c++) {
          if (q.includes(c)) continue;
          const ok = free.filter((r) => safe(r, c));
          if (ok.length !== 1) continue;
          const r = ok[0];
          const w = why(free.filter((rr) => rr !== r).map((rr) => [rr, c]));
          return {
            text: L(
              `Column ${c + 1} still needs a queen, and ${w.length === 1 ? 'the queen attacks' : 'the queens attack'} all its free squares but one: row ${r + 1}.`,
              `La colonne ${c + 1} a encore besoin d’une dame, et ${w.length === 1 ? 'la dame menace' : 'les dames menacent'} toutes ses cases libres sauf une : la rangée ${r + 1}.`,
            ),
            why: w,
            at: [cells[r * n + c]],
            play: () => tap(r, c),
          };
        }
        return null;
      };
      const rules = [byRow, byCol];
      for (const rule of [...rules.filter((_, k) => k !== last), ...rules.filter((_, k) => k === last)]) {
        const found = rule();
        if (found) {
          last = rules.indexOf(rule);
          return found;
        }
      }
      // No forced square: follow a full solution that fits the queens already placed.
      const fit = sols.find((cand) => q.every((x, r) => x == null || x === cand[r]));
      if (!fit) return null;
      const r = free.reduce((a, b) =>
        [...Array(n).keys()].filter((c) => safe(b, c)).length < [...Array(n).keys()].filter((c) => safe(a, c)).length ? b : a,
      );
      const c = fit[r];
      last = -1;
      return {
        text: L(
          `No row is forced yet, so pick the row with the fewest safe squares. Column ${c + 1} works out: it still leaves a safe square in every other row.`,
          `Aucune rangée n’est encore forcée : prenez celle qui a le moins de cases sûres. La colonne ${c + 1} fonctionne : elle laisse une case sûre dans chaque autre rangée.`,
        ),
        at: [cells[r * n + c]],
        play: () => tap(r, c),
      };
    };
    /** A queen to take back: one that attacks another, else one no solution can keep. */
    const check = (): Hint | null => {
      if (done) return null;
      const fix = (r: number, text: string, why: number[]): Hint => ({
        kind: 'fix',
        text,
        why: why.map((i) => cells[i]),
        at: [cells[r * n + q[r]!]],
        action: L('Remove it', 'L’enlever'),
        play: () => {
          if (q[r] != null) tap(r, q[r]);
        },
      });
      const fits = (qq: (number | null)[]) => sols.some((cand) => qq.every((x, r) => x == null || x === cand[r]));
      for (let a = 0; a < n; a++)
        for (let b = a + 1; b < n; b++) {
          if (q[a] == null || q[b] == null || !attacks(a, q[a]!, b, q[b]!)) continue;
          // Remove the one that isn't fixed, preferring the one no solution keeps.
          const mine = [a, b].filter((r) => r !== lockedRow);
          const r = mine.find((m) => !fits(q.map((x, rr) => (rr === m ? x : rr === lockedRow ? x : null)))) ?? mine[mine.length - 1];
          const o = r === a ? b : a;
          const how = q[a] === q[b] ? L('the same column', 'la même colonne') : L('a diagonal', 'une diagonale');
          return fix(
            r,
            L(
              `The queens in rows ${a + 1} and ${b + 1} attack each other: they share ${how}. Remove the one in row ${r + 1}.`,
              `Les dames des rangées ${a + 1} et ${b + 1} se menacent : elles partagent ${how}. Enlevez celle de la rangée ${r + 1}.`,
            ),
            [o * n + q[o]!],
          );
        }
      if (fits(q)) return null;
      // No attack, but no full solution keeps all these queens: take back one that frees a solution.
      const mine = [...Array(n).keys()].filter((r) => r !== lockedRow && q[r] != null);
      const r =
        mine.find((m) => fits(q.map((x, rr) => (rr === m ? null : x)))) ??
        mine.find((m) => !fits(q.map((x, rr) => (rr === m || rr === lockedRow ? x : null)))) ??
        mine[mine.length - 1];
      if (r == null) return null;
      return fix(
        r,
        L(
          `The queen in row ${r + 1} attacks no one yet, but it leads to a dead end: no way of finishing the board keeps it there.`,
          `La dame de la rangée ${r + 1} ne menace encore personne, mais elle mène à une impasse : aucune façon de finir la grille ne la garde là.`,
        ),
        [],
      );
    };
    return { snapshot: () => ({ q }), hint, check };
  },
};
