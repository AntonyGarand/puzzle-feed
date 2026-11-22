import { telemetry } from '../../core/analytics';
import { L, P, wordLocale } from '../../core/i18n';
import { Rng } from '../../core/rng';
import { clearSave, dailySaveKey, putSave, type Save, type Slot } from '../../core/saves';
import { encodeCode } from '../../core/share';
import { getProfile, prefs, record, recordDaily, setLevel, stats, type RecordOutcome } from '../../core/store';
import { LEVEL_IDS, LEVEL_NAMES, type Difficulty, type Hint, type PuzzleDef, type PuzzleInstance } from '../../core/types';
import { xpLevel } from '../../core/xp';
import { btn, cogIcon, fmtTime, h, undoBtn } from '../../ui/dom';
import { helpButton } from '../../ui/help';
import { shareSection } from '../../ui/share';
import { openSheet } from '../../ui/sheet';
import { levelHex, lostCard, winCard } from '../../ui/win';
import { Clock } from './clock';
import { fitBoard } from './fit';
import { HintPopup } from './hint-popup';
import { celebrate, confettiOver, makePeekable, resultLine, type Outcome } from './result';
import { openGameSettings } from './settings-sheet';
import { UndoHistory } from './undo-history';

export interface CardOptions {
  /** Labs mode: fixed levels (doesn't touch feed prefs), no auto-advance, "New puzzle" instead of "Next". */
  lab?: boolean;
  /** Start at this level instead of the puzzle's current level. */
  level?: Difficulty | undefined;
  /** Resume this saved puzzle on first mount. */
  resume?: Save | undefined;
  /** Play this exact seed on first mount (with `level`). */
  seed?: number | undefined;
  /** The first mount is a shared puzzle: separate save slot, no auto-levelling. */
  shared?: boolean | undefined;
  /** Called after every (re)generation, e.g. to keep the URL in sync. */
  onMount?: (card: Card) => void;
  /**
   * A daily challenge puzzle (with `level` and `seed`): every (re)mount plays that exact puzzle, it
   * has its own save slot, results go to the daily list and never move auto-levelling.
   */
  daily?: DailyRef;
}

export interface DailyRef {
  date: string;
  level: Difficulty;
  index: number;
}

interface Launch {
  level?: Difficulty | undefined;
  resume?: Save | undefined;
  seed?: number | undefined;
  shared?: boolean | undefined;
}

/**
 * One puzzle card: header (level, lives, mistakes, timer, hint/help/settings), the game on its stage,
 * and the footer (status, controls, result). Owns the run around the game: timing, mistakes, hints,
 * undo, saving progress, recording the result.
 */
export class Card {
  readonly el: HTMLElement;
  private stage!: HTMLElement;
  private foot!: HTMLElement;
  private statusEl!: HTMLElement;
  private controlsEl!: HTMLElement;
  private timerEl!: HTMLElement;
  private levelEl!: HTMLElement;
  private mistakesEl!: HTMLElement;
  private livesEl!: HTMLElement;
  private hint!: HintPopup;
  private inst: PuzzleInstance = {};
  private resize = new ResizeObserver(() => {
    this.fit();
    this.hint.draw();
  });

  level: Difficulty = 1;
  mounted = false;
  done = false;
  /** Solve recorded at the goal while the player keeps going (`solved({ keepPlaying })`). */
  private reached: { ms: number; res: RecordOutcome | null } | null = null;
  interacted = false;
  private active = false;
  private clock = new Clock();
  private mistakes = 0;
  /** Hints shown on this puzzle (the hint button gave a step, a fix or a dead end). */
  private hints = 0;
  private gen = 0;
  /** Bumped for every game instance (a new puzzle or an undo): callbacks from older ones are ignored. */
  private igen = 0;
  private root: HTMLElement | null = null;
  private history = new UndoHistory();
  private undoBtn = undoBtn(() => this.undo());
  private trackTimer = 0;
  private listen: AbortController | null = null;
  /** `gen` of the puzzle already reported as left (scrolled past), so it's reported once. */
  private leftGen = -1;
  private seed = 0;
  /** Opened from a share code (until the player starts another puzzle on this card). */
  shared = false;
  private saveTimer = 0;
  private advanceTimer = 0;
  private launch: Launch | null;

