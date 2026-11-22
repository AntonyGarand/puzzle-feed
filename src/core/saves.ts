import type { Difficulty } from './types';

/** One in-progress puzzle per puzzle type, so it can be resumed from Labs. */
export interface Save {
  seed: number;
  level: Difficulty;
  elapsed: number;
  mistakes: number;
  /** Hints used so far. */
  hints?: number;
  state: unknown;
  at: number;
  /** Locale the puzzle was generated in (matters for word games). */
  locale?: 'en' | 'fr';
  /** The goal was reached and the solve already recorded (endless games playing on). */
  reached?: true;
}

/**
 * Where a save lives. `own` is your game (one per puzzle type). Puzzles opened from a share code and
 * daily puzzles each get their own slot, so they never overwrite your own game.
 */
export type Slot = 'own' | 'shared' | 'daily';

const KEYS: Record<Slot, string> = {
  own: 'puzzle-feed:saves:v1',
  shared: 'puzzle-feed:shared:v1',
  daily: 'puzzle-feed:daily-saves:v1',
};

function read(slot: Slot = 'own'): Record<string, Save> {
  try {
    const v = JSON.parse(localStorage.getItem(KEYS[slot]) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
function write(all: Record<string, Save>, slot: Slot = 'own') {
  try {
    localStorage.setItem(KEYS[slot], JSON.stringify(all));
  } catch {
    /* quota: resume is best-effort */
  }
}

/** Save key of a daily puzzle: `<date>:<level>:<index>`. Older days are pruned on write. */
export const dailySaveKey = (date: string, level: Difficulty, index: number) => `${date}:${level}:${index}`;

export const getSave = (id: string, slot: Slot = 'own'): Save | undefined => read(slot)[id];
export const allSaves = () => read();

export function putSave(id: string, s: Save, slot: Slot = 'own') {
  const all = read(slot);
  all[id] = s;
  if (slot === 'daily') {
    // Only the current day's daily puzzles are worth resuming.
    const day = id.split(':')[0];
    for (const k of Object.keys(all)) if (k.split(':')[0] !== day) delete all[k];
  }
  write(all, slot);
}

/** Remove the save for `id`; if `seed` is given, only when it belongs to that puzzle. */
export function clearSave(id: string, seed?: number, slot: Slot = 'own') {
  const all = read(slot);
  if (!all[id] || (seed != null && all[id].seed !== seed)) return;
  delete all[id];
  write(all, slot);
}

export function clearAllSaves() {
  for (const slot of Object.keys(KEYS) as Slot[]) write({}, slot);
}
