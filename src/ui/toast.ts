import { h } from './dom';

const SHOW_MS = 3500;
let stack: HTMLElement | null = null;

/**
 * A short notice that slides in at the top of the screen and goes away on its own (or on a tap).
 * Several stack up. The region is a polite live region, so screen readers announce each one.
 */
export function toast(title: string, detail?: string, opts: { icon?: string; href?: string } = {}) {
  if (!stack?.isConnected) {
    stack = h('div', { class: 'notices', role: 'status', 'aria-live': 'polite' });
    document.body.append(stack);
  }
  const el = h(
    opts.href ? 'a' : 'div',
    { class: 'notice', ...(opts.href ? { href: opts.href } : {}) },
    opts.icon ? h('span', { class: 'notice-icon', 'aria-hidden': 'true' }, opts.icon) : null,
    h('span', { class: 'notice-text' }, h('strong', null, title), detail ? h('span', null, detail) : null),
  );
  let gone = false;
  const close = () => {
    if (gone) return;
    gone = true;
    el.classList.add('out');
    const drop = () => el.remove();
    el.addEventListener('animationend', drop, { once: true });
    setTimeout(drop, 400); // reduced motion: no animation to wait for
  };
  el.addEventListener('click', close);
  stack.append(el);
  setTimeout(close, SHOW_MS);
}
