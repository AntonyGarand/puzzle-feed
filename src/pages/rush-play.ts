import { telemetry } from '../core/analytics';
import { L, P } from '../core/i18n';
import { raceLevel, rushKey, rushLevel, rushPick, SKIP_PENALTY_MS, type RushMinutes, type RushMode } from '../core/rush';
import { prefs, recordRush } from '../core/store';
import { LEVEL_IDS, LEVEL_NAMES, type Difficulty, type PuzzleDef } from '../core/types';
import { Card, isUndoKey } from '../app/card/card';
import type { Outcome } from '../app/card/result';
import { navigate } from '../app/nav';
import { confetti } from '../ui/confetti';
import { btn, fmtTime, h } from '../ui/dom';
import { sheetOpen } from '../ui/sheet';
import { rushModeName } from './rush';

/** Games enabled in the feed, or every game when fewer than this many are on. */
const MIN_POOL = 8;
/** Pause after a solve or a loss before the next puzzle, so the result registers. */
const SOLVED_PAUSE_MS = 400;
const FAILED_PAUSE_MS = 700;
/** The clock turns urgent in the last this-many milliseconds. */
const URGENT_MS = 10_000;

interface Played {
  def: PuzzleDef;
  level: Difficulty;
  o: Outcome;
}

interface Run {
  mode: RushMode;
  minutes: RushMinutes;
  /** Milliseconds left on the clock. */
  left: number;
  /** `performance.now()` of the last clock tick. */
  last: number;
  solved: number;
  played: Played[];
  recent: string[];
  /** Between two puzzles (the clock is paused). */
  between: boolean;
  over: boolean;
}

/** Puzzle Rush in play: a countdown, the score, and one puzzle card at a time. */
export class RushView {
  readonly el = h('div', { class: 'lab rush-play' });
  private card: Card | null = null;
  private run: Run | null = null;
  private shown = false;
  private clockEl = h('strong', { class: 'rush-clock', role: 'timer' });
  private scoreEl = h('strong', { class: 'rush-score', 'aria-live': 'polite' });
  private noteEl = h('span', { class: 'rush-note', 'aria-live': 'polite' });
  private stage = h('div', { class: 'rush-stage' });
  private skipBtn = btn(L('Skip', 'Passer'), () => this.skip(), 'ghost');
  private noteTimer = 0;

  constructor(private readonly defs: PuzzleDef[]) {
    window.setInterval(() => this.tick(), 100);
    document.addEventListener('keydown', (e) => {
      if (!this.shown || !this.card || this.run?.over || sheetOpen()) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if ((e.ctrlKey || e.metaKey || e.altKey) && !isUndoKey(e)) return;
      if (this.card.onKey(e)) e.preventDefault();
    });
    document.addEventListener('visibilitychange', () => this.syncActive());
  }

  /** Start a new run (dropping any run in progress). */
  start(mode: RushMode, minutes: RushMinutes) {
    this.close();
    this.run = {
      mode,
      minutes,
      left: minutes * 60_000,
      last: performance.now(),
      solved: 0,
      played: [],
      recent: [],
      between: false,
      over: false,
    };
    this.el.replaceChildren(
      h(
        'div',
        { class: 'lab-bar rush-bar' },
        btn(L('Quit', 'Quitter'), () => navigate('/rush'), 'ghost'),
        h(
          'div',
          { class: 'rush-hud' },
          this.clockEl,
          h('span', { class: 'rush-score-box' }, this.scoreEl, h('span', { class: 'small muted' }, L('solved', 'réussis'))),
        ),
        this.skipBtn,
      ),
      this.noteEl,
      this.stage,
    );
    this.el.dataset['mode'] = mode;
    this.draw();
    this.next();
  }

  /** The view is on screen (or not): the clock only runs while it is. */
  setShown(shown: boolean) {
    this.shown = shown;
    if (this.run) this.run.last = performance.now();
    this.syncActive();
  }

  /** Drop the run and its card. */
  close() {
    this.card?.setActive(false);
    this.card?.destroy();
    this.card = null;
    this.run = null;
    clearTimeout(this.noteTimer);
    this.el.replaceChildren();
  }

  private get running() {
    return !!this.run && !this.run.over && this.shown && !document.hidden && !sheetOpen();
  }

  private syncActive() {
    this.card?.setActive(this.shown && !document.hidden && !!this.run && !this.run.over);
  }

  private tick() {
    const run = this.run;
    if (!run || run.over) return;
    const now = performance.now();
    const dt = now - run.last;
    run.last = now;
    if (!this.running || run.between) return;
    run.left -= dt;
    if (run.left <= 0) this.end();
    else this.draw();
  }

  private draw() {
    const run = this.run;
    if (!run) return;
    // Round up, so the clock shows 0:00 only when the run is over.
    this.clockEl.textContent = fmtTime(Math.ceil(Math.max(0, run.left) / 1000) * 1000);
    this.clockEl.classList.toggle('urgent', run.left <= URGENT_MS && !run.over);
    this.scoreEl.textContent = String(run.solved);
  }

