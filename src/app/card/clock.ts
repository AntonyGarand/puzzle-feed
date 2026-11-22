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
