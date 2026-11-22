// oxlint-disable-next-line import/no-unassigned-import -- must run before any module reads localStorage
import './core/migrate-storage';
import { telemetry } from './core/analytics';
import { L, localeTag } from './core/i18n';
import '@fontsource-variable/space-grotesk';
import './styles.css';
import { Feed } from './core/feed';
import { dayStreak, getProfile, onChange } from './core/store';
import { LEVELS, type Difficulty } from './core/types';
import { cogIcon, h, s } from './core/ui';
import { LabView } from './pages/lab';
import { renderDaily } from './pages/daily';
import { dailyDate, getDaily } from './core/daily';
import { renderLabs } from './pages/labs';
import { renderSettings } from './pages/settings';
import { renderStats } from './pages/stats';
import { resolveCode } from './core/share';
import { PUZZLES } from './puzzles';
import { setupUpdates } from './core/update';
import { closeSheet } from './core/sheet';
import { navigate, onNavigate, upgradeHashRoute } from './core/nav';
import { isReload, sessionGet, sessionSet } from './core/session';

const app = document.getElementById('app')!;
telemetry.track('app.open', {
  'app.installed': matchMedia('(display-mode: standalone)').matches,
  'player.age_days': Math.floor((Date.now() - getProfile().created) / 86_400_000),
  'player.games_played': Object.values(getProfile().stats).reduce((n, st) => n + st.played, 0),
});
// For scripts/shots.mjs & scripts/audit.mjs
(window as unknown as { __puzzles: string[] }).__puzzles = PUZZLES.map((p) => p.id);

// Simple geometric tab icons (24×24, stroked with currentColor).
const icon = (...paths: string[]) =>
  s('svg', { viewBox: '0 0 24 24', class: 'tab-icon', 'aria-hidden': 'true' }, ...paths.map((d) => s('path', { d })));
const ICONS = {
  feed: () => icon('M5 4h14v7H5z', 'M5 15h14v5H5z'),
  daily: () => icon('M4 6h16v14H4z', 'M4 10h16', 'M8 3v5', 'M16 3v5', 'M9 15l2 2 4-4'),
  labs: () => icon('M9 3h6', 'M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3', 'M7.5 15h9'),
  stats: () => icon('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21c1-4 4-6 8-6s7 2 8 6'),
  settings: () => cogIcon('tab-icon'),
};
const tab = (key: keyof typeof ICONS, href: string, label: string) =>
  h('a', { href, class: 'tab', 'data-tab': key }, ICONS[key](), h('span', null, label));
const tabs = {
  feed: tab('feed', '/', L('Feed', 'Fil')),
  daily: tab('daily', '/daily', L('Daily', 'Défis')),
  labs: tab('labs', '/games', L('Games', 'Jeux')),
  stats: tab('stats', '/stats', L('Profile', 'Profil')),
  settings: tab('settings', '/settings', L('Settings', 'Réglages')),
};

document.documentElement.lang = localeTag();
const streak = h('span', { class: 'streak', title: L('Day streak', 'Jours consécutifs') });
const practice = h('a', { class: 'practice', href: '/', title: L('Back to the mixed feed', 'Retour au fil mélangé'), hidden: true });
const header = h(
  'header',
  { class: 'top' },
  h('a', { class: 'brand', href: '/' }, h('span', { class: 'logo' }, h('i'), h('i'), h('i'), h('i')), 'puzzle feed'),
  h('div', { class: 'top-extra' }, streak, practice),
  h('nav', { class: 'tabs', 'aria-label': L('Main', 'Principal') }, ...Object.values(tabs)),
);
const feed = new Feed(PUZZLES);
const lab = new LabView();
const page = h('div', { class: 'page-wrap' });
app.append(header, feed.el, lab.el, page);

function applyTheme() {
  const t = getProfile().theme;
  if (t === 'system') delete document.documentElement.dataset['theme'];
  else document.documentElement.dataset['theme'] = t;
  if (getProfile().symbols) document.documentElement.dataset['symbols'] = '';
  else delete document.documentElement.dataset['symbols'];
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#17161a' : '#fff6e5');
}
function updateStreak() {
  const n = dayStreak();
  streak.textContent = n > 1 ? L(`${n} day streak`, `${n} jours de suite`) : '';
}

type View = 'feed' | 'daily' | 'labs' | 'lab' | 'stats' | 'settings';
let labOpen: string | null = null;

const safeDecode = (str: string) => {
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
};

