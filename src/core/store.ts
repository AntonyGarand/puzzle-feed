import type { Difficulty } from './types';
import { xpGains, type XpOutcome } from './xp';

type Outcome = 'solved' | 'failed' | 'skipped';
/** 0 = off, 1 = less, 2 = normal, 3 = more */
export type Weight = 0 | 1 | 2 | 3;
export type Theme = 'system' | 'light' | 'dark' | 'oled';
/** Look of the whole app (styles/themes.css), on top of light / dark. */
export type Style = 'neo' | 'minimal' | 'soft' | 'newsprint';

export interface Result {
  d: Difficulty;
  o: Outcome;
  ms: number;
  m: number;
  /** Hints used (absent = none): a hinted solve never counts toward levelling up. */
  hn?: number;
  at: number;
  /** Played from a share code: counts in stats, never in auto-levelling. */
  sh?: true;
  /** A daily challenge puzzle: counts in stats, never in auto-levelling. */
  dy?: true;
}

/** One puzzle of a daily list, with the player's progress on it. */
export interface DailyEntry {
  id: string;
  seed: number;
  /** Best outcome so far: solved beats failed (a failed or skipped daily can be retried). */
  o?: 'solved' | 'failed';
  /** Time and mistakes of the solve. */
  ms?: number;
  m?: number;
  /** Attempts that ended (solved, failed or skipped). */
  tries?: number;
  /** When it was solved. */
  at?: number;
}

/** A day's daily lists, one per difficulty, stored the first time the player opens one. */
type DailyDay = Partial<Record<Difficulty, DailyEntry[]>>;

export interface TypePrefs {
  level: Difficulty;
  /** true once the player picked a level by hand: auto-levelling stops for this puzzle. */
  manual: boolean;
  weight: Weight;
  /** Timestamp of the last level change; only results after it count for auto-levelling. */
  since: number;
}

export interface TypeStats {
  played: number;
  solved: number;
  failed: number;
  skipped: number;
  /** Total time spent on solved puzzles (ms). */
  time: number;
  best: Partial<Record<Difficulty, number>>;
  recent: Result[];
  /** Experience earned in this game (profiles from before XP get 10 per past solve). */
  xp?: number;
  /** Day (`dayKey`) of the last solve, for the first-of-the-day bonus. */
  day?: string;
}

export interface Profile {
  v: 1;
  name: string;
  created: number;
  theme: Theme;
  /** Absent = Neo. */
  style?: Style;
  autoAdvance: boolean;
  /** Shape symbols on colour-coded pieces (see core/symbols.ts). */
  symbols?: boolean;
  /** Zen mode: no timer, mistakes, lives, streak or XP on screen, and lives never run out. */
  zen?: boolean;
  startLevel: Difficulty;
  types: Record<string, TypePrefs>;
  stats: Record<string, TypeStats>;
  /** solved count per local day (YYYY-MM-DD) */
  days: Record<string, number>;
  /** Daily challenges by calendar date (YYYY-MM-DD). */
  daily: Record<string, DailyDay>;
  /** Puzzles whose off-by-default was already applied, so turning one back on sticks. */
  offApplied?: string[];
  /**
   * XP earned per local day (`dayKey`) per game, for the progress charts. Profiles from before XP get
   * their recent solves (the last 30 per game) filled in at 10 XP each, matching the starting XP.
   */
  xpDays?: Record<string, Record<string, number>>;
}

const KEY = 'puzzle-feed:v1';

function fresh(): Profile {
  return {
    v: 1,
    name: '',
    created: Date.now(),
    theme: 'system',
    autoAdvance: true,
    startLevel: 1,
    types: {},
    stats: {},
    days: {},
    daily: {},
  };
}

function load(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && p.v === 1) return { ...fresh(), ...p };
    }
  } catch {
    /* corrupt storage: start over */
  }
  return fresh();
}

let profile = load();

const defaultOff = new Set<string>();

/** Switch these puzzles off in the feed, once per profile: a player who turns one back on keeps it. */
export function setDefaultOff(ids: string[]) {
  for (const id of ids) defaultOff.add(id);
  applyDefaultOff();
}