  constructor(
    readonly def: PuzzleDef,
    private readonly onNext: (card: Card) => void,
    private readonly opts: CardOptions = {},
  ) {
    this.launch = { level: opts.level, resume: opts.resume, seed: opts.seed, shared: opts.shared };
    this.el = h('article', { class: 'card', 'data-puzzle': def.id });
    (this.el as HTMLElement & { card?: Card }).card = this;
    this.build();
  }

  /** Share code of the current puzzle: game, level, seed (and locale for word games). */
  get code() {
    return encodeCode({ id: this.def.id, level: this.level, seed: this.seed, locale: this.def.localized ? wordLocale() : undefined });
  }

  /** Seed of the puzzle on this card (with `level`, enough to deal the same puzzle again). */
  get puzzleSeed() {
    return this.seed;
  }

  /** Where this card's progress is saved, and under which key. */
  private get slot(): Slot {
    return this.opts.daily ? 'daily' : this.shared ? 'shared' : 'own';
  }
  private get saveId(): string {
    const d = this.opts.daily;
    return d ? dailySaveKey(d.date, d.level, d.index) : this.def.id;
  }

  /** Not yet started: safe to regenerate or drop. */
  get pristine() {
    return !this.done && !this.interacted && this.time() < 1500;
  }

  private build() {
    this.timerEl = h('span', { class: 'timer', title: L('Time', 'Temps') }, '0:00');
    this.mistakesEl = h('span', { class: 'mistakes', title: L('Mistakes', 'Erreurs'), hidden: true });
    this.livesEl = h('span', { class: 'lives', title: L('Lives', 'Vies'), hidden: true });
    this.levelEl = h('span', { class: 'level-label' });
    this.stage = h('div', { class: 'stage' });
    this.statusEl = h('span', { class: 'status' });
    this.controlsEl = h('div', { class: 'controls' });
    this.foot = h('footer', { class: 'card-foot' });
    this.hint = new HintPopup({
      card: this.el,
      stage: this.stage,
      canShow: () => this.mounted && !this.done,
      ask: () => this.askHint(),
      onShown: (hint) => {
        this.hints++;
        this.interacted = true;
        this.queueSave();
        telemetry.track('puzzle.hint', { ...this.trackAttrs(), 'hint.kind': hint.kind ?? 'step', 'hint.count': this.hints });
      },
      onPlayed: () => {
        this.interacted = true;
        this.queueSave();
      },
    });
    const settings = h(
      'button',
      {
        type: 'button',
        class: 'icon-btn',
        'data-action': 'settings',
        title: L('Game settings', 'Réglages du jeu'),
        'aria-label': L('Game settings', 'Réglages du jeu'),
      },
      cogIcon(),
    );
    settings.addEventListener('click', () => this.openSettings());
    this.el.replaceChildren(
      h(
        'header',
        { class: 'card-head' },
        h('div', { class: 'title' }, h('h2', null, this.def.name), this.levelEl),
        h('div', { class: 'meta' }, this.livesEl, this.mistakesEl, this.timerEl, this.hint.button, this.makeHelpButton(), settings),
      ),
      this.stage,
      this.foot,
    );
    this.resize.observe(this.stage);
    // Any touch on the board puts the hint away (the touch itself still goes through).
    this.stage.addEventListener('pointerdown', () => this.hint.close(), { capture: true });
  }

