import { L } from './i18n';
import { drawHint } from './hint-overlay';
import { Rng } from './rng';
import { openSheet } from './sheet';
import type { Hint, PuzzleDef, PuzzleInstance } from './types';
import { btn, h, s as svg } from './ui';

const SEEN_KEY = 'puzzle-feed:help-seen';

function seenSet(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}
const helpSeen = (id: string) => seenSet().has(id);
function markSeen(id: string) {
  const s = seenSet();
  s.add(id);
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...s]));
  } catch {
    /* ignore */
  }
}

const GUIDE_STEPS = 6;
const SHOW_MS = 3400;

/**
 * The animated walkthrough: an Easy board that plays itself a few moves at a time. Each step
 * outlines the clue, points an arrow at the move, explains it, then makes it.
 */
function walkthrough(def: PuzzleDef) {
  const board = h('div', { class: 'guide-board', 'data-puzzle': def.id, inert: true });
  const layer = svg('svg', { class: 'guide-layer', 'aria-hidden': 'true' });
  const stage = h('div', { class: 'guide-stage' }, board, layer);
  const caption = h('p', { class: 'guide-caption', 'aria-live': 'polite' });
  const count = h('span', { class: 'guide-count' });
  let inst: PuzzleInstance = {};
  let step = 0;
  let hint: Hint | null = null;
  let timer = 0;
  let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let ended = false;

  const build = () => {
    inst.destroy?.();
    const root = h('div', { class: 'puzzle' });
    board.replaceChildren(root);
    inst =
      def.create({
        difficulty: 1,
        rng: new Rng(0x5eed),
        root,
        solved() {},
        failed() {},
        mistake() {},
        touch() {},
        status() {},
        controls() {},
      }) || {};
    inst.activate?.();
  };

  const draw = () => drawHint(layer, stage, hint);

  /** Show the step after the current position, or the closing message. */
  const show = () => {
    hint = step < GUIDE_STEPS ? (inst.hint?.() ?? null) : null;
    ended = !hint;
    stage.classList.toggle('done', ended);
    if (hint) {
      caption.textContent = hint.text;
      count.textContent = `${step + 1} / ${GUIDE_STEPS}`;
    } else {
      caption.textContent = L(
        'Your turn! Close the guide and solve the rest the same way.',
        'À vous! Fermez le guide et terminez de la même façon.',
      );
      count.textContent = '';
      setPlaying(false);
    }
    requestAnimationFrame(draw);
    schedule();
  };

  const next = () => {
    if (ended) return restart();
    if (!hint) return;
    layer.replaceChildren();
    const h0 = hint;
    hint = null;
    h0.play();
    step++;
    // Let the move's own animation start before pointing at the next thing.
    clearTimeout(timer);
    timer = window.setTimeout(show, 450);
  };

  const prev = () => {
    if (step === 0) return;
    const target = step - 1;
    build();
    step = 0;
    ended = false;
    for (; step < target; step++) {
      const hh = inst.hint?.();
      if (!hh) break;
      hh.play();
    }
    setPlaying(false);
    show();
  };

  const restart = () => {
    build();
    step = 0;
    ended = false;
    setPlaying(true);
    show();
  };

  const schedule = () => {
    clearTimeout(timer);
    if (playing && hint) timer = window.setTimeout(next, SHOW_MS);
  };

  const playBtn = btn('', () => {
    if (ended) return restart();
    setPlaying(!playing);
    if (playing) next();
  });
  const setPlaying = (v: boolean) => {
    playing = v;
    playBtn.textContent = ended && !v ? L('↺ Replay', '↺ Revoir') : v ? L('❚❚ Pause', '❚❚ Pause') : L('▶ Play', '▶ Lecture');
    schedule();
  };

  build();
  if (!inst.hint) {
    inst.destroy?.();
    return null;
  }
  const ro = new ResizeObserver(() => draw());
  ro.observe(stage);
  setPlaying(playing);
  // Wait for the sheet to lay out before measuring.
  requestAnimationFrame(show);

  return {
    el: h(
      'section',
      { class: 'guide-section' },
      h('h3', null, L('Watch how', 'Voyez comment'), count),
      stage,
      caption,
      h(
        'div',
        { class: 'guide-row' },
        btn('◀', prev, 'ghost'),
        playBtn,
        btn(
          L('Next ▶', 'Suivant ▶'),
          () => {
            setPlaying(false);
            next();
          },
          'ghost',
        ),
      ),
    ),
    destroy: () => {
      clearTimeout(timer);
      ro.disconnect();
      inst.destroy?.();
    },
  };
}

/** Show the how-to-play guide: goal, steps, the animated walkthrough and tips. */
function openHelp(def: PuzzleDef, onClose?: () => void) {
  markSeen(def.id);
  const help = def.help?.();
  const guide = walkthrough(def);
  let close = () => {};
  close = openSheet({
    title: def.name,
    puzzle: def.id,
    className: 'help',
    body: [
      h('p', { class: 'help-goal' }, help?.goal ?? def.rules),
      help?.steps.length
        ? h(
            'section',
            null,
            h('h3', null, L('How to play', 'Comment jouer')),
            h('ol', { class: 'help-steps' }, ...help.steps.map((s) => h('li', null, s))),
          )
        : null,
      guide?.el ?? null,
      help?.tips?.length
        ? h(
            'section',
            null,
            h('h3', null, L('Tips', 'Astuces')),
            h('ul', { class: 'help-tips' }, ...help.tips.map((s) => h('li', null, s))),
          )
        : null,
      h(
        'p',
        { class: 'help-levels muted small' },
        L(
          'Five levels, Easy to Master. On Auto, the level rises when you solve quickly and cleanly.',
          'Cinq niveaux, de Facile à Maître. En mode Auto, le niveau monte quand vous résolvez vite et sans faute.',
        ),
      ),
    ],
    footer: [btn(L('Got it', 'Compris'), () => close(), 'primary')],
    onClose: () => {
      guide?.destroy();
      onClose?.();
    },
  });
}

/**
 * The round "?" icon button on cards and game tiles. Unseen games get a highlighted, pulsing button
 * unless `quiet` (long lists like Settings, where every row pulsing would be noise).
 */
export function helpButton(def: PuzzleDef, opts: { onOpen?: () => void; onClose?: () => void; quiet?: boolean } = {}) {
  const b = h(
    'button',
    {
      type: 'button',
      class: `icon-btn help-btn ${opts.quiet || helpSeen(def.id) ? '' : 'fresh'}`,
      title: L('How to play', 'Comment jouer'),
      'aria-label': `${L('How to play', 'Comment jouer')}: ${def.name}`,
      onclick: (e: MouseEvent) => {
        e.stopPropagation();
        opts.onOpen?.();
        openHelp(def, () => {
          b.classList.remove('fresh');
          opts.onClose?.();
        });
      },
    },
    '?',
  );
  return b;
}
