import { L, P } from '../core/i18n';
import { byLevel, type Hint, type PuzzleDef } from '../core/types';
import { h, pad, PALETTE, s, shake } from '../core/ui';
import { genHiddenRule, type Spec } from './shapekit/rulegen';
import { shape } from './shapekit/shapes';
import './hidden-rule.css';

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export const hiddenRule: PuzzleDef = {
  id: 'hidden-rule',
  get name() {
    return L('Hidden Rule', 'Règle cachée');
  },
  category: 'logic',
  offByDefault: true,
  get rules() {
    return L('Find the hidden rule, then sort each pattern ✓ or ✗.', 'Trouvez la règle cachée, puis classez chaque motif ✓ ou ✗.');
  },
  help: () => ({
    goal: L(
      'Work out the secret rule from the examples, then sort new patterns by it.',
      'Devinez la règle secrète à partir des exemples, puis classez les nouveaux motifs selon elle.',
    ),
    steps: [
      L(
        'Patterns in the ✓ row follow a hidden rule; patterns in the ✗ row break it.',
        'Les motifs de la rangée ✓ respectent une règle cachée; ceux de la rangée ✗ l’enfreignent.',
      ),
      L(
        'The rule is about colours, shapes, counts, positions or symmetry.',
        'La règle porte sur les couleurs, les formes, les quantités, les positions ou la symétrie.',
      ),
      L(
        'A new pattern appears below: tap ✓ if it follows the rule, ✗ if it breaks it (or press 1 or 2).',
        'Un nouveau motif apparaît en dessous : touchez ✓ s’il respecte la règle, ✗ s’il l’enfreint (ou appuyez sur 1 ou 2).',
      ),
      L(
        'Each answered pattern joins the bottom strip with its true mark: more evidence for the next one.',
        'Chaque motif classé rejoint la bande du bas avec sa vraie marque : un indice de plus pour le suivant.',
      ),
      L(
        'A wrong mark costs a life (♥). Sort them all to win; the rule is revealed at the end.',
        'Une erreur coûte une vie (♥). Classez-les tous pour gagner; la règle est dévoilée à la fin.',
      ),
      L(
        'From Expert on, the rule joins two simpler ones (and, or, but not).',
        'Dès Expert, la règle combine deux règles plus simples (et, ou, mais pas).',
      ),
    ],
    tips: [
      L(
        'Look for something every ✓ pattern shares and no ✗ pattern has.',
        'Cherchez ce que tous les motifs ✓ ont en commun et qu’aucun motif ✗ n’a.',
      ),
      L(
        'Count things (colours, shapes, filled cells), then test your idea on the ✗ row.',
        'Comptez (couleurs, formes, cases pleines), puis vérifiez votre idée sur la rangée ✗.',
      ),
    ],
  }),
  par: (d) => byLevel(d, [40, 60, 90, 130, 170]),
  create(ctx) {
    const { root, rng, difficulty: d } = ctx;
    const g = genHiddenRule(rng, d);
    const { rule, tests } = g;
    const maxLives = byLevel(d, [3, 3, 3, 2, 2]);
    const answers: boolean[] = [];
    let lives = maxLives;
    let over = false;

    /** One specimen as an SVG 3×3 picture inside a shared tile. */
    const spec = (sp: Spec, cls = '') =>
      h(
        'div',
        { class: `cell hr-spec ${cls}`.trim() },
        s(
          'svg',
          { viewBox: '0 0 300 300', 'aria-hidden': 'true' },
          s('path', { class: 'hr-lines', d: 'M100 8V292M200 8V292M8 100H292M8 200H292' }),
          ...sp.flatMap((v, i) =>
            v < 0
              ? []
              : [
                  s(
                    'g',
                    { transform: `translate(${(i % 3) * 100} ${Math.floor(i / 3) * 100})` },
                    shape(v % 3, PALETTE[g.cols[(v / 3) | 0]]),
                  ),
                ],
          ),
        ),
      );
    const row = (mark: string, title: string, list: Spec[]) => {
      const els = list.map((sp) => spec(sp));
      return {
        els,
        el: h(
          'div',
          { class: 'hr-row' },
          h('span', { class: `hr-tag ${mark === '✓' ? 'yes' : 'no'}`, title, 'aria-label': title }, mark),
          h('div', { class: 'hr-specs' }, ...els),
        ),
      };
    };
    const yes = row('✓', L('Follow the rule', 'Respectent la règle'), g.pos);
    const no = row('✗', L('Break the rule', 'Enfreignent la règle'), g.neg);

    const stage = h('div', { class: 'hr-stage' });
    const prompt = h('p', { class: 'hr-prompt' });
    const keys = pad(
      [
        { label: '✓', value: 'y', class: 'hr-yes', aria: L('Follows the rule', 'Respecte la règle') },
        { label: '✗', value: 'n', class: 'hr-no', aria: L('Breaks the rule', 'Enfreint la règle') },
      ],
      (v) => answer(v === 'y'),
    );
    keys.classList.add('hr-keys');
    const [keyYes, keyNo] = keys.children;
    const side = h('div', { class: 'hr-side' }, prompt, keys);
    const play = h('div', { class: 'hr-play' }, stage, side);
    const hist = h('div', { class: 'hr-hist', style: `--n:${tests.length}` });

    const render = () => {
      const i = answers.length;
      ctx.lives(lives, maxLives);
      stage.replaceChildren(i < tests.length && !over ? spec(tests[i], 'hr-test') : spec(tests[Math.max(0, i - 1)], 'hr-test done'));
      hist.replaceChildren(
        ...tests.map((sp, k) => {
          if (k >= i) return h('div', { class: `hr-slot ${k === i && !over ? 'cur' : ''}`.trim() }, h('i', { class: 'hr-empty' }));
          const truth = rule.test(sp);
          const ok = answers[k] === truth;
          return h('div', { class: `hr-slot ${ok ? 'ok' : 'err'}` }, spec(sp), h('b', { class: truth ? 'yes' : 'no' }, truth ? '✓' : '✗'));
        }),
      );
      if (over) {
        keys.hidden = true;
        prompt.className = 'hr-prompt hr-rule';
        prompt.textContent = `${L('Rule: ', 'Règle : ')}${cap(rule.say())}.`;
      } else {
        prompt.textContent = L('Does this one follow the rule?', 'Celui-ci respecte-t-il la règle?');
      }
      ctx.status(`${i} / ${P(tests.length, ['pattern', 'patterns'], ['motif', 'motifs'])}`);
    };

    const answer = (v: boolean) => {
      if (over) return;
      ctx.touch();
      const sp = tests[answers.length];
      const right = rule.test(sp) === v;
      answers.push(v);
      if (!right) {
        lives--;
        ctx.mistake();
        shake(stage);
      }
      if (lives <= 0 || answers.length === tests.length) over = true;
      render();
      if (over) {
        if (lives > 0) ctx.solved();
        else ctx.failed();
      }
    };

    // Resume: replay the saved answers, stopping before anything that would end the game.
    const sv = ctx.saved as { a?: unknown } | undefined;
    if (Array.isArray(sv?.a)) {
      for (const x of sv.a) {
        if (typeof x !== 'boolean' || answers.length >= tests.length - 1) break;
        const wrong = rule.test(tests[answers.length]) !== x;
        if (wrong && lives <= 1) break;
        if (wrong) lives--;
        answers.push(x);
      }
    }

    const hint = (): Hint | null => {
      if (over) return null;
      const i = answers.length;
      const fits = rule.test(tests[i]);
      const mark = fits ? '✓' : '✗';
      const clause = rule.say();
      const key = fits ? keyYes : keyNo;
      const test = stage.firstElementChild!;
      if (i === 0)
        return {
          text: L(
            `Compare the rows: every ✓ pattern follows one rule and every ✗ one breaks it. Here: ${clause}. This pattern ${fits ? 'follows' : 'breaks'} it, so tap ${mark}.`,
            `Comparez les rangées : chaque motif ✓ respecte une même règle et chaque motif ✗ l’enfreint. Ici : ${clause}. Ce motif la ${fits ? 'respecte' : 'enfreint'}, alors touchez ${mark}.`,
          ),
          why: [...yes.els, ...no.els],
          at: [key],
          play: () => answer(fits),
        };
      return {
        text: L(
          `Check the rule (${clause}) on the new pattern: it ${fits ? 'follows' : 'breaks'} it, so tap ${mark}.`,
          `Vérifiez la règle (${clause}) sur le nouveau motif : il la ${fits ? 'respecte' : 'enfreint'}, alors touchez ${mark}.`,
        ),
        why: [test],
        at: [key],
        play: () => answer(fits),
      };
    };

    root.append(h('div', { class: 'hr-ex' }, yes.el, no.el), play, hist);
    render();
    return {
      hint,
      snapshot: () => ({ a: answers }),
      onKey(e) {
        const k = e.key.toLowerCase();
        if (k === '1' || k === 'y' || k === 'o') {
          answer(true);
          return true;
        }
        if (k === '2' || k === 'n') {
          answer(false);
          return true;
        }
        return false;
      },
    };
  },
};
