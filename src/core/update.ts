import { registerSW } from 'virtual:pwa-register';
import { L } from './i18n';
import { btn, h } from './ui';

const CHECK_EVERY_MS = 30 * 60 * 1000;

let banner: HTMLElement | null = null;

function showBanner(apply: () => void) {
  if (banner) return;
  banner = h(
    'div',
    { class: 'update-banner', role: 'status' },
    h(
      'span',
      null,
      h('strong', null, L('New version available', 'Nouvelle version disponible')),
      ' — ',
      L('reload to get it.', 'rechargez pour l’obtenir.'),
    ),
    h(
      'div',
      { class: 'row' },
      btn(
        L('Later', 'Plus tard'),
        () => {
          banner?.remove();
          banner = null;
        },
        'ghost',
      ),
      btn(L('Reload', 'Recharger'), apply, 'primary'),
    ),
  );
  document.body.append(banner);
}

function toast(text: string) {
  const el = h('div', { class: 'toast', role: 'status' }, text);
  document.body.append(el);
  setTimeout(() => el.remove(), 3500);
}

/**
 * Register the service worker (offline + installable). When a new build has been downloaded, show a
 * banner; "Reload" saves in-progress games, activates the new worker and reloads.
 */
export function setupUpdates() {
  // The Android build ships its files inside the APK and updates through app releases.
  if (!('serviceWorker' in navigator) || import.meta.env.DEV || import.meta.env.VITE_PLATFORM === 'android') return;
  const updateSW = registerSW({
    onNeedRefresh() {
      showBanner(() => {
        window.dispatchEvent(new Event('pagehide')); // flush in-progress saves
        void updateSW(true);
      });
    },
    onOfflineReady() {
      toast(L('Ready to play offline', 'Prêt à jouer hors ligne'));
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      // Check for a new version periodically and whenever the app comes back to the foreground.
      const check = () => {
        if (navigator.onLine) void reg.update().catch(() => {});
      };
      setInterval(check, CHECK_EVERY_MS);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) check();
      });
    },
  });
}
