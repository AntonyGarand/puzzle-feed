import { L } from '../core/i18n';
import type { Rng } from '../core/rng';
import { byLevel, type Difficulty, type Hint, type PuzzleDef } from '../core/types';
import { btn, h, shake } from '../core/ui';

type Op = '+' | '−' | '×' | '÷';

function apply(a: number, op: Op, b: number): number | null {
  switch (op) {
    case '+':
      return a + b;
    case '−':
      return a - b > 0 ? a - b : null;
    case '×':
      return a * b;
    case '÷':
      return b !== 0 && a % b === 0 ? a / b : null;
  }
}

function generate(d: Difficulty, r: Rng) {
  const count = byLevel(d, [3, 4, 4, 5, 5]);
  const max = byLevel(d, [9, 10, 12, 13, 25]);
  const ops: Op[] = byLevel<Op[]>(d, [
    ['+', '−'],
    ['+', '−', '×'],
    ['+', '−', '×', '÷'],
    ['+', '−', '×', '÷'],
    ['+', '−', '×', '÷'],
  ]);
  const cap = byLevel(d, [40, 100, 200, 400, 999]);
  for (let tries = 0; tries < 500; tries++) {
    const nums = Array.from({ length: count }, () => r.int(1, max));
    const items = [...nums];
    let ok = true;
    while (items.length > 1) {
      const i = r.int(0, items.length - 1);
      const a = items.splice(i, 1)[0];
      const j = r.int(0, items.length - 1);
      const b = items.splice(j, 1)[0];
      const op = r.pick(ops);
      const v = apply(Math.max(a, b), op, Math.min(a, b));
      if (v == null || v > cap) {
        ok = false;
        break;
      }
      items.push(v);
    }
    const target = items[0];
    if (!ok || nums.includes(target) || target < 10) continue;
    return { nums, target, ops };
  }
  return { nums: [2, 3, 4], target: 14, ops: ['+', '−', '×', '÷'] as Op[] };
}

