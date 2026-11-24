import { L } from '../../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../../core/types';
import { board, clearBtn, h, PALETTE, ruleBreaks, shake } from '../../ui/dom';
import { generate } from './gen';
import { broken, letter, restore, seating, seatsFor, solved, stageOf, startOf, type Wish, wishState } from './rules';
import { badgeText, say, sayAll, sayTrait, traitIcon, VENUE, wishIcon } from './words';
import './style.css';

export const seats: PuzzleDef = {
  id: 'seats',
  get name() {
    return L('Seats', 'Sièges');
  },
  category: 'logic',
  undo: true,
  get rules() {
    return L('Seat everyone so all their wishes hold.', 'Placez tout le monde selon ses souhaits.');
  },
  help: () => ({
    goal: L(
      'Find everyone a seat on the bus, at the cinema or at the restaurant so that each person gets all their wishes.',
      'Trouvez une place à chacun dans l’autobus, au cinéma ou au restaurant pour que tous aient ce qu’ils souhaitent.',
    ),
    steps: [
      L(
        'The room is seen from above. Beside means the next seat in the same row, on the same side of the aisle or table. At a restaurant, the seat facing you is a neighbour too.',
        'La salle est vue de haut. À côté veut dire le siège voisin dans la même rangée, du même côté de l’allée ou de la table. Au restaurant, la place en face est aussi une voisine.',
      ),
      L(
        'Under the plan, each person shows their wishes: a place (window, aisle, front or back row, middle, kitchen, a table), or someone to sit beside (♥), left of (→), facing (↕), right behind (↑) or not beside (✕).',
        'Sous le plan, chaque personne montre ses souhaits : une place (fenêtre, allée, première ou dernière rangée, milieu, cuisine, une table), ou quelqu’un à côté (♥), à gauche de (→), en face (↕), juste derrière (↑) ou pas à côté (✕).',
      ),
      L(
        'Some people smell strong, are loud, are kids, eat or wear a big hat. Others want no smell, noise or kid beside them, or no hat in front. A kid always needs a grown-up beside them.',
        'Certains sentent fort, sont bruyants, sont des enfants, mangent ou portent un grand chapeau. D’autres ne veulent ni odeur, ni bruit, ni enfant à côté, ou pas de chapeau devant. Un enfant a toujours besoin d’un adulte à côté.',
      ),
      L(
        'Tap a person (their wishes are spelled out above the list), then a free seat. Tap a seated person to pick them up; tap their seat again to stand them up, or another person’s seat to swap.',
        'Touchez une personne (ses souhaits sont écrits au-dessus de la liste), puis un siège libre. Touchez une personne assise pour la reprendre; touchez encore son siège pour la lever, ou le siège d’une autre pour les échanger.',
      ),
      L(
        'On harder levels, once everyone is seated some leave and others arrive. Those who stay can’t move, and their wishes still count. People who ate leave leftovers: no one sits there, and it smells.',
        'Aux niveaux difficiles, une fois tout le monde assis, certains partent et d’autres arrivent. Ceux qui restent ne bougent plus, et leurs souhaits comptent encore. Ceux qui mangeaient laissent des restes : personne ne s’y assoit, et ça sent.',
      ),
      L(
        'A broken wish turns red and counts as a mistake. Flat seats can’t change. Undo (Z) and Clear are in the footer.',
        'Un souhait brisé passe au rouge et compte comme une erreur. Les sièges à plat ne changent pas. Annuler (Z) et Effacer sont en bas.',
      ),
    ],
    tips: [
      L(
        'Start with people who have two place wishes, like window and front row: few seats fit both.',
        'Commencez par les personnes qui ont deux souhaits de place, comme fenêtre et première rangée : peu de sièges conviennent.',
      ),
      L(
        'Chains of ♥, → and ↑ wishes settle whole groups at once. Then keep the noisy, smelly and kids away from those who mind.',
        'Les chaînes de ♥, → et ↑ placent des groupes entiers. Gardez ensuite les bruyants, ceux qui sentent et les enfants loin de ceux que ça dérange.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [45, 100, 200, 300, 450]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const z = generate(rng, d);
    const V = z.v;
    const words = VENUE[V.kind];

    let k = 0;
    let st = stageOf(z, 0);
    let pos = startOf(z, st);
    let sel = -1;
    let done = false;
    const sv = ctx.saved as { sel?: unknown } | undefined;
    const back = restore(z, ctx.saved);
    if (back) {
      k = back.k;
      st = stageOf(z, k);
      pos = back.pos.slice();
      const s0 = sv?.sel;
      if (typeof s0 === 'number' && st.fresh.includes(s0) && !z.given.includes(s0)) sel = s0;
    }

    /** People who can't move now: those who were already there, and givens. */
    const fixed = (p: number) => z.people[p].arrive < k || z.given.includes(p);
    const col = (p: number) => PALETTE[p % PALETTE.length];

    const top = h('div', { class: 'st-wall' }, words.top());
    const grid = board(1, 1, `st-room st-${V.kind}`);
    grid.style.gridTemplateColumns = V.cols;
    grid.style.gridTemplateRows = V.rows;
    for (const dc of V.deco)
      grid.append(
        h(
          'div',
          { class: `st-${dc.cls}`, 'aria-hidden': 'true', style: `grid-area:${dc.row} / ${dc.col} / span ${dc.rows} / span ${dc.cols}` },
          dc.text ?? null,
        ),
      );
    const seatEls = V.seats.map((seat, i) => {
      const el = h('button', {
        type: 'button',
        class: 'cell st-seat',
        style: `grid-area:${seat.row} / ${seat.col}`,
        onclick: () => tapSeat(i),
      });
      grid.append(el);
      return el;
    });
    const bottom = words.bottom ? h('div', { class: 'st-wall st-bottom' }, words.bottom()) : null;
    const line = h('div', { class: 'st-line' });
    const tray = h('div', { class: 'st-tray' });
    let chips: { p: number; el: HTMLButtonElement; badges: HTMLElement[] }[] = [];
    const buildTray = () => {
      const here = z.people.flatMap((_, p) => (st.here[p] ? [p] : []));
      chips = here.map((p) => {
        const person = z.people[p];
        const badges = person.wish.map((w) =>
          h('span', { class: 'st-w' }, wishIcon(w.t), badgeText(w) ? h('b', null, badgeText(w)) : null),
        );
        const el = h(
          'button',
          { type: 'button', class: 'key st-p', onclick: () => tapChip(p) },
          h('span', { class: 'st-tag', style: `--c:${col(p)}` }, letter(p)),
          person.trait ? traitIcon(person.trait) : null,
          h('span', { class: 'st-ws' }, ...badges),
        );
        return { p, el, badges };
      });
      tray.style.setProperty('--tc', String(here.length > 6 ? 4 : 3));
      tray.replaceChildren(...chips.map((c) => c.el));
    };
    buildTray();
    const wrap = h('div', { class: 'st-wrap' }, top, grid, bottom, line, tray);
    root.append(wrap);
    const watch = ruleBreaks(wrap, ctx.mistake);

    /** What changed at the start of this stage, for the line under the plan. */
    const news = () => {
      const gone = z.people.flatMap((x, p) => (x.leave === k ? [letter(p)] : []));
      const came = st.fresh.map(letter);
      return L(
        `${words.stage()} ${k + 1}. Gone: ${gone.join(', ')} · New: ${came.join(', ')}`,
        `${words.stage()} ${k + 1}. Partis : ${gone.join(', ')} · Arrivés : ${came.join(', ')}`,
      );
    };

    const render = () => {
      const at = seating(z, pos);
      const final = st.here.every((x, p) => !x || pos[p] >= 0);
      const bad = new Set<number>();
      for (const { p, el, badges } of chips) {
        z.people[p].wish.forEach((w, i) => {
          const state = wishState(z, st, pos, at, p, w, final);
          const gone = 'o' in w && !st.here[w.o];
          badges[i].classList.toggle('err', state === 'bad');
          badges[i].classList.toggle('ok', state === 'ok' && !gone);
          badges[i].classList.toggle('void', gone);
          if (state === 'bad') bad.add(p);
        });
        el.classList.toggle('sel', p === sel);
        el.classList.toggle('used', pos[p] >= 0);
        el.classList.toggle('given', fixed(p));
        const t = z.people[p].trait;
        el.setAttribute(
          'aria-label',
          `${letter(p)}${t ? ` (${sayTrait(t)})` : ''}: ${sayAll(z.people[p].wish)}${pos[p] >= 0 ? L(', seated', ', assis') : ''}${bad.has(p) ? L(', unhappy', ', insatisfait') : ''}`,
        );
      }
      seatEls.forEach((el, i) => {
        const p = at[i];
        const dirty = st.dirty[i];
        el.classList.toggle('on', p >= 0);
        el.classList.toggle('sel', p >= 0 && p === sel);
        el.classList.toggle('given', p >= 0 && fixed(p));
        el.classList.toggle('err', p >= 0 && bad.has(p));
        el.classList.toggle('dirty', dirty);
        el.classList.toggle('target', sel >= 0 && p < 0 && !dirty);
        el.setAttribute('style', `grid-area:${V.seats[i].row} / ${V.seats[i].col}${p >= 0 ? `;--c:${col(p)}` : ''}`);
        const t = p >= 0 ? z.people[p].trait : null;
        el.replaceChildren(...(p >= 0 ? [letter(p), t ? traitIcon(t) : ''] : dirty ? [traitIcon('plate')] : []));
        el.setAttribute(
          'aria-label',
          p >= 0
            ? `${letter(p)}${t ? ` (${sayTrait(t)})` : ''}`
            : dirty
              ? L('Leftovers', 'Des restes')
              : `${L('Free seat', 'Siège libre')}${V.seats[i].table ? ` (${L('table', 'table')} ${V.seats[i].table})` : ''}`,
        );
      });
      const person = sel >= 0 ? z.people[sel] : null;
      line.replaceChildren(
        person
          ? h(
              'span',
              null,
              h(
                'strong',
                null,
                L(
                  `${letter(sel)}${person.trait ? ` (${sayTrait(person.trait)})` : ''}: `,
                  `${letter(sel)}${person.trait ? ` (${sayTrait(person.trait)})` : ''} : `,
                ),
              ),
              sayAll(person.wish.filter((w) => !('o' in w) || st.here[w.o])),
            )
          : k > 0 && st.fresh.every((p) => pos[p] < 0 || z.given.includes(p))
            ? h('span', null, news())
            : h('span', { class: 'st-tip' }, L('Tap a person, then a seat.', 'Touchez une personne, puis un siège.')),
      );
      const here = st.here.filter(Boolean).length;
      const seated = pos.filter((x, p) => x >= 0 && st.here[p]).length;
      const stage = z.stages > 1 ? `${words.stage()} ${k + 1} / ${z.stages} · ` : '';
      ctx.status(`${stage}${seated} / ${words.people(here)}`);
    };

    /** Move on to the next stage: some leave, others arrive. */
    const advance = () => {
      k++;
      st = stageOf(z, k);
      pos = startOf(z, st);
      sel = -1;
      buildTray();
    };
    const finish = () => {
      render();
      watch(true);
      if (!solved(z, st, pos)) return;
      if (k + 1 < z.stages) {
        while (k + 1 < z.stages && solved(z, st, pos)) advance();
        render();
        watch(false);
        for (const c of chips) if (st.fresh.includes(c.p)) c.el.animate?.([{ transform: 'scale(0.6)' }, { transform: 'scale(1)' }], 220);
        if (!solved(z, st, pos)) return;
      }
      done = true;
      ctx.solved();
    };
    const tapChip = (p: number) => {
      if (done) return;
      const c = chips.find((x) => x.p === p);
      if (fixed(p)) {
        if (c) shake(c.el);
        return;
      }
      ctx.touch();
      sel = sel === p ? -1 : p;
      render();
    };
    const tapSeat = (i: number) => {
      if (done) return;
      const q = pos.indexOf(i);
      if (st.dirty[i] || (q >= 0 && fixed(q))) {
        shake(seatEls[i]);
        return;
      }
      ctx.touch();
      if (sel < 0) {
        if (q >= 0) sel = q;
        render();
        return;
      }
      if (q === sel) pos[sel] = -1;
      else {
        if (q >= 0) pos[q] = pos[sel];
        pos[sel] = i;
      }
      sel = -1;
      finish();
    };
    /** Stand `p` up through the same taps a player would make. */
    const standUp = (p: number) => {
      if (pos[p] < 0) return;
      if (sel !== p) tapSeat(pos[p]);
      if (sel === p) tapSeat(pos[p]);
    };
    /** Seat `p` on free seat `i` through the player's taps. */
    const sit = (p: number, i: number) => {
      if (sel !== p) tapChip(p);
      tapSeat(i);
    };

    // A stage with everyone seated from the start (only ever a generator fallback) is skipped.
    while (k + 1 < z.stages && solved(z, st, pos)) advance();
    render();
    watch(false);
    ctx.controls(
      clearBtn(() => {
        if (done) return;
        const start = startOf(z, st);
        if (pos.every((x, p) => x === start[p])) return;
        ctx.touch();
        pos = start;
        sel = -1;
        render();
        watch(false);
      }),
    );

    const chipOf = (p: number) => chips.find((c) => c.p === p)?.el;
    /** People seated this stage, by the player, off the solution. */
    const misplaced = (p: number) => p >= 0 && st.fresh.includes(p) && !z.given.includes(p) && pos[p] >= 0 && pos[p] !== z.sol[p];

    const check = (): Hint | null => {
      if (done) return null;
      const fix = (p: number, text: string, why: (Element | undefined)[]): Hint => ({
        kind: 'fix',
        text,
        why: why.filter((e): e is Element => !!e),
        at: [seatEls[pos[p]]],
        action: L('Stand up', 'Le lever'),
        play: () => standUp(p),
      });
      const at = seating(z, pos);
      for (const p of z.people.keys()) {
        if (!st.here[p]) continue;
        const ws = broken(z, st, pos, p);
        if (!ws.length) continue;
        const w: Wish = ws[0];
        // Stand up whoever involved sits off the solution: the person, the one named, or a neighbour.
        const seat = pos[p] >= 0 ? V.seats[pos[p]] : null;
        const near = seat ? [...seat.near, seat.front, seat.back].map((u) => (u >= 0 ? at[u] : -1)) : [];
        const q = [p, 'o' in w ? w.o : -1, ...near].find(misplaced);
        if (q == null) continue;
        return fix(
          q,
          L(
            `${letter(p)} wants to sit ${say(w)}, and that can’t happen now.`,
            `${letter(p)} veut être ${say(w)}, et c’est impossible ainsi.`,
          ),
          [chipOf(p)],
        );
      }
      const wrong = z.people.findIndex((_, p) => misplaced(p));
      if (wrong < 0) return null;
      return fix(
        wrong,
        L(
          `${letter(wrong)} is happy there for now, but it leads to a dead end: no way of seating everyone keeps ${letter(wrong)} in that seat.`,
          `${letter(wrong)} est content là pour l’instant, mais c’est une impasse : aucune façon d’asseoir tout le monde ne garde ${letter(wrong)} sur ce siège.`,
        ),
        [],
      );
    };

    const hint = (): Hint | null => {
      if (done) return null;
      const standing = st.fresh.filter((p) => pos[p] < 0);
      if (!standing.length) return null;
      const options = standing.map((p) => ({ p, seats: seatsFor(z, st, pos, p) }));
      const wishes = (p: number) => sayAll(z.people[p].wish.filter((w) => !('o' in w) || st.here[w.o]));
      const forced = options.find((o) => o.seats.length === 1 && o.seats[0] === z.sol[o.p]);
      if (forced) {
        const { p } = forced;
        const own = z.people[p].wish.some((w) => !('o' in w) || st.here[w.o]);
        return {
          text: own
            ? L(
                `${letter(p)} wants to sit ${wishes(p)}. Only one free seat gives them that without breaking anyone’s wishes.`,
                `${letter(p)} veut être ${wishes(p)}. Un seul siège libre le permet sans briser les souhaits des autres.`,
              )
            : L(
                `${letter(p)} has no wish of their own, but only one free seat leaves everyone else’s wishes intact.`,
                `${letter(p)} n’a pas de souhait, mais un seul siège libre respecte les souhaits de tous les autres.`,
              ),
          why: [chipOf(p)].filter((e): e is HTMLButtonElement => !!e),
          at: [seatEls[z.sol[p]]],
          play: () => sit(p, z.sol[p]),
        };
      }
      // Nothing forced yet: the person with the fewest seats left, where everything still works out.
      const best = options.reduce((a, o) => (o.seats.length < a.seats.length ? o : a));
      return {
        text: L(
          `${letter(best.p)} (${wishes(best.p)}) has the fewest seats left: ${best.seats.length}. Only this one still lets everyone else get their wishes.`,
          `${letter(best.p)} (${wishes(best.p)}) a le moins de sièges possibles : ${best.seats.length}. Seul celui-ci laisse tous les autres obtenir leurs souhaits.`,
        ),
        why: [chipOf(best.p)].filter((e): e is HTMLButtonElement => !!e),
        at: [seatEls[z.sol[best.p]]],
        play: () => sit(best.p, z.sol[best.p]),
      };
    };

    return { snapshot: () => ({ k, pos, sel }), hint, check };
  },
};
