// Contrast and accessibility audit of every game, in light and dark. Usage: node scripts/a11y.mjs [baseUrl]
// Env: IDS=a,b (default all), THEMES=light,dark, LEVELS=3, JSON=out.json. Exits 1 if anything fails.
// Checks, on the rendered page (WCAG 2.2 AA):
//   text      4.5:1 (3:1 at 18.66px bold / 24px) against the backdrop it is painted on
//   non-text  3:1 for SVG strokes/fills that carry meaning, and for control boundaries (border or fill vs backdrop)
//   name      every button / [role=button] / input has an accessible name
//   target    tap targets at least 24 × 24 px
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5180/';
const themes = (process.env.THEMES ?? 'light,dark').split(',');
const levels = (process.env.LEVELS ?? '3').split(',');
let ids = (process.env.IDS ?? '').split(',').filter(Boolean);

/** Known exceptions, checked by eye: [kind, selector regex, why]. */
const IGNORE = [
  ['graphic', /ar-(tip|body)/, 'Arrows: coloured arrows sit on an ink casing drawn underneath'],
  ['graphic', /wm-layer > g\.wm > (polyline\.body|circle\.eye)/, 'Worms: body has an ink edge; eyes sit on the coloured head'],
  ['graphic', /svg\.grass/, 'Lawn: grass blades are texture'],
  ['graphic', /tether-tape > polyline\.over/, 'Tether: the tape is drawn over an ink casing'],
  ['graphic', /hn-m/, 'Haunted: monster features sit on their bright body fill'],
  ['graphic', /hr-lines|pe-grid/, 'faint guide grid behind the content, not needed to play'],
  ['graphic', /sm-icon > rect\.off/, 'Shape Mines legend: off cells are the icon background'],
  ['graphic', /span\.sg/, 'Unequal: chevrons sit in the gap on the page, not on the cell'],
  ['text', /trail-svg > g\.cp|beehive > g\.hex/, 'SVG numbers on their own filled disc / hex'],
  ['boundary', /lg-clue|hn-clue|arr-piece/, 'clue rows / outside clues / polyomino pieces: the content is the target'],
  ['target', /arr-piece/, 'Arrange: a piece is several cells; each cell is the size of the board cell'],
];

async function pickLevel(page, lv) {
  const card = page.locator('.card').first();
  await card.locator('[data-action="settings"]').click();
  await page.locator(`dialog.sheet [data-setting="level"] [data-value="${lv}"]`).click();
  await page.waitForTimeout(150);
}

