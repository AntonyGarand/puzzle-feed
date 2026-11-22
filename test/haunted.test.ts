// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountGame } from './support/mount';

const key = (g: ReturnType<typeof mountGame>, k: string) => g.inst.onKey?.(new KeyboardEvent('keydown', { key: k }));
const firstEmpty = (g: ReturnType<typeof mountGame>) => g.root.querySelector<HTMLElement>('.hn-grid button.cell:not(.given)')!;

describe('haunted', () => {
  it('✕ on an empty cell pencils in an x, a monster replaces it, and it survives a resume', () => {
    const g = mountGame('haunted', 2, 7);
    const cell = firstEmpty(g);
    cell.click();
    const x = g.root.querySelectorAll<HTMLElement>('.pad .key')[3];
    x.click();
    expect(cell.classList.contains('mx')).toBe(true);
    const back = mountGame('haunted', 2, 7, { saved: structuredClone(g.inst.snapshot?.()) });
    expect(back.root.querySelector(`[data-i="${cell.dataset['i']}"]`)!.classList.contains('mx')).toBe(true);
    x.click();
    expect(cell.classList.contains('mx')).toBe(false);
    key(g, 'x');
    key(g, 'g');
    expect(cell.classList.contains('mx')).toBe(false);
    expect(cell.classList.contains('m1')).toBe(true);
  });

  it('a lit edge number traces its line instead of tinting cells', () => {
    const g = mountGame('haunted', 2, 7);
    const lines = () => [...g.root.querySelectorAll('.hn-ray polyline')].map((p) => p.getAttribute('points') ?? '');
    expect(lines().every((p) => !p)).toBe(true);
    g.root.querySelector<HTMLElement>('button.hn-clue')!.click();
    expect(lines().some((p) => p.split(' ').length >= 3)).toBe(true);
    expect(g.root.querySelector('.cell.ray, .cell.ray2')).toBeNull();
  });

  it('the keys show only what is left to place', () => {
    const g = mountGame('haunted', 2, 7);
    for (const n of g.root.querySelectorAll('.hn-n')) expect(n.textContent).toMatch(/^\d+$/);
  });
});
