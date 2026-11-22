/** Selection and cursor: part of a snapshot, but moving them isn't a move. */
const VIEW_KEYS = ['sel', 'cur'];

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

interface Step {
  state: unknown;
  /** The state without selection and cursor, as JSON: equal keys mean no move happened. */
  key: string;
}

/**
 * Undo for games with `def.undo`: the card records `snapshot()` after every interaction and re-creates
 * the game from an earlier one. Oldest first; the last step is the current position.
 */
export class UndoHistory {
  private steps: Step[] = [];

  constructor(private readonly max = 300) {}

  clear() {
    this.steps = [];
  }

  /** At least one move to take back. */
  get canUndo() {
    return this.steps.length > 1;
  }

  /**
   * Record the current position if a move changed it. `snapshot` is the game's `snapshot()`; a game
   * without one (undefined) or a snapshot that isn't JSON is ignored.
   */
  record(snapshot: () => unknown) {
    const step = capture(snapshot);
    if (!step) return;
    if (this.steps.at(-1)?.key !== step.key) this.steps.push(step);
    if (this.steps.length > this.max) this.steps.shift();
  }

  /**
   * Drop the current position and return the previous one (a fresh copy), keeping the current selection
   * and cursor so the player's focus doesn't jump. Null when there's nothing to undo.
   */
  undo(): { state: unknown } | null {
    if (!this.canUndo) return null;
    const cur = this.steps.pop()!.state;
    const prev = this.steps.at(-1)!.state;
    let state = prev;
    if (isRecord(prev) && isRecord(cur)) {
      const merged: Record<string, unknown> = { ...prev };
      for (const k of VIEW_KEYS) if (k in cur) merged[k] = cur[k];
      state = merged;
    }
    return { state: structuredClone(state) };
  }
}

function capture(snapshot: () => unknown): Step | null {
  try {
    const raw = snapshot();
    if (raw === undefined) return null;
    const state: unknown = JSON.parse(JSON.stringify(raw));
    const key = JSON.stringify(isRecord(state) ? { ...state, ...Object.fromEntries(VIEW_KEYS.map((k) => [k, undefined])) } : state);
    return { state, key };
  } catch {
    return null;
  }
}
