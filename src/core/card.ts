import { telemetry } from './analytics';
import { confetti } from './confetti';
import { helpButton } from './help';
import { drawHint } from './hint-overlay';
import { L, P, wordLocale } from './i18n';
import { Rng } from './rng';
import { clearSave, dailySaveKey, putSave, type Save, type Slot } from './saves';
import { encodeCode, shareSection } from './share';
import { openSheet } from './sheet';
import { prefs, record, recordDaily, setLevel, setWeight, getProfile, stats, type RecordOutcome, type Weight } from './store';
import { LEVELS, LEVEL_IDS, LEVEL_NAMES, type Difficulty, type Hint, type PuzzleDef, type PuzzleInstance } from './types';
import { btn, bulbIcon, cogIcon, fmtTime, h, s as svg } from './ui';
import { levelHex, lostCard, winCard } from './win';
import { xpLevel } from './xp';

export interface CardOptions {
  /** Labs mode: fixed levels (doesn't touch feed prefs), no auto-advance, "New puzzle" instead of "Next". */
  lab?: boolean;
  /** Start at this level instead of the puzzle's current level. */
  level?: Difficulty;
  /** Resume this saved puzzle on first mount. */
  resume?: Save;
  /** Play this exact seed on first mount (with `level`). */
  seed?: number;
  /** The first mount is a shared puzzle: separate save slot, no auto-levelling. */
  shared?: boolean;
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
  level?: Difficulty;
  resume?: Save;
  seed?: number;
  shared?: boolean;
}

export class Card {
  readonly el: HTMLElement;
  private stage!: HTMLElement;
  private foot!: HTMLElement;
  private statusEl!: HTMLElement;
  private controlsEl!: HTMLElement;
  private timerEl!: HTMLElement;
  private levelEl!: HTMLElement;
  private mistakesEl!: HTMLElement;
  private hintBtn!: HTMLButtonElement;
  /** The open in-game hint (overlay on the board + bubble over the footer), if any. */
  private hintUi: { el: HTMLElement; layer: SVGSVGElement; hint: Hint | null } | null = null;
  private inst: PuzzleInstance = {};
  private resize = new ResizeObserver(() => {
    this.fit();
    this.drawHint();
  });

