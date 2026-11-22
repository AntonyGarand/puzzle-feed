// Renders the link-preview image (Open Graph / Twitter card) in the site's neo-brutalist style,
// using your installed Chrome. Usage: node scripts/og-image.mjs   → writes public/og.png (1200×630)
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const out = 'public/og.png';
const font = readFileSync('node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2').toString('base64');

// Light theme tokens from src/styles/tokens.css.
const C = {
  bg: '#fff6e5',
  ink: '#111111',
  muted: '#5e584e',
  cell: '#ffffff',
  yellow: '#ffd23f',
  pink: '#ff6fb5',
  blue: '#5b8cff',
  green: '#3ddc84',
  orange: '#ff8a3d',
  purple: '#b98aff',
};
const soft = (c) => `color-mix(in srgb, ${c} 32%, #fff)`;

/** A puzzle card: a bordered board with its category pill on the top edge (`pill = 'end'` anchors it right). */
const card = ([en, fr], accent, board, style, pill = '') => `
  <div class="card" style="${style}">
    <div class="board">${board}</div>
    <div class="pill ${pill}" style="background:${accent}">${en}${fr ? ` <i>· ${fr}</i>` : ''}</div>
  </div>`;

// 4×4 Sudoku (solution 1234/3412/2143/4321) with the selected cell's row and column tinted.
const sudoku = (() => {
  const g = ['. . . 4', '3 . 1 .', '2 . . 3', '4 . 2 .'].map((r) => r.split(' '));
  const cells = g
    .flatMap((row, y) =>
      row.map((v, x) => {
        const sel = x === 1 && y === 2;
        const bg = sel ? C.blue : x === 1 || y === 2 ? soft(C.blue) : C.cell;
        const bR = x === 1 ? `border-right:2.5px solid ${C.ink};` : '';
        const bB = y === 1 ? `border-bottom:2.5px solid ${C.ink};` : '';
        return `<i style="background:${bg};${bR}${bB}">${v === '.' ? (sel ? '1' : '') : v}</i>`;
      }),
    )
    .join('');
  return `<div class="grid" style="grid-template-columns:repeat(4,1fr)">${cells}</div>`;
})();

// Word Guess: four guesses closing in on SOLVE, then an empty row. Colours as in word-guess.css.
const word = (() => {
  const T = { g: C.green, y: C.yellow, x: '#f4ead6', e: C.cell };
  const rows = [
    ['CRANE', 'xxxxg'],
    ['TOWEL', 'xgxyy'],
    ['LOVES', 'ygyyy'],
    ['SOLVE', 'ggggg'],
    ['     ', 'eeeee'],
  ];
  return `<div class="tiles">${rows
    .map(([w, f]) =>
      [...w].map((l, i) => `<b style="background:${T[f[i]]};${f[i] === 'x' ? `color:${C.muted}` : ''}">${l.trim()}</b>`).join(''),
    )
    .join('')}</div>`;
})();

// Connect: a solved 5×5 board, every cell filled by one of the coloured paths.
const connect = (() => {
  const paths = [
    [
      C.pink,
      [
        [0, 2],
        [0, 1],
        [0, 0],
        [1, 0],
        [2, 0],
      ],
    ],
    [
      C.blue,
      [
        [0, 3],
        [0, 4],
        [1, 4],
        [2, 4],
        [3, 4],
        [4, 4],
        [4, 3],
      ],
    ],
    [
      C.yellow,
      [
        [2, 1],
        [1, 1],
        [1, 2],
        [1, 3],
      ],
    ],
    [
      C.green,
      [
        [2, 2],
        [2, 3],
        [3, 3],
      ],
    ],
    [
      C.orange,
      [
        [3, 2],
        [3, 1],
        [3, 0],
        [4, 0],
        [4, 1],
        [4, 2],
      ],
    ],
  ];
  const step = 24,
    at = (v) => v * step + step / 2; // [row, col] → centre
  const tint = paths
    .flatMap(([c, cells]) =>
      cells.map(([r, k]) => `<rect x="${k * step}" y="${r * step}" width="${step}" height="${step}" fill="${soft(c)}"/>`),
    )
    .join('');
  const lines = Array.from(
    { length: 4 },
    (_, i) =>
      `<line x1="${(i + 1) * step}" y1="0" x2="${(i + 1) * step}" y2="120"/><line x1="0" y1="${(i + 1) * step}" x2="120" y2="${(i + 1) * step}"/>`,
  ).join('');
  const pipes = paths
    .map(([c, cells]) => {
      const d = cells.map(([r, k], i) => `${i ? 'L' : 'M'}${at(k)} ${at(r)}`).join(' ');
      const ends = [cells[0], cells.at(-1)]
        .map(([r, k]) => `<circle cx="${at(k)}" cy="${at(r)}" r="8" fill="${c}" stroke="${C.ink}" stroke-width="2.2"/>`)
        .join('');
      return `<path d="${d}" fill="none" stroke="${c}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>${ends}`;
    })
    .join('');
  return `<svg viewBox="0 0 120 120" width="100%" height="100%">${tint}<g stroke="#0002" stroke-width=".8">${lines}</g>${pipes}</svg>`;
})();

