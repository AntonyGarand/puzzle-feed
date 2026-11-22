import { L, P, wordLocale } from '../../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../../core/types';
import { board, btn, h, shake } from '../../ui/dom';
import { adjacent, findPath, makeGrid, points } from '../../kits/word/hunt-solver';
import { dictReady, isWord, letterKey, whenDict } from '../../kits/word/lexicon';
import { traceInput, traceOverlay } from '../../kits/word/trace';
import '../../kits/word/pill.css';
import './style.css';

export const hunt: PuzzleDef = {
  id: 'hunt',
  get name() {
    return L('Hunt', 'Chasse aux mots');
  },
  category: 'words',
  get rules() {
    return L('Drag through touching letters to spell words.', 'Glissez sur des lettres voisines pour former des mots.');
  },
  localized: true,
  help: () => ({
    goal: L(
      'Find words hidden in the letter grid until the bar reaches its points target.',
      'Trouvez les mots cachés dans la grille jusqu’à ce que la barre atteigne l’objectif de points.',
    ),
    steps: [
      L(
        'Drag through touching letters (sideways, up, down or diagonally) to spell a word, then let go to submit it.',
        'Glissez le doigt sur des lettres qui se touchent (côté, haut, bas ou diagonale) pour former un mot, puis relâchez pour le valider.',
      ),
      L(
        'Or tap the letters one by one, and tap the last one again to submit. Tap an earlier letter to back up.',
        'Ou touchez les lettres une à une, puis retouchez la dernière pour valider. Touchez une lettre précédente pour revenir en arrière.',
      ),
      L(
        'Each tile counts once per word. The minimum length is shown above the grid (3 or 4 letters).',
        'Chaque tuile ne sert qu’une fois par mot. La longueur minimale est affichée au-dessus de la grille (3 ou 4 lettres).',
      ),
      L(
        'Longer words score more: 3 letters = 1 pt, 4 = 2, 5 = 3, 6 = 5, 7 = 7, 8+ = 10. Something that isn’t a word counts as a mistake.',
        'Les mots longs rapportent plus : 3 lettres = 1 pt, 4 = 2, 5 = 3, 6 = 5, 7 = 7, 8 et + = 10. Ce qui n’est pas un mot compte comme une erreur.',
      ),
      L(
        'The first ★ solves the puzzle. Keep going for ★★★, or tap Finish to stop there.',
        'La première ★ résout la partie. Continuez vers ★★★, ou touchez Terminer pour vous arrêter là.',
      ),
      L(
        'Keyboard: type a word and press Enter; Backspace removes a letter, Escape clears.',
        'Clavier : tapez un mot (sans accents) et appuyez sur Entrée; Retour arrière retire une lettre, Échap efface tout.',
      ),
    ],
    tips: [
      L(
        'Once you find a word, try adding S, ED or ER to it.',
        'Un mot trouvé? Essayez-le au pluriel, au féminin ou conjugué : ils comptent aussi.',
      ),
      L('Scan for short common chunks like TH, ING or ER first.', 'Repérez d’abord les groupes courants comme ER, ON, QU ou ENT.'),
    ],
  }),
  par: (d) => byLevel(d, [60, 90, 150, 200, 260]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const n = byLevel(d, [4, 4, 4, 5, 5]);
    const minLen = byLevel(d, [3, 3, 3, 3, 4]);
    const frac = byLevel(d, [0.3, 0.4, 0.5, 0.4, 0.45]);
    const grid0 = makeGrid(rng, n, minLen, byLevel(d, [40, 40, 45, 100, 85]));
    const letters = grid0.letters;
    const target = Math.max(8, Math.round(grid0.pts * frac));

    const found: string[] = [];
    let path: number[] = [];
    let score = 0;
    let won = false;

    // Stars: ★ at the goal (counts as solved), ★★ halfway to perfect, ★★★ = every listed word found.
    // Listed words = the common words hidden in the grid; rarer dictionary words still score as bonus.
    const listed = [...grid0.words];
    const perfect = Math.max(target + 2, grid0.pts);
    const milestones = [target, Math.round((target + perfect) / 2), perfect];
    const stars = () => {
      const allListed = listed.every((w) => found.includes(w));
      return allListed || score >= perfect ? 3 : score >= milestones[1] ? 2 : score >= milestones[0] ? 1 : 0;
    };
    let shownStars = 0;

    const word = h('div', { class: 'hunt-word' });
    const fill = h('div', { class: 'hunt-fill' });
    const starEls = milestones.map((_, k) => h('span', { class: 'hunt-star', title: '★'.repeat(k + 1) }, '★'));
    const bar = h('div', { class: 'hunt-bar' }, fill, ...starEls);
    const remainingEl = h('div', { class: 'hunt-left' });
    const foundEl = h('div', { class: 'hunt-found' });
    // The ★ goal records the solve (`keepPlaying`); Finish, or ★★★, ends the run.
    const finish = btn(
      L('Finish', 'Terminer'),
      () => {
        if (!won) {
          won = true;
          ctx.solved();
        }
      },
      'primary',
    );
    finish.hidden = true;
    ctx.controls(finish);
    const grid = board(n, n, 'hunt-grid');
    const cells = letters.map((ch, i) => {
      const el = h('div', { class: 'cell', 'data-i': i }, ch);
      grid.append(el);
      return el;
    });
    // The current path drawn as a line through the letters, so diagonal links are unambiguous.
    const trace = traceOverlay(grid);
    const wrap = trace.wrap;

    let msg = '';
    let msgTimer = 0;
    const say = (m: string) => {
      msg = m;
      clearTimeout(msgTimer);
      msgTimer = window.setTimeout(() => {
        msg = '';
        renderWord();
      }, 1100);
      renderWord();
    };
    const renderWord = () => {
      const w = path.map((i) => letters[i]).join('');
      word.textContent =
        w || msg || (dictReady() ? L(`${minLen}+ letters`, `${minLen} lettres et +`) : L('loading words…', 'chargement des mots…'));
      word.classList.toggle('typing', !!w);
    };
    const render = () => {
      cells.forEach((el, i) => {
        const k = path.indexOf(i);
        el.className = `cell${k >= 0 ? (k === path.length - 1 ? ' sel' : ' on') : ''}`;
      });
      trace.draw(path);
      renderWord();
      // Bar runs to "perfect"; stars sit at the milestones.
      const scale = Math.max(perfect, score);
      fill.style.width = `${Math.min(100, (score / scale) * 100)}%`;
      bar.setAttribute('data-label', `${score} pts`);
      const st = stars();
      starEls.forEach((el, k) => {
        el.style.left = `${Math.min(100, (milestones[k] / scale) * 100)}%`;
        el.classList.toggle('on', st > k);
      });
      // Remaining listed words, by length.
      const left = new Map<number, number>();
      for (const w of listed) if (!found.includes(w)) left.set(w.length, (left.get(w.length) ?? 0) + 1);
      const lens = [...new Set(listed.map((w) => w.length))].sort((a, b) => a - b);
      remainingEl.replaceChildren(
        ...lens.map((len) =>
          h(
            'span',
            {
              class: `word-pill hunt-len${(left.get(len) ?? 0) === 0 ? ' done' : ''}`,
              title: L(`${len}-letter words left`, `mots de ${len} lettres restants`),
            },
            h('b', null, L(`${len}L`, `${len} l.`)),
            String(left.get(len) ?? 0),
          ),
        ),
      );
      foundEl.replaceChildren(
        ...[...found].reverse().map((w) => h('span', { class: listed.includes(w) ? 'word-pill' : 'word-pill bonus' }, w)),
      );
      finish.hidden = won || st < 1 || st >= 3;
      ctx.status(
        st >= 1
          ? L(`${'★'.repeat(st)} · keep going for ★★★ or finish`, `${'★'.repeat(st)} · continuez vers ★★★ ou terminez`)
          : `${P(found.length, ['word', 'words'], ['mot', 'mots'])} · ${L('★ at', '★ à')} ${target} pts`,
      );
      if (st > shownStars) {
        if (shownStars > 0 || st === 1) starEls[st - 1]?.classList.add('pop');
        shownStars = st;
      }
    };

    const submit = () => {
      const w = path.map((i) => letters[i]).join('');
      path = [];
      if (!w) return render();
      if (w.length < minLen) {
        render();
        if (w.length > 1) {
          shake(word);
          say(L('Too short', 'Trop court'));
        }
        return;
      }
      if (found.includes(w)) {
        render();
        shake(word);
        say(L('Already found', 'Déjà trouvé'));
        return;
      }
      const ok = isWord(w);
      if (ok === null) {
        render();
        say(L('loading words…', 'chargement des mots…'));
        return;
      }
      if (!ok) {
        // A rejected answer: a mistake (a real word never is, even one that doesn't score).
        render();
        shake(word);
        ctx.mistake();
        say(L('Not a word', 'Mot inconnu'));
        return;
      }
      const before = stars();
      found.push(w);
      score += points(w.length);
      render();
      say(`+${points(w.length)} ${w}`);
      if (won) return;
      if (stars() >= 3) {
        won = true;
        render();
        ctx.solved();
      } else if (before < 1 && stars() >= 1) ctx.solved({ keepPlaying: true });
    };

    // Pointer: drag to trace (release submits); or tap cells one by one and tap the last again to submit.
    const stopInput = traceInput(grid, {
      cols: n,
      path: () => path,
      set: (p) => {
        path = p;
        render();
      },
      submit,
      active: () => !won,
      touch: () => ctx.touch(),
    });

    const sv = ctx.saved as { f?: unknown; p?: unknown } | undefined;
    if (sv && Array.isArray(sv.f)) {
      for (const w of sv.f) {
        if (typeof w !== 'string' || !/^[a-z]+$/.test(w) || w.length < minLen || found.includes(w)) continue;
        if (score + points(w.length) >= perfect) break; // three stars ends the game: never resume a finished one
        found.push(w);
        score += points(w.length);
      }
      if (Array.isArray(sv.p)) {
        const p: number[] = [];
        for (const i of sv.p) {
          if (typeof i !== 'number' || i < 0 || i >= n * n || p.includes(i) || (p.length && !adjacent(n, p[p.length - 1], i))) break;
          p.push(i);
        }
        path = p;
      }
    }

    shownStars = stars(); // no star pop for progress restored from a save
    root.append(h('div', { class: 'hunt-top' }, word, bar, remainingEl), wrap, foundEl);
    render();
    whenDict(() => renderWord());

    // ---------- guide ----------
    const CHUNKS =
      wordLocale() === 'fr' ? ['qu', 'ou', 'on', 'en', 'er', 'es', 'ai', 'ch'] : ['th', 'ing', 'er', 'ed', 'st', 'ch', 'ea', 'ou'];
    const up = (s: string) => s.toUpperCase();
    const pts = (w: string) => P(points(w.length), ['pt', 'pts'], ['pt', 'pts']);
    let lastRule = '';
    const used = new Map<string, number>();
    const hint = (): Hint | null => {
      if (won) return null;
      const left = listed
        .filter((w) => !found.includes(w))
        .map((w) => ({ w, p: findPath(letters, n, w)! }))
        .filter((x) => x.p)
        .sort((a, b) => a.w.length - b.w.length || (a.w < b.w ? -1 : 1));
      if (!left.length) return null;
      const els = (ix: number[]) => ix.map((i) => cells[i]);
      const make = (x: { w: string; p: number[] }, text: string, why: Element[] = [], at = els(x.p)): Hint => ({
        text,
        why,
        at,
        play: () => {
          path = x.p;
          render();
          submit();
        },
      });
      const diagAt = (p: number[]) =>
        p.findIndex((v, k) => k > 0 && Math.floor(v / n) !== Math.floor(p[k - 1] / n) && v % n !== p[k - 1] % n);
      const rules: Record<string, () => Hint | null> = {
        extend: () => {
          for (const f of [...found].reverse()) {
            const x = left.find((y) => y.w.length > f.length && y.w.startsWith(f));
            const tag = [...foundEl.children].find((el) => el.textContent === f);
            if (x)
              return make(
                x,
                L(
                  `You found ${up(f)}: add ${up(x.w.slice(f.length))} to make ${up(x.w)}, worth ${pts(x.w)}. Both words count.`,
                  `Vous avez trouvé ${up(f)} : ajoutez ${up(x.w.slice(f.length))} pour former ${up(x.w)}, qui vaut ${pts(x.w)}. Les deux mots comptent.`,
                ),
                tag ? [tag] : [],
              );
          }
          return null;
        },
        diag: () => {
          const x = left.find((y) => diagAt(y.p) > 0);
          if (!x) return null;
          const k = diagAt(x.p);
          return make(
            x,
            L(
              `Diagonals count too: ${up(x.w)} goes corner to corner from ${up(x.w[k - 1])} to ${up(x.w[k])}.`,
              `Les diagonales comptent aussi : ${up(x.w)} passe en diagonale entre ${up(x.w[k - 1])} et ${up(x.w[k])}.`,
            ),
          );
        },
        long: () => {
          const x = left[left.length - 1];
          if (x.w.length < minLen + 2) return null;
          return make(
            x,
            L(
              `Longer words pay more: ${up(x.w)} has ${x.w.length} letters and is worth ${pts(x.w)}, against 1 pt for 3 letters.`,
              `Les mots longs rapportent plus : ${up(x.w)} a ${x.w.length} lettres et vaut ${pts(x.w)}, contre 1 pt pour 3 lettres.`,
            ),
            [bar],
          );
        },
        chunk: () => {
          for (const c of CHUNKS) {
            const x = left.find((y) => y.w.includes(c) && y.w.length > c.length);
            if (!x) continue;
            const k = x.w.indexOf(c);
            const inChunk = x.p.slice(k, k + c.length);
            return make(
              x,
              L(
                `Spot common chunks like ${up(c)}: build around these tiles and ${up(x.w)} appears.`,
                `Repérez les groupes courants comme ${up(c)} : bâtissez autour de ces tuiles et ${up(x.w)} apparaît.`,
              ),
              els(inChunk),
              els(x.p.filter((i) => !inChunk.includes(i))),
            );
          }
          return null;
        },
        any: () => {
          const x = left[0];
          return make(
            x,
            L(
              `${up(x.w)} is hidden here too. Each tile counts only once per word, but tiles can be reused in other words.`,
              `${up(x.w)} se cache ici aussi. Une tuile ne sert qu’une fois par mot, mais elle peut resservir dans d’autres mots.`,
            ),
          );
        },
      };
      if (!found.length) {
        lastRule = 'start';
        const x = left.find((y) => diagAt(y.p) < 0) ?? left[0];
        return make(
          x,
          L(
            `Start with short words: ${up(x.w)} is a chain of touching letters. Drag through them (or tap each one) to submit it for ${pts(x.w)}.`,
            `Commencez par des mots courts : ${up(x.w)} est une chaîne de lettres qui se touchent. Glissez dessus (ou touchez-les une à une) pour ${pts(x.w)}.`,
          ),
        );
      }
      // Rules not shown yet first, then the least used; never the same one twice in a row if avoidable.
      const order = ['extend', 'diag', 'long', 'chunk', 'any'];
      const ranked = order
        .map((o, k) => ({ o, k, n: (used.get(o) ?? 0) + (o === lastRule ? 100 : 0) }))
        .sort((a, b) => a.n - b.n || a.k - b.k);
      for (const { o } of ranked) {
        const got = rules[o]();
        if (got) {
          lastRule = o;
          used.set(o, (used.get(o) ?? 0) + 1);
          return got;
        }
      }
      return null;
    };

    let typed = '';
    return {
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
        if (e.key === 'Backspace') {
          typed = path
            .map((i) => letters[i])
            .join('')
            .slice(0, -1);
          path = findPath(letters, n, typed) ?? [];
          render();
          return true;
        }
        const ch = letterKey(e.key);
        if (ch) {
          typed = path.map((i) => letters[i]).join('') + ch;
          const p = findPath(letters, n, typed);
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