/** Runs in the page: returns a list of problems inside `root`. */
function audit(rootSel) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const g = cv.getContext('2d', { willReadFrequently: true });
  /** Any CSS colour → [r, g, b, a] (0–255, a 0–1), via the canvas so color-mix / oklab resolve. */
  const rgba = (c) => {
    if (!c || c === 'none' || c === 'transparent') return [0, 0, 0, 0];
    g.clearRect(0, 0, 1, 1);
    g.fillStyle = '#000';
    g.fillStyle = c;
    g.fillRect(0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (top, bot) => {
    const a = top[3];
    return [0, 1, 2].map((i) => top[i] * a + bot[i] * (1 - a)).concat(1);
  };
  const lum = ([r, gg, b]) => {
    const f = (c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const x = lum(a);
    const y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const hex = (c) =>
    '#' +
    c
      .slice(0, 3)
      .map((v) => Math.round(v).toString(16).padStart(2, '0'))
      .join('');
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement || e.parentNode?.host) {
      const s = getComputedStyle(e);
      if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) < 0.05) return false;
    }
    return true;
  };
  /** Opaque backdrop behind an element: composite ancestor backgrounds (HTML only; SVG fills handled by caller). */
  const backdrop = (el) => {
    const layers = [];
    let img = false;
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (e instanceof SVGElement && !(e instanceof SVGSVGElement)) continue;
      if (s.backgroundImage !== 'none' && !s.backgroundImage.startsWith('url')) img = true;
      const c = rgba(s.backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] >= 1) break;
    }
    let col = rgba(getComputedStyle(document.body).backgroundColor);
    for (let i = layers.length - 1; i >= 0; i--) col = over(layers[i], col);
    return { col, img };
  };
  const path = (el) => {
    const parts = [];
    for (let e = el; e && e !== root && parts.length < 3; e = e.parentElement) {
      let p = e.tagName.toLowerCase();
      const cls = [...e.classList].filter((c) => !/^(is-|on$|sel$)/.test(c)).slice(0, 3);
      if (cls.length) p += '.' + cls.join('.');
      parts.unshift(p);
    }
    return parts.join(' > ');
  };
  const root = document.querySelector(rootSel);
  const out = [];
  const push = (kind, el, need, got, fg, bg, extra = '') =>
    out.push({ kind, sel: path(el), need, got: Number(got.toFixed(2)), fg: hex(fg), bg: hex(bg), extra });

  // ---- text ----
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || seen.has(el) || !visible(el)) continue;
    // disabled controls are exempt (WCAG 1.4.3)
    if (el.closest(':disabled, [aria-disabled="true"]')) continue;
    seen.add(el);
    const s = getComputedStyle(el);
    if (el.closest('[aria-hidden="true"]') && !el.closest('svg')) continue;
    // an outlined glyph (text-stroke / hard text-shadow) carries its own contrast; checked by eye
    if (parseFloat(s.webkitTextStrokeWidth) > 0 || s.textShadow !== 'none') continue;
    const size = parseFloat(s.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
    const need = large ? 3 : 4.5;
    let fg;
    let bg;
    if (el instanceof SVGElement) {
      fg = rgba(s.fill);
      // SVG text: backdrop is the svg's HTML backdrop (shapes underneath aren't resolved; flagged by eye).
      bg = backdrop(el.ownerSVGElement ?? el).col;
    } else {
      const b = backdrop(el);
      if (b.img) continue;
      bg = b.col;
      fg = rgba(s.color);
    }
    const op = [
      ...(function* () {
        for (let e = el; e && e !== document.body; e = e.parentElement) yield Number(getComputedStyle(e).opacity);
      })(),
    ].reduce((a, b) => a * b, 1);
    fg = over([fg[0], fg[1], fg[2], fg[3] * op], bg);
    const r = ratio(fg, bg);
    if (r < need) push('text', el, need, r, fg, bg, JSON.stringify(n.textContent.trim().slice(0, 12)));
  }

  // ---- SVG strokes / fills (non-text, 3:1) ----
  for (const el of root.querySelectorAll('svg path, svg line, svg polyline, svg circle, svg rect, svg polygon, svg ellipse')) {
    if (!visible(el) || el.closest('[aria-hidden="true"]:not(svg)')) continue;
    const s = getComputedStyle(el);
    const bg = backdrop(el.ownerSVGElement).col;
    // stroke-width is in user units: scale it to screen px (a 0.08 stroke in a 0–1 viewBox can be 3 px)
    const sw = parseFloat(s.strokeWidth) * Math.abs(el.getScreenCTM()?.a ?? 1);
    const st = rgba(s.stroke);
    const fi = rgba(s.fill);
    const op = Number(s.opacity) * (Number(s.strokeOpacity) || 1);
    const cand = [];
    if (st[3] > 0 && sw >= 1) cand.push(over([st[0], st[1], st[2], st[3] * op], bg));
    if (fi[3] > 0) cand.push(over([fi[0], fi[1], fi[2], fi[3] * Number(s.opacity) * (Number(s.fillOpacity) || 1)], bg));
    if (!cand.length) continue;
    const best = Math.max(...cand.map((c) => ratio(c, bg)));
    if (best < 3) push('graphic', el, 3, best, cand[0], bg);
  }

  // ---- controls ----
  const ctrls = root.querySelectorAll('button, [role="button"], input, select, [tabindex="0"], [data-i], .cell');
  for (const el of ctrls) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const interactive = el.matches('button, [role="button"], input, select, [tabindex="0"]');
    if (interactive) {
      const name = el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent.trim() || el.getAttribute('aria-labelledby');
      // Board cells are reported once per board (NAMES=1 lists them all).
      if (!name && (window.__a11yNames || !el.closest('.puzzle'))) push('name', el, 1, 0, [0, 0, 0], [0, 0, 0]);
      if ((r.width < 24 || r.height < 24) && !el.closest('.grid, svg'))
        push('target', el, 24, Math.min(r.width, r.height), [0, 0, 0], [0, 0, 0]);
    }
    // boundary: the control must stand out from what's around it by its border or its fill
    const parentBg = backdrop(el.parentElement).col;
    const fill = over(rgba(s.backgroundColor), parentBg);
    const bw = parseFloat(s.borderTopWidth);
    const bc = over(rgba(s.borderTopColor), fill);
    const sh = s.boxShadow !== 'none';
    const r1 = ratio(fill, parentBg);
    const r2 = bw >= 1 ? ratio(bc, parentBg) : 0;
    const plain = el.matches('.ghost, .link, .linkish, .icon, .seg > *') || el instanceof SVGElement;
    // board cells are separated by the board's grid lines, not their own edge: those are checked on screenshots
    if (Math.max(r1, r2) < 3 && !sh && el.matches('button, [role="button"]') && !el.matches('.cell') && !plain)
      push('boundary', el, 3, Math.max(r1, r2), bc, parentBg);
  }
  return out;
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const report = {};
let fails = 0;
for (const theme of themes) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: theme, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  if (!ids.length) {
    await page.goto(base);
    ids = await page.evaluate(() => window.__puzzles);
  }
  for (const id of ids)
    for (const lv of levels) {
      await page.goto(`${base}play/${id}`);
      await page.waitForSelector('.card .puzzle');
      await pickLevel(page, lv);
      await page.waitForTimeout(350);
      if (process.env.NAMES) await page.evaluate(() => (window.__a11yNames = true));
      const probs = await page.evaluate(audit, '.card');
      // collapse identical problems
      const uniq = new Map();
      for (const p of probs) {
        const k = `${p.kind}|${p.sel}|${p.fg}|${p.bg}`;
        const u = uniq.get(k);
        if (u) u.n++;
        else uniq.set(k, { ...p, n: 1 });
      }
      const list = [...uniq.values()].filter((p) => !IGNORE.some(([k, re]) => k === p.kind && re.test(p.sel)));
      report[`${theme}/${id}`] = list;
      fails += list.length;
      console.log(`${list.length ? 'FAIL' : 'ok  '} ${theme} ${id}${list.length ? '' : ''}`);
      for (const p of list) console.log(`   ${p.kind} ${p.got}<${p.need} ${p.fg} on ${p.bg} ×${p.n} ${p.sel} ${p.extra}`);
    }
  // chrome around the feed
  for (const path of ['', 'stats', 'labs', 'settings', 'daily']) {
    await page.goto(`${base}${path}`);
    await page.waitForTimeout(400);
    const probs = await page.evaluate(audit, 'body');
    const uniq = new Map();
    for (const p of probs) {
      const k = `${p.kind}|${p.sel}|${p.fg}|${p.bg}`;
      if (!uniq.has(k)) uniq.set(k, { ...p, n: 1 });
      else uniq.get(k).n++;
    }
    const list = [...uniq.values()].filter((p) => !IGNORE.some(([k, re]) => k === p.kind && re.test(p.sel)));
    report[`${theme}/page:${path || 'feed'}`] = list;
    fails += list.length;
    console.log(`${list.length ? 'FAIL' : 'ok  '} ${theme} page:${path || 'feed'}`);
    for (const p of list) console.log(`   ${p.kind} ${p.got}<${p.need} ${p.fg} on ${p.bg} ×${p.n} ${p.sel} ${p.extra}`);
  }
  await ctx.close();
}
await browser.close();
if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(report, null, 1));
console.log(`\n${fails} problem group(s)`);
process.exit(fails ? 1 : 0);
