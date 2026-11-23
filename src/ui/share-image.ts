import { L } from '../core/i18n';
import { fmtTime, h } from './dom';
import { openSheet } from './sheet';
import { shareSection } from './share';

/** A finished puzzle to turn into a picture: the board, how it went, and a link to the same puzzle. */
export interface ShareImageInfo {
  /** The finished game. Key pads are left out of the picture. */
  board: HTMLElement;
  /** Element whose theme tokens (colours, font) the picture uses: the card. */
  theme: HTMLElement;
  /** Puzzle id (the sheet takes the game's tone) and its share code. */
  puzzle: string;
  code: string;
  name: string;
  level: string;
  /** "Daily", "Pack 3", … */
  tag?: string | undefined;
  ms: number;
  mistakes: number;
  hints: number;
  parMs: number;
  /** Pack stars, out of three. */
  stars?: number | undefined;
  /** Zen mode: no time or counts. */
  zen?: boolean;
}

const W = 1080;
const PAD = 64;
const INNER = W - 2 * PAD;
const BORDER = 5;
const SHADOW = 8;
const RADIUS = 20;

const linkFor = (code: string) => `${location.origin}/s/${code}`;

/** Resolve theme tokens to colours a canvas understands (tokens can be `var()` or `color-mix()`). */
function palette(theme: HTMLElement) {
  const probe = h('span', { style: 'position:absolute;visibility:hidden' });
  theme.append(probe);
  const tok = (name: string) => {
    probe.style.color = `var(${name})`;
    return getComputedStyle(probe).color;
  };
  const c = {
    bg: tok('--bg'),
    cell: tok('--cell'),
    alt: tok('--cell-alt'),
    fg: tok('--fg'),
    muted: tok('--muted'),
    ink: tok('--ink'),
    accent: tok('--accent'),
    hi: tok('--hi'),
    onTone: tok('--on-tone'),
    font: getComputedStyle(theme).fontFamily || 'sans-serif',
  };
  probe.remove();
  return c;
}

type Pal = ReturnType<typeof palette>;

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, hgt: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, hgt, r);
}

/** Neo-brutalist box: hard offset shadow, fill, thick ink border. */
function box(g: CanvasRenderingContext2D, p: Pal, x: number, y: number, w: number, hgt: number, fill: string, r = RADIUS) {
  g.fillStyle = p.ink;
  roundRect(g, x + SHADOW, y + SHADOW, w, hgt, r);
  g.fill();
  g.fillStyle = fill;
  roundRect(g, x, y, w, hgt, r);
  g.fill();
  g.lineWidth = BORDER;
  g.strokeStyle = p.ink;
  g.stroke();
}

/** Shrink the font until `text` fits in `max` pixels. */
function fitFont(g: CanvasRenderingContext2D, text: string, weight: number, size: number, max: number, family: string) {
  let s = size;
  do g.font = `${weight} ${s}px ${family}`;
  while (g.measureText(text).width > max && --s > 12);
}

/** Input pads and on-screen keyboards: not part of the finished board. */
const INPUTS = ['pad', 'dpad', 'kb'];

/** The finished board as a canvas, without the key pads, at most `maxW` × `maxH`, cropped to what's drawn. */
async function captureBoard(board: HTMLElement, maxW: number, maxH: number): Promise<HTMLCanvasElement> {
  const { domToCanvas } = await import('modern-screenshot');
  const r = board.getBoundingClientRect();
  const scale = Math.min(maxW / Math.max(1, r.width), maxH / Math.max(1, r.height), 4);
  const full = await domToCanvas(board, {
    scale,
    backgroundColor: null,
    filter: (n) => !(n instanceof HTMLElement && INPUTS.some((c) => n.classList.contains(c))),
    // The capture replays the solve "pop": keep the board still.
    style: { animation: 'none', transform: 'none' },
  });
  return trim(full);
}