  /** Deal the next puzzle. */
  private next() {
    const run = this.run;
    if (!run || run.over) return;
    run.between = false;
    run.last = performance.now();
    const on = this.defs.filter((d) => prefs(d.id).weight > 0);
    const pool = on.length >= MIN_POOL ? on : this.defs;
    const pick = rushPick(pool, run.recent, (d) => rushLevel(run.mode, run.solved, prefs(d.id).level), Math.random);
    if (!pick) return this.end();
    run.recent = [...run.recent, pick.def.id].slice(-6);
    this.card?.setActive(false);
    this.card?.destroy();
    const card = new Card(pick.def, () => {}, {
      lab: true,
      level: pick.level,
      seed: (Math.random() * 2 ** 32) >>> 0,
      rush: (o) => this.result(card, pick.level, o),
    });
    this.card = card;
    this.stage.replaceChildren(card.el);
    card.mount();
    this.syncActive();
  }

  private result(card: Card, level: Difficulty, o: Outcome) {
    const run = this.run;
    if (!run || run.over || card !== this.card) return;
    run.played.push({ def: card.def, level, o });
    if (o === 'solved') {
      run.solved++;
      if (run.mode === 'race' && raceLevel(run.solved) > raceLevel(run.solved - 1))
        this.note(`${L('Level up', 'Niveau supérieur')} ↑ ${LEVEL_NAMES[raceLevel(run.solved)]}`);
    }
    this.draw();
    run.between = true;
    this.el.classList.remove('flash-solved', 'flash-failed');
    void this.el.offsetWidth; // restart the flash animation
    this.el.classList.add(o === 'solved' ? 'flash-solved' : 'flash-failed');
    window.setTimeout(() => this.run === run && this.next(), o === 'solved' ? SOLVED_PAUSE_MS : FAILED_PAUSE_MS);
  }

  /** Skip the current puzzle: it costs {@link SKIP_PENALTY_MS} off the clock. */
  private skip() {
    const run = this.run;
    const card = this.card;
    if (!run || run.over || run.between || !card) return;
    run.played.push({ def: card.def, level: card.level, o: 'skipped' });
    run.left -= SKIP_PENALTY_MS;
    this.note(L('Skipped · −5 s', 'Passé · −5 s'));
    if (run.left <= 0) return this.end();
    this.draw();
    this.next();
  }

  private note(text: string) {
    clearTimeout(this.noteTimer);
    this.noteEl.textContent = text;
    this.noteEl.classList.add('on');
    this.noteTimer = window.setTimeout(() => this.noteEl.classList.remove('on'), 1600);
  }

  /** Time's up: freeze the board and show the score. */
  private end() {
    const run = this.run;
    if (!run || run.over) return;
    run.over = true;
    run.left = 0;
    this.draw();
    this.card?.setActive(false);
    this.card?.destroy();
    this.card = null;
    const rec = recordRush(rushKey(run.mode, run.minutes), run.solved);
    telemetry.track('rush.end', {
      'rush.mode': run.mode,
      'rush.minutes': run.minutes,
      'rush.score': run.solved,
      'rush.played': run.played.length,
      'rush.best': rec.best,
      'rush.top_level': LEVEL_IDS[run.played.reduce<Difficulty>((a, p) => (p.level > a ? p.level : a), 1)],
    });
    this.skipBtn.disabled = true;
    this.stage.replaceChildren(this.summary(run, rec));
    if (rec.best) {
      const r = this.stage.getBoundingClientRect();
      confetti(r.left + r.width / 2, r.top + r.height / 3, 90);
    }
  }

  private summary(run: Run, rec: { best: boolean; prev: number | undefined }): HTMLElement {
    const mark = (o: Outcome) => (o === 'solved' ? '✓' : o === 'failed' ? '✕' : '↷');
    const label = (o: Outcome) => (o === 'solved' ? L('solved', 'réussi') : o === 'failed' ? L('failed', 'raté') : L('skipped', 'passé'));
    return h(
      'section',
      { class: 'rush-end', 'aria-live': 'polite' },
      h('p', { class: 'rush-end-kicker' }, `${L('Time’s up!', 'Temps écoulé!')} · ${rushModeName(run.mode)} · ${run.minutes} min`),
      h(
        'p',
        { class: 'rush-end-score' },
        h('strong', null, run.solved),
        // The number is the big one above: keep only the words.
        P(run.solved, ['puzzle solved', 'puzzles solved'], ['partie réussie', 'parties réussies']).replace(/^\S+ /, ''),
      ),
      h(
        'p',
        { class: `rush-end-best ${rec.best ? 'new' : ''}` },
        rec.best
          ? rec.prev
            ? L(`New best! (was ${rec.prev})`, `Nouveau record! (avant : ${rec.prev})`)
            : L('First record set!', 'Premier record!')
          : rec.prev != null
            ? L(`Best: ${rec.prev}`, `Record : ${rec.prev}`)
            : '',
      ),
      run.played.length
        ? h(
            'ol',
            { class: 'rush-log' },
            ...run.played.map((p) =>
              h(
                'li',
                { class: `is-${p.o}`, 'data-puzzle': p.def.id },
                h('span', { class: 'rush-mark', 'aria-label': label(p.o) }, mark(p.o)),
                h('span', { class: 'swatchlet' }),
                h('span', { class: 'rush-log-name' }, p.def.name),
                h('span', { class: 'small muted' }, LEVEL_NAMES[p.level]),
              ),
            ),
          )
        : null,
      h(
        'div',
        { class: 'row rush-end-actions' },
        h('a', { class: 'btn ghost', href: '/rush' }, L('← Rush', '← Sprint')),
        btn(L('Again', 'Rejouer'), () => this.start(run.mode, run.minutes), 'primary'),
      ),
    );
  }
}