const html = `<!doctype html><html><head><style>
  @font-face { font-family: SG; src: url(data:font/woff2;base64,${font}) format('woff2'); font-weight: 300 700; }
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; font-family: SG, sans-serif; color: ${C.ink};
    background: ${C.bg} radial-gradient(${C.ink}22 1.6px, transparent 1.7px) 0 0 / 28px 28px; position: relative; }
  .left { position: absolute; left: 72px; top: 112px; width: 620px; }
  .logo { display: grid; grid-template-columns: repeat(2, 46px); gap: 11px; margin-bottom: 20px; }
  .logo i { width: 46px; height: 46px; border: 6px solid ${C.ink}; border-radius: 12px; }
  .lockup { display: flex; align-items: center; gap: 28px; }
  .lockup .logo { margin: 0; }
  h1 { display: inline-block; font-size: 66px; font-weight: 700; letter-spacing: -0.04em; line-height: 1; white-space: nowrap;
    background: ${C.yellow}; border: 5px solid ${C.ink}; border-radius: 20px; padding: 6px 24px 14px;
    box-shadow: 9px 9px 0 ${C.ink}; transform: rotate(-2deg); }
  p { margin-top: 46px; font-size: 29px; font-weight: 600; line-height: 1.2; letter-spacing: -0.01em; }
  p + p { margin-top: 10px; font-weight: 500; color: ${C.muted}; }
  .tags { display: flex; flex-wrap: wrap; gap: 14px 12px; margin-top: 28px; width: 560px; }
  .tags b i { font-style: normal; font-weight: 500; }
  .tags b { font-size: 18px; font-weight: 700; padding: 6px 16px; border: 3px solid ${C.ink}; border-radius: 999px; box-shadow: 3px 3px 0 ${C.ink}; }
  .url { margin-top: 30px; font-size: 24px; font-weight: 700; letter-spacing: -0.01em; }
  .card { position: absolute; width: 220px; }
  .pill { position: absolute; left: -10px; top: -34px; white-space: nowrap; font-size: 20px; font-weight: 700; padding: 4px 13px 6px;
    border: 4px solid ${C.ink}; border-radius: 12px; box-shadow: 4px 4px 0 ${C.ink}; letter-spacing: -0.02em; }
  .pill i { font-style: normal; font-weight: 500; }
  .pill.end { left: auto; right: -10px; }
  .board { width: 220px; height: 236px; background: ${C.cell}; border: 4px solid ${C.ink}; border-radius: 16px;
    box-shadow: 10px 10px 0 ${C.ink}; overflow: hidden; }
  .grid { display: grid; width: 100%; height: 100%; }
  .grid i { display: grid; place-items: center; font-style: normal; font-size: 36px; font-weight: 700;
    border-right: 1px solid #0003; border-bottom: 1px solid #0003; }
  .tiles { display: grid; grid-template-columns: repeat(5, 1fr); grid-template-rows: repeat(5, 1fr); gap: 6px; padding: 30px 10px 10px; height: 100%; }
  .tiles b { display: grid; place-items: center; font-size: 22px; border: 2.5px solid ${C.ink}; border-radius: 7px; }
</style></head><body>
  <div class="left">
    <div class="lockup">
      <div class="logo"><i style="background:${C.yellow}"></i><i style="background:${C.pink}"></i><i style="background:${C.blue}"></i><i style="background:${C.green}"></i></div>
      <h1>Puzzle Feed</h1>
    </div>
    <p>An endless feed of bite-sized puzzles.</p>
    <p lang="fr">Un fil sans fin de petits casse-têtes.</p>
    <div class="tags">
      ${[
        [C.pink, 'numbers', 'chiffres'],
        [C.orange, 'moves', 'déplacements'],
        [C.yellow, 'cards & chess', 'cartes et échecs'],
        [C.purple, 'memory', 'mémoire'],
      ]
        .map(([bg, en, fr]) => `<b style="background:${bg}">${en} <i>· ${fr}</i></b>`)
        .join('')}
    </div>
    <div class="url">puzzle.garand.dev</div>
  </div>
  ${card(['Paths & links', 'Chemins et liens'], C.purple, connect, 'left:908px;top:76px;transform:rotate(4deg);z-index:1', 'end')}
  ${card(['Logic', 'Logique'], C.blue, sudoku, 'left:688px;top:190px;transform:rotate(-4deg);z-index:2')}
  ${card(['Words', 'Mots'], C.green, word, 'left:888px;top:322px;transform:rotate(4deg);z-index:3')}
</body></html>`;

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out });
await browser.close();
console.log('link preview image written to', out);
