import { L } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { board, btn, h } from '../core/ui';
import { applyOp, evaluate, genFactory, type Op } from './playkit/factory-gen';
import './factory.css';

/** "×2" → "× 2", for sums written out in the guide. */
const spaced = (op: Op) => `${op[0]} ${op[1]}`;

type Drag = { tile: number; from: number; id: number; sx: number; sy: number; moved: boolean; ghost?: HTMLElement };

export const factory: PuzzleDef = {
  id: 'factory',
  offByDefault: true,
  get name() {
    return L('Factory', 'Usine');
  },
  category: 'numbers',
  get rules() {
    return L('Place tiles so every output gets its number.', 'Posez les tuiles pour que chaque sortie ait son nombre.');
  },
  help: () => ({
    goal: L(
      'Numbers ride the belts from the inputs on the left to the outputs on the right. Place the operator tiles so each output receives exactly the number it shows.',
      'Les nombres voyagent sur les convoyeurs, des entrées à gauche vers les sorties à droite. Placez les tuiles d’opération pour que chaque sortie reçoive exactement son nombre.',
    ),
    steps: [
      L(
        'A number changes as it crosses a tile: +2 adds 2, ×2 doubles it, ÷2 halves it (even numbers only). Order matters.',
        'Un nombre change en traversant une tuile : +2 ajoute 2, ×2 le double, ÷2 le divise par deux (nombres pairs seulement). L’ordre compte.',
      ),
      L(
        'From Hard up, an arrow ↓ or ↑ turns a belt into its neighbour: at the +, the two numbers add up.',
        'À partir de Difficile, une flèche ↓ ou ↑ dévie un convoyeur vers son voisin : au +, les deux nombres s’additionnent.',
      ),
      L(
        'Tap a tile in the tray, then a dashed slot, to place it. You can also drag it there.',
        'Touchez une tuile du bac, puis une case pointillée, pour l’y poser. Vous pouvez aussi la glisser.',
      ),
      L(
        'Tap a placed tile to send it back; drag it to move it. Clear empties the board.',
        'Touchez une tuile posée pour la renvoyer au bac; glissez-la pour la déplacer. Vider libère tout.',
      ),
      L(
        'The small number in a cell is the value leaving it. An output turns green when it matches; ✕ means the number broke.',
        'Le petit nombre d’une case est la valeur qui en sort. Une sortie devient verte quand elle concorde; ✕ indique un nombre brisé.',
      ),
    ],
    tips: [
      L(
        'Work backwards from an output: what must arrive just before its last tile?',
        'Partez d’une sortie : que doit-il arriver juste avant sa dernière tuile?',
      ),
      L('+1 then ×2 is not the same as ×2 then +1.', '+1 puis ×2, ce n’est pas pareil que ×2 puis +1.'),
      L('From Medium up, the tray holds a few tiles you won’t need.', 'À partir de Moyen, le bac contient quelques tuiles inutiles.'),
    ],
  }),
  par: (d) => byLevel(d, [15, 35, 60, 100, 150]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const F = genFactory(d, rng);
    const { rows, cols, kinds, slots, tray, targets } = F;
    const W = cols + 2;
    /** Tray tile held by each slot, or -1. */
    const place = slots.map(() => -1);
    let sel = -1;
    let done = false;

    // ---- DOM ----
    const grid = board(W, rows, 'factory');
    const valEl = new Map<HTMLElement, HTMLElement>();
    const badge = (el: HTMLElement) => {
      const b = h('span', { class: 'fx-v' });
      el.append(b);
      el.classList.add('fx-b');
      valEl.set(el, b);
      return el;
    };
    const inEls: HTMLElement[] = [];
    const outEls: (HTMLElement | null)[] = [];
    const cellEls: HTMLElement[] = [];
    for (let r = 0; r < rows; r++) {
      const inp = h('div', { class: 'cell given fx-in' }, F.inputs[r]);
      inEls.push(inp);
      grid.append(inp);
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const k = kinds[i];
        let el: HTMLElement;
        if (k === 'slot') {
          const s = slots.indexOf(i);
          el = badge(
            h(
              'button',
              { type: 'button', class: 'cell fx-slot', 'data-slot': s, onclick: () => click(() => tapSlot(s)) },
              h('span', { class: 'fx-op' }),
            ),
          );
          el.addEventListener('pointerdown', (e) => place[s] >= 0 && begin(e, place[s], s));
        } else if (k === 'turn') el = badge(h('div', { class: 'cell fx-belt' }, F.into[i] > r ? '↓' : '↑'));
        else if (k === 'join') el = badge(h('div', { class: 'cell fx-belt fx-join' }, '+'));
        else if (k === 'dead') el = h('div', { class: 'cell fx-dead' });
        else el = h('div', { class: 'cell fx-belt' }, '→');
        cellEls.push(el);
        grid.append(el);
      }
      const t = targets[r];
      const out = t == null ? h('div', { class: 'cell fx-dead' }) : badge(h('div', { class: 'cell fx-out' }, t));
      outEls.push(t == null ? null : out);
      grid.append(out);
    }
    const keys = tray.map((op, t) => {
      const el = h('button', { type: 'button', class: 'key', 'data-tile': t, onclick: () => click(() => tapKey(t)) }, op);
      el.addEventListener('pointerdown', (e) => place.indexOf(t) < 0 && begin(e, t, -1));
      return el;
    });
    const trayEl = h('div', { class: 'pad fx-tray' }, ...keys);

    // ---- state → view ----
    const opsNow = () => place.map((t) => (t >= 0 ? tray[t] : null));
    const setVal = (el: HTMLElement, v: number | null) => {
      const b = valEl.get(el)!;
      b.textContent = v == null ? '✕' : String(v);
      b.classList.toggle('bad', v == null);
    };
    const render = () => {
      const { vals, outs } = evaluate(F, opsNow());
      cellEls.forEach((el, i) => {
        if (!valEl.has(el)) return;
        setVal(el, vals[i]);
        if (kinds[i] !== 'slot') return;
        const t = place[slots.indexOf(i)];
        el.firstElementChild!.textContent = t >= 0 ? tray[t] : '';
        el.classList.toggle('on', t >= 0);
      });
      let ok = 0;
      outEls.forEach((el, r) => {
        if (!el) return;
        const v = outs[r] ?? null;
        setVal(el, v);
        el.classList.toggle('ok', v === targets[r]);
        if (v === targets[r]) ok++;
      });
      keys.forEach((el, t) => {
        el.classList.toggle('sel', sel === t);
        el.classList.toggle('used', place.includes(t));
      });
      const n = outEls.filter(Boolean).length;
      ctx.status(L(`${ok} / ${n} outputs match`, `${ok} / ${n} sorties concordent`));
      return ok === n;
    };
    const settle = () => {
      if (render() && !done) {
        done = true;
        sel = -1;
        render();
        ctx.solved();
      }
    };

    // ---- moves ----
    /** Put tile `t` (coming from slot `from`, or -1 for the tray) into slot `to` (-1: back to the tray). */
    const drop = (t: number, from: number, to: number) => {
      ctx.touch();
      sel = -1;
      if (to === from) return settle();
      if (to >= 0) {
        const prev = place[to];
        place[to] = t;
        if (from >= 0) place[from] = prev;
      } else if (from >= 0) place[from] = -1;
      settle();
    };
    const tapKey = (t: number) => {
      if (done || place.includes(t)) return;
      ctx.touch();
      sel = sel === t ? -1 : t;
      render();
    };
    const tapSlot = (s: number) => {
      if (done) return;
      if (sel >= 0) drop(sel, -1, s);
      else if (place[s] >= 0) drop(place[s], s, -1);
    };

    // ---- dragging (pointer events; a tap falls through to the click handlers) ----
    let drag: Drag | null = null;
    let swallow = false;
    const click = (fn: () => void) => {
      if (swallow) swallow = false;
      else fn();
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved) {
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 8) return;
        drag.moved = true;
        ctx.touch();
        const size = keys[drag.tile].getBoundingClientRect();
        drag.ghost = h('div', { class: 'key fx-ghost', style: `width:${size.width}px;height:${size.height}px` }, tray[drag.tile]);
        root.append(drag.ghost);
        keys[drag.tile].classList.add('lifted');
        render();
      }
      const g = drag.ghost!;
      g.style.left = `${e.clientX - g.offsetWidth / 2}px`;
      g.style.top = `${e.clientY - g.offsetHeight / 2}px`;
      const over = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest?.('.fx-slot');
      grid.querySelectorAll('.fx-slot.hint').forEach((el) => el !== over && el.classList.remove('hint'));
      over?.classList.add('hint');
      e.preventDefault();
    };
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      const g = drag;
      drag = null;
      if (!g.moved) return;
      g.ghost?.remove();
      keys[g.tile].classList.remove('lifted');
      grid.querySelectorAll('.fx-slot.hint').forEach((el) => el.classList.remove('hint'));
      swallow = true;
      setTimeout(() => (swallow = false), 350);
      const over = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest?.<HTMLElement>('.fx-slot');
      const to = e.type === 'pointerup' && over ? Number(over.dataset.slot) : e.type === 'pointerup' ? -1 : g.from;
      drop(g.tile, g.from, to);
    };
    const begin = (e: PointerEvent, tile: number, from: number) => {
      if (done || drag || e.button > 0) return;
      swallow = false;
      drag = { tile, from, id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false };
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    };

    ctx.controls(
      btn(
        L('Clear', 'Vider'),
        () => {
          if (done) return;
          place.fill(-1);
          sel = -1;
          render();
        },
        'ghost',
      ),
    );

    // ---- resume ----
    const sv = ctx.saved as { place?: unknown; sel?: unknown } | undefined;
    if (Array.isArray(sv?.place) && sv.place.length === slots.length) {
      const seen = new Set<number>();
      sv.place.forEach((t, s) => {
        if (Number.isInteger(t) && (t as number) >= 0 && (t as number) < tray.length && !seen.has(t as number)) {
          seen.add(t as number);
          place[s] = t as number;
        }
      });
      if (Number.isInteger(sv.sel) && (sv.sel as number) >= 0 && (sv.sel as number) < tray.length && !seen.has(sv.sel as number))
        sel = sv.sel as number;
    }
    root.append(grid, trayEl);
    // Never resume (or start) solved.
    if (render()) {
      place.fill(-1);
      render();
    }

    // ---- guide: fill the slots in flow order with the generator's solution ----
    const want = F.solution.map((t) => tray[t]);
    const solVals = evaluate(F, want).vals;
    /** The rest of the trip from cell i in the solved factory, written as sums, and the output it reaches. */
    const route = (i: number) => {
      let r = Math.floor(i / cols);
      const parts: string[] = [];
      for (let c = (i % cols) + 1; c < cols; c++) {
        let j = r * cols + c;
        if (kinds[j] === 'turn') {
          r = F.into[j];
          j = r * cols + c;
        }
        const before = solVals[j - 1]!;
        if (kinds[j] === 'slot') parts.push(`${spaced(want[slots.indexOf(j)])} = ${solVals[j]}`);
        else if (kinds[j] === 'join') parts.push(`+ ${solVals[j]! - before} = ${solVals[j]}`);
      }
      return { lane: r, parts };
    };
    const hint = (): Hint | null => {
      if (done) return null;
      const s = slots.findIndex((_, k) => place[k] < 0 || tray[place[k]] !== want[k]);
      if (s < 0) return null;
      const i = slots[s];
      const op = want[s];
      const spare = keys.findIndex((_, t) => tray[t] === op && !place.includes(t));
      if (spare < 0) {
        // The tile is sitting in a later slot: free it first.
        const k = place.findIndex((t, k2) => t >= 0 && tray[t] === op && k2 !== s);
        const at = cellEls[slots[k]];
        return {
          text: L(
            `The ${op} is needed earlier on the line, here. Tap it to send it back to the tray first.`,
            `Le ${op} doit servir plus tôt sur la ligne, ici. Touchez-le pour le renvoyer au bac d’abord.`,
          ),
          why: [cellEls[i]],
          at: [at],
          play: () => tapSlot(k),
        };
      }
      const { vals } = evaluate(F, opsNow());
      const prev = i % cols ? vals[i - 1] : F.inputs[Math.floor(i / cols)];
      const vin = prev ?? 0;
      const vout = applyOp(op, vin);
      const { lane, parts } = route(i);
      const goal = targets[lane];
      const outEl = outEls[lane]!;
      const swap = place[s] >= 0 ? L(` Swap out the ${tray[place[s]]}.`, ` Remplacez le ${tray[place[s]]}.`) : '';
      const sum = (then: string) => [`${vin} ${spaced(op)} = ${vout}`, ...parts].join(then);
      const text = L(
        `The belt brings ${vin} here. ${sum(', then ')}: exactly the ${goal} the output wants. So the ${op} goes here.${swap}`,
        `Le convoyeur amène ${vin} ici. ${sum(', puis ')} : pile le ${goal} demandé par la sortie. Le ${op} va donc ici.${swap}`,
      );
      return {
        text,
        why: [outEl],
        at: [keys[spare], cellEls[i]],
        play: () => {
          if (sel !== spare) tapKey(spare);
          tapSlot(s);
        },
      };
    };

    return {
      hint,
      snapshot: () => ({ place, sel }),
      destroy() {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      },
    };
  },
};