  /** What's wrong with the position, else the next step. A game error shows as "no hint", not a crash. */
  private askHint(): Hint | null {
    try {
      return this.inst.check?.() ?? this.inst.hint?.() ?? null;
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  /** Pause the clock while a sheet (guide/settings) is open. Returns the resume function. */
  private pauseWhile(): () => void {
    const wasActive = this.active && !this.done;
    if (wasActive) this.setActive(false);
    return () => {
      if (wasActive) this.setActive(true);
    };
  }

  private openSettings() {
    const lab = !!this.opts.lab;
    openGameSettings({
      def: this.def,
      level: this.level,
      done: this.done,
      lab,
      daily: !!this.opts.daily,
      code: this.code,
      pause: () => this.pauseWhile(),
      pickLevel: (v) => {
        if (lab) return this.mount({ level: v });
        setLevel(this.def.id, v); // picking a level turns Auto off
        this.mount(); // the feed also regenerates untouched upcoming cards
      },
      giveUp: () => this.finish(lab ? 'failed' : 'skipped'),
      newPuzzle: () => this.mount({ level: this.level }),
    });
  }

  /** Sheet with this puzzle's share code and link. */
  openShare() {
    const resume = this.pauseWhile();
    openSheet({
      title: L('Share this puzzle', 'Partager cette partie'),
      puzzle: this.def.id,
      className: 'share-sheet',
      body: [
        h(
          'p',
          { class: 'muted small' },
          `${this.def.name} · ${LEVEL_NAMES[this.level]}. `,
          L(
            'Send the code or the link: the other person gets the same puzzle at the same level.',
            'Envoyez le code ou le lien : l’autre personne obtient la même partie, au même niveau.',
          ),
        ),
        shareSection(this.code, this.def.name),
      ],
      onClose: resume,
    });
  }

  private makeHelpButton() {
    let resume = () => {};
    return helpButton(this.def, {
      onOpen: () => (resume = this.pauseWhile()),
      onClose: () => resume(),
    });
  }

  private syncLevelSel() {
    const auto = !this.opts.lab && !this.shared && !prefs(this.def.id).manual;
    const tag = this.opts.daily
      ? ` · ${L('daily', 'du jour')} ${this.opts.daily.index + 1}`
      : this.shared
        ? ` · ${L('shared', 'partagée')}`
        : auto
          ? ' · auto'
          : '';
    const xp = stats(this.def.id).xp!;
    this.levelEl.replaceChildren(levelHex(xpLevel(xp).level, 'sm'), LEVEL_NAMES[this.level] + tag);
  }

  private syncLives(count: number, max: number) {
    const left = Math.max(0, Math.min(max, count));
    const el = this.livesEl;
    const lost = el.dataset['left'] !== '' && left < Number(el.dataset['left']);
    el.dataset['left'] = String(left);
    el.hidden = false;
    el.setAttribute('aria-label', P(left, ['life left', 'lives left'], ['vie restante', 'vies restantes']));
    el.replaceChildren(...Array.from({ length: max }, (_, i) => h('i', { class: i < left ? 'on' : '' })));
    if (lost) bump(el);
  }

  private syncMistakes() {
    this.mistakesEl.hidden = this.mistakes === 0;
    this.mistakesEl.textContent = `✕ ${this.mistakes}`;
  }

  /** Size the board to the space left between header and footer. */
  fit() {
    fitBoard(this.stage);
  }

  mount(first: Launch | null = this.launch) {
    this.launch = null; // the launch options only apply to the first mount
    // A daily card always replays its own puzzle.
    const launch = this.opts.daily ? { level: this.opts.daily.level, seed: this.opts.seed, resume: first?.resume } : first;
    this.gen++;
    // Word games generate from the locale's word list: a save from the other language can't be resumed.
    const resume = launch?.resume && (!this.def.localized || (launch.resume.locale ?? 'en') === wordLocale()) ? launch.resume : undefined;
    this.level = resume?.level ?? launch?.level ?? (this.opts.lab && this.mounted ? this.level : prefs(this.def.id).level);
    this.seed = resume?.seed ?? launch?.seed ?? (Math.random() * 2 ** 32) >>> 0;
    this.shared = !!launch?.shared;
    this.mounted = true;
    this.done = false;
    this.reached = resume?.reached ? { ms: resume.elapsed, res: null } : null;
    this.interacted = !!resume;
    this.mistakes = resume?.mistakes ?? 0;
    this.hints = resume?.hints ?? 0;
    this.hint.close();
    this.clock.reset(resume?.elapsed ?? 0, this.active);
    this.el.classList.remove('is-solved', 'is-failed', 'is-skipped');
    this.stage.inert = false;
    this.livesEl.hidden = true;
    this.livesEl.dataset['left'] = '';
    this.foot.replaceChildren(this.statusEl, h('div', { class: 'actions' }, this.def.undo ? this.undoBtn : null, this.controlsEl));
    this.syncLevelSel();
    this.syncMistakes();
    this.tick();

    this.history.clear();
    this.listen?.abort();
    this.listen = new AbortController();
    // Drags can end outside the board; the move is in the state shortly after the pointer lifts.
    if (this.def.undo) window.addEventListener('pointerup', () => this.active && this.queueTrack(), { signal: this.listen.signal });
    this.createInstance(resume?.state);
    this.opts.onMount?.(this);
  }

  /** Build the game in a fresh root, restoring `saved` (a resume or an undo). Keeps time and mistakes. */
  private createInstance(saved: unknown) {
    const igen = ++this.igen;
    this.inst.destroy?.();
    this.inst = {};
    if (this.root) this.resize.unobserve(this.root);
    this.stage.replaceChildren();
    this.statusEl.textContent = '';
    this.controlsEl.replaceChildren();
    const live = () => igen === this.igen && !this.done;
    const root = h('div', { class: 'puzzle' });
    this.root = root;
    this.stage.append(root);
    this.inst =
      this.def.create({
        difficulty: this.level,
        rng: new Rng(this.seed),
        root,
        saved,
        solved: (opts) => live() && (opts?.keepPlaying ? this.reach() : this.finish('solved')),
        failed: () => live() && this.finish('failed'),
        mistake: () => {
          if (!live()) return;
          this.mistakes++;
          this.syncMistakes();
          bump(this.mistakesEl);
        },
        touch: () => {
          if (live()) this.interacted = true;
        },
        lives: (left, max) => {
          if (igen === this.igen) this.syncLives(left, max);
        },
        status: (t) => {
          if (igen === this.igen) this.statusEl.textContent = t;
        },
        controls: (...els) => {
          if (igen === this.igen) this.controlsEl.append(...els);
        },
      }) || {};
    this.hint.button.hidden = !this.inst.hint && !this.inst.check;
    // Any pointer interaction inside the stage counts as starting; progress is saved shortly after.
    root.addEventListener('pointerdown', () => (this.interacted = true), { capture: true });
    root.addEventListener('pointerup', () => this.queueSave());
    root.addEventListener('keyup', () => this.queueSave());
    root.addEventListener('click', () => this.queueTrack());
    this.resize.observe(root);
    this.fit();
    if (this.active) this.inst.activate?.();
    this.track();
  }

  private queueTrack() {
    if (!this.def.undo) return;
    clearTimeout(this.trackTimer);
    this.trackTimer = window.setTimeout(() => this.track(), 0);
  }

  /** Add the current state to the undo history if a move changed it. */
  private track() {
    clearTimeout(this.trackTimer);
    if (!this.def.undo || this.done) return;
    this.history.record(() => this.inst.snapshot?.());
    this.undoBtn.disabled = !this.history.canUndo;
  }

  /** Step back one move: re-create the game from the previous state, keeping selection and cursor. */
  undo() {
    if (!this.def.undo || this.done) return;
    this.track(); // a move that settled after an animation may not be recorded yet
    const prev = this.history.undo();
    if (!prev) return;
    this.interacted = true;
    this.createInstance(prev.state);
    this.queueSave();
  }

  /** Re-sync the level label without regenerating (e.g. auto→manual elsewhere). */
  refreshLevelLabel() {
    this.syncLevelSel();
  }

  private queueSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.persist(), 400);
    this.queueTrack();
  }

