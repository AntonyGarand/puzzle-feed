// Plays puzzles in a real browser to check solve/fail flows. Usage: node scripts/audit.mjs [baseUrl]
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:5180/';

/** Pick a level (1–5 or 'auto') through the card's cog sheet. */
async function pickLevel(page, lv, card = page.locator('.card').first()) {
  await card.locator('[data-action="settings"]').click();
  // Auto is its own On/Off switch; a level pick turns it off.
  const sel = lv === 'auto' ? '[data-setting="auto"] [data-value="1"]' : `[data-setting="level"] [data-value="${lv}"]`;
  await page.locator(`dialog.sheet ${sel}`).click();
  if (lv === 'auto') await page.keyboard.press('Escape'); // the switch doesn't close the sheet
  await page.waitForTimeout(150);
}

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const results = [];
const ok = (name, pass, info = '') => {
  results.push({ name, pass, info });
  console.log(pass ? 'PASS' : 'FAIL', name, info);
};

/** The card currently snapped into view. */
const card = () => page.locator('.card').nth(0);
async function open(id, level) {
  await page.goto(base); // force a fresh single-puzzle feed between games
  await page.goto(`${base}play/${id}`);
  await page.waitForSelector('.card .puzzle');
  if (level) {
    await pickLevel(page, level, card());
  }
}
const state = async () => (await card().getAttribute('class')).match(/is-(\w+)/)?.[1] ?? 'open';
const footer = async () => (await card().locator('.card-foot').innerText()).replace(/\s+/g, ' ');
/** The level change announced on the win panel ("Harder puzzles → Medium"), or ''. */
const levelPill = async () => {
  const pill = card().locator('.win-level');
  return (await pill.count()) ? (await pill.innerText()).trim() : '';
};
const feedScroll = () => page.evaluate(() => document.querySelector('.feed').scrollTop);

/** Solve the Lights board on the current card (GF(2) elimination in the page) and click the presses. */
async function solveLights() {
  const presses = await card()
    .locator('.cell')
    .evaluateAll((els) => {
      const N = els.length;
      const n = Math.sqrt(N);
      const A = [];
      for (let i = 0; i < N; i++) {
        const row = new Array(N + 1).fill(0);
        const r = Math.floor(i / n);
        const c = i % n;
        for (const [dr, dc] of [
          [0, 0],
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr >= 0 && rr < n && cc >= 0 && cc < n) row[rr * n + cc] = 1;
        }
        row[N] = els[i].classList.contains('on') ? 1 : 0;
        A.push(row);
      }
      let rank = 0;
      const where = new Array(N).fill(-1);
      for (let col = 0; col < N && rank < N; col++) {
        const piv = A.findIndex((row, k) => k >= rank && row[col]);
        if (piv < 0) continue;
        [A[rank], A[piv]] = [A[piv], A[rank]];
        for (let k = 0; k < N; k++) if (k !== rank && A[k][col]) for (let j = col; j <= N; j++) A[k][j] ^= A[rank][j];
        where[col] = rank++;
      }
      return where.map((w, i) => (w >= 0 && A[w][N] ? i : -1)).filter((i) => i >= 0);
    });
  for (const i of presses) await card().locator('.cell').nth(i).click();
  return presses.length;
}

// ---- Lights + auto-levelling + auto-advance
await open('lights', 1);
await solveLights();
ok('lights L1 solves', (await state()) === 'solved', await footer());

await open('lights');
await pickLevel(page, 'auto', card());
await solveLights();
const f1 = await levelPill();
await open('lights');
await solveLights();
const f2 = await levelPill();
// The level change is announced on the win panel, not in the footer.
ok('auto level-up after fast flawless solves', /Harder puzzles/.test(f1 + f2), `${f1 || '-'} | ${f2 || '-'}`);
// Auto-advance waits 2.4 s, or 3.2 s after a first clear, a record or a level change (confetti).
await page.waitForFunction(() => document.querySelector('.feed').scrollTop > 300, null, { timeout: 6000 }).catch(() => {});
const scrolled = await feedScroll();
ok('auto-advance scrolls to the next card', scrolled > 300, `scrollTop=${scrolled}`);