  level: Difficulty = 1;
  mounted = false;
  done = false;
  /** Solve recorded at the goal while the player keeps going (`solved({ keepPlaying })`). */
  private reached: { ms: number; res: RecordOutcome | null } | null = null;
  interacted = false;
  private active = false;
  private elapsed = 0;
  private runningSince = 0;
  private mistakes = 0;
  /** Hints shown on this puzzle (the hint button gave a step, a fix or a dead end). */
  private hints = 0;
  private gen = 0;
  /** Bumped for every game instance (a new puzzle or an undo): callbacks from older ones are ignored. */
  private igen = 0;
  private root: HTMLElement | null = null;
  /** Undo steps for games with `def.undo`: snapshots, oldest first; the last one is the current state. */
  private history: { state: unknown; key: string }[] = [];
  private undoBtn = btn(L('Undo', 'Annuler'), () => this.undo(), 'ghost');
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
    this.levelEl = h('span', { class: 'level-label' });
    this.stage = h('div', { class: 'stage' });
    this.statusEl = h('span', { class: 'status' });
    this.controlsEl = h('div', { class: 'controls' });
    this.foot = h('footer', { class: 'card-foot' });
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
    this.hintBtn = h(
      'button',
      {
        type: 'button',
        class: 'icon-btn hint-btn',
        'data-action': 'hint',
        title: L('Hint', 'Indice'),
        'aria-label': L('Hint', 'Indice'),
      },
      bulbIcon(),
    ) as HTMLButtonElement;
    this.hintBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.hintUi) this.closeHint();
      else this.showHint();
    });
    this.el.replaceChildren(
      h(
        'header',
        { class: 'card-head' },
        h('div', { class: 'title' }, h('h2', null, this.def.name), this.levelEl),
        h('div', { class: 'meta' }, this.mistakesEl, this.timerEl, this.hintBtn, this.makeHelpButton(), settings),
      ),
      this.stage,
      this.foot,
    );
    this.resize.observe(this.stage);
    // Any touch on the board puts the hint away (the touch itself still goes through).
    this.stage.addEventListener('pointerdown', () => this.closeHint(), { capture: true });
  }

  /**
   * In-game hint: first what's wrong with the position (`check()`), otherwise the next step (`hint()`).
   * The clue and the move are outlined on the live board; a bubble over the footer explains it and
   * offers to make the move (or undo the mistake).
   */
  private showHint() {
    if (this.done || !this.mounted) return;
    this.closeHint();
    let hint: Hint | null = null;
    try {
      hint = this.inst.check?.() ?? this.inst.hint?.() ?? null;
    } catch (err) {
      console.error(err);
      hint = null;
    }
    if (hint) {
      this.hints++;
      this.interacted = true;
      this.queueSave();
      telemetry.track('puzzle.hint', { ...this.trackAttrs(), 'hint.kind': hint.kind ?? 'step', 'hint.count': this.hints });
    }
    const layer = svg('svg', { class: 'guide-layer hint-layer', 'aria-hidden': 'true' }) as SVGSVGElement;
    const kind = hint?.kind ?? 'step';
    const action =
      hint?.action ?? (kind === 'fix' ? L('Fix it', 'Corriger') : kind === 'stuck' ? L('Undo', 'Annuler') : L('Play it', 'Jouer le coup'));
    const play = () => {
      const h0 = this.hintUi?.hint;
      this.closeHint();
      if (!h0 || this.done) return;
      try {
        h0.play();
      } catch (err) {
        console.error(err);
      }
      this.interacted = true;
      this.queueSave();
    };
    const el = h(
      'div',
      { class: `hint-pop ${kind}`, role: 'status', 'aria-live': 'polite' },
      h(
        'p',
        null,
        hint
          ? hint.text
          : L('No hint here: nothing sure to suggest from this position.', 'Pas d’indice ici : rien de sûr à suggérer pour le moment.'),
      ),
      h(
        'div',
        { class: 'hint-actions' },
        hint ? btn(action, play, 'primary') : null,
        btn('✕', () => this.closeHint(), 'ghost'),
      ),
    );
    this.stage.append(layer);
    this.el.append(el);
    this.hintBtn.classList.add('on');
    this.hintUi = { el, layer, hint };
    requestAnimationFrame(() => this.drawHint());
  }

  private drawHint() {
    const ui = this.hintUi;
    if (ui) drawHint(ui.layer, this.stage, ui.hint);
  }

  private closeHint() {
    const ui = this.hintUi;
    if (!ui) return;
    this.hintUi = null;
    ui.el.remove();
    ui.layer.remove();
    this.hintBtn.classList.remove('on');
  }

  /** Pause the clock while a sheet (guide/settings) is open. Returns the resume function. */
  private pauseWhile(): () => void {
    const wasActive = this.active && !this.done;
    if (wasActive) this.setActive(false);
    return () => {
      if (wasActive) this.setActive(true);
    };
  }

  /** The cog sheet: difficulty, how often this game shows up in the feed, new puzzle, skip/give up. */
  private openSettings() {
    const resume = this.pauseWhile();
    const p = prefs(this.def.id);
    const daily = !!this.opts.daily;
    // The picker always shows the level being played; Auto is a separate switch (feed only).
    const options = LEVELS.map((l) => ({ label: LEVEL_NAMES[l], value: l }));
    let close = () => {};
    const pickLevel = (v: Difficulty) => {
      close();
      if (this.opts.lab) {
        this.mount({ level: v });
        return;
      }
      setLevel(this.def.id, v); // picking a level turns Auto off
      this.mount(); // the feed also regenerates untouched upcoming cards
    };
    const seg = <T>(name: string, items: { label: string; value: T }[], cur: T, onpick: (v: T) => void) =>
      h(
        'div',
        { class: 'seg wrap', role: 'radiogroup', 'data-setting': name },
        ...items.map((o) =>
          h(
            'button',
            {
              type: 'button',
              role: 'radio',
              'data-value': String(o.value),
              'aria-checked': String(o.value === cur),
              class: o.value === cur ? 'on' : '',
              onclick: () => onpick(o.value),
            },
            o.label,
          ),
        ),
      );
    const weights: { label: string; value: Weight }[] = [
      { label: L('Off', 'Jamais'), value: 0 },
      { label: L('Less', 'Moins'), value: 1 },
      { label: L('Normal', 'Normal'), value: 2 },
      { label: L('More', 'Plus'), value: 3 },
    ];
    const freq = seg('weight', weights, p.weight, (v) => {
      setWeight(this.def.id, v);
      freq.querySelectorAll('button').forEach((b, i) => {
        b.classList.toggle('on', weights[i].value === v);
        b.setAttribute('aria-checked', String(weights[i].value === v));
      });
    });
    const autoOpts = [
      { label: L('Off', 'Non'), value: 0 },
      { label: L('On', 'Oui'), value: 1 },
    ];
    const auto = seg('auto', autoOpts, p.manual ? 0 : 1, (v) => {
      // The level stays where it is: On lets auto-levelling move it from here, Off locks it.
      setLevel(this.def.id, v ? 'auto' : this.level);
      auto.querySelectorAll('button').forEach((b, i) => {
        b.classList.toggle('on', autoOpts[i].value === v);
        b.setAttribute('aria-checked', String(autoOpts[i].value === v));
      });
    });
    const showAuto = !daily && !this.opts.lab;
    close = openSheet({
      title: this.def.name,
      puzzle: this.def.id,
      className: 'game-settings',
      body: [
        daily ? null : h('h3', null, L('Difficulty', 'Difficulté')),
        daily ? null : seg('level', options, this.level, pickLevel),
        showAuto ? h('h3', null, L('Auto-level', 'Niveau auto')) : null,
        showAuto
          ? h(
              'p',
              { class: 'muted small auto-hint' },
              L('Raises the level when you solve quickly and cleanly.', 'Monte le niveau quand vous résolvez vite et sans faute.'),
            )
          : null,
        showAuto ? auto : null,
        this.opts.lab ? null : h('h3', null, L('In the feed', 'Dans le fil')),
        this.opts.lab ? null : freq,
        h('h3', null, L('Share this puzzle', 'Partager cette partie')),
        shareSection(this.code, this.def.name),
      ],
      footer: [
        h('a', { class: 'btn ghost', href: '/settings', onclick: () => close() }, L('All settings', 'Tous les réglages')),
        this.done
          ? null
          : btn(this.opts.lab ? L('Give up', 'Abandonner') : L('Skip', 'Passer'), () => {
              close();
              this.finish(this.opts.lab ? 'failed' : 'skipped');
            }),
        daily
          ? null
          : btn(
              L('New puzzle', 'Nouvelle partie'),
              () => {
                close();
                this.mount({ level: this.level });
              },
              'primary',
            ),
      ],
      onClose: resume,
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

  private syncMistakes() {
    this.mistakesEl.hidden = this.mistakes === 0;
    this.mistakesEl.textContent = `✕ ${this.mistakes}`;
  }

  /**
   * Size the board to the space actually left between header and footer. Every game scales from
   * `--board`, so shrink it until the whole game (board + pads/palettes) fits without overflowing.
   */
  fit() {
    const stage = this.stage;
    const root = stage.firstElementChild as HTMLElement | null;
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    if (!root || !W || !H) return;
    const set = (f: number) => stage.style.setProperty('--fit', `${Math.max(120, Math.floor(f))}px`);
    let f = Math.min(W - 8, 600);
    set(f);
    // Bracket the answer: `lo` is the largest size known to fit, `hi` the smallest known to overflow.
    // Content height isn't always 1:1 with the board size (grids capped by width or per-cell maximums
    // stop growing), so a bare secant step can overshoot to the minimum; keep every guess in the bracket.
    let lo = 120;
    let hi = Infinity;
    let prevF = 0;
    let prevOver = 0;
    for (let i = 0; i < 8; i++) {
      const overH = root.getBoundingClientRect().height - H;
      const overW = root.scrollWidth - W;
      const over = Math.max(overH, overW);
      if (over <= 0.5) {
        lo = f;
        if (hi === Infinity || hi - lo <= 2) break;
        // Fits but a larger size overflowed earlier: try halfway back up.
        f = (lo + hi) / 2;
      } else {
        hi = f;
        // Secant step once there are two samples, bisection if it leaves the bracket.
        const slope = prevF ? Math.max(0.3, (prevOver - over) / (prevF - f || 1)) : 1;
        prevF = f;
        prevOver = over;
        f -= over / slope + 1;
        if (f <= lo || f >= hi) f = (lo + hi) / 2;
        if (hi - lo <= 2) f = lo;
      }
      set(f);
    }
    // Out of steps while overflowing: fall back to the largest size known to fit.
    if (Math.max(root.getBoundingClientRect().height - H, root.scrollWidth - W) > 0.5) set(lo);
  }

  mount(launch: Launch | null = this.launch) {
    this.launch = null; // the launch options only apply to the first mount
    // A daily card always replays its own puzzle.
    if (this.opts.daily) launch = { level: this.opts.daily.level, seed: this.opts.seed, resume: launch?.resume };
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
    this.closeHint();
    this.elapsed = resume?.elapsed ?? 0;
    this.runningSince = this.active ? performance.now() : 0;
    this.el.classList.remove('is-solved', 'is-failed', 'is-skipped');
    this.stage.inert = false;
    this.foot.replaceChildren(this.statusEl, h('div', { class: 'actions' }, this.def.undo ? this.undoBtn : null, this.controlsEl));
    this.syncLevelSel();
    this.syncMistakes();
    this.tick();

    this.history = [];
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
          this.mistakesEl.classList.remove('bump');
          void this.mistakesEl.offsetWidth;
          this.mistakesEl.classList.add('bump');
        },
        touch: () => {
          if (live()) this.interacted = true;
        },
        status: (t) => {
          if (igen === this.igen) this.statusEl.textContent = t;
        },
        controls: (...els) => {
          if (igen === this.igen) this.controlsEl.append(...els);
        },
      }) || {};
    this.hintBtn.hidden = !this.inst.hint && !this.inst.check;
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

  /** Current state as an undo step; `key` ignores the selection and cursor. */
  private capture(): { state: unknown; key: string } | null {
    try {
      const raw = this.inst.snapshot?.();
      if (raw === undefined) return null;
      const state: unknown = JSON.parse(JSON.stringify(raw));
      const key = JSON.stringify(isRecord(state) ? { ...state, sel: undefined, cur: undefined } : state);
      return { state, key };
    } catch {
      return null;
    }
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
    const c = this.capture();
    if (!c) return;
    if (this.history.at(-1)?.key !== c.key) this.history.push(c);
    if (this.history.length > 300) this.history.shift();
    this.undoBtn.disabled = this.history.length < 2;
  }

  /** Step back one move: re-create the game from the previous state, keeping selection and cursor. */
  undo() {
    if (!this.def.undo || this.done) return;
    this.track(); // a move that settled after an animation may not be recorded yet
    if (this.history.length < 2) return;
    const cur = this.history.pop()!.state;
    const prev = this.history.at(-1)!.state;
    let state = prev;
    if (isRecord(prev) && isRecord(cur)) {
      const merged: Record<string, unknown> = { ...prev };
      for (const k of ['sel', 'cur']) if (k in cur) merged[k] = cur[k];
      state = merged;
    }
    this.interacted = true;
    this.createInstance(structuredClone(state));
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

  time() {
    return this.elapsed + (this.runningSince ? performance.now() - this.runningSince : 0);
  }

  setActive(on: boolean) {
    if (on === this.active) return;
    this.active = on;
    if (!this.mounted) this.mount();
    if (on && !this.done) {
      this.runningSince = performance.now();
      this.fit();
      this.inst.activate?.();
    } else if (!on) {
      this.closeHint();
      this.persist();
      if (this.runningSince) this.elapsed += performance.now() - this.runningSince;
      this.runningSince = 0;
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
    this.reached = { ms, res: this.recordResult('solved', ms) };
    this.syncLevelSel();
    this.queueSave();
    const res = this.reached.res!;
    if (celebrate(res)) {
      const r = this.stage.getBoundingClientRect();
      if (r.height) confetti(r.left + r.width / 2, r.top + r.height / 2, res.best ? 90 : 50);
    }
  }

  private recordResult(o: 'solved' | 'failed' | 'skipped', ms: number) {
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

  private finish(o: 'solved' | 'failed' | 'skipped') {
    if (this.done) return;
    // An endless game that already reached its goal ends as a solve, timed at the goal, recorded once.
    const early = this.reached;
    if (early) o = 'solved';
    const ms = early ? early.ms : Math.round(this.time());
    this.done = true;
    this.closeHint();
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

    const parts: (string | HTMLElement)[] = [];
    if (o === 'solved') parts.push(h('strong', { class: 'good' }, L('Solved', 'Réussi')));
    else if (o === 'failed') parts.push(h('strong', { class: 'bad' }, L('Not this time', 'Pas cette fois')));
    else parts.push(h('strong', null, L('Skipped', 'Passé')));
    if (this.mistakes && o === 'failed') parts.push(` · ${P(this.mistakes, ['mistake', 'mistakes'], ['erreur', 'erreurs'])}`);
    if (this.hints && o === 'failed') parts.push(` · ${P(this.hints, ['hint', 'hints'], ['indice', 'indices'])}`);
    // An endless game already celebrated when its goal was reached.
    if (o === 'solved' && known && !early && celebrate(res)) {
      const r = this.stage.getBoundingClientRect();
      if (r.height) confetti(r.left + r.width / 2, r.top + r.height / 2, res.best ? 90 : 50);
    }
    const advance = !this.opts.lab && o === 'solved' && getProfile().autoAdvance;
    const advanceMs = res.best || res.prevBest == null || res.levelChange ? 3200 : 2400;
    const levelUp = res.levelChange && { up: res.levelChange.to > res.levelChange.from, to: LEVEL_NAMES[res.levelChange.to] };
    let panel: HTMLElement | null = null;
    if (o === 'solved') {
      panel = winCard({
        name: this.def.name,
        level: LEVEL_NAMES[this.level],
        daily: !!this.opts.daily,
        ms,
        mistakes: this.mistakes,
        hints: this.hints,
        parMs: this.def.par(this.level) * 1000,
        solved: stats(this.def.id).solved,
        res: known ? res : null,
        levelUp,
        advanceMs: advance ? advanceMs : undefined,
      });
    } else if (o === 'failed') {
      const st = stats(this.def.id);
      panel = lostCard({
        name: this.def.name,
        level: LEVEL_NAMES[this.level],
        daily: !!this.opts.daily,
        ms,
        mistakes: this.mistakes,
        hints: this.hints,
        best: st.best[this.level],
        played: st.solved + st.failed,
        solved: st.solved,
        levelUp,
      });
    } else if (levelUp) {
      parts.push(
        h(
          'span',
          { class: 'lvl-change' },
          ` · ${levelUp.up ? L('Level up', 'Niveau supérieur') : L('Easing off', 'On ralentit')} → ${levelUp.to}`,
        ),
      );
    }
    if (panel) {
      const p = panel;
      // Tap the panel to peek at the finished board (tap again to bring it back); this stops auto-advance.
      // Only taps that start on the panel count: on touch screens, the tap that ended the puzzle fires its
      // `click` after the panel is added, hit-tested onto it, which would hide the panel straight away.
      let pressed = false;
      p.addEventListener('pointerdown', () => (pressed = true));
      p.addEventListener('click', () => {
        if (!pressed) return;
        pressed = false;
        p.classList.toggle('peek');
        clearTimeout(this.advanceTimer);
      });
      this.stage.append(p);
    }

    const daily = !!this.opts.daily;
    this.foot.replaceChildren(
      h('span', { class: 'status result' }, ...parts),
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

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Confetti for a solve worth celebrating, not every one: a first clear, a new best, a level up
 * (puzzle difficulty, game or player XP level), or a standout bonus (the day's first solve of this
 * game, a daily challenge).
 */
function celebrate(res: RecordOutcome): boolean {
  if (res.best || res.prevBest == null) return true;
  if (res.levelChange && res.levelChange.to > res.levelChange.from) return true;
  const xp = res.xp;
  if (!xp) return false;
  if (xpLevel(xp.game.after).level > xpLevel(xp.game.before).level) return true;
  if (xpLevel(xp.player.after).level > xpLevel(xp.player.before).level) return true;
  return xp.gains.some((g) => g.why === 'gameToday' || g.why === 'daily');
}