/** Crop away the transparent margins (the game's root often fills the whole stage). */
function trim(c: HTMLCanvasElement): HTMLCanvasElement {
  const { width: w, height: hgt } = c;
  if (!w || !hgt) return c;
  const px = c.getContext('2d')!.getImageData(0, 0, w, hgt).data;
  let x0 = w;
  let y0 = hgt;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < hgt; y++)
    for (let x = 0; x < w; x++)
      if (px[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return c;
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext('2d')!.drawImage(c, -x0, -y0);
  return out;
}

async function qrModules(text: string) {
  const { encode } = await import('uqr');
  return encode(text, { ecc: 'M', border: 0 });
}

/** The site logo (as in favicon.svg): 2×2 rounded squares, fixed brand colours in every theme. */
const LOGO = ['#ffd23f', '#ff6fb5', '#5b8cff', '#3ddc84'];

function logo(g: CanvasRenderingContext2D, p: Pal, x: number, y: number, size: number) {
  const sq = size * 0.4;
  const gap = size - 2 * sq;
  g.lineWidth = size * 0.07;
  g.strokeStyle = p.ink;
  LOGO.forEach((c, i) => {
    g.fillStyle = c;
    roundRect(g, x + (i % 2) * (sq + gap), y + Math.floor(i / 2) * (sq + gap), sq, sq, sq * 0.24);
    g.fill();
    g.stroke();
  });
}

/** Draw `fn` rotated by `deg` around (cx, cy), like the tilted cards of the link-preview image. */
function tilted(g: CanvasRenderingContext2D, cx: number, cy: number, deg: number, fn: () => void) {
  g.save();
  g.translate(cx, cy);
  g.rotate((deg * Math.PI) / 180);
  g.translate(-cx, -cy);
  fn();
  g.restore();
}

/** A label pill with a hard shadow; `x`, `y` is its top-left corner. Returns its width. */
function pill(g: CanvasRenderingContext2D, p: Pal, x: number, y: number, text: string, fill: string, size: number, max: number) {
  fitFont(g, text, 700, size, max, p.font);
  const hgt = Math.round(g.measureText('Ag').fontBoundingBoxAscent * 1.9);
  const w = g.measureText(text).width + hgt * 0.6;
  box(g, p, x, y, w, hgt, fill, hgt * 0.3);
  g.fillStyle = p.onTone;
  g.textBaseline = 'middle';
  g.fillText(text, x + hgt * 0.3, y + hgt / 2 + 2);
  g.textBaseline = 'alphabetic';
  return w;
}

/** Dotted paper background, as on the link-preview image. */
function dots(g: CanvasRenderingContext2D, p: Pal, w: number, hgt: number) {
  g.fillStyle = p.bg;
  g.fillRect(0, 0, w, hgt);
  g.fillStyle = p.ink;
  g.globalAlpha = 0.14;
  for (let y = 15; y < hgt; y += 30)
    for (let x = 15; x < w; x += 30) {
      g.beginPath();
      g.arc(x, y, 2, 0, 2 * Math.PI);
      g.fill();
    }
  g.globalAlpha = 1;
}

/**
 * Render the share picture in the link-preview image's style: the logo and "Puzzle Feed" lockup, the
 * finished board as a tilted card under a pill with the game and level, the stats, and a QR code with
 * the link to the same puzzle.
 */
async function renderShareImage(info: ShareImageInfo): Promise<Blob> {
  const p = palette(info.theme);
  const link = linkFor(info.code);
  const [boardCanvas, qr] = await Promise.all([captureBoard(info.board, INNER - 120, 960), qrModules(link)]);
  await document.fonts?.ready;
  const font = p.font;

  const stats: [string, string][] = info.zen
    ? []
    : [
        [L('Time', 'Temps'), fmtTime(info.ms)],
        [L('Mistakes', 'Erreurs'), String(info.mistakes)],
        [L('Hints', 'Indices'), String(info.hints)],
        [L('Par', 'Normale'), fmtTime(info.parMs)],
      ];

  // Layout, top to bottom.
  const headY = PAD;
  const cardY = headY + 100 + 84;
  const cardW = INNER - SHADOW - 12;
  const cardH = boardCanvas.height + 120;
  const statsY = cardY + cardH + 60;
  const statsH = stats.length ? 120 : 0;
  const footY = statsY + statsH + (stats.length ? 64 : 0);
  const qrSize = 232;
  const qrBox = qrSize + 48;
  const H = footY + qrBox + 40 + PAD;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  dots(g, p, W, H);

  // Lockup: logo, "Puzzle Feed" on a tilted yellow pill, and the date.
  logo(g, p, PAD, headY, 100);
  g.font = `700 58px ${font}`;
  const brand = 'Puzzle Feed';
  const bw = g.measureText(brand).width + 56;
  const bx = PAD + 100 + 32;
  tilted(g, bx + bw / 2, headY + 50, -2, () => {
    g.fillStyle = p.ink;
    roundRect(g, bx + 10, headY + 6 + 10, bw, 88, 22);
    g.fill();
    g.fillStyle = p.hi;
    roundRect(g, bx, headY + 6, bw, 88, 22);
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = p.ink;
    g.stroke();
    g.fillStyle = '#111111'; // on the brand yellow in every theme
    g.font = `700 58px ${font}`;
    g.fillText(brand, bx + 28, headY + 70);
  });
  g.font = `500 28px ${font}`;
  g.fillStyle = p.muted;
  g.textAlign = 'right';
  const date = new Date().toLocaleDateString(document.documentElement.lang || undefined, { dateStyle: 'medium' });
  g.fillText(date, W - PAD, headY + 62);
  g.textAlign = 'left';

  // The finished board on a tilted card, with the game and level on a pill along its top edge.
  const title = [info.name, info.level, info.tag].filter(Boolean).join(' · ');
  tilted(g, PAD + cardW / 2, cardY + cardH / 2, -1.2, () => {
    box(g, p, PAD, cardY, cardW, cardH, p.cell, 24);
    g.drawImage(boardCanvas, PAD + (cardW - boardCanvas.width) / 2, cardY + 72);
    pill(g, p, PAD - 12, cardY - 34, title, p.accent, 38, cardW - 240);
    if (info.stars) {
      const stars = '★'.repeat(info.stars) + '☆'.repeat(3 - info.stars);
      g.font = `700 36px ${font}`;
      const sw = g.measureText(stars).width + 40;
      pill(g, p, PAD + cardW - sw + 12, cardY - 34, stars, p.hi, 36, sw);
    }
  });

  // Stat tiles.
  if (stats.length) {
    const gap = 20;
    const tw = (INNER - SHADOW - gap * (stats.length - 1)) / stats.length;
    stats.forEach(([label, value], i) => {
      const x = PAD + i * (tw + gap);
      box(g, p, x, statsY, tw, statsH, i === 0 ? p.accent : p.cell, 16);
      g.fillStyle = i === 0 ? p.onTone : p.muted;
      fitFont(g, label.toUpperCase(), 600, 22, tw - 32, font);
      g.fillText(label.toUpperCase(), x + 20, statsY + 40);
      g.fillStyle = i === 0 ? p.onTone : p.fg;
      fitFont(g, value, 700, 48, tw - 32, font);
      g.fillText(value, x + 20, statsY + 96);
    });
  }

  // QR code on a tilted white card (dark on white so any camera reads it), then the link.
  tilted(g, PAD + qrBox / 2, footY + 20 + qrBox / 2, 2, () => {
    box(g, p, PAD, footY + 20, qrBox, qrBox, '#ffffff', 18);
    const mod = qrSize / qr.size;
    g.fillStyle = '#111111';
    qr.data.forEach((row, y) =>
      row.forEach((on, x) => {
        if (on) g.fillRect(PAD + 24 + x * mod, footY + 44 + y * mod, Math.ceil(mod), Math.ceil(mod));
      }),
    );
  });
  const tx = PAD + qrBox + SHADOW + 48;
  const tw = W - PAD - tx;
  g.fillStyle = p.fg;
  const ask = info.zen ? L('Your turn!', 'À vous de jouer!') : L('Can you beat my time?', 'Pouvez-vous battre mon temps?');
  fitFont(g, ask, 700, 44, tw, font);
  g.fillText(ask, tx, footY + 92);
  g.fillStyle = p.muted;
  const scan = L('Scan to play this exact puzzle:', 'Balayez pour jouer cette partie :');
  fitFont(g, scan, 500, 28, tw, font);
  g.fillText(scan, tx, footY + 146);
  // The link on two lines: the site, then the puzzle path.
  const url = new URL(link);
  g.fillStyle = p.fg;
  fitFont(g, url.host, 700, 34, tw, font);
  g.fillText(url.host, tx, footY + 212);
  fitFont(g, url.pathname, 600, 30, tw, font);
  g.fillText(url.pathname, tx, footY + 256);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));
}

