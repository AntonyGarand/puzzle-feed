import { execSync } from 'node:child_process';
import { copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/** Short commit + build date, shown in Settings so you can tell which version is running. */
function buildVersion() {
  let sha = 'dev';
  try {
    sha = execSync('git rev-parse --short=10 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    /* not a git checkout */
  }
  return `${sha} · ${new Date().toISOString().slice(0, 10)}`;
}

/** Top-level routes served as real files, so a fresh visit gets a 200 instead of the 404 fallback. */
const SHELL_ROUTES = ['games', 'daily', 'stats', 'settings'];

/**
 * GitHub Pages has no rewrites: copy the app shell to 404.html (served for any unknown path, e.g.
 * /game/sudoku or /s/<code>) and to <route>.html (Pages serves /games from games.html).
 */
function pagesFallback(): Plugin {
  let outDir = 'dist';
  return {
    name: 'pages-spa-fallback',
    apply: 'build',
    configResolved: (c) => void (outDir = c.build.outDir),
    closeBundle() {
      const index = join(outDir, 'index.html');
      for (const name of ['404', ...SHELL_ROUTES]) copyFileSync(index, join(outDir, `${name}.html`));
    },
  };
}

export default defineConfig(({ mode }) => {
  // `npm run build:android` (mode "android", see .env.android) bundles dist/ into the F-Droid APK:
  // no source maps or service worker there.
  const android = mode === 'android';
  return {
    // Fixed port so scripts/audit.mjs and scripts/shots.mjs find the dev server.
    server: { port: 5180, strictPort: true },
    preview: { port: 5181 },
    build: { target: 'es2022', sourcemap: !android },
    define: { __APP_VERSION__: JSON.stringify(buildVersion()) },
    plugins: [
      pagesFallback(),
      // Installable app that works fully offline: every built file (JS, CSS, fonts, both dictionaries,
      // icons) is precached by a Workbox service worker. A new version downloads in the background and
      // src/core/update.ts shows a "new version" banner; reloading activates it.
      VitePWA({
        // Still resolves virtual:pwa-register, but emits no service worker or manifest.
        disable: android,
        registerType: 'prompt',
        injectRegister: false,
        manifest: {
          id: '/',
          name: 'Puzzle Feed',
          short_name: 'puzzles',
          description: 'An endless feed of procedurally generated puzzles. Works offline.',
          lang: 'en',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#fff6e5',
          theme_color: '#fff6e5',
          categories: ['games', 'education', 'entertainment'],
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
          // Copies of index.html for GitHub Pages (pagesFallback); navigateFallback covers them.
          globIgnores: ['404.html', ...SHELL_ROUTES.map((r) => `${r}.html`)],
          // The dictionaries are lazy chunks of a few hundred KB; precache them too so word games work offline.
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          // Path routing (src/core/nav.ts): every navigation is the app shell.
          navigateFallback: '/index.html',
          cleanupOutdatedCaches: true,
        },
        devOptions: { enabled: false },
      }),
    ],
  };
});
