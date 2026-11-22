import { sheetOpen } from './sheet';
import { L } from './i18n';
import { Card } from './card';
import { onChange, prefs } from './store';
import type { PuzzleDef } from './types';
import { h } from './ui';

const WEIGHTS = [0, 1, 2.5, 5];
const AHEAD = 3;

export class Feed {
  readonly el: HTMLElement;
  private cards: Card[] = [];
  private active: Card | null = null;
  private recentTypes: string[] = [];
  private activeObs: IntersectionObserver;
  private mountObs: IntersectionObserver;
  private empty: HTMLElement;
  private ratios = new Map<Card, number>();
  /** When set, the feed only deals this puzzle type (practice mode). */
  private only: string | null = null;

  constructor(private readonly defs: PuzzleDef[]) {
    this.el = h('main', { class: 'feed' });
    this.empty = h(
      'div',
      { class: 'empty' },
      h('p', null, L('All puzzles are turned off.', 'Tous les jeux sont désactivés.')),
      h('a', { class: 'btn', href: '#/settings' }, L('Pick some puzzles', 'Choisir des jeux')),
    );

    const ratios = this.ratios;
    this.activeObs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) ratios.set(cardOf(e.target), e.intersectionRatio);
        let best: Card | null = null;
        let bestR = 0.55;
        for (const [c, r] of ratios)
          if (r > bestR) {
            best = c;
            bestR = r;
          }
        if (best && best !== this.active) this.setActive(best);
      },
      { root: this.el, threshold: [0, 0.25, 0.55, 0.75, 1] },
    );
    this.mountObs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const c = cardOf(e.target);
          if (!c.mounted) c.mount();
          this.mountObs.unobserve(e.target);
        }
      },
      { root: this.el, rootMargin: '0px 0px 150% 0px' },
    );

    onChange((kind, id) => {
      if (kind === 'level') this.regenPending((c) => !id || c.def.id === id, true);
      if (kind === 'weight' || kind === 'profile') this.prunePending();
      for (const c of this.cards) c.refreshLevelLabel();
    });

    window.setInterval(() => this.active?.tick(), 250);
    document.addEventListener('visibilitychange', () => {
      this.active?.setActive(!document.hidden && this.visible());
    });
    document.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('pagehide', () => this.active?.persist());

    this.fill();
  }

  private visible() {
    return this.el.isConnected && this.el.offsetParent !== null;
  }

  /** Pause/resume when the feed view is hidden by the router. */
  setShown(shown: boolean) {
    this.active?.setActive(shown && !document.hidden);
    if (shown) {
      this.prunePending();
      this.fill();
    }
  }

  /** Switch between the mixed feed and a single-puzzle feed; rebuilds the cards if it changed. */
  setOnly(id: string | null) {
    if (id === this.only) return;
    this.only = id;
    for (const c of this.cards) {
      this.detach(c);
      c.el.remove();
    }
    this.cards = [];
    this.active = null;
    this.recentTypes = [];
    this.el.scrollTop = 0;
    this.fill();
  }

  private enabled(d: PuzzleDef) {
    return this.only ? d.id === this.only : prefs(d.id).weight > 0;
  }

  private pick(): PuzzleDef | null {
    const pool = this.defs.filter((d) => this.enabled(d)).map((d) => ({ d, w: this.only ? 1 : WEIGHTS[prefs(d.id).weight] }));
    if (!pool.length) return null;
    // Avoid immediate repeats (and soften repeats from the last few cards) when there is variety.
    for (const x of pool) {
      const idx = this.recentTypes.lastIndexOf(x.d.id);
      if (idx === -1 || pool.length === 1) continue;
      const age = this.recentTypes.length - idx; // 1 = previous card
      x.w *= age === 1 ? 0 : age === 2 ? 0.3 : age === 3 ? 0.6 : 1;
    }
    const total = pool.reduce((a, x) => a + x.w, 0);
    if (total <= 0) return pool[Math.floor(Math.random() * pool.length)].d;
    let r = Math.random() * total;
    for (const x of pool) if ((r -= x.w) <= 0) return x.d;
    return pool[pool.length - 1].d;
  }

  private append(): boolean {
    const def = this.pick();
    if (!def) return false;
    this.recentTypes.push(def.id);
    if (this.recentTypes.length > 6) this.recentTypes.shift();
    const card = new Card(def, (c) => this.next(c));
    this.cards.push(card);
    this.el.append(card.el);
    this.activeObs.observe(card.el);
    this.mountObs.observe(card.el);
    return true;
  }

  private fill() {
    const idx = this.active ? this.cards.indexOf(this.active) : -1;
    while (this.cards.length - 1 - idx < AHEAD) if (!this.append()) break;
    if (!this.cards.length) this.el.replaceChildren(this.empty);
    else this.empty.remove();
    if (!this.active && this.cards.length) {
      this.cards[0].mount();
      this.setActive(this.cards[0]);
    }
  }

  private setActive(card: Card) {
    this.active?.setActive(false);
    this.active?.left();
    this.active = card;
    card.setActive(!document.hidden && this.visible());
    this.fill();
  }

  next(card: Card) {
    const i = this.cards.indexOf(card);
    if (i === -1) return;
    if (i + 1 >= this.cards.length) this.fill();
    this.cards[i + 1]?.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Cards ahead of the current one that haven't been touched. */
  private pending(): Card[] {
    const idx = this.active ? this.cards.indexOf(this.active) : -1;
    return this.cards.slice(idx + 1).filter((c) => c.pristine);
  }

  private regenPending(match: (c: Card) => boolean, includeActive = false) {
    const list = this.pending();
    if (includeActive && this.active?.pristine) list.unshift(this.active);
    for (const c of list) if (c.mounted && match(c) && c.level !== prefs(c.def.id).level) c.mount();
  }

  private detach(c: Card) {
    c.destroy();
    this.activeObs.unobserve(c.el);
    this.mountObs.unobserve(c.el);
    this.ratios.delete(c);
  }

  /** Drop upcoming cards whose puzzle type has been turned off. */
  private prunePending() {
    for (const c of this.pending()) {
      if (!this.enabled(c.def)) {
        this.detach(c);
        c.el.remove();
        this.cards.splice(this.cards.indexOf(c), 1);
      }
    }
    if (this.active && this.active.pristine && !this.enabled(this.active.def) && this.cards.length > 1) {
      // current card's type was turned off: replace it in place
      const i = this.cards.indexOf(this.active);
      const old = this.active;
      this.active = null;
      const def = this.pick();
      if (def) {
        const card = new Card(def, (c) => this.next(c));
        this.detach(old);
        old.el.replaceWith(card.el);
        this.cards[i] = card;
        this.activeObs.observe(card.el);
        card.mount();
        this.setActive(card);
      } else this.active = old;
    }
    this.fill();
  }

  private onKey(e: KeyboardEvent) {
    if (!this.active || !this.visible() || sheetOpen()) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.active.onKey(e)) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter' && this.active.done) {
      e.preventDefault();
      this.next(this.active);
    }
  }
}

const cardOf = (el: Element) => (el as Element & { card: Card }).card;