function applyDefaultOff() {
  const done = (profile.offApplied ??= []);
  let changed = false;
  for (const id of defaultOff) {
    if (done.includes(id)) continue;
    prefs(id).weight = 0;
    done.push(id);
    changed = true;
  }
  if (changed) save();
}

type Listener = (kind: 'level' | 'weight' | 'profile' | 'record', id?: string) => void;
const listeners = new Set<Listener>();
export const onChange = (fn: Listener) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const emit: Listener = (kind, id) => listeners.forEach((fn) => fn(kind, id));

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* quota / private mode: keep in memory */
  }
}

export const getProfile = () => profile;

export function update(patch: Partial<Pick<Profile, 'name' | 'theme' | 'style' | 'autoAdvance' | 'symbols' | 'zen' | 'startLevel'>>) {
  Object.assign(profile, patch);
  save();
  emit('profile');
}

export function prefs(id: string): TypePrefs {
  return (profile.types[id] ??= { level: profile.startLevel, manual: false, weight: 2, since: Date.now() });
}

export function stats(id: string): TypeStats {
  const s = (profile.stats[id] ??= { played: 0, solved: 0, failed: 0, skipped: 0, time: 0, best: {}, recent: [] });
  s.xp ??= s.solved * 10;
  return s;
}

/** XP earned per day: one game's, or every game's (`id` omitted). Days without XP are absent. */
export function xpByDay(id?: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const [day, games] of Object.entries(xpDays())) {
    const v = id ? (games[id] ?? 0) : Object.values(games).reduce((a, b) => a + b, 0);
    if (v) out.set(day, v);
  }
  return out;
}

function xpDays() {
  if (!profile.xpDays) {
    const d: Record<string, Record<string, number>> = {};
    for (const [id, s] of Object.entries(profile.stats))
      for (const r of s.recent) {
        if (r.o !== 'solved') continue;
        const g = (d[dayKey(r.at)] ??= {});
        g[id] = (g[id] ?? 0) + 10;
      }
    profile.xpDays = d;
  }
  return profile.xpDays;
}

/** XP across every game. */
export function totalXp(): number {
  let n = 0;
  for (const id in profile.stats) n += stats(id).xp!;
  return n;
}

/** Set a fixed level (manual) or hand control back to auto-levelling. */
export function setLevel(id: string, level: Difficulty | 'auto') {
  const p = prefs(id);
  if (level === 'auto') {
    p.manual = false;
  } else {
    p.manual = true;
    if (p.level !== level) p.since = Date.now();
    p.level = level;
  }
  save();
  emit('level', id);
}

export function setWeight(id: string, w: Weight) {
  prefs(id).weight = w;
  save();
  emit('weight', id);
}

export function resetAllToAuto() {
  for (const p of Object.values(profile.types)) p.manual = false;
  save();
  emit('level');
}

/** A "day" for streaks and the activity chart starts at 4 am, so a late-night session counts as one day. */
const DAY_START_HOURS = 4;
export const dayKey = (t = Date.now()) => new Date(t - DAY_START_HOURS * 3_600_000).toLocaleDateString('en-CA');

export interface RecordOutcome {
  levelChange?: { from: Difficulty; to: Difficulty };
  /** Beat the previous best at this level (by at least a second). */
  best?: boolean;
  /** Best time at this level before this result, if any. */
  prevBest?: number | undefined;
  /** XP earned by a solve. */
  xp?: XpOutcome;
}

/**
 * Record a finished puzzle and run auto-levelling.
 * Level goes up after 3 clean, unhinted solves within par (or 2 very fast flawless ones) at the current level,
 * and down after 2 failures/skips in a row. Manual levels, shared (`sh`) and daily (`dy`) puzzles never move it.
 */
