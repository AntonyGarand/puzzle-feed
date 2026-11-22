import { L, P, wordLocale } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { btn, h, shake } from '../core/ui';
import { answers, commonOfLength, isWord, letterKey } from './wordkit/lexicon';
import { ANAGRAMS, anagramKey, WORDS } from './words';
import './anagram.css';

export const anagram: PuzzleDef = {
  id: 'anagram',
  get name() {
    return L('Anagram', 'Anagramme');
  },
  category: 'words',
  get rules() {
    return L('Unscramble the word. Tap the letters or type.', 'Remettez les lettres dans l’ordre. Touchez ou tapez.');
  },
  localized: true,
  help: () => ({
    goal: L('Rearrange the scrambled letters to spell a word.', 'Replacez les lettres mélangées dans le bon ordre pour former un mot.'),
    steps: [
      L('The word gets longer with the level: from 4 letters up to 8.', 'Le mot s’allonge avec le niveau : de 4 à 8 lettres.'),
      L(
        'Tap the tiles in order to fill the slots. The word is checked as soon as every slot is full.',
        'Touchez les tuiles dans l’ordre pour remplir les cases. Le mot est vérifié dès que toutes les cases sont pleines.',
      ),
      L(
        'Tap a filled slot to take back that letter and the ones after it.',
        'Touchez une case remplie pour retirer cette lettre et celles qui la suivent.',
      ),
      L(
        'A wrong word shakes, counts as a mistake and clears the slots.',
        'Un mauvais mot fait trembler les cases, compte comme une erreur et les vide.',
      ),
      L(
        'Keyboard: type the letters; Backspace removes the last one, Escape clears. Shuffle mixes the tiles again.',
        'Clavier : tapez les lettres (sans accents, É = E); Retour arrière retire la dernière, Échap vide tout. « Mélanger » brasse les tuiles.',
      ),
    ],
    tips: [
      L(
        'Look for common endings such as -ING, -ER or -TION, and build from there.',
        'Repérez les terminaisons courantes comme -ER, -EUR ou -TION, puis complétez le début.',
      ),
      L('Stuck? Shuffle: a new order often makes the word jump out.', 'Bloqué? Mélangez : un nouvel ordre fait souvent apparaître le mot.'),
    ],
  }),
  par: (d) => byLevel(d, [15, 25, 40, 60, 90]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const len = byLevel(d, [4, 5, 6, 7, 8]);
    const fr = wordLocale() === 'fr';
    const word = rng.pick(fr ? answers(len) : WORDS[len]);
    const key = anagramKey(word);
    // French: any common word with the same letters (and, once loaded, any dictionary word) also counts.
    const valid = fr ? new Set(commonOfLength(len).filter((w) => anagramKey(w) === key)) : ANAGRAMS.get(key)!;
    const accepts = (g: string) => valid.has(g) || (fr && isWord(g) === true);
    let letters = [...word];
    do rng.shuffle(letters);
    while (valid.has(letters.join('')));

    // picked[k] = index into `letters`
    let picked: number[] = [];
    const slots = h('div', { class: 'slots', style: `--len:${len}` });
    const tiles = h('div', { class: 'slots tiles', style: `--len:${len}` });

    const render = () => {
      slots.replaceChildren(
        ...Array.from({ length: len }, (_, k) =>
          h(
            'button',
            { type: 'button', class: `cell slot ${picked[k] != null ? 'filled' : ''}`, onclick: () => unpick(k) },
            picked[k] != null ? letters[picked[k]] : '',
          ),
        ),
      );
      tiles.replaceChildren(
        ...letters.map((ch, i) =>
          h('button', { type: 'button', class: `cell ${picked.includes(i) ? 'used' : ''}`, onclick: () => pick(i) }, ch),
        ),
      );
      ctx.status(`${picked.length} / ${P(len, ['letter', 'letters'], ['lettre', 'lettres'])}`);
    };
    const check = () => {
      if (picked.length < len) return;
      const guess = picked.map((i) => letters[i]).join('');
      if (accepts(guess)) ctx.solved();
      else {
        ctx.mistake();
        shake(slots);
        setTimeout(() => {
          picked = [];
          render();
        }, 350);
      }
    };
    const pick = (i: number) => {
      if (picked.includes(i) || picked.length >= len) return;
      ctx.touch();
      picked.push(i);
      render();
      check();
    };
    const unpick = (k: number) => {
      if (k >= picked.length) return;
      picked = picked.slice(0, k);
      render();
    };
    const reshuffle = () => {
      const chosen = picked.map((i) => letters[i]);
      rng.shuffle(letters);
      // re-map picked letters onto the new order
      const used = new Set<number>();
      picked = chosen.map((ch) => {
        const i = letters.findIndex((l, j) => l === ch && !used.has(j));
        used.add(i);
        return i;
      });
      render();
    };
    ctx.controls(btn(L('Shuffle', 'Mélanger'), reshuffle, 'ghost'));
    const sv = ctx.saved as { letters?: string[]; picked?: number[] } | undefined;
    if (Array.isArray(sv?.letters) && [...sv.letters].sort().join('') === [...word].sort().join('')) {
      letters = sv.letters;
      const saved = Array.isArray(sv.picked) ? sv.picked : [];
      picked = saved.filter((i, k) => Number.isInteger(i) && i >= 0 && i < len && saved.indexOf(i) === k);
      if (picked.length >= len) picked = []; // never resume a full (already checked) row
    }
    root.append(slots, tiles);
    render();
    // ---------- guide ----------
    const ENDS = fr
      ? ['tion', 'ment', 'euse', 'eur', 'ier', 'ble', 'er', 're', 'te']
      : ['tion', 'ing', 'ness', 'ment', 'est', 'er', 'ed', 'ly'];
    const STARTS = fr
      ? ['ch', 'tr', 'pr', 'br', 'gr', 'pl', 'cl', 'qu', 're', 'de']
      : ['th', 'sh', 'ch', 'st', 'tr', 'br', 'gr', 'pl', 'cl', 'wh', 'un', 're'];
    const VOWELS = 'aeiouy';
    const up = (s: string) => s.toUpperCase();
    /** Unused tile indices spelling `s`, skipping the tiles in `skip`. */
    const tilesFor = (s: string, skip: number[] = picked) => {
      const used = [...skip];
      const out: number[] = [];
      for (const ch of s) {
        const i = letters.findIndex((l, j) => l === ch && !used.includes(j));
        if (i < 0) return null;
        used.push(i);
        out.push(i);
      }
      return out;
    };
    const tileEls = (ix: number[]) => ix.map((i) => tiles.children[i]);
    const slotEls = (n: number) => Array.from(slots.children).slice(0, n);
    const place = (s: string) => () => {
      for (const ch of s) {
        const i = letters.findIndex((l, j) => l === ch && !picked.includes(j));
        if (i >= 0) pick(i);
      }
    };
    /** A start no word begins with: take back from the first letter that leaves the word list. */
    const wrongStart = (): Hint | null => {
      const pre = picked.map((i) => letters[i]).join('');
      if (!pre || [...valid].some((w) => w.startsWith(pre))) return null;
      let k = 0;
      while (k < pre.length && [...valid].some((w) => w.startsWith(pre.slice(0, k + 1)))) k++;
      return {
        kind: 'fix',
        text:
          k === 0
            ? L(
                `No word here starts with ${up(pre[0])}. Tap the first slot to take the letters back.`,
                `Aucun mot ici ne commence par ${up(pre[0])}. Touchez la première case pour retirer les lettres.`,
              )
            : L(
                `No word starts with ${up(pre.slice(0, k + 1))}. Tap the ${up(pre[k])} slot to take back that letter and the ones after it.`,
                `Aucun mot ne commence par ${up(pre.slice(0, k + 1))}. Touchez la case du ${up(pre[k])} pour retirer cette lettre et les suivantes.`,
              ),
        why: slotEls(k),
        at: slotEls(pre.length).slice(k, k + 1),
        action: L('Take back', 'Retirer'),
        play: () => unpick(k),
      };
    };
    const hint = (): Hint | null => {
      const pre = picked.map((i) => letters[i]).join('');
      const wrong = wrongStart();
      if (wrong) return wrong;
      if (pre.length === len) return null; // solved
      const target = word.startsWith(pre) ? word : [...valid].find((w) => w.startsWith(pre))!;
      const rest = target.slice(pre.length);
      const one = (s: string, text: string, why: Element[] = []): Hint | null => {
        const ix = tilesFor(s);
        return ix ? { text, why, at: tileEls(ix), play: place(s) } : null;
      };
      if (!pre) {
        const end = ENDS.find((e) => e.length < len - 1 && target.endsWith(e));
        if (end) {
          const head = target.slice(0, len - end.length);
          const endIx = tilesFor(end, []);
          return one(
            target[0],
            L(
              `These letters can end in -${up(end)}. Set those aside: the start is made of ${up([...head].join(', '))}, so tap ${up(target[0])} first.`,
              `Ces lettres peuvent finir en -${up(end)}. Mettez-les de côté : le début se fait avec ${up([...head].join(', '))}; touchez d’abord ${up(target[0])}.`,
            ),
            endIx ? tileEls(endIx) : [],
          );
        }
        const st = STARTS.find((p) => target.startsWith(p));
        if (st)
          return one(
            st,
            L(
              `${up(st)} is a common way to start a word, and both letters are here. Tap ${up(st[0])} then ${up(st[1])}: each tile fills the next slot.`,
              `${up(st)} est un début de mot courant, et les deux lettres sont là. Touchez ${up(st[0])} puis ${up(st[1])} : chaque tuile remplit la case suivante.`,
            ),
          );
        return one(
          target[0],
          L(
            `Try each letter as the start and say it out loud. ${up(target[0])} leads somewhere: tap it to fill the first slot.`,
            `Essayez chaque lettre en tête et prononcez le début. ${up(target[0])} mène quelque part : touchez-la pour remplir la première case.`,
          ),
        );
      }
      const why = slotEls(pre.length);
      if (rest.length === 1)
        return one(
          rest,
          L(
            `Only ${up(rest)} is left, and ${up(pre)}${up(rest)} is a word. The word is checked as soon as every slot is full.`,
            `Il ne reste que ${up(rest)}, et ${up(pre)}${up(rest)} est un mot. Le mot est vérifié dès que toutes les cases sont pleines.`,
          ),
          why,
        );
      const end = ENDS.find((e) => rest === e);
      if (end)
        return one(
          end,
          L(
            `${up(pre)} needs an ending, and the tiles left spell -${up(end)}. Place them in order to finish the word.`,
            `${up(pre)} a besoin d’une fin, et les tuiles restantes forment -${up(end)}. Placez-les dans l’ordre pour finir le mot.`,
          ),
          why,
        );
      if (pre.endsWith('q') && rest[0] === 'u')
        return one(
          'u',
          L('Q is almost always followed by U, so U comes next.', 'Q est presque toujours suivi de U : U vient ensuite.'),
          why,
        );
      const last = pre[pre.length - 1];
      if (VOWELS.includes(rest[0]) && !VOWELS.includes(last))
        return one(
          rest[0],
          L(
            `After ${up(pre)}, a vowel makes it sayable. ${up(rest[0])} fits: ${up(pre + rest[0])}…`,
            `Après ${up(pre)}, il faut une voyelle pour que ça se prononce. ${up(rest[0])} convient : ${up(pre + rest[0])}…`,
          ),
          why,
        );
      const pair = STARTS.find((p) => rest.startsWith(p) && rest.length > p.length);
      if (pair)
        return one(
          pair,
          L(
            `${up(pair)} is a common pair of letters, and both tiles are free. Place them together after ${up(pre)}.`,
            `${up(pair)} est une paire de lettres courante, et les deux tuiles sont libres. Placez-les ensemble après ${up(pre)}.`,
          ),
          why,
        );
      const after = rest.slice(1).toUpperCase();
      return one(
        rest[0],
        after.length === 1
          ? L(
              `Keep the last tile, ${after}, for the end: ${up(pre)}${up(rest[0])}${after} reads well, so ${up(rest[0])} comes next.`,
              `Gardez la dernière tuile, ${after}, pour la fin : ${up(pre)}${up(rest[0])}${after} se lit bien, donc ${up(rest[0])} vient ensuite.`,
            )
          : L(
              `${up(pre)}${up(rest[0])}… sounds like the start of a word, and ${after.split('').join(', ')} can still follow it.`,
              `${up(pre)}${up(rest[0])}… sonne comme un début de mot, et ${after.split('').join(', ')} peuvent encore suivre.`,
            ),
        why,
      );
    };
    return {
      check: wrongStart,
      hint,
      snapshot: () => ({ letters, picked }),
      onKey(e) {
        if (e.key === 'Backspace') {
          unpick(picked.length - 1);
          return true;
        }
        if (e.key === 'Escape') {
          picked = [];
          render();
          return true;
        }
        const ch = letterKey(e.key);
        if (ch) {
          const i = letters.findIndex((l, j) => l === ch && !picked.includes(j));
          if (i >= 0) pick(i);
          else shake(tiles);
          return true;
        }
        return false;
      },
    };
  },
};
