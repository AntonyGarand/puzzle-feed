import { confirmSheet, openSheet, sheetOpen } from '../core/sheet';
import { L, locale, setLocale, setWordLocale, wordLocale, type Locale } from '../core/i18n';
import { Card, isUndoKey, type DailyRef } from '../core/card';
import { dailySaveKey, getSave, type Save } from '../core/saves';
import type { DailyEntry } from '../core/store';
import { setPath } from '../core/nav';
import { prefs } from '../core/store';
import type { ShareCode } from '../core/share';
import type { Difficulty, PuzzleDef } from '../core/types';
import { btn, h } from '../core/ui';

/** A single puzzle opened from Labs: resume or new, outside the feed. */
export class LabView {
  readonly el = h('div', { class: 'lab' });
  private card: Card | null = null;
  private shown = false;
  /** Word list of the open puzzle when it isn't the interface language's (a shared word puzzle). */
  private words: Locale | null = null;
  /** Explain the language mismatch once the lab is on screen. */
  private notice: Locale | null = null;

  constructor() {
    window.setInterval(() => this.card?.tick(), 250);
    document.addEventListener('keydown', (e) => {
      if (!this.shown || !this.card || sheetOpen()) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if ((e.ctrlKey || e.metaKey || e.altKey) && !isUndoKey(e)) return;
      if (this.card.onKey(e)) e.preventDefault();
    });
    document.addEventListener('visibilitychange', () => this.card?.setActive(this.shown && !document.hidden));
    window.addEventListener('pagehide', () => this.card?.persist());
  }

  /**
   * Open puzzle `def`: resume its save unless `level` asks for a new one. With `shared`, play that exact
   * puzzle in its own save slot (resuming it if it was already started), leaving your own game alone.
   */
  open(def: PuzzleDef, level?: Difficulty, shared?: ShareCode) {
    this.close();
    this.useWords(def, shared);
    const sharedSave = shared && getSave(def.id, 'shared');
    const saved = shared
      ? sharedSave && sharedSave.seed === shared.seed && sharedSave.level === shared.level
        ? sharedSave
        : undefined
      : level
        ? undefined
        : getSave(def.id);
    const save = saved && (!def.localized || (saved.locale ?? 'en') === wordLocale()) ? saved : undefined;
    // Explicit args (no defaults): "New puzzle" passes `undefined` to mean a fresh game, which a default
    // parameter would silently turn back into the old save.
    const start = (lvl: Difficulty | undefined, resume: Save | undefined, code: ShareCode | undefined) => {
      this.card?.setActive(false);
      this.card?.destroy();
      this.useWords(def, code); // "New puzzle" after a shared one goes back to your own language
      const note = h('span', { class: 'small muted' });
      const card = new Card(def, (c) => start(c.level, undefined, undefined), {
        lab: true,
        level: code?.level ?? lvl ?? prefs(def.id).level,
        resume,
        seed: code?.seed,
        shared: !!code,
        onMount: (c) => {
          // Right after mount, `interacted` is only set when a save was resumed.
          note.textContent = c.shared
            ? L('Shared puzzle', 'Partie partagée')
            : c.interacted
              ? L('Resumed', 'Reprise')
              : L('New puzzle', 'Nouvelle partie');
          // Keep the address bar on what's being played, so a reload brings back the same puzzle.
          setPath(c.shared ? `/s/${c.code}` : `/game/${def.id}`);
        },
      });
      this.card = card;
      this.el.replaceChildren(
        h(
          'div',
          { class: 'lab-bar' },
          h('a', { class: 'btn ghost', href: '/games' }, L('← Games', '← Jeux')),
          note,
          btn(L('New game', 'Nouvelle partie'), () => void newGame(card), 'ghost'),
          btn(L('Share', 'Partager'), () => card.openShare(), 'ghost'),
        ),
        card.el,
      );
      card.mount();
      card.setActive(this.shown && !document.hidden);
    };
    const newGame = async (card: Card) => {
      if (card.interacted && !card.done) {
        card.setActive(false);
        const ok = await confirmSheet({
          title: L('Start a new game?', 'Commencer une nouvelle partie?'),
          message: L('Your current game will be lost.', 'La partie en cours sera perdue.'),
          action: L('New game', 'Nouvelle partie'),
        });
        if (this.card !== card) return;
        if (!ok) return card.setActive(this.shown && !document.hidden);
      }
      start(card.level, undefined, undefined);
    };
    start(level, save, shared);
    this.notice = this.words;
    if (this.shown) this.showNotice();
  }