export function record(id: string, r: Omit<Result, 'at'>, parMs: number): RecordOutcome {
  const s = stats(id);
  const p = prefs(id);
  const res: Result = { ...r, at: Date.now() };
  const out: RecordOutcome = {};

  s.played++;
  if (r.o === 'solved') {
    s.solved++;
    s.time += r.ms;
    const prev = s.best[r.d];
    out.prevBest = prev;
    if (prev == null || r.ms < prev) {
      s.best[r.d] = r.ms;
      out.best = prev != null && prev - r.ms >= 1000; // only celebrate a real improvement
    }
    const k = dayKey();
    profile.days[k] = (profile.days[k] ?? 0) + 1;
    const gains = xpGains({
      d: r.d,
      m: r.m,
      hn: r.hn ?? 0,
      ms: r.ms,
      parMs,
      first: prev == null,
      best: !!out.best,
      daily: !!r.dy,
      gameToday: s.day !== k,
      today: profile.days[k],
    });
    s.day = k;
    const gained = gains.reduce((a, g) => a + g.xp, 0);
    const before = { game: s.xp!, player: totalXp() };
    s.xp! += gained;
    const day = (xpDays()[k] ??= {});
    day[id] = (day[id] ?? 0) + gained;
    out.xp = {
      gains,
      total: gained,
      game: { before: before.game, after: s.xp! },
      player: { before: before.player, after: before.player + gained },
    };
  } else if (r.o === 'failed') s.failed++;
  else s.skipped++;

  s.recent.push(res);
  if (s.recent.length > 30) s.recent.splice(0, s.recent.length - 30);

  if (!p.manual && !r.sh && !r.dy) {
    const rel = s.recent.filter((x) => x.d === p.level && x.at >= p.since && !x.sh && !x.dy);
    const last3 = rel.slice(-3);
    const last2 = rel.slice(-2);
    const good = (x: Result) => x.o === 'solved' && x.ms <= parMs && x.m <= 1 && !x.hn;
    const great = (x: Result) => x.o === 'solved' && x.ms <= parMs * 0.5 && x.m === 0 && !x.hn;
    let to = p.level;
    if (p.level < 5 && ((last3.length === 3 && last3.every(good)) || (last2.length === 2 && last2.every(great)))) {
      to = (p.level + 1) as Difficulty;
    } else if (p.level > 1 && last2.length === 2 && last2.every((x) => x.o !== 'solved')) {
      to = (p.level - 1) as Difficulty;
    }
    if (to !== p.level) {
      out.levelChange = { from: p.level, to };
      p.level = to;
      p.since = Date.now();
    }
  }
  save();
  if (out.levelChange) emit('level', id);
  emit('record', id);
  return out;
}

/** The stored daily list for `date` at `level`; `make` builds (and stores) it the first time. */
export function dailyList(date: string, level: Difficulty, make: () => { id: string; seed: number }[]): DailyEntry[] {
  const day = (profile.daily[date] ??= {});
  if (!day[level]) {
    day[level] = make().map(({ id, seed }) => ({ id, seed }));
    save();
  }
  return day[level];
}

/** Record the end of an attempt at a daily puzzle. A solve sticks; later attempts don't overwrite it. */
export function recordDaily(date: string, level: Difficulty, index: number, o: 'solved' | 'failed' | 'skipped', ms: number, m: number) {
  const e = profile.daily[date]?.[level]?.[index];
  if (!e) return;
  e.tries = (e.tries ?? 0) + 1;
  if (e.o !== 'solved') {
    if (o === 'solved') Object.assign(e, { o, ms, m, at: Date.now() });
    else e.o = 'failed';
  }
  save();
  emit('record');
}

export function dayStreak(): number {
  const d = new Date();
  if (!profile.days[dayKey(d.getTime())]) d.setDate(d.getDate() - 1);
  let n = 0;
  while (profile.days[dayKey(d.getTime())]) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function exportProfile(): string {
  return JSON.stringify(profile, null, 2);
}

export function importProfile(json: string) {
  const p = JSON.parse(json);
  if (!p || p.v !== 1 || typeof p.types !== 'object' || typeof p.stats !== 'object') throw new Error('Not a puzzle feed profile');
  profile = { ...fresh(), ...p };
  applyDefaultOff();
  save();
  emit('profile');
  emit('level');
}

export function resetProfile() {
  profile = fresh();
  applyDefaultOff();
  save();
  emit('profile');
  emit('level');
}
