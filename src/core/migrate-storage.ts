// One-time move of localStorage keys from the app's old name (puzzle express) to puzzle feed, so
// profiles, saves and settings survive the rename. Imported first in main.ts: it must run before any
// module reads storage. Safe to delete once old installs have had time to load a new version.
const OLD = 'puzzle-express:';
const NEW = 'puzzle-feed:';

/** Rename every `puzzle-express:*` key to `puzzle-feed:*`, never overwriting a newer value. */
export function migrateStorage(storage: Storage) {
  try {
    const old: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k?.startsWith(OLD)) old.push(k);
    }
    for (const k of old) {
      const to = NEW + k.slice(OLD.length);
      const v = storage.getItem(k);
      if (v !== null && storage.getItem(to) === null) storage.setItem(to, v);
      storage.removeItem(k);
    }
  } catch {
    // Storage unavailable (private mode, quota): nothing to migrate.
  }
}

migrateStorage(localStorage);
