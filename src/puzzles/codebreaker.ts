import { L, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { btn, h, pad, PALETTE, shake } from '../core/ui';
import './playkit/code-board.css';
import './codebreaker.css';

/** Mastermind score of a guess: ● right colour and spot, ○ right colour elsewhere (repeats counted once each). */
function scoreOf(code: number[], g: number[]) {
  let exact = 0;
  const rc: number[] = [],
    rg: number[] = [];
  g.forEach((c, k) => (c === code[k] ? exact++ : (rc.push(code[k]), rg.push(c))));
  let near = 0;
  for (const c of rg) {
    const j = rc.indexOf(c);
    if (j >= 0) {
      near++;
      rc.splice(j, 1);
    }
  }
  return { exact, near };
}

/** Names of the PALETTE colours, for the guide. */
const colourName = (c: number) =>
  [
    L('orange', 'orange'),
    L('blue', 'bleu'),
    L('green', 'vert'),
    L('yellow', 'jaune'),
    L('purple', 'violet'),
    L('cyan', 'turquoise'),
    L('pink', 'rose'),
    L('lime', 'lime'),
  ][c];

export const codebreaker: PuzzleDef = {
  id: 'codebreaker',
  get name() {
    return L('Code Breaker', 'Casse-code');
  },
  category: 'logic',
  get rules() {
    return L('Crack the code. ● right spot · ○ wrong spot.', 'Trouvez le code. ● bien placée · ○ mal placée.');
  },
  help: () => ({
    goal: L('Find the hidden colour code before you run out of guesses.', 'Trouvez le code de couleurs secret avant d’épuiser vos essais.'),
    steps: [
      L(
        'Tap colours in the palette to fill the current row (or press 1, 2, 3…).',
        'Touchez les couleurs de la palette pour remplir la rangée en cours (ou appuyez sur 1, 2, 3…).',
      ),
      L(
        '✕ on the palette removes the last colour (Backspace). Guess submits a full row (Enter).',
        '✕ dans la palette retire la dernière couleur (Retour arrière). Essayer soumet une rangée complète (Entrée).',
      ),
      L(
        'Each ● is a right colour in the right spot; each ○ a right colour in the wrong spot. They don’t say which peg.',
        'Chaque ● est une bonne couleur bien placée; chaque ○, une bonne couleur mal placée. Ils ne disent pas laquelle.',
      ),
      L(
        'Up to Medium, each colour appears at most once. From Hard on, colours can repeat.',
        'Jusqu’au niveau Moyen, chaque couleur apparaît au plus une fois. Dès Difficile, elles peuvent se répéter.',
      ),
      L('Run out of rows and the code is revealed.', 'Si vous manquez de rangées, le code est révélé.'),
    ],
    tips: [
      L(
        'Use your first guesses to learn which colours are in the code.',
        'Servez-vous des premiers essais pour savoir quelles couleurs sont dans le code.',
      ),
      L(
        'Change one thing at a time and watch how the feedback shifts.',
        'Changez une chose à la fois et observez comment les indices évoluent.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [40, 60, 90, 120, 160]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const len = byLevel(d, [3, 4, 4, 5, 5]);
    const colors = byLevel(d, [4, 5, 6, 6, 7]);
    const maxGuesses = byLevel(d, [8, 8, 8, 9, 9]);
    const dupes = d >= 3;
    const pool = [...Array(colors).keys()];
    const code = dupes ? Array.from({ length: len }, () => rng.int(0, colors - 1)) : rng.shuffle(pool).slice(0, len);

    const guesses: { g: number[]; exact: number; near: number }[] = [];
    let cur: number[] = [];

    const board = h('div', { class: 'code-board', style: `--len:${len}` });
    // Colour swatches (index = colour), then ✕ to delete the last peg.
    const palette = pad(
      [
        ...Array.from({ length: colors }, (_, c) => ({
          label: '',
          value: String(c),
          class: 'swatch',
          style: `--c:${PALETTE[c]}`,
          aria: L(`colour ${c + 1}`, `couleur ${c + 1}`),
        })),
        { label: '✕', value: 'del', aria: L('Delete', 'Effacer') },
      ],
      (v) => (v === 'del' ? back() : add(Number(v))),
    );

    const peg = (c: number | undefined) =>
      h('span', { class: `peg ${c == null ? 'empty' : ''}`, style: c == null ? '' : `--c:${PALETTE[c]}` });
    const render = () => {
      const rows: HTMLElement[] = [];
      for (let r = 0; r < maxGuesses; r++) {
        const past = guesses[r];
        const isCur = r === guesses.length;
        const pegs = Array.from({ length: len }, (_, k) => peg(past ? past.g[k] : isCur ? cur[k] : undefined));
        const fb = h('span', { class: 'fb' });
        if (past) {
          for (let k = 0; k < past.exact; k++) fb.append(h('i', { class: 'exact' }));
          for (let k = 0; k < past.near; k++) fb.append(h('i', { class: 'near' }));
        }
        rows.push(
          h('div', { class: `code-row ${isCur ? 'cur' : ''} ${past || isCur ? '' : 'future'}` }, h('span', { class: 'pegs' }, ...pegs), fb),
        );
      }
      board.replaceChildren(...rows);
      ctx.status(P(maxGuesses - guesses.length, ['guess left', 'guesses left'], ['essai restant', 'essais restants']));
    };
    const add = (c: number) => {
      if (cur.length >= len) return;
      if (!dupes && cur.includes(c)) {
        shake(board.children[guesses.length]);
        return;
      }
      ctx.touch();
      cur.push(c);
      render();
    };
    const back = () => {
      cur.pop();
      render();
    };
    const submit = () => {
      if (cur.length < len) {
        shake(board.children[guesses.length]);
        return;
      }
      const { exact, near } = scoreOf(code, cur);
      guesses.push({ g: cur, exact, near });
      cur = [];
      render();
      if (exact === len) ctx.solved();
      else if (guesses.length >= maxGuesses) {
        board.append(
          h(
            'div',
            { class: 'code-row reveal' },
            h('span', { class: 'pegs' }, ...code.map((c) => peg(c))),
            h('span', { class: 'fb' }, 'code'),
          ),
        );
        ctx.failed();
      }
    };
    ctx.controls(btn(L('Guess', 'Essayer'), submit, 'primary'));
    const sv = ctx.saved as { guesses?: unknown; cur?: unknown } | undefined;
    /** A row of colours this game could hold: `len` pegs (at most, for the row being entered), in range, no repeats unless allowed. */
    const okRow = (v: unknown, full: boolean): v is number[] =>
      Array.isArray(v) &&
      (full ? v.length === len : v.length <= len) &&
      v.every((c) => Number.isInteger(c) && c >= 0 && c < colors) &&
      (dupes || new Set(v).size === v.length);
    if (sv && Array.isArray(sv.guesses)) {
      for (const x of sv.guesses.slice(0, maxGuesses - 1)) {
        const g = (x as { g?: unknown } | null)?.g;
        if (!okRow(g, true)) break;
        guesses.push({ g: g.slice(), ...scoreOf(code, g) });
        if (guesses[guesses.length - 1].exact === len) {
          guesses.pop();
          break;
        }
      }
      if (okRow(sv.cur, false)) cur = sv.cur.slice();
    }
    // ---------- guide ----------
    /**
     * The row being entered contradicts feedback already on the board: a colour a no-peg row ruled out,
     * or a full row that would have scored an earlier guess differently than it did. A full row the
     * player is still free to submit as a probe, so it's flagged only when it can't be the code.
     */
    const check = (): Hint | null => {
      const last = guesses[guesses.length - 1];
      if (!cur.length || (last && last.exact === len) || guesses.length >= maxGuesses) return null;
      const rowEl = board.children[guesses.length];
      const fix = (text: string, k: number, why: Element): Hint => ({
        kind: 'fix',
        text,
        why: [why],
        at: [rowEl],
        action: L('Delete', 'Effacer'),
        play: () => {
          while (cur.length > k) back();
        },
      });
      for (let r = 0; r < guesses.length; r++) {
        const x = guesses[r];
        if (x.exact + x.near) continue;
        const k = cur.findIndex((c) => x.g.includes(c));
        if (k >= 0)
          return fix(
            L(
              `Row ${r + 1} got no pegs, so ${colourName(cur[k])} is not in the code at all. Delete it.`,
              `La rangée ${r + 1} n’a reçu aucun indice : ${colourName(cur[k])} n’est donc pas dans le code. Effacez-la.`,
            ),
            k,
            board.children[r],
          );
      }
      if (cur.length < len) return null;
      for (let r = 0; r < guesses.length; r++) {
        const x = guesses[r];
        const s = scoreOf(cur, x.g);
        if (s.exact === x.exact && s.near === x.near) continue;
        return fix(
          L(
            `This can’t be the code: if it were, row ${r + 1} would have scored ${s.exact} ● ${s.near} ○, not ${x.exact} ● ${x.near} ○. Change it.`,
            `Ce ne peut pas être le code : sinon la rangée ${r + 1} aurait obtenu ${s.exact} ● ${s.near} ○, et non ${x.exact} ● ${x.near} ○. Modifiez cette rangée.`,
          ),
          0,
          board.children[r],
        );
      }
      return null;
    };
    const hint = (): Hint | null => {
      const last = guesses[guesses.length - 1];
      if ((last && last.exact === len) || guesses.length >= maxGuesses) return null;
      const fits = (s: number[]) =>
        guesses.every((x) => {
          const r = scoreOf(s, x.g);
          return r.exact === x.exact && r.near === x.near;
        });
      const cands: number[][] = [];
      const gen = (pre: number[]) => {
        if (pre.length === len) {
          if (fits(pre)) cands.push(pre);
          return;
        }
        for (let c = 0; c < colors; c++) if (dupes || !pre.includes(c)) gen([...pre, c]);
      };
      gen([]);
      if (!cands.length) return null;
      const names = (g: number[]) => g.map(colourName).join(', ');
      const swatches = (g: number[]) => [...new Set(g)].map((c) => palette.children[c]);
      const guessOf = (g: number[]): Pick<Hint, 'at' | 'play'> => ({
        at: swatches(g),
        play: () => {
          while (cur.length) back();
          g.forEach(add);
          submit();
        },
      });
      if (!last) {
        // Opening: pairs of colours when repeats are allowed, otherwise the first colours in order.
        const g = Array.from({ length: len }, (_, k) => (dupes ? (k < len / 2 ? 0 : 1) : k));
        return {
          text: dupes
            ? L(
                `Colours can repeat here, so open with two colours, ${names([0, 1])}: one guess tests both. ● means right colour, right spot; ○ right colour, wrong spot.`,
                `Les couleurs peuvent se répéter : ouvrez avec deux couleurs (${names([0, 1])}), un seul essai les teste toutes les deux. ● : bonne couleur bien placée; ○ : bonne couleur mal placée.`,
              )
            : L(
                `Start with any ${len} colours, like ${names(g)}. ● means right colour, right spot; ○ right colour, wrong spot.`,
                `Commencez par ${len} couleurs au choix, comme ${names(g)}. ● : bonne couleur bien placée; ○ : bonne couleur mal placée.`,
              ),
          ...guessOf(g),
        };
      }
      // Any code that fits will do; keep the secret one back while there are rows to spare.
      const spare = maxGuesses - guesses.length > 2;
      const g = (spare && cands.find((c) => c.join() !== code.join())) || code;
      const tot = last.exact + last.near;
      const tried = names(last.g);
      const first =
        tot === 0
          ? L(`No pegs: ${tried} are all out of the code.`, `Aucun indice : ${tried}, rien de tout ça n’est dans le code.`)
          : tot === len
            ? L(
                `${tot} pegs: every colour is right, only the order is off.`,
                `${tot} indices : toutes les couleurs sont bonnes, seul l’ordre cloche.`,
              )
            : L(
                `${last.exact} ● and ${last.near} ○: ${tot} of those colours ${tot === 1 ? 'is' : 'are'} in the code, ${last.exact ? `${last.exact} already in place` : 'but none in place yet'}.`,
                `${last.exact} ● et ${last.near} ○ : ${tot} de ces couleurs ${tot > 1 ? 'sont' : 'est'} dans le code, ${last.exact ? `dont ${last.exact} déjà bien placée${last.exact > 1 ? 's' : ''}` : 'mais aucune n’est encore bien placée'}.`,
              );
      const second =
        cands.length === 1
          ? L(`Only ${names(g)} fits every row.`, `Seul le code ${names(g)} respecte toutes les rangées.`)
          : L(
              `${cands.length} codes still fit every row, such as ${names(g)}.`,
              `${cands.length} codes respectent encore toutes les rangées, comme ${names(g)}.`,
            );
      return { text: `${first} ${second}`, why: [board.children[guesses.length - 1]], ...guessOf(g) };
    };

    root.append(board, palette);
    render();
    return {
      check,
      hint,
      snapshot: () => ({ guesses, cur }),
      onKey(e) {
        const n = Number(e.key);
        if (n >= 1 && n <= colors) {
          add(n - 1);
          return true;
        }
        if (e.key === 'Backspace') {
          back();
          return true;
        }
        if (e.key === 'Enter') {
          submit();
          return true;
        }
        return false;
      },
    };
  },
};
