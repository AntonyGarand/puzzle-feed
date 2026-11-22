import { L, P } from '../../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../../core/types';
import { board, h, shake } from '../../ui/dom';
import { makeCover } from './gen';
import { adjacent, findPath } from '../../kits/word/hunt-solver';
import { dictReady, isWord, letterKey, whenDict } from '../../kits/word/lexicon';
import { traceInput, traceOverlay } from '../../kits/word/trace';
import '../../kits/word/pill.css';
import './style.css';

// Found words get these colours in turn (the tone, --p5, is kept for the live trace).
const COLORS = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)', 'var(--p7)', 'var(--p6)', 'var(--p8)'];

export const cover: PuzzleDef = {
  id: 'cover',
  get name() {
    return L('Word Cover', 'Mots couvrants');
  },
  category: 'words',
  get rules() {
    return L('Split the grid into hidden words of touching letters.', 'Découpez la grille en mots cachés de lettres voisines.');
  },
  localized: true,
  offByDefault: true,
  help: () => ({
    goal: L(
      'Every letter belongs to exactly one hidden word. Find them all until the whole grid is covered.',
      'Chaque lettre appartient à un seul mot caché. Trouvez-les tous jusqu’à couvrir toute la grille.',
    ),
    steps: [
      L(
        'Drag through touching letters (sideways, up, down or diagonally) to spell a word, then let go.',
        'Glissez sur des lettres qui se touchent (côté, haut, bas ou diagonale) pour former un mot, puis relâchez.',
      ),
      L(
        'Or tap the letters one by one, and tap the last one again to submit.',
        'Ou touchez les lettres une à une, puis retouchez la dernière pour valider.',
      ),
      L(
        'A hidden word locks in and takes a colour. Other real words don’t count, without penalty; something that isn’t a word is a mistake.',
        'Un mot caché se verrouille et prend une couleur. Les autres vrais mots ne comptent pas, sans pénalité; ce qui n’est pas un mot est une erreur.',
      ),
      L(
        'The chips above the grid show the words left (with their lengths on the easier levels).',
        'Les pastilles au-dessus de la grille montrent les mots restants (et leur longueur aux niveaux faciles).',
      ),
      L(
        'Stuck? The bulb at the top shows where a word runs. Keyboard: type, then Enter.',
        'Bloqué? L’ampoule en haut montre où passe un mot. Clavier : tapez, puis Entrée.',
      ),
    ],
    tips: [
      L(
        'Start in the corners: a corner letter has only three neighbours, so its word is easy to pin down.',
        'Commencez par les coins : une lettre de coin n’a que trois voisines, son mot est donc plus facile à cerner.',
      ),
      L(
        'Each found word shrinks the grid. Watch for letters left with few free neighbours.',
        'Chaque mot trouvé réduit la grille. Surveillez les lettres qui n’ont plus que peu de voisines libres.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [50, 80, 120, 170, 230]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const cols = byLevel(d, [4, 4, 5, 6, 6]);
    const rows = byLevel(d, [4, 5, 5, 5, 6]);
    const gen = makeCover(rng, {
      cols,
      rows,
      lo: byLevel(d, [3, 4, 4, 4, 5]),
      hi: byLevel(d, [5, 5, 6, 7, 8]),
      kMin: byLevel(d, [4, 4, 5, 5, 5]),
      kMax: byLevel(d, [4, 5, 5, 6, 6]),
      diag: byLevel(d, [3, 2, 1, 0.4, 0]),
    });
    const { letters, words, paths } = gen;
    const K = words.length;
    const N = letters.length;
    const showLens = d <= 3;
    /** Word owning each cell. */
    const owner = new Array<number>(N);
    paths.forEach((p, k) => p.forEach((i) => (owner[i] = k)));

    const found: number[] = []; // word indices, in the order they were found
    let path: number[] = [];
    let won = false;
    const claimed = (i: number) => found.includes(owner[i]);
    const color = (k: number) => COLORS[found.indexOf(k) % COLORS.length];

    const word = h('div', { class: 'cover-word' });
    const chipsEl = h('div', { class: 'cover-chips' });
    const grid = board(cols, rows, 'cover-grid');
    const cells = letters.map((ch, i) => {
      const el = h('div', { class: 'cell', 'data-i': i }, ch);
      grid.append(el);
      return el;
    });
    const trace = traceOverlay(grid);

    let msg = '';
    let msgTimer = 0;
    const say = (m: string) => {
      msg = m;
      clearTimeout(msgTimer);
      msgTimer = window.setTimeout(() => {
        msg = '';
        renderWord();
      }, 1200);
      renderWord();
    };
    const renderWord = () => {
      const w = path.map((i) => letters[i]).join('');
      word.textContent =
        w ||
        msg ||
        (won
          ? L('All covered!', 'Tout est couvert!')
          : dictReady()
            ? L('Trace a word', 'Tracez un mot')
            : L('loading words…', 'chargement des mots…'));
      word.classList.toggle('typing', !!w);
    };
    // Chips in a fixed order (by length, then alphabetically) so their place gives nothing away.
    const order = words.map((_, k) => k).sort((a, b) => words[a].length - words[b].length || (words[a] < words[b] ? -1 : 1));
    const render = () => {
      cells.forEach((el, i) => {
        const k = owner[i];
        const pk = path.indexOf(i);
        let cls = 'cell';
        let style = '';
        if (claimed(i)) {
          cls += ' cover-done';
          style = `--c:${color(k)}`;
        } else if (pk >= 0) cls += pk === path.length - 1 ? ' sel' : ' on';
        el.className = cls;
        if (style) el.setAttribute('style', style);
        else el.removeAttribute('style');
      });
      trace.draw(
        path,
        found.map((k) => ({ path: paths[k], color: color(k) })),
      );
      renderWord();
      chipsEl.replaceChildren(
        ...order.map((k) =>
          found.includes(k)
            ? h('span', { class: 'word-pill cover-chip done', style: `--c:${color(k)}` }, words[k])
            : h(
                'span',
                { class: 'word-pill cover-chip', title: showLens ? P(words[k].length, ['letter', 'letters'], ['lettre', 'lettres']) : '' },
                showLens ? '•'.repeat(words[k].length) : '?',
              ),
        ),
      );
      ctx.status(`${found.length} / ${P(K, ['word', 'words'], ['mot', 'mots'])}`);
    };

    const claim = (k: number) => {
      found.push(k);
      path = [];
      render();
      say(words[k].toUpperCase());
      if (found.length === K && !won) {
        won = true;
        clearTimeout(msgTimer);
        msg = '';
        render();
        ctx.solved();
      }
    };
    const submit = () => {
      const p = path;
      const w = p.map((i) => letters[i]).join('');
      path = [];
      if (!w) return render();
      const same = (k: number) => paths[k].length === p.length && p.every((i) => owner[i] === k);
      const k = owner[p[0]];
      if (!found.includes(k) && same(k) && words[k] === w) return claim(k);
      render();
      if (w.length < 3) {
        if (w.length > 1) {
          shake(word);
          say(L('Too short', 'Trop court'));
        }
        return;
      }
      if (words.some((x, j) => x === w && !found.includes(j))) {
        shake(word);
        say(L('Right word, other tiles', 'Bon mot, autres tuiles'));
        return;
      }
      const ok = isWord(w);
      if (ok === null) return say(L('loading words…', 'chargement des mots…'));
      shake(word);
      // A rejected answer is a mistake; a real word that isn't hidden here is just a try.
      if (!ok) ctx.mistake();
      say(ok ? L('Real word, not hidden here', 'Vrai mot, mais pas caché ici') : L('Not a word', 'Mot inconnu'));
    };

    const stopInput = traceInput(grid, {
      cols,
      path: () => path,
      set: (p) => {
        path = p;
        render();
      },
      submit,
      active: () => !won,
      touch: () => ctx.touch(),
      free: (i) => !claimed(i),
    });

    // ---------- resume ----------
    const sv = ctx.saved as { f?: unknown; p?: unknown } | undefined;
    if (sv && typeof sv === 'object') {
      if (Array.isArray(sv.f))
        for (const k of sv.f) {
          if (Number.isInteger(k) && k >= 0 && k < K && !found.includes(k) && found.length < K - 1) found.push(k);
        }
      if (Array.isArray(sv.p)) {
        const p: number[] = [];
        for (const i of sv.p) {
          if (!Number.isInteger(i) || i < 0 || i >= N || p.includes(i) || claimed(i) || (p.length && !adjacent(cols, p[p.length - 1], i)))
            break;
          p.push(i);
        }
        path = p;
      }
    }

    root.append(h('div', { class: 'cover-top' }, word, chipsEl), trace.wrap);
    render();
    whenDict(() => renderWord());

    // ---------- guide ----------
    const up = (s: string) => s.toUpperCase();
    const freeNb = (i: number) => {
      let c = 0;
      for (let j = 0; j < N; j++) if (!claimed(j) && adjacent(cols, i, j)) c++;
      return c;
    };
    /** A trace in progress that no hidden word follows: mixed tiles of two words, or letters out of order. */
    const check = (): Hint | null => {
      if (won || !path.length) return null;
      const k = owner[path[0]];
      const w = path.map((i) => letters[i]).join('');
      if (path.every((i) => owner[i] === k) && words[k].startsWith(w)) return null;
      const bad = path.findIndex((i, j) => owner[i] !== k || words[k][j] !== letters[i]);
      return {
        kind: 'fix',
        text:
          bad === 0
            ? L(
                `No hidden word starts with this ${up(letters[path[0]])}. Let go and start from another tile.`,
                `Aucun mot caché ne commence par ce ${up(letters[path[0]])}. Relâchez et partez d’une autre tuile.`,
              )
            : L(
                `No hidden word runs ${up(w.slice(0, bad + 1))}: from the ${up(letters[path[bad - 1]])}, the word goes elsewhere. Start this trace over.`,
                `Aucun mot caché ne suit ${up(w.slice(0, bad + 1))} : après le ${up(letters[path[bad - 1]])}, le mot va ailleurs. Recommencez ce tracé.`,
              ),
        at: path.map((i) => cells[i]),
        action: L('Clear', 'Effacer'),
        play: () => {
          path = [];
          render();
        },
      };
    };
    const used = new Map<string, number>();
    let lastRule = '';
    const hint = (): Hint | null => {
      if (won) return null;
      const left = order.filter((k) => !found.includes(k));
      if (!left.length) return null;
      const make = (k: number, text: string, why: Element[] = []): Hint => ({
        text,
        why,
        at: paths[k].map((i) => cells[i]),
        play: () => {
          path = [...paths[k]];
          render();
          submit();
        },
      });
      const freeCells = cells.map((_, i) => i).filter((i) => !claimed(i));
      const rules: Record<string, () => Hint | null> = {
        last: () => {
          if (left.length !== 1) return null;
          const k = left[0];
          return make(
            k,
            L(
              `Only ${freeCells.length} letters are left, and every letter belongs to a word: they spell ${up(words[k])}.`,
              `Il ne reste que ${freeCells.length} lettres, et chacune appartient à un mot : elles forment ${up(words[k])}.`,
            ),
          );
        },
        tight: () => {
          // The free letter with the fewest free neighbours: its word can only run through them.
          let best = -1;
          for (const i of freeCells) if (best < 0 || freeNb(i) < freeNb(best)) best = i;
          if (best < 0 || freeNb(best) > 3) return null;
          const k = owner[best];
          const nbs = freeNb(best);
          return make(
            k,
            L(
              `This ${up(letters[best])} touches only ${P(nbs, ['free letter', 'free letters'], ['lettre libre', 'lettres libres'])}, so its word must run through ${nbs === 1 ? 'it' : 'them'}: ${up(words[k])}.`,
              `La lettre ${up(letters[best])} ne touche que ${P(nbs, ['lettre libre', 'lettres libres'], ['lettre libre', 'lettres libres'])}, alors son mot passe forcément par là : ${up(words[k])}.`,
            ),
            [cells[best]],
          );
        },
        long: () => {
          const k = left.toSorted((a, b) => words[b].length - words[a].length)[0];
          if (words[k].length < 5) return null;
          return make(
            k,
            L(
              `Long words take up the most room: ${up(words[k])} snakes through ${words[k].length} letters. Spot it and the rest gets easier.`,
              `Les longs mots prennent le plus de place : ${up(words[k])} serpente sur ${words[k].length} lettres. Repérez-le et le reste devient plus simple.`,
            ),
          );
        },
      };
      if (!found.length) {
        // Start in a corner: few neighbours, so few ways for its word to go.
        lastRule = 'corner';
        const corners = [0, cols - 1, N - cols, N - 1];
        const c = corners.find((i) => !claimed(i)) ?? freeCells[0];
        const k = owner[c];
        return make(
          k,
          L(
            `Every letter belongs to exactly one word. Start in a corner: this ${up(letters[c])} has only 3 neighbours, and it's part of ${up(words[k])}.`,
            `Chaque lettre appartient à un seul mot. Commencez par un coin : la lettre ${up(letters[c])} n’a que 3 voisines, et elle fait partie de ${up(words[k])}.`,
          ),
          [cells[c]],
        );
      }
      const ranked = ['last', 'tight', 'long']
        .map((o, i) => ({ o, i, n: (used.get(o) ?? 0) + (o === lastRule ? 100 : 0) }))
        .sort((a, b) => a.n - b.n || a.i - b.i);
      for (const { o } of ranked) {
        const got = rules[o]();
        if (got) {
          lastRule = o;
          used.set(o, (used.get(o) ?? 0) + 1);
          return got;
        }
      }
      const k = left[0];
      return make(
        k,
        L(
          `${up(words[k])} is hidden here too: follow its letters from tile to tile.`,
          `${up(words[k])} se cache aussi ici : suivez ses lettres d’une tuile à l’autre.`,
        ),
      );
    };

    let typed = '';
    return {
      check,
      hint,
      snapshot: () => ({ f: found, p: path }),
      onKey(e) {
        if (won) return false;
        if (e.key === 'Enter') {
          typed = '';
          submit();
          return true;
        }
        if (e.key === 'Escape') {
          typed = '';
          path = [];
          render();
          return true;
        }
        const ch = e.key === 'Backspace' ? '' : letterKey(e.key);
        if (e.key === 'Backspace' || ch) {
          typed = path.map((i) => letters[i]).join('');
          typed = ch ? typed + ch : typed.slice(0, -1);
          const p = typed ? findPath(letters, cols, typed, (i) => !claimed(i)) : [];
          if (p) {
            path = p;
            render();
          } else shake(grid);
          return true;
        }
        return false;
      },
      destroy() {
        clearTimeout(msgTimer);
        trace.destroy();
        stopInput();
      },
    };
  },
};