/** Short message that goes with the picture when shared. */
function shareMessage(info: ShareImageInfo): string {
  const what = `${info.name} (${info.level})`;
  return info.zen
    ? L(`I solved ${what}. Your turn!`, `J’ai réussi ${what}. À vous de jouer!`)
    : L(
        `I solved ${what} in ${fmtTime(info.ms)}. Can you beat it?`,
        `J’ai réussi ${what} en ${fmtTime(info.ms)}. Pouvez-vous faire mieux?`,
      );
}

/** Sheet with the share picture: preview, Share (system sheet with the file) or Save, plus the code and link. */
export function openShareImage(info: ShareImageInfo, onClose?: () => void) {
  const preview = h(
    'div',
    { class: 'share-image-preview', 'aria-busy': 'true' },
    h('p', { class: 'muted small' }, L('Drawing…', 'Préparation…')),
  );
  const actions = h('div', { class: 'share-image-actions' });
  let url = '';
  openSheet({
    title: L('Share your solve', 'Partager votre réussite'),
    puzzle: info.puzzle,
    className: 'share-sheet',
    body: [preview, actions, shareSection(info.code, info.name)],
    onClose: () => {
      if (url) URL.revokeObjectURL(url);
      onClose?.();
    },
  });
  renderShareImage(info).then(
    (blob) => {
      url = URL.createObjectURL(blob);
      const fileName = `puzzle-${info.code}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });
      preview.removeAttribute('aria-busy');
      preview.replaceChildren(
        h('img', {
          src: url,
          alt: L(`${info.name}, solved, with a QR code to the same puzzle`, `${info.name}, réussi, avec un code QR vers la même partie`),
        }),
      );
      const save = h('a', { class: 'btn ghost', href: url, download: fileName }, L('Save image', 'Enregistrer l’image'));
      const canShare = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
      const share = canShare
        ? h(
            'button',
            {
              type: 'button',
              class: 'btn primary',
              onclick: () => {
                navigator.share({ files: [file], text: `${shareMessage(info)} ${linkFor(info.code)}` }).catch(() => {});
              },
            },
            L('Share image…', 'Partager l’image…'),
          )
        : null;
      actions.replaceChildren(...[share, save].filter((n) => !!n));
    },
    (err: unknown) => {
      console.error(err);
      preview.removeAttribute('aria-busy');
      preview.replaceChildren(
        h(
          'p',
          { class: 'muted small' },
          L('Couldn’t draw the picture. The link still works:', 'Impossible de créer l’image. Le lien fonctionne quand même :'),
        ),
      );
    },
  );
}
