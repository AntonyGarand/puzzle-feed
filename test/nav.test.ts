// @vitest-environment happy-dom
// Path routing: in-app links and navigate() change the URL without a reload and notify the router once;
// old hash links (#/game/…) are upgraded to paths.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { navigate, onNavigate, setPath, upgradeHashRoute } from '../src/app/nav';

const routed = vi.fn<() => void>();
onNavigate(routed);

beforeEach(() => {
  history.replaceState(null, '', '/');
  routed.mockClear();
  document.body.replaceChildren();
});

/** Click an <a> in the page the way a user would. */
function click(href: string, init: MouseEventInit = {}, attrs: Record<string, string> = {}) {
  const a = document.createElement('a');
  a.setAttribute('href', href);
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  a.append(document.createElement('span'));
  document.body.append(a);
  const e = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
  a.firstElementChild!.dispatchEvent(e);
  return e;
}

describe('navigate', () => {
  it('pushes a new path and routes once', () => {
    const before = history.length;
    navigate('/game/sudoku');
    expect(location.pathname).toBe('/game/sudoku');
    expect(history.length).toBe(before + 1);
    expect(routed).toHaveBeenCalledTimes(1);
  });

  it('replaces the current entry when asked', () => {
    const before = history.length;
    navigate('/games', true);
    expect(location.pathname).toBe('/games');
    expect(history.length).toBe(before);
    expect(routed).toHaveBeenCalledTimes(1);
  });

  it('re-routes on the same path without adding history, but stays quiet on a same-path replace', () => {
    navigate('/stats');
    const before = history.length;
    navigate('/stats');
    expect(history.length).toBe(before);
    expect(routed).toHaveBeenCalledTimes(2);
    navigate('/stats', true);
    expect(routed).toHaveBeenCalledTimes(2);
  });
});

describe('setPath', () => {
  it('updates the address bar without routing', () => {
    setPath('/game/mines');
    expect(location.pathname).toBe('/game/mines');
    expect(routed).not.toHaveBeenCalled();
  });
});

describe('link clicks', () => {
  it('route same-origin paths in place', () => {
    const e = click('/daily');
    expect(e.defaultPrevented).toBe(true);
    expect(location.pathname).toBe('/daily');
    expect(routed).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['an external link', 'https://example.com/', {}, {}],
    ['a protocol-relative link', '//example.com/x', {}, {}],
    ['a link opening a new tab', '/games', {}, { target: '_blank' }],
    ['a download', '/og.png', {}, { download: '' }],
    ['a ctrl-click', '/games', { ctrlKey: true }, {}],
    ['a middle click', '/games', { button: 1 }, {}],
  ])('leave %s to the browser', (_what, href, init, attrs) => {
    const e = click(href, init, attrs);
    expect(e.defaultPrevented).toBe(false);
    expect(routed).not.toHaveBeenCalled();
  });
});

describe('hash links from before path routing', () => {
  it('become paths', () => {
    history.replaceState(null, '', '/#/game/sudoku');
    upgradeHashRoute();
    expect(location.pathname).toBe('/game/sudoku');
    expect(location.hash).toBe('');
  });

  it('leave ordinary anchors alone', () => {
    history.replaceState(null, '', '/settings#about');
    upgradeHashRoute();
    expect(location.pathname).toBe('/settings');
    expect(location.hash).toBe('#about');
  });
});

describe('back and forward', () => {
  it('route on popstate', () => {
    dispatchEvent(new PopStateEvent('popstate'));
    expect(routed).toHaveBeenCalledTimes(1);
  });
});
