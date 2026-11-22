import { L } from '../core/i18n';
import { h } from './dom';

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
