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

/** Where `npm run deploy` publishes the Android game bundle (see .github/workflows/deploy.yml). */
const ANDROID_MANIFEST = 'https://puzzle.garand.dev/android/version.json';

interface BundleManifest {
  /** Commit of the build, same as the start of __APP_VERSION__. */
  sha: string;
  url: string;
  /** sha256 of the zip, checked by the updater before it unpacks it. */
  checksum: string;
}

/**
 * Android (Capacitor) build: the game files ship inside the APK, and newer builds of the site are
 * downloaded in the background like the website's service worker does. A downloaded build switches
 * in the next time the app goes to the background, or right away from the banner.
 */
async function setupAndroidUpdates() {
  const [{ CapacitorUpdater }, { CapacitorHttp }] = await Promise.all([import('@capgo/capacitor-updater'), import('@capacitor/core')]);
  // Confirms this bundle started fine; without it the updater rolls back to the previous one.
  await CapacitorUpdater.notifyAppReady();
  const running = __APP_VERSION__.split(' ')[0];

  let busy = false;
  const check = async () => {
    if (busy || !navigator.onLine) return;
    busy = true;
    try {
      // Native request: in the app, fetch() to puzzle.garand.dev is served from the bundled files.
      const res = await CapacitorHttp.get({ url: `${ANDROID_MANIFEST}?t=${Date.now()}`, responseType: 'json' });
      const latest = (typeof res.data === 'string' ? JSON.parse(res.data) : res.data) as BundleManifest;
      if (res.status !== 200 || !latest?.sha || latest.sha === running) return;

      const { bundles } = await CapacitorUpdater.list();
      let bundle = bundles.find((b) => b.version === latest.sha && b.status === 'success');
      bundle ??= await CapacitorUpdater.download({ url: latest.url, version: latest.sha, checksum: latest.checksum });
      // Older downloads are no longer needed.
      for (const b of bundles) if (b.id !== bundle.id && b.version !== running) void CapacitorUpdater.delete({ id: b.id }).catch(() => {});
      await CapacitorUpdater.next({ id: bundle.id });
      const id = bundle.id;
      showBanner(() => {
        window.dispatchEvent(new Event('pagehide')); // flush in-progress saves
        void CapacitorUpdater.set({ id });
      });
    } catch {
      /* offline or a bad download: try again later */
    } finally {
      busy = false;
    }
  };
  void check();
  setInterval(check, CHECK_EVERY_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void check();
  });
}

/**
 * Register the service worker (offline + installable). When a new build has been downloaded, show a
 * banner; "Reload" saves in-progress games, activates the new worker and reloads.
 */
export function setupUpdates() {
  if (import.meta.env.DEV) return;
  if (import.meta.env.VITE_PLATFORM === 'android') {
    void setupAndroidUpdates().catch(() => {});
    return;
  }
  if (!('serviceWorker' in navigator)) return;
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