  /** Save in-progress state so it can be resumed from Labs. */
  persist() {
    clearTimeout(this.saveTimer);
    if (!this.mounted || this.done || !this.interacted) return;
    let state: unknown;
    try {
      state = this.inst.snapshot?.();
    } catch {
      state = undefined;
    }
    putSave(
      this.saveId,
      {
        seed: this.seed,
        level: this.level,
        elapsed: Math.round(this.time()),
        mistakes: this.mistakes,
        ...(this.hints ? { hints: this.hints } : {}),
        state,
        at: Date.now(),
        locale: wordLocale(),
        ...(this.reached ? { reached: true as const } : {}),
      },
      this.slot,
    );
  }

  /** Milliseconds played on this puzzle. */
  time() {
    return this.clock.time();
  }

  setActive(on: boolean) {
    if (on === this.active) return;
    this.active = on;
    if (!this.mounted) this.mount();
    if (on && !this.done) {
      this.clock.start();
      this.fit();
      this.inst.activate?.();
    } else if (!on) {
      this.hint.close();
      this.persist();
      this.clock.stop();
      // Don't let a focused input keep swallowing keys meant for the next card.
      const f = document.activeElement as HTMLElement | null;
      if (f && this.el.contains(f)) f.blur();
    }
  }

  tick() {
    this.timerEl.textContent = fmtTime(this.time());
  }

