import { L } from './i18n';
import { h } from './ui';

let open: HTMLDialogElement | null = null;

export const sheetOpen = () => !!open;

/** Close the open sheet, if any. True when there was one. */
export function closeSheet(): boolean {
  if (!open?.open) return false;
  open.close();
  return true;
}

/**
 * Modal sheet (bottom sheet on phones, centred dialog on wider screens) in the game's tone.
 * Returns a `close()` function.
 */
export function openSheet(opts: {
  title: string;
  /** Puzzle id, so the sheet picks up that game's accent colour. */
  puzzle?: string;
  className?: string;
  body: (Node | null | false)[];
  footer?: (Node | null | false)[];
  onClose?: () => void;
}): () => void {
  open?.close();
  const close = () => dlg.close();
  const dlg = h(
    'dialog',
    { class: `sheet ${opts.className ?? ''}`.trim(), 'data-puzzle': opts.puzzle, 'aria-labelledby': 'sheet-title' },
    h(
      'div',
      { class: 'sheet-head' },
      h('h2', { id: 'sheet-title' }, opts.title),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': L('Close', 'Fermer'), onclick: close }, '✕'),
    ),
    h('div', { class: 'sheet-body' }, ...opts.body.filter((n): n is Node => !!n)),
    opts.footer ? h('div', { class: 'sheet-foot' }, ...opts.footer.filter((n): n is Node => !!n)) : null,
  );
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) close(); // backdrop
  });
  dlg.addEventListener('close', () => {
    dlg.remove();
    if (open === dlg) open = null;
    opts.onClose?.();
  });
  document.body.append(dlg);
  open = dlg;
  dlg.showModal();
  return close;
}
