// Screenshot every puzzle at chosen levels. Usage: node scripts/shots.mjs [baseUrl] [outDir]
import { chromium } from 'playwright-core';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const base = process.argv[2] ?? 'http://localhost:5180/';
const out = resolve(process.argv[3] ?? 'shots');
mkdirSync(out, { recursive: true });
let ids = (process.env.IDS ?? '').split(',').filter(Boolean);
const levels = (process.env.LEVELS ?? '1,3,5').split(',');
const themes = (process.env.THEMES ?? 'light').split(',');
// pixel ≈ a Pixel 7 in Chrome with its address and nav bars (412 × 915 screen).
const viewports = { mobile: { width: 390, height: 844 }, pixel: { width: 412, height: 760 }, desktop: { width: 1280, height: 860 } };
const vps = (process.env.VP ?? 'mobile').split(',');

/** Pick a level (1–5 or 'auto') through the card's cog sheet. */
async function pickLevel(page, lv, card = page.locator('.card').first()) {
  await card.locator('[data-action="settings"]').click();
  await page.locator(`dialog.sheet [data-setting="level"] [data-value="${lv}"]`).click();
  await page.waitForTimeout(150);
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
for (const vp of vps)
  for (const theme of themes) {
    const ctx = await browser.newContext({ viewport: viewports[vp], deviceScaleFactor: 2, colorScheme: theme });
    // LOCALE=fr screenshots the French UI; HELP=1 opens the how-to-play dialog before each shot.
    if (process.env.LOCALE) await ctx.addInitScript((l) => localStorage.setItem('puzzle-feed:locale', l), process.env.LOCALE);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
    if (!ids.length) {
      await page.goto(base);
      ids = await page.evaluate(() => window.__puzzles);
    }
    for (const id of ids) {
      for (const lv of levels) {
        await page.goto(`${base}play/${id}`);
        await page.waitForSelector('.card .puzzle');
        await pickLevel(page, lv);
        await page.waitForTimeout(lv === '5' ? 900 : 400);
        if (process.env.HELP) {
          await page.locator('.card .help-btn').first().click();
          await page.waitForTimeout(250);
        }
        await page.screenshot({ path: join(out, `${vp}-${theme}-${id}-L${lv}.png`) });
        if (process.env.HELP) await page.keyboard.press('Escape');
      }
    }
    // Pages
    await page.goto(`${base}stats`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(out, `${vp}-${theme}-zz-stats.png`), fullPage: true });
    await page.goto(`${base}labs`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(out, `${vp}-${theme}-zz-labs.png`) });
    await page.goto(`${base}lab/pipes/new/3`);
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(out, `${vp}-${theme}-zz-lab-view.png`) });
    await page.goto(`${base}settings`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(out, `${vp}-${theme}-zz-settings.png`) });
    await ctx.close();
  }

// Contact sheets: 4 shots per sheet row.
const files = readdirSync(out).filter((f) => f.endsWith('.png') && !f.startsWith('sheet'));
const sheet = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const groups = {};
for (const f of files) (groups[f.split('-').slice(0, 2).join('-')] ??= []).push(f);
for (const [g, list] of Object.entries(groups)) {
  for (let i = 0; i < list.length; i += 12) {
    const chunk = list.slice(i, i + 12);
    const html = `<body style="margin:0;background:#888;display:grid;grid-template-columns:repeat(6,1fr);gap:6px;padding:6px;font:12px sans-serif">${chunk
      .map(
        (f) =>
          `<figure style="margin:0"><img src="data:image/png;base64,${readFileSync(join(out, f)).toString('base64')}" style="width:100%;display:block"><figcaption>${f}</figcaption></figure>`,
      )
      .join('')}</body>`;
    await sheet.setContent(html);
    await sheet.waitForTimeout(300);
    await sheet.screenshot({ path: join(out, `sheet-${g}-${i / 12}.png`), fullPage: true });
  }
}
await browser.close();
console.log('done', files.length);
