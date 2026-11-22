import { L, type Locale } from './i18n';
import { LEVELS, type Difficulty } from './types';
import { h } from '../ui/dom';

/**
 * Share codes: `<game id>-<level>-<seed in base 36>`, plus `-<locale>` for word games (their puzzles come
 * from the locale's word list). E.g. `sudoku-3-1k2x9q`, `anagram-2-z81kd0-fr`. Links are `/s/<code>` (older ones `#/s/<code>`).
 */
export interface ShareCode {
  id: string;
  level: Difficulty;
  seed: number;
  locale?: Locale | undefined;
}

export function encodeCode(c: ShareCode): string {
  return `${c.id}-${c.level}-${(c.seed >>> 0).toString(36)}${c.locale ? `-${c.locale}` : ''}`;
}

// Id segments start with a letter, so the level digit (and the seed) can never be read as part of the id.
const RE = /^([a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*)-([1-5])-([0-9a-z]{1,7})(?:-(en|fr))?$/;

/** Parse a code or a pasted share link. Returns null when it isn't a valid code (the game id isn't checked). */
export function decodeCode(input: string): ShareCode | null {
  let s = input.trim();
  const link = s.match(/(?:^|[/#])\/?s\/([^/?#\s]+)/);
  if (link) s = decodeURIComponent(link[1]);
  const m = RE.exec(s.toLowerCase());
  if (!m) return null;
  const seed = parseInt(m[3], 36);
  if (!Number.isFinite(seed) || seed > 0xffffffff) return null;
  const level = Number(m[2]) as Difficulty;
  if (!LEVELS.includes(level)) return null;
  return { id: m[1], level, seed, ...(m[4] ? { locale: m[4] as Locale } : {}) };
}

const shareLink = (code: string) => `${location.origin}/s/${code}`;

async function copyText(text: string, fallback: HTMLInputElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Insecure context (LAN dev server) or permission denied: select and use the legacy command.
    const prev = fallback.value;
    fallback.value = text;
    fallback.select();
    const ok = document.execCommand('copy');
    fallback.value = prev;
    return ok;
  }
}

/** "Share this puzzle" block: the code in a read-only field, with Copy code and Share/Copy link buttons. */
export function shareSection(code: string, title: string): HTMLElement {
  const link = shareLink(code);
  const field = h('input', {
    class: 'input inline share-code',
    readonly: true,
    value: code,
    'aria-label': L('Puzzle code', 'Code de la partie'),
    spellcheck: 'false',
    onfocus: (e: FocusEvent) => (e.target as HTMLInputElement).select(),
  });
  const note = h('p', { class: 'muted small share-note', role: 'status' });
  const flash = (b: HTMLButtonElement, label: string, ok: boolean) => {
    note.textContent = ok
      ? L('Copied. Anyone with it gets this exact puzzle.', 'Copié. Avec ce code, on obtient exactement cette partie.')
      : L('Couldn’t copy: select the code and copy it.', 'Impossible de copier : sélectionnez le code et copiez-le.');
    b.textContent = ok ? L('Copied ✓', 'Copié ✓') : label;
  };
  const copyCode = L('Copy code', 'Copier le code');
  const canShare = typeof navigator.share === 'function';
  const linkLabel = canShare ? L('Share…', 'Partager…') : L('Copy link', 'Copier le lien');
  const codeBtn = h('button', { type: 'button', class: 'btn ghost' }, copyCode);
  codeBtn.addEventListener('click', () => void copyText(code, field).then((ok) => flash(codeBtn, copyCode, ok)));
  const linkBtn = h('button', { type: 'button', class: 'btn primary', 'data-action': 'share-link' }, linkLabel);
  linkBtn.addEventListener('click', () => {
    if (canShare) {
      navigator.share({ title, text: L(`Try this puzzle: ${title}`, `Essayez cette partie : ${title}`), url: link }).catch(() => {});
      return;
    }
    void copyText(link, field).then((ok) => flash(linkBtn, linkLabel, ok));
  });
  return h('div', { class: 'share' }, h('div', { class: 'share-row' }, field, codeBtn, linkBtn), note);
}

/**
 * Turn what the player typed or opened into a playable puzzle, or a friendly error. A word puzzle from the
 * other language still resolves: it's played with that language's word list (see LabView).
 */
export function resolveCode<D extends { id: string }>(input: string, defs: D[]): { def: D; code: ShareCode } | { error: string } {
  if (!input.trim()) return { error: L('Enter a puzzle code first.', 'Entrez d’abord un code de partie.') };
  const code = decodeCode(input);
  if (!code)
    return {
      error: L(
        'That doesn’t look like a puzzle code. It should look like sudoku-3-1k2x9q.',
        'Ce code de partie n’est pas valide. Il devrait ressembler à sudoku-3-1k2x9q.',
      ),
    };
  const def = defs.find((d) => d.id === code.id);
  if (!def) return { error: L(`There’s no game called “${code.id}”.`, `Aucun jeu ne s’appelle « ${code.id} ».`) };
  return { def, code };
}
