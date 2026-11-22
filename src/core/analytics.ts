// Anonymous gameplay events -> https://t.garand.dev -> SigNoz (dashboard "Puzzle Feed").
// Only random ids and game metrics: never the profile name.
// Players can turn this off in Settings. The same key also stops the Plausible pageviews in index.html.
import { locale } from './i18n';
import { createTelemetry } from './telemetry';

const OFF_KEY = 'puzzle-feed:analytics-off';

export function analyticsEnabled(): boolean {
  try {
    return localStorage.getItem(OFF_KEY) !== '1';
  } catch {
    return true;
  }
}

export function setAnalyticsEnabled(on: boolean) {
  try {
    if (on) localStorage.removeItem(OFF_KEY);
    else localStorage.setItem(OFF_KEY, '1');
  } catch {
    /* storage unavailable: nothing to remember */
  }
}

const client = createTelemetry({
  service: 'puzzle-feed',
  version: __APP_VERSION__,
  // Only the real site (the Android build serves itself as puzzle.garand.dev): no events from
  // `vite dev`, previews or forks.
  enabled: import.meta.env.PROD && location.hostname === 'puzzle.garand.dev',
  common: { 'app.lang': locale(), 'app.platform': import.meta.env.VITE_PLATFORM || 'web' },
});

export const telemetry = {
  track: (event: string, attrs?: Parameters<typeof client.track>[1]) => {
    if (analyticsEnabled()) client.track(event, attrs);
  },
};
