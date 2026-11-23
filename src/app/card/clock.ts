/** Play time of one puzzle: runs while its card is the visible one, pauses otherwise. */
export class Clock {
  private elapsed = 0;
  /** `now()` when the clock last started, or null while paused. */
  private since: number | null = null;

  constructor(private readonly now: () => number = () => performance.now()) {}

  get running() {
    return this.since !== null;
  }

  /** Start over at `ms` (a resumed save's time), running or paused. */
  reset(ms: number, running: boolean) {
    this.elapsed = ms;
    this.since = running ? this.now() : null;
  }

  start() {
    this.since = this.now();
  }

  stop() {
    if (this.since !== null) this.elapsed += this.now() - this.since;
    this.since = null;
  }

  /** Milliseconds played so far. */
  time() {
    return this.elapsed + (this.since !== null ? this.now() - this.since : 0);
  }
}

/**
 * Time the player is actually there, for the profile's play time: counts while started, but a gap
 * without input (`poke`) counts for `idle` at most, so a puzzle left open on screen doesn't pile up.
 */
export class PlayTime {
  /** `now()` of the last input (or start) while running, or null while stopped. */
  private last: number | null = null;
  private pending = 0;

  constructor(
    private readonly idle = 120_000,
    private readonly now: () => number = () => performance.now(),
  ) {}

  start() {
    this.last ??= this.now();
  }

  /** The player did something. */
  poke() {
    if (this.last === null) return;
    const t = this.now();
    this.pending += Math.min(t - this.last, this.idle);
    this.last = t;
  }

  /** Stop, and hand over the time counted since the last take. */
  take(): number {
    this.poke();
    this.last = null;
    const ms = this.pending;
    this.pending = 0;
    return ms;
  }
}