export const target: PuzzleDef = {
  id: 'target',
  get name() {
    return L('Target', 'Cible');
  },
  category: 'numbers',
  get rules() {
    return L('Combine every number to hit the target.', 'Combinez tous les nombres pour atteindre la cible.');
  },
  help: () => ({
    goal: L(
      'Use every number exactly once with + − × ÷ so that the last one left equals the target.',
      'Utilisez chaque nombre une seule fois avec + − × ÷ pour que le dernier qui reste égale la cible.',
    ),
    steps: [
      L(
        'Tap a number, then an operator, then a second number: the two merge into the result.',
        'Touchez un nombre, puis un opérateur, puis un deuxième nombre : les deux fusionnent en leur résultat.',
      ),
      L(
        'The result stays selected, so you can chain the next operation right away.',
        'Le résultat reste sélectionné : vous pouvez enchaîner l’opération suivante.',
      ),
      L(
        'Subtraction must stay above zero and division must come out even.',
        'Une soustraction doit rester au-dessus de zéro et une division doit tomber juste.',
      ),
      L(
        'When one number is left, it must be the target. Undo steps back one merge; Reset starts over.',
        'Quand il reste un seul nombre, ce doit être la cible. Annuler défait une fusion; Recommencer repart de zéro.',
      ),
      L(
        'Keyboard: 1 to 5 pick numbers, + - * / pick operators, Backspace or Z undoes.',
        'Clavier : 1 à 5 choisissent les nombres, + - * / les opérateurs, Retour arrière ou Z annule.',
      ),
    ],
    tips: [
      L(
        'Work backwards: which product or sum gets close to the target?',
        'Partez de la cible : quel produit ou quelle somme s’en approche?',
      ),
      L('Keep a small number for a final + or − adjustment.', 'Gardez un petit nombre pour un ajustement final avec + ou −.'),
    ],
  }),
  par: (d) => byLevel(d, [25, 40, 60, 90, 120]),
  create(ctx) {
    const { root, rng, difficulty } = ctx;
    const { nums, target: goal } = generate(difficulty, rng);
    const allOps: Op[] = ['+', '−', '×', '÷'];
    type Chip = { id: number; v: number };
    let nextId = 0;
    const initial = (): Chip[] => nums.map((v) => ({ id: nextId++, v }));
    let chips = initial();
    let history: Chip[][] = [];
    let sel: number | null = null;
    let op: Op | null = null;

    const goalEl = h('div', { class: 'big' }, goal);
    const chipRow = h('div', { class: 'chips' });
    const opRow = h('div', { class: 'pad' });

    const render = () => {
      chipRow.replaceChildren(
        ...chips.map((c) =>
          h('button', { type: 'button', class: `chip num ${c.id === sel ? 'sel' : ''}`, onclick: () => tapChip(c.id) }, c.v),
        ),
      );
      opRow.replaceChildren(
        ...allOps.map((o) => h('button', { type: 'button', class: `key ${o === op ? 'sel' : ''}`, onclick: () => tapOp(o) }, o)),
      );
    };

    const tapChip = (id: number) => {
      ctx.touch();
      if (sel === null || op === null) {
        sel = sel === id ? null : id;
        op = null;
        render();
        return;
      }
      if (id === sel) {
        sel = null;
        op = null;
        render();
        return;
      }
      const a = chips.find((c) => c.id === sel)!;
      const b = chips.find((c) => c.id === id)!;
      const v = apply(a.v, op, b.v);
      if (v == null) {
        ctx.mistake();
        shake(chipRow);
        op = null;
        render();
        return;
      }
      history.push(chips);
      const merged = { id: nextId++, v };
      chips = chips.filter((c) => c.id !== a.id).map((c) => (c.id === b.id ? merged : c));
      sel = merged.id;
      op = null;
      render();
      if (chips.length === 1) {
        if (v === goal) ctx.solved();
        else {
          shake(chipRow);
          ctx.status(L('Not quite — undo and try again', 'Raté — annulez et réessayez'));
        }
      } else if (!reachable()) ctx.status(L('Target out of reach — undo', 'Cible hors d’atteinte — annulez'));
    };
    const tapOp = (o: Op) => {
      if (sel === null) return;
      op = op === o ? null : o;
      render();
    };
    const undo = () => {
      const prev = history.pop();
      if (!prev) return;
      chips = prev;
      sel = null;
      op = null;
      ctx.status('');
      render();
    };
    const reset = () => {
      if (!history.length) return;
      chips = history[0];
      history = [];
      sel = null;
      op = null;
      ctx.status('');
      render();
    };

    const sv = ctx.saved as { chips?: Chip[]; history?: Chip[][]; nextId?: number; sel?: number | null } | undefined;
    if (Array.isArray(sv?.chips) && sv.chips.length) {
      chips = sv.chips;
      history = sv.history ?? [];
      nextId = sv.nextId ?? 1000;
      sel = sv.sel != null && chips.some((c) => c.id === sv.sel) ? sv.sel : null;
    }
    root.append(h('div', { class: 'label' }, L('target', 'cible')), goalEl, chipRow, opRow);
    ctx.controls(btn(L('Undo', 'Annuler'), undo, 'ghost'), btn(L('Reset', 'Recommencer'), reset, 'ghost'));
    render();

    // ---- Guide ----
    type Node = { id: number; v: number; expr: string; leaf: boolean };
    type Step = { a: Node; op: Op; b: Node; v: number };
    /** A sequence of merges reaching the goal; the first one may be pinned to a chip and an operator. */
    const plan = (first?: number | null, firstOp?: Op | null): Step[] | null => {
      const go = (list: Node[], steps: Step[]): Step[] | null => {
        if (list.length === 1) return list[0].v === goal ? steps : null;
        for (const a of list)
          for (const b of list) {
            if (a === b || (!steps.length && first != null && a.id !== first)) continue;
            for (const o of allOps) {
              if (!steps.length && firstOp && o !== firstOp) continue;
              const v = apply(a.v, o, b.v);
              if (v == null) continue;
              const node: Node = { id: -1, v, expr: `(${a.expr} ${o} ${b.expr})`, leaf: false };
              const found = go([...list.filter((x) => x !== a && x !== b), node], [...steps, { a, op: o, b, v }]);
              if (found) return found;
            }
          }
        return null;
      };
      return go(
        chips.map((c) => ({ id: c.id, v: c.v, expr: String(c.v), leaf: true })),
        [],
      );
    };
    /** Whether the numbers left can still make the goal (memoised per multiset: check() then hint()). */
    const reach = new Map<string, boolean>();
    const reachable = () => {
      const key = chips
        .map((c) => c.v)
        .sort((a, b) => a - b)
        .join(',');
      let ok = reach.get(key);
      if (ok === undefined) reach.set(key, (ok = chips.length === 1 ? chips[0].v === goal : !!plan()));
      return ok;
    };
    const chipEl = (id: number) => chipRow.children[chips.findIndex((c) => c.id === id)];
    /** Dead end: the numbers left can't make the goal any more. Undo the last merge (or reset). */
    const check = (): Hint | null => {
      if (!history.length || reachable()) return null;
      const vals = chips.map((c) => c.v).join(', ');
      return {
        kind: 'stuck',
        text:
          chips.length === 1
            ? L(
                `The last number is ${chips[0].v}, not ${goal}. Undo and try another merge.`,
                `Le dernier nombre est ${chips[0].v}, pas ${goal}. Annulez et essayez une autre fusion.`,
              )
            : L(
                `No combination of ${vals} makes ${goal} any more. Undo the last merge.`,
                `Aucune combinaison de ${vals} ne donne plus ${goal}. Annulez la dernière fusion.`,
              ),
        why: [goalEl],
        at: [...chipRow.children],
        action: L('Undo', 'Annuler'),
        play: undo,
      };
    };
    const opEl = (o: Op) => opRow.children[allOps.indexOf(o)];
    const hint = (): Hint | null => {
      if (chips.length < 2) return null;
      if (!reachable()) return check();
      const p = plan(sel, op);
      if (!p) {
        // The current selection leads nowhere: drop it (same as tapping the selected number again).
        if (sel == null) return null;
        const id = sel;
        return {
          text: L(
            'No way to reach the target starts like this. Tap the selected number again to let go of it.',
            'Aucune façon d’atteindre la cible ne commence ainsi. Touchez de nouveau le nombre choisi pour le relâcher.',
          ),
          at: [chipEl(id)],
          play: () => tapChip(id),
        };
      }
      const s = p[0];
      const last = p.length === 1;
      const whole = `${p[p.length - 1].a.expr} ${p[p.length - 1].op} ${p[p.length - 1].b.expr}`.replace(/^\((.*)\)$/, '$1');
      if (sel == null)
        return {
          text: history.length
            ? L(
                `Next: ${s.a.v} ${s.op} ${s.b.v} = ${s.v}. Tap the ${s.a.v} to start that merge.`,
                `Ensuite : ${s.a.v} ${s.op} ${s.b.v} = ${s.v}. Touchez le ${s.a.v} pour commencer cette fusion.`,
              )
            : L(
                `Work backwards from ${goal}: ${whole} = ${goal} uses every number once. Start by tapping the ${s.a.v}.`,
                `Partez de la cible ${goal} : ${whole} = ${goal} utilise chaque nombre une fois. Commencez par toucher le ${s.a.v}.`,
              ),
          why: [goalEl],
          at: [chipEl(s.a.id)],
          play: () => tapChip(s.a.id),
        };
      if (op == null)
        return {
          text: last
            ? L(
                `${history.length ? `The ${s.a.v} stays selected, so you can chain: ` : ''}${s.a.v} ${s.op} ${s.b.v} = ${goal}, exactly the target. Pick ${s.op}.`,
                `${history.length ? `Le ${s.a.v} reste choisi, vous pouvez donc enchaîner : ` : ''}${s.a.v} ${s.op} ${s.b.v} = ${goal}, pile la cible. Choisissez ${s.op}.`,
              )
            : history.length
              ? L(
                  `The result stays selected, so you can chain: ${s.a.v} ${s.op} ${s.b.v} = ${s.v}. Pick ${s.op}.`,
                  `Le résultat reste choisi : vous pouvez enchaîner. ${s.a.v} ${s.op} ${s.b.v} = ${s.v}. Choisissez ${s.op}.`,
                )
              : L(
                  `Then pick the operator: ${s.a.v} ${s.op} ${s.b.v} = ${s.v}.`,
                  `Choisissez ensuite l’opérateur : ${s.a.v} ${s.op} ${s.b.v} = ${s.v}.`,
                ),
          why: [chipEl(s.a.id)],
          at: [opEl(s.op)],
          play: () => tapOp(s.op),
        };
      const rule =
        s.op === '−'
          ? L(' (a subtraction must stay above zero)', ' (une soustraction doit rester au-dessus de zéro)')
          : s.op === '÷'
            ? L(' (a division must come out even)', ' (une division doit tomber juste)')
            : '';
      return {
        text: last
          ? L(
              `Tap the ${s.b.v}: ${s.a.v} ${s.op} ${s.b.v} = ${goal}, and the last number left is the target.`,
              `Touchez le ${s.b.v} : ${s.a.v} ${s.op} ${s.b.v} = ${goal}, et le dernier nombre qui reste est la cible.`,
            )
          : L(`Tap the ${s.b.v}: the two merge into ${s.v}${rule}.`, `Touchez le ${s.b.v} : les deux fusionnent en ${s.v}${rule}.`),
        why: [chipEl(s.a.id), opEl(s.op)],
        at: [chipEl(s.b.id)],
        play: () => tapChip(s.b.id),
      };
    };

    return {
      snapshot: () => ({ chips, history, nextId, sel }),
      check,
      hint,
      onKey(e) {
        const map: Record<string, Op> = { '+': '+', '-': '−', '*': '×', x: '×', '/': '÷' };
        if (map[e.key]) {
          tapOp(map[e.key]);
          return true;
        }
        if (e.key === 'Backspace' || e.key === 'z') {
          undo();
          return true;
        }
        const n = Number(e.key);
        if (n >= 1 && n <= chips.length) {
          tapChip(chips[n - 1].id);
          return true;
        }
        return false;
      },
    };
  },
};