  onKey(e: KeyboardEvent): boolean {
    if (this.done) return false;
    if (isUndoKey(e)) {
      if (!this.def.undo) return false; // modifier keys never reach the games
      this.undo();
      return true;
    }
    const handled = this.inst.onKey?.(e) ?? false;
    if (handled) {
      this.interacted = true;
      this.queueSave();
    }
    return handled;
  }

  /** Goal reached in an endless game: record the solve now, keep the board live. */
  private reach() {
    if (this.reached) return;
    const ms = Math.round(this.time());
    const res = this.recordResult('solved', ms);
    this.reached = { ms, res };
    this.syncLevelSel();
    this.queueSave();
    if (celebrate(res)) confettiOver(this.stage, res);
  }

  private recordResult(o: Outcome, ms: number) {
    const daily = this.opts.daily;
    const res = record(
      this.def.id,
      {
        d: this.level,
        o,
        ms,
        m: this.mistakes,
        ...(this.hints ? { hn: this.hints } : {}),
        ...(this.shared ? { sh: true as const } : {}),
        ...(daily ? { dy: true as const } : {}),
      },
      this.def.par(this.level) * 1000,
    );
    telemetry.track('puzzle.result', {
      ...this.trackAttrs(),
      'puzzle.outcome': o,
      'puzzle.duration_ms': ms,
      'puzzle.mistakes': this.mistakes,
      'puzzle.hints': this.hints,
      'puzzle.auto_level': !this.opts.lab && !this.shared && !prefs(this.def.id).manual,
      'puzzle.personal_best': !!res.best,
      'puzzle.first_clear': o === 'solved' && res.prevBest == null,
      'puzzle.level_change': res.levelChange ? res.levelChange.to - res.levelChange.from : 0,
    });
    if (daily) recordDaily(daily.date, daily.level, daily.index, o, ms, this.mistakes);
    return res;
  }

  private trackAttrs() {
    return {
      'puzzle.id': this.def.id,
      'puzzle.difficulty': this.level,
      'puzzle.difficulty_name': LEVEL_IDS[this.level],
      'puzzle.mode': this.opts.daily ? 'daily' : this.opts.lab ? 'lab' : this.shared ? 'shared' : 'feed',
    };
  }

  /**
   * The feed scrolled away from this puzzle before it ended. Reported once per puzzle as `puzzle.leave`
   * (the card stays playable, so it isn't a `puzzle.result`). Cards only flicked past (pristine) don't count.
   */
  left() {
    if (!this.mounted || this.done || this.reached || this.pristine || this.leftGen === this.gen) return;
    this.leftGen = this.gen;
    telemetry.track('puzzle.leave', {
      ...this.trackAttrs(),
      'puzzle.started': this.interacted,
      'puzzle.duration_ms': Math.round(this.time()),
      'puzzle.mistakes': this.mistakes,
    });
  }

