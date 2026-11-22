import { CATEGORIES } from '../core/categories';
import { setDefaultOff } from '../core/store';
import type { PuzzleDef } from '../core/types';

/**
 * Every top-level module in this folder that exports a PuzzleDef is registered automatically.
 * Helpers live in subfolders (or simply don't export a PuzzleDef).
 */
const modules = import.meta.glob<Record<string, unknown>>('./*.ts', { eager: true });

const isDef = (v: unknown): v is PuzzleDef =>
  !!v && typeof v === 'object' && typeof (v as PuzzleDef).id === 'string' && typeof (v as PuzzleDef).create === 'function';

const found = new Map<string, PuzzleDef>();
for (const mod of Object.values(modules)) for (const v of Object.values(mod)) if (isDef(v)) found.set(v.id, v);

const catOrder = (d: PuzzleDef) => CATEGORIES.findIndex((c) => c.id === d.category);

export const PUZZLES: PuzzleDef[] = [...found.values()].sort((a, b) => catOrder(a) - catOrder(b) || a.name.localeCompare(b.name));

setDefaultOff(PUZZLES.filter((d) => d.offByDefault).map((d) => d.id));
