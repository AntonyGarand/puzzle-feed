import './style.css';
import { L, P } from '../../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../../core/types';
import { board, clearBtn, h, PALETTE, pad } from '../../ui/dom';
import { generateDeduct } from './gen';
import { breaksRule, clueState, dupes, findFix, isSolved, itemIn, levelOf, nextStep, placed, restore } from './rules';
import { aFr, cap, clueTexts, MARK, pickGroups, plain, valOf, wordOf as wordIn } from './words';

export const logicGrid: PuzzleDef = {
  id: 'logic-grid',
  get name() {
    return L('Logic Grid', 'Grille logique');
  },
  category: 'logic',
  undo: true,
  offByDefault: true,
  get rules() {
    return L('Use the clues to find who has what in each house.', 'Trouvez qui a quoi dans chaque maison grâce aux indices.');
  },
  help: () => ({
    goal: L(
      'Each house holds one person, and each person has exactly one thing of every kind. Use the clues to work out the whole table.',
      'Chaque maison abrite une personne, et chaque personne a exactement un élément de chaque sorte. Servez-vous des indices pour remplir tout le tableau.',
    ),
    steps: [
      L(
        'Columns are houses, numbered from left to right. Each row is one kind of thing (name, pet, drink…), and every value appears once per row.',
        'Les colonnes sont les maisons, numérotées de gauche à droite. Chaque rangée est une sorte d’élément (prénom, animal, boisson…), et chaque valeur y apparaît une fois.',
      ),
      L(
        '“Next to” means a neighbouring house; “directly left” means the house just before; “somewhere left” means any house before. “Either A or B” means exactly one of the two.',
        '« À côté » veut dire une maison voisine; « juste à gauche », la maison juste avant; « quelque part à gauche », n’importe quelle maison avant. « Soit A, soit B » veut dire exactement l’un des deux.',
      ),
      L(
        'Tap a cell, then a value on the pad to place it. Tap the same value again to erase it; Clear wipes the whole grid.',
        'Touchez une case, puis une valeur du pavé pour la placer. Touchez la même valeur de nouveau pour l’effacer; Effacer vide toute la grille.',
      ),
      L(
        'Switch the pad to ✗ to rule values out of a cell: the cell then lists what is still possible.',
        'Passez le pavé en mode ✗ pour exclure des valeurs d’une case : elle affiche alors ce qui reste possible.',
      ),
      L(
        'Tap a clue to cross it off. Clues fade once their items are placed correctly and turn red when broken.',
        'Touchez un indice pour le rayer. Les indices pâlissent quand leurs éléments sont bien placés et passent au rouge s’ils ne sont pas respectés.',
      ),
    ],
    tips: [
      L(
        'Start with clues that name a house, then follow the clues that link two things together.',
        'Commencez par les indices qui nomment une maison, puis suivez ceux qui relient deux éléments.',
      ),
      L(
        'Someone “directly left” of another can’t be in the last house: rule out the edges with ✗.',
        'Quelqu’un « juste à gauche » d’un autre ne peut pas être dans la dernière maison : excluez les bords avec ✗.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [60, 150, 270, 360, 540]),
  create(ctx) {
    const { rng, difficulty: d } = ctx;
    const { n, K, weights, dropFirst } = levelOf(d);

    // Name is always a row; the others are drawn at random, values keep the list order.
    const groups = pickGroups(rng, n, K);
    const { pos: solPos, clues } = generateDeduct({ n, groups: K, weights, dropFirst, rng });
    const size = n * K;
    // Sentence wording is fixed at generation time (the rng stream must not depend on the locale).
    const flip = clues.map(() => rng.chance(0.5));
    const texts = clueTexts(groups, n, clues, flip);

    // ---- state ----
    const { vals, xs, struck, sel: sel0, mark: mark0 } = restore(n, size, clues.length, ctx.saved);
    let sel = sel0;
    let mark = mark0;
    let done = false;

    // ---- view ----
    const icon = (item: number, cls: string) => {
      const v = valOf(groups, n, item);
      if (v.col !== undefined) return h('span', { class: `${cls} lg-sw`, style: `--c:${PALETTE[v.col]}` });
      return h('span', { class: `${cls}${v.ic ? '' : ' lg-name'}` }, v.ic || v.label);
    };
    const wordOf = (item: number) => wordIn(groups, n, item);

    const grid = board(n + 1, K + 1, 'lg');
    grid.style.setProperty('--n', String(n));
    grid.append(h('div', { class: 'lg-hd' }));
    for (let p = 0; p < n; p++) grid.append(h('div', { class: 'lg-hd' }, String(p + 1)));
    const cellEls: HTMLButtonElement[] = [];
    for (let g = 0; g < K; g++) {
      grid.append(h('div', { class: 'lg-rl', title: groups[g].name(), 'aria-label': groups[g].name() }, groups[g].ic));
      for (let p = 0; p < n; p++) {
        const i = g * n + p;
        const el = h('button', { type: 'button', class: 'cell', 'aria-label': `${groups[g].name()} ${p + 1}`, onclick: () => select(i) });
        cellEls.push(el);
        grid.append(el);
      }
    }

    const clueEls = texts.map((t, k) => {
      const el = h('button', { type: 'button', class: 'lg-clue', 'aria-label': plain(t), onclick: () => strike(k) });
      // Each icon stays on the line of the word before it and the punctuation after it.
      let last = 0;
      for (const m of t.matchAll(MARK)) {
        const [, lead, word] = /^([^]*?)(\S*)$/.exec(t.slice(last, m.index))!;
        last = m.index + m[0].length;
        const punct = /^[.,]?/.exec(t.slice(last))![0];
        last += punct.length;
        el.append(lead, h('span', { class: 'lg-nw' }, word, icon(Number(m[1]), 'lg-ic'), punct));
      }
      el.append(t.slice(last));
      return el;
    });
    const clueBox = h('div', { class: 'lg-clues' }, ...clueEls);
    const padSlot = h('div', { class: 'lg-pad' });

    const renderPad = () => {
      const g = Math.floor(sel / n);
      const keys = groups[g].vals.map((v, i) => ({
        label: v.col !== undefined ? '' : v.ic || v.label!,
        value: String(i),
        class: `${v.col !== undefined ? 'swatch' : v.ic ? 'lg-k' : 'lg-k lg-name'}${xs[sel] & (1 << i) ? ' lg-out' : ''}`,
        style: v.col !== undefined ? `--c:${PALETTE[v.col]}` : undefined,
        aria: wordOf(g * n + i),
      }));
      keys.push({ label: '✗', value: 'x', class: mark ? 'sel' : '', style: undefined, aria: L('Rule out mode', 'Mode exclusion') });
      padSlot.replaceChildren(pad(keys, (k) => (k === 'x' ? toggleMark() : press(Number(k)))));
    };

    const render = () => {
      const bad = dupes(n, vals);
      const pos = placed(n, vals);
      const sc = sel % n;
      cellEls.forEach((el, i) => {
        const g = Math.floor(i / n);
        let cls = 'cell';
        if (i === sel) cls += ' sel';
        else if (i % n === sc) cls += ' peer';
        if (bad.has(i)) cls += ' err';
        if (vals[i] < 0 && xs[i]) cls += ' lg-c';
        if (el.className !== cls) el.className = cls;
        if (vals[i] >= 0) el.replaceChildren(icon(g * n + vals[i], 'lg-v'));
        else if (xs[i]) {
          const left = groups[g].vals.flatMap((_, v) => (xs[i] & (1 << v) ? [] : [icon(g * n + v, 'lg-cand')]));
          el.replaceChildren(h('span', { class: 'lg-cands' }, ...left));
        } else el.replaceChildren();
      });
      clueEls.forEach((el, k) => {
        const st = clueState(clues[k], pos);
        const cls = `lg-clue${st === 1 ? ' ok' : st === -1 ? ' err' : ''}${struck[k] ? ' done' : ''}`;
        if (el.className !== cls) el.className = cls;
      });
      renderPad();
      ctx.status(P(vals.filter((v) => v < 0).length, ['left', 'left'], ['à remplir', 'à remplir']));
    };

    const select = (i: number) => {
      sel = i;
      render();
    };
    const toggleMark = () => {
      mark = !mark;
      render();
    };
    const strike = (k: number) => {
      ctx.touch();
      struck[k] ^= 1;
      render();
    };

    const finish = () => {
      if (!isSolved(n, clues, vals)) return;
      done = true;
      ctx.solved();
    };

    /** Put value v in cell i (or take it out if it's already there). */
    const place = (i: number, v: number) => {
      if (done) return;
      ctx.touch();
      sel = i;
      if (vals[i] === v) {
        vals[i] = -1;
        render();
        return;
      }
      vals[i] = v;
      xs[i] &= ~(1 << v);
      const broken = breaksRule(n, clues, vals, i);
      render();
      if (broken) ctx.mistake();
      finish();
    };
    const press = (v: number) => {
      if (done) return;
      if (!mark) return place(sel, v);
      ctx.touch();
      xs[sel] ^= 1 << v;
      if (vals[sel] === v) vals[sel] = -1;
      render();
    };

    /** Clear: wipe every placed value, rule-out mark and crossed-off clue. */
    const clear = () => {
      if (done || !(vals.some((v) => v >= 0) || xs.some(Boolean) || struck.some(Boolean))) return;
      ctx.touch();
      vals.fill(-1);
      xs.fill(0);
      struck.fill(0);
      render();
    };
    ctx.root.append(h('div', { class: 'lg-wrap', style: `--k:${K}` }, grid, clueBox, padSlot));
    ctx.controls(clearBtn(clear));
    render();

    // ---- guide ----
    const hintFor = (f: { it: number; cell: number }, text: string, why: Element[]): Hint => ({
      text,
      why,
      at: [cellEls[f.cell]],
      play: () => {
        mark = false;
        place(f.cell, f.it % n);
      },
    });
    /**
     * A wrong value (a repeated one or a broken clue first), then a ✗ that rules out the right value:
     * ✗ marks are the player's eliminations, so crossing out the answer is a real mistake.
     */
    const check = (): Hint | null => {
      if (done) return null;
      const fx = findFix(n, clues, solPos, vals, xs);
      if (!fx) return null;
      if (fx.kind === 'ruledOut') {
        const { cell: i, v } = fx;
        return {
          kind: 'fix',
          text: L(
            `You ruled out ${wordOf(itemIn(n, i, v))} for house ${(i % n) + 1}, but it belongs there: that ✗ leads to a dead end.`,
            `Vous avez exclu ${wordOf(itemIn(n, i, v))} de la maison ${(i % n) + 1}, mais c’est sa place : ce ✗ mène à une impasse.`,
          ),
          at: [cellEls[i]],
          action: L('Remove the ✗', 'Enlever le ✗'),
          play: () => {
            const was = mark;
            select(i);
            if (!mark) toggleMark();
            if (xs[i] & (1 << v)) press(v);
            if (mark !== was) toggleMark();
          },
        };
      }
      const i = fx.cell;
      const v = vals[i];
      const word = cap(wordOf(itemIn(n, i, v)));
      const house = (i % n) + 1;
      const [text, why] =
        fx.kind === 'dupe'
          ? [
              L(
                `${word} is in two houses, but each value appears once per row.`,
                `${word} est dans deux maisons, mais chaque valeur n’apparaît qu’une fois par rangée.`,
              ),
              fx.twins.map((j) => cellEls[j]),
            ]
          : fx.kind === 'clue'
            ? [
                L(
                  `With ${wordOf(itemIn(n, i, v))} in house ${house}, this clue no longer holds.`,
                  `Avec ${wordOf(itemIn(n, i, v))} dans la maison ${house}, cet indice n’est plus respecté.`,
                ),
                [clueEls[fx.clue]],
              ]
            : [
                L(
                  `${word} in house ${house} breaks no clue yet, but it leads to a dead end.`,
                  `${word} dans la maison ${house} ne brise encore aucun indice, mais mène à une impasse.`,
                ),
                [],
              ];
      return {
        kind: 'fix',
        text,
        why,
        at: [cellEls[i]],
        action: L('Take it out', 'Retirer la valeur'),
        play: () => {
          mark = false;
          if (vals[i] === v) place(i, v);
        },
      };
    };
    const hint = (): Hint | null => {
      if (done) return null;
      const fix = check();
      if (fix) return fix;
      const step = nextStep(n, clues, vals);
      if (!step) return null;
      const f = step.fact;
      const w = wordOf(f.it),
        p = f.p + 1;
      // A row with a single gap.
      if (step.kind === 'lastGap')
        return hintFor(
          f,
          L(
            `Every value appears once per row, and house ${p} is the last gap in this one: it gets ${w}.`,
            `Chaque valeur apparaît une fois par rangée : il ne reste que ${w} pour la maison ${p}.`,
          ),
          [],
        );
      // One clue on its own, with what's already placed.
      if (step.kind === 'clue') {
        const text =
          step.how === 'at'
            ? L(`This clue puts ${w} in house ${p}.`, `Cet indice place ${w} dans la maison ${p}.`)
            : step.how === 'pair'
              ? L(
                  `This clue pairs ${w} with ${wordOf(step.mate)}, already in house ${p}.`,
                  `Cet indice associe ${w} ${aFr(wordOf(step.mate))}, déjà dans la maison ${p}.`,
                )
              : L(
                  `With what’s already placed, this clue leaves only house ${p} for ${w}.`,
                  `Avec ce qui est déjà placé, cet indice ne laisse que la maison ${p} pour ${w}.`,
                );
        return hintFor(f, text, [clueEls[step.clue]]);
      }
      // Several clues together.
      return hintFor(
        f,
        L(
          `Rule out the houses each clue forbids: combined, they leave only house ${p} for ${w}.`,
          `Excluez les maisons que chaque indice interdit : ensemble, ils ne laissent que la maison ${p} pour ${w}.`,
        ),
        step.clues.map((k) => clueEls[k]),
      );
    };
    const move = (dr: number, dc: number) => {
      const r = Math.min(K - 1, Math.max(0, Math.floor(sel / n) + dr)),
        c = Math.min(n - 1, Math.max(0, (sel % n) + dc));
      select(r * n + c);
    };

    return {
      snapshot: () => ({ vals, xs, struck, sel, mark }),
      hint,
      check,
      onKey(e) {
        const k = Number(e.key);
        if (k >= 1 && k <= n) {
          press(k - 1);
          return true;
        }
        if (e.key === 'x' || e.key === 'X') {
          toggleMark();
          return true;
        }
        if (e.key === 'Backspace' || e.key === 'Delete') {
          if (vals[sel] >= 0 && !done) place(sel, vals[sel]);
          return true;
        }
        const mv: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
        if (mv[e.key]) {
          move(...mv[e.key]);
          return true;
        }
        return false;
      },
    };
  },
};
