import { L, type Locale } from './i18n';
import { LEVELS, type Difficulty } from './types';

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
