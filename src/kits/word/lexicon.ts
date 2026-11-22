// Shared word data for the word games, per locale (English / Québec French).
// - Common words are bundled; always available, used for generation.
//     en: SCOWL 10–20 + the curated anagram list (words.ts)
//     fr: the 6000 most frequent words (OpenSubtitles), split into answers and other forms (common-fr.ts)
// - The full validation dictionary of the current locale (en ~40k, fr ~85k words) is a lazily loaded
//   chunk, fetched at module init for the page's locale (or on first use for the other one, in tests).
// All words are lowercase a–z: French is folded (é→e, ç→c, œ→oe), see fold().
import { wordLocale, type Locale } from '../../core/i18n';
import { WORDS } from './words';
import { COMMON_RAW } from './common';
import { ANSWERS_FR, OTHER_FR } from './common-fr';

/** Lowercase and strip diacritics: "Œuvre" → "oeuvre", "Ç" → "c". */
export const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

/** A single typed letter folded to a–z ("É" → "e"), or null. */
export function letterKey(key: string): string | null {
  if (key.length !== 1) return null;
  const f = fold(key);
  return /^[a-z]$/.test(f) ? f : null;
}

const split = (raw: string) => raw.split(/\s+/).filter(Boolean);

/** Words that are valid but shouldn't be picked as answers / shown as targets (English; French is pre-filtered). */
const NOT_ANSWERS = new Set(
  `abort abortion alcohol ass beer bloody bomb bombs booze bra butt cancer corpse crap crime damn dead deadly death devil die died dies
drug drugs drunk evil gay gun guns hell kill killed killer kills lesbian murder naked nazi nude penis pee poop racism racist rape sex
sexual sexy sin slave slaves suicide sexism terror toilet urine victim violent virgin war wars weapon whisky wine condom fat ugly stupid
idiot dumb fool hate drown poison prison shot shoot stab grave tomb coffin bury bully porn pot puke vomit corpse thug thief rob bomb cop
jew god pray lord church bible islam pope arab sue gin rum`.split(/\s+/),
);

interface Lang {
  common: Set<string>;
  /** Answer filter (base form, family-friendly). */
  isAnswer: (w: string) => boolean;
  answers: Map<number, string[]>;
  ofLength: Map<number, string[]>;
  dict: Set<string> | null;
  failed: boolean;
  started: boolean;
  waiters: (() => void)[];
  load: () => Promise<{ default: string }>;
}

function english(): Lang {
  const common = new Set<string>();
  for (const w of split(COMMON_RAW)) common.add(w);
  for (const list of Object.values(WORDS)) for (const w of list) if (/^[a-z]+$/.test(w)) common.add(w);
  const has = (s: string) => s.length >= 3 && common.has(s);
  const isInflected = (w: string) => {
    if (w.endsWith('s') && !w.endsWith('ss') && (has(w.slice(0, -1)) || (w.endsWith('es') && has(w.slice(0, -2))))) return true;
    if (w.endsWith('ed') && (has(w.slice(0, -2)) || has(w.slice(0, -1)) || (w[w.length - 3] === w[w.length - 4] && has(w.slice(0, -3)))))
      return true;
    if (
      w.endsWith('ing') &&
      (has(w.slice(0, -3)) || has(w.slice(0, -3) + 'e') || (w[w.length - 4] === w[w.length - 5] && has(w.slice(0, -4))))
    )
      return true;
    return false;
  };
  return {
    common,
    isAnswer: (w) => !NOT_ANSWERS.has(w) && !isInflected(w),
    answers: new Map(),
    ofLength: new Map(),
    dict: null,
    failed: false,
    started: false,
    waiters: [],
    load: () => import('./dict.txt?raw'),
  };
}

function french(): Lang {
  const answerSet = new Set(split(ANSWERS_FR));
  const common = new Set([...answerSet, ...split(OTHER_FR)]);
  return {
    common,
    isAnswer: (w) => answerSet.has(w),
    answers: new Map(),
    ofLength: new Map(),
    dict: null,
    failed: false,
    started: false,
    waiters: [],
    load: () => import('./dict-fr.txt?raw'),
  };
}

const langs: Partial<Record<Locale, Lang>> = {};
const lang = (l: Locale = wordLocale()): Lang => (langs[l] ??= l === 'fr' ? french() : english());

/** The bundled common words of the current locale. */
export const commonSet = () => lang().common;

/** Common, family-friendly base-form words of a given length, sorted (stable for seeded picks). */
export function answers(len: number): string[] {
  const L = lang();
  let a = L.answers.get(len);
  if (!a) {
    a = [...L.common].filter((w) => w.length === len && L.isAnswer(w)).sort();
    L.answers.set(len, a);
  }
  return a;
}

/** Every common word of a given length (inflections included), sorted. */
export function commonOfLength(len: number): string[] {
  const L = lang();
  let a = L.ofLength.get(len);
  if (!a) {
    a = [...L.common].filter((w) => w.length === len).sort();
    L.ofLength.set(len, a);
  }
  return a;
}

// ---------- full dictionary (lazy chunk) ----------

function decode(packed: string): Set<string> {
  const out = new Set<string>();
  let prev = '';
  const re = /(\d)([a-z]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(packed))) {
    prev = prev.slice(0, Number(m[1])) + m[2];
    out.add(prev);
  }
  return out;
}

function ensure(L: Lang) {
  if (L.started) return;
  L.started = true;
  L.load()
    .then((m) => {
      L.dict = decode(m.default);
    })
    .catch(() => {
      L.failed = true;
    })
    .finally(() => {
      for (const f of L.waiters.splice(0)) f();
    });
}
ensure(lang());

/** True once the full dictionary is usable (or failed to load and we fall back to the common list). */
export const dictReady = () => {
  const L = lang();
  ensure(L);
  return L.dict !== null || L.failed;
};

/** Run `fn` once the dictionary is ready (immediately if it already is). */
export function whenDict(fn: () => void) {
  const L = lang();
  ensure(L);
  if (L.dict !== null || L.failed) fn();
  else L.waiters.push(fn);
}

/** true / false, or null while the dictionary is still loading and the word isn't a common one. */
export function isWord(w: string): boolean | null {
  const L = lang();
  if (L.common.has(w)) return true;
  ensure(L);
  if (L.dict) return L.dict.has(w);
  return L.failed ? false : null;
}