// ---- Lights at harder levels
for (const lv of [3, 5]) {
  await open('lights', lv);
  const n = await solveLights();
  ok(`lights L${lv} solves`, (await state()) === 'solved', `${n} presses`);
}

// ---- Queens: backtrack around the locked queen
for (const lv of [2, 5]) {
  await open('queens', lv);
  const clicks = await card()
    .locator('.cell')
    .evaluateAll((els) => {
      const n = Math.sqrt(els.length);
      let lr = -1;
      let lc = -1;
      els.forEach((e, i) => {
        if (e.classList.contains('given')) {
          lr = Math.floor(i / n);
          lc = i % n;
        }
      });
      const q = new Array(n).fill(null);
      q[lr] = lc;
      const safe = (r, c) => q.every((cc, rr) => cc == null || rr === r || (cc !== c && Math.abs(cc - c) !== Math.abs(rr - r)));
      const rec = (r) => {
        if (r === n) return true;
        if (r === lr) return rec(r + 1);
        for (let c = 0; c < n; c++) {
          if (!safe(r, c)) continue;
          q[r] = c;
          if (rec(r + 1)) return true;
          q[r] = null;
        }
        return false;
      };
      rec(0);
      return q.map((c, r) => (r === lr ? -1 : r * n + c)).filter((i) => i >= 0);
    });
  for (const i of clicks) await card().locator('.cell').nth(i).click();
  ok(`queens L${lv} solves`, (await state()) === 'solved', await footer());
}

// ---- Flood: greedy play; must end either way
for (const lv of [1, 5]) {
  await open('flood', lv);
  for (let k = 0; k < 60 && (await state()) === 'open'; k++) {
    const pick = await card()
      .locator('.cell')
      .evaluateAll((els) => {
        const n = Math.sqrt(els.length);
        const g = els.map((e) => e.style.background);
        const region = (grid) => {
          const seen = new Set([0]);
          const st = [0];
          while (st.length) {
            const i = st.pop();
            const r = Math.floor(i / n);
            const c = i % n;
            for (const j of [r > 0 ? i - n : -1, r < n - 1 ? i + n : -1, c > 0 ? i - 1 : -1, c < n - 1 ? i + 1 : -1]) {
              if (j >= 0 && !seen.has(j) && grid[j] === grid[0]) {
                seen.add(j);
                st.push(j);
              }
            }
          }
          return seen;
        };
        const reg = region(g);
        let best = null;
        let bestN = -1;
        for (const c of new Set(g)) {
          if (c === g[0]) continue;
          const s = region(g.map((x, i) => (reg.has(i) ? c : x))).size;
          if (s > bestN) {
            bestN = s;
            best = c;
          }
        }
        return g.indexOf(best);
      });
    await card().locator('.cell').nth(pick).click();
  }
  const st = await state();
  ok(`flood L${lv} ends (solved or out of moves)`, st === 'solved' || st === 'failed', `${st} · ${await footer()}`);
}

// ---- Code breaker: run out of guesses, code must be revealed
await open('codebreaker', 1);
for (let k = 0; k < 8 && (await state()) === 'open'; k++) {
  for (let p = 0; p < 3; p++)
    await card()
      .locator('.pad .key')
      .nth((k + p) % 4)
      .click();
  await card().getByRole('button', { name: 'Guess' }).click();
}
const cb = await state();
const revealed = await card().locator('.code-row.reveal').count();
ok('codebreaker ends; failure reveals the code', cb === 'solved' || (cb === 'failed' && revealed === 1), cb);

// ---- Skip
await open('slide', 1);
await card().locator('[data-action="settings"]').click(); // Skip lives in the cog sheet now
await page.locator('dialog.sheet').getByRole('button', { name: 'Skip' }).click();
await page.waitForTimeout(900);
ok('skip advances to the next card', (await feedScroll()) > 300);

