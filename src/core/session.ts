// Per-tab memory of where the player was, so a reload (pull-to-refresh, language switch, app
// update) lands back on the same page and the same feed card instead of starting over.
// sessionStorage lives as long as the tab: opening the app fresh still starts at the feed.

/** True when this page load is a reload of the same tab (not a fresh visit). */
export const isReload = (() => {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return nav?.type === 'reload';
  } catch {
    return false;
  }
})();

export function sessionGet<T>(key: string): T | undefined {
  try {
    const v = sessionStorage.getItem(`puzzle-feed:${key}`);
    return v == null ? undefined : (JSON.parse(v) as T);
  } catch {
    return undefined;
  }
}

export function sessionSet(key: string, value: unknown) {
  try {
    sessionStorage.setItem(`puzzle-feed:${key}`, JSON.stringify(value));
  } catch {
    /* storage unavailable: a reload just starts over */
  }
}