  /**
   * Play puzzle `ref.index` of a daily list of `count` puzzles (resuming it if it was started).
   * `next` runs on "Next".
   */
  openDaily(def: PuzzleDef, entry: DailyEntry, ref: DailyRef, count: number, next: () => void) {
    this.close();
    const saved = getSave(dailySaveKey(ref.date, ref.level, ref.index), 'daily');
    const resume =
      saved && saved.seed === entry.seed && saved.level === ref.level && (!def.localized || (saved.locale ?? 'en') === locale())
        ? saved
        : undefined;
    const note = h('span', { class: 'small muted' });
    const card = new Card(def, next, {
      lab: true,
      level: ref.level,
      seed: entry.seed,
      resume,
      daily: ref,
      onMount: (c) => {
        note.textContent = `${L('Daily', 'Défi du jour')} · ${ref.index + 1}/${count}`;
        if (c.interacted) note.textContent += ` · ${L('Resumed', 'Reprise')}`;
      },
    });
    this.card = card;
    this.el.replaceChildren(
      h(
        'div',
        { class: 'lab-bar' },
        h('a', { class: 'btn ghost', href: `/daily/${ref.level}` }, L('← Daily', '← Défis')),
        note,
        btn(L('Share', 'Partager'), () => card.openShare(), 'ghost'),
      ),
      card.el,
    );
    card.mount();
    card.setActive(this.shown && !document.hidden);
  }
  setShown(shown: boolean) {
    this.shown = shown;
    // The feed and the rest of the app always use the interface language's words.
    setWordLocale(shown ? this.words : null);
    this.card?.setActive(shown && !document.hidden);
    if (shown) this.showNotice();
  }

  close() {
    this.card?.setActive(false);
    this.card?.destroy();
    this.card = null;
    this.useWords();
  }

  /** A shared word puzzle keeps the word list it was made with, whatever the interface language. */
  private useWords(def?: PuzzleDef, code?: ShareCode) {
    const l = def?.localized && code ? (code.locale ?? 'en') : null;
    this.words = l && l !== locale() ? l : null;
    setWordLocale(this.words);
  }

  /** "This puzzle is in French": play it as is, or switch the whole interface to its language. */
  private showNotice() {
    const l = this.notice;
    const card = this.card;
    if (!l || !card) return;
    this.notice = null;
    const name = l === 'fr' ? L('French', 'français') : L('English', 'anglais');
    const own = locale() === 'fr' ? L('French', 'français') : L('English', 'anglais');
    card.setActive(false);
    const close = openSheet({
      title: L(`This puzzle is in ${name}`, `Cette partie est en ${name}`),
      puzzle: card.def.id,
      className: 'language-sheet',
      body: [
        h(
          'p',
          null,
          L(
            `You can play it right here, but the words to find are in ${name}.`,
            `Vous pouvez y jouer tel quel, mais les mots à trouver sont en ${name}.`,
          ),
        ),
        h(
          'p',
          { class: 'muted small' },
          L(
            `Prefer the whole interface in ${name}? You can switch back anytime in Settings.`,
            `Vous préférez toute l’interface en ${name}? Vous pourrez revenir en arrière en tout temps dans les Réglages.`,
          ),
        ),
      ],
      footer: [
        btn(L(`Keep ${own}`, `Garder le ${own}`), () => close(), 'ghost'),
        btn(L(`Switch to ${name}`, `Passer en ${name}`), () => setLocale(l), 'primary'),
      ],
      onClose: () => this.card === card && card.setActive(this.shown && !document.hidden),
    });
  }
}