// ---- Games tab: a half-played feed puzzle shows up as resumable, and resumes with the same board
await open('lights', 3);
await card().locator('.cell').nth(0).click();
await card().locator('.cell').nth(7).click();
const before = await card()
  .locator('.cell')
  .evaluateAll((els) => els.map((e) => e.classList.contains('on')).join(''));
await page.goto(`${base}games`);
await page.waitForSelector('.lab-tile');
// The unfinished game appears in "Continue" (first) and again in its category, marked as saved.
const continueSec = page.locator('.cat').first();
const lightsTile = continueSec.locator('.lab-tile[data-puzzle="lights"]');
ok(
  'games tab lists the unfinished puzzle under Continue',
  (await continueSec.locator('h3').innerText()).toLowerCase().startsWith('continue') &&
    (await lightsTile.count()) === 1 &&
    /\bhas-save\b/.test((await lightsTile.getAttribute('class')) ?? ''),
);
await lightsTile.getByRole('link', { name: 'Resume' }).click();
await page.waitForSelector('.lab .card .cell');
const after = await page.locator('.lab .card .cell').evaluateAll((els) => els.map((e) => e.classList.contains('on')).join(''));
ok('resume restores the same board', before === after);
ok('resume keeps the move count', /2 moves/.test(await page.locator('.lab .status').innerText()));

// ---- Games tab: start a new one at a chosen level; reload resumes it rather than re-rolling
await page.goto(`${base}games`);
await page.waitForSelector('.lab-tile');
const sudokuTile = page.locator('.lab-tile[data-puzzle="sudoku"]').last();
// The level is picked in the tile's cog sheet; the tile link then starts a new game at that level.
await sudokuTile.locator('.cog-btn').click();
await page.locator('dialog.sheet').getByRole('radio', { name: 'Expert' }).click();
await page.keyboard.press('Escape');
await page.locator('.lab-tile[data-puzzle="sudoku"] .tile-link').last().click();
await page.waitForSelector('.lab .card .cell');
ok(
  'labs starts a new puzzle at the picked level',
  (await page.locator('.lab .card .cell').count()) === 81 && page.url().endsWith('/game/sudoku'),
);
const firstEmpty = page.locator('.lab .card .cell:not(.given)').first();
await firstEmpty.click();
await page.keyboard.press('5');
await page.waitForTimeout(600);
const boardA = await page.locator('.lab .card .cell').allInnerTexts();
await page.reload();
await page.waitForSelector('.lab .card .cell');
const boardB = await page.locator('.lab .card .cell').allInnerTexts();
ok('reloading a lab puzzle resumes it', boardA.join() === boardB.join());

// ---- Settings tab is reachable from the tab bar
await page.locator('.tabs a[data-tab="settings"]').click();
await page.waitForSelector('.page h1');
ok('settings tab opens settings', (await page.locator('.page h1').innerText()) === 'Settings');

// ---- Cog sheet, guide and confetti
await open('lights', 1);
await card().locator('.help-btn').click();
await page.waitForSelector('dialog.sheet .guide-board .cell');
ok('guide opens with its walkthrough board', (await page.locator('dialog.sheet .guide-board .cell').count()) > 0);
await page.keyboard.press('Escape');
const before2 = await card().locator('.cell').count();
await card().locator('[data-action="settings"]').click();
await page.locator('dialog.sheet [data-setting="level"] [data-value="3"]').click();
ok('cog sheet changes the level', (await card().locator('.cell').count()) > before2);

// ---- Stats & persistence
await page.goto(`${base}stats`);
await page.waitForTimeout(200);
// Tiles: player level, XP, solved, ...
const solvedTile = page.locator('.stat', { hasText: 'solved' }).first().locator('.stat-v');
const solved = await solvedTile.innerText();
ok('stats count solves', Number(solved) >= 8, `solved=${solved}`);
await page.reload();
await page.waitForTimeout(300);
ok('stats persist after reload', (await solvedTile.innerText()) === solved);

ok('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
const fails = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
