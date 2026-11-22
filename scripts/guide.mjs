// Step through each game's animated "?" guide and screenshot every step.
// Usage: IDS=mines,sudoku node scripts/guide.mjs [baseUrl] [outDir]   (LOCALE=fr for French)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const base = process.argv[2] ?? 'http://localhost:5180/';
const out = resolve(process.argv[3] ?? 'shots/guide');
mkdirSync(out, { recursive: true });
let ids = (process.env.IDS ?? '').split(',').filter(Boolean);

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 2 });
if (process.env.LOCALE) await ctx.addInitScript((l) => localStorage.setItem('puzzle-feed:locale', l), process.env.LOCALE);
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
if (!ids.length) {
  await page.goto(base);
  ids = await page.evaluate(() => window.__puzzles);
}
for (const id of ids) {
  await page.goto(`${base}play/${id}`);
  await page.waitForSelector('.card .puzzle');
  await page.locator('.card').first().locator('.help-btn').click();
  const sheet = page.locator('dialog.sheet');
  if (!(await sheet.locator('.guide-section').count())) {
    console.log(`${id}: no guide (practice board)`);
    continue;
  }
  await page.waitForTimeout(400);
  const pause = sheet.locator('.guide-row .btn').nth(1);
  if ((await pause.innerText()).includes('❚❚')) await pause.click();
  const captions = [];
  for (let k = 1; k <= 7; k++) {
    await page.waitForTimeout(1100);
    const cap = await sheet.locator('.guide-caption').innerText();
    const marks = await sheet.locator('.guide-at').count();
    captions.push(`  ${k}. [${marks}] ${cap}`);
    await sheet.locator('.guide-stage').scrollIntoViewIfNeeded();
    await sheet.locator('.guide-section').screenshot({ path: `${out}/${id}-${k}.png` });
    if (await sheet.locator('.guide-stage.done').count()) break;
    await sheet.locator('.guide-row .btn').nth(2).click();
  }
  console.log(`${id}:\n${captions.join('\n')}`);
  await page.keyboard.press('Escape');
}
await browser.close();