  private finish(result: Outcome) {
    if (this.done) return;
    // An endless game that already reached its goal ends as a solve, timed at the goal, recorded once.
    const early = this.reached;
    const o = early ? 'solved' : result;
    const ms = early ? early.ms : Math.round(this.time());
    this.done = true;
    this.hint.close();
    clearSave(this.saveId, this.seed, this.slot);
    this.setActive(false);
    this.active = true; // still the visible card; just stop the clock
    for (const c of this.stage.children) (c as HTMLElement).inert = true;
    this.el.classList.add(`is-${o}`);
    this.tick();

    // A resumed run that had already reached its goal has no outcome in memory: skip the record line.
    const res: RecordOutcome = early ? (early.res ?? {}) : this.recordResult(o, ms);
    this.syncLevelSel();
    const known = !early || !!early.res;
    // An endless game already celebrated when its goal was reached.
    if (o === 'solved' && known && !early && celebrate(res)) confettiOver(this.stage, res);

    const daily = !!this.opts.daily;
    const advance = !this.opts.lab && o === 'solved' && getProfile().autoAdvance;
    const advanceMs = res.best || res.prevBest == null || res.levelChange ? 3200 : 2400;
    const levelUp = res.levelChange && { up: res.levelChange.to > res.levelChange.from, to: LEVEL_NAMES[res.levelChange.to] };
    const panel = this.resultPanel(o, ms, known ? res : null, levelUp, advance ? advanceMs : undefined);
    if (panel) {
      makePeekable(panel, () => clearTimeout(this.advanceTimer));
      this.stage.append(panel);
    }

    this.foot.replaceChildren(
      resultLine(o, this.mistakes, this.hints, levelUp),
      h(
        'div',
        { class: 'actions' },
        this.opts.lab ? btn(L('Share', 'Partager'), () => this.openShare(), 'ghost') : null,
        daily && o !== 'solved' ? btn(L('Try again', 'Réessayer'), () => this.mount(), 'ghost') : null,
        this.opts.lab ? null : btn(L('Again', 'Rejouer'), () => this.mount(), 'ghost'),
        btn(
          daily ? L('Next', 'Suivant') : this.opts.lab ? L('New puzzle', 'Nouvelle partie') : L('Next ↓', 'Suivant ↓'),
          () => this.onNext(this),
          'primary',
        ),
      ),
    );

    if (this.opts.lab) return;
    if (advance) {
      const gen = this.gen;
      this.advanceTimer = window.setTimeout(() => gen === this.gen && this.onNext(this), advanceMs);
    } else if (o === 'skipped') {
      this.onNext(this);
    }
  }

  /** The win or loss panel over the board (a skip has none). `res` is null when the outcome isn't known. */
  private resultPanel(
    o: Outcome,
    ms: number,
    res: RecordOutcome | null,
    levelUp: { up: boolean; to: string } | undefined,
    advanceMs: number | undefined,
  ): HTMLElement | null {
    const common = {
      name: this.def.name,
      level: LEVEL_NAMES[this.level],
      daily: !!this.opts.daily,
      ms,
      mistakes: this.mistakes,
      hints: this.hints,
      levelUp,
    };
    if (o === 'solved')
      return winCard({ ...common, parMs: this.def.par(this.level) * 1000, solved: stats(this.def.id).solved, res, advanceMs });
    if (o === 'failed') {
      const st = stats(this.def.id);
      return lostCard({ ...common, best: st.best[this.level], played: st.solved + st.failed, solved: st.solved });
    }
    return null;
  }

  destroy() {
    this.persist();
    this.listen?.abort();
    clearTimeout(this.trackTimer);
    this.resize.disconnect();
    this.inst.destroy?.();
    this.gen++;
    this.igen++;
  }
}

/** Ctrl+Z / Cmd+Z: the card's Undo (games with `def.undo`). */
export const isUndoKey = (e: KeyboardEvent) => (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z';

/** Replay the little "bump" animation on a counter that just went up. */
function bump(el: HTMLElement) {
  el.classList.remove('bump');
  void el.offsetWidth; // restart the CSS animation
  el.classList.add('bump');
}