function route() {
  const [r = 'feed', arg, sub, lvl] = location.pathname.split('/').filter(Boolean);
  // /s/<code>: a shared puzzle (game, level, seed). A bad code lands on the Games tab with the error.
  let codeError: { input: string; error: string } | undefined;
  const input = r === 's' ? safeDecode(arg ?? '') : '';
  const shared = r === 's' ? resolveCode(input, PUZZLES) : undefined;
  if (shared && 'error' in shared) {
    codeError = { input, error: shared.error };
    history.replaceState(null, '', '/games');
  }
  const sharedOk = shared && 'def' in shared ? shared : undefined;
  const def = sharedOk?.def ?? PUZZLES.find((p) => p.id === arg);
  // /games (alias /labs) lists games; /game/<id> (alias /lab/<id>) opens one.
  let view: View = r === 'stats' || r === 'settings' || r === 'daily' ? r : r === 'labs' || r === 'games' || codeError ? 'labs' : 'feed';
  if (((r === 'lab' || r === 'game') && def) || sharedOk) view = 'lab';
  // Leaving the lab drops a shared puzzle's word list before the feed deals any cards.
  if (view !== 'lab') lab.setShown(false);

  // /daily/<level> shows that level's list; /daily/<level>/<n> plays its n-th puzzle.
  const dailyLevel = r === 'daily' && LEVELS.includes(Number(arg) as Difficulty) ? (Number(arg) as Difficulty) : undefined;
  const daily = dailyLevel && sub ? openDaily(dailyLevel, Number(sub) - 1) : false;
  if (daily) view = 'lab';

  // Feed (optionally a single-puzzle "endless" feed)
  const only = r === 'play' && def ? def.id : null;
  if (view === 'feed') feed.setOnly(only);
  practice.hidden = !(view === 'feed' && only);
  if (only && def) practice.replaceChildren(h('span', { class: 'swatchlet', 'data-puzzle': def.id }), `${def.name} ✕`);

  // Lab: /game/<id> resumes (or starts) · /game/<id>/new/<level> starts fresh
  if (daily) {
    // opened by openDaily()
  } else if (sharedOk) {
    const key = `s:${sharedOk.code.id}-${sharedOk.code.level}-${sharedOk.code.seed}`;
    if (labOpen !== key) {
      lab.open(sharedOk.def, undefined, sharedOk.code);
      labOpen = key;
    }
  } else if (view === 'lab' && def) {
    const level = sub === 'new' && LEVELS.includes(Number(lvl) as Difficulty) ? (Number(lvl) as Difficulty) : undefined;
    if (level || labOpen !== def.id) {
      lab.open(def, level);
      labOpen = def.id;
    }
    if (level) history.replaceState(null, '', `/game/${def.id}`); // reload/back resumes instead of re-rolling
  } else if (labOpen && view !== 'lab') {
    lab.setShown(false);
  }

  const activeTab = daily ? 'daily' : view === 'lab' ? 'labs' : view;
  for (const [k, a] of Object.entries(tabs)) a.classList.toggle('on', k === activeTab && !(k === 'feed' && only));

  feed.el.hidden = view !== 'feed';
  lab.el.hidden = view !== 'lab';
  page.hidden = view === 'feed' || view === 'lab';
  feed.setShown(view === 'feed');
  lab.setShown(view === 'lab');
  if (view === 'daily') renderDaily(page, PUZZLES, dailyLevel);
  if (view === 'labs') renderLabs(page, PUZZLES, codeError);
  if (view === 'stats') renderStats(page, PUZZLES);
  if (view === 'settings') renderSettings(page, PUZZLES);
  if (!page.hidden) page.scrollTop = 0;
  updateStreak();
  sessionSet('route', location.pathname);
}

/** Open puzzle `index` of today's `level` list in the lab view. False when there's no such puzzle. */
function openDaily(level: Difficulty, index: number): boolean {
  const date = dailyDate();
  const list = getDaily(date, level, PUZZLES);
  const entry = list[index];
  const def = entry && PUZZLES.find((p) => p.id === entry.id);
  if (!def) {
    history.replaceState(null, '', `/daily/${level}`);
    return false;
  }
  const key = `d:${date}:${level}:${index}`;
  if (labOpen !== key) {
    lab.openDaily(def, entry, { date, level, index }, list.length, () => {
      // Next: the following unsolved puzzle of the list (wrapping around), or back to the list.
      const n = list.length;
      const next = Array.from({ length: n - 1 }, (_, k) => (index + 1 + k) % n).find(
        (i) => list[i].o !== 'solved' && PUZZLES.some((p) => p.id === list[i].id),
      );
      navigate(next == null ? `/daily/${level}` : `/daily/${level}/${next + 1}`);
    });
    labOpen = key;
  }
  return true;
}

onChange((kind) => {
  if (kind === 'profile') applyTheme();
  updateStreak();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
onNavigate(route);
// Android app: the system back button asks here first (MainActivity.java). An open sheet closes;
// otherwise the WebView goes back through the visited pages, and leaves the app from the first one.
(window as unknown as { __onBack: () => boolean }).__onBack = closeSheet;
applyTheme();
upgradeHashRoute();
// A reload that dropped the route (e.g. the app reloading its start page) goes back to it.
// Sessions from before path routing stored "#/…"; upgradeHashRoute() turns those into paths too.
const storedRoute = isReload && location.pathname === '/' ? sessionGet('route') : undefined;
const lastRoute = typeof storedRoute === 'string' ? storedRoute : undefined;
if (lastRoute && lastRoute !== '/') {
  history.replaceState(null, '', lastRoute);
  upgradeHashRoute();
}
route();
setupUpdates();
