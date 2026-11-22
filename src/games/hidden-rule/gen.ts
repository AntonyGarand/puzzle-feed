import { L } from '../../core/i18n';
import type { Rng } from '../../core/rng';
import { byLevel, type Difficulty } from '../../core/types';
import { SHAPE_EN, SHAPE_EN_PL, SHAPE_FR, SHAPE_FR_PL } from '../../kits/shape/shapes';

/** A 3×3 specimen, row by row: -1 for an empty cell, else colour * 3 + shape. */
export type Spec = number[];

/** A hidden rule: a predicate on specimens and its description as a clause ("there is at least one circle"). */
interface Rule {
  /** Family: compound rules never join two rules of the same family. */
  fam: string;
  tier: number;
  /** Bit mask of the colours (bits 0-3) and shapes (bits 4-6) the rule names. */
  about: number;
  test(sp: Spec): boolean;
  /** Localised clause, lower-case, no final period. */
  say(): string;
}

/** Palette indices the game draws from (orange, blue, green, yellow): clearly distinct and easy to name. */
const PAL = [0, 1, 2, 3];
const COL_EN = ['orange', 'blue', 'green', 'yellow'];
const COL_FR = ['orange', 'bleue', 'verte', 'jaune'];
const COL_FR_PL = ['orange', 'bleues', 'vertes', 'jaunes'];

/** English indefinite article + word. */
const an = (w: string) => `${/^[aeiou]/.test(w) ? 'an' : 'a'} ${w}`;
const colOf = (v: number) => (v / 3) | 0;
const shpOf = (v: number) => v % 3;
const count = (sp: Spec, f: (v: number) => boolean) => sp.reduce((n, v) => n + (v >= 0 && f(v) ? 1 : 0), 0);
const filled = (sp: Spec) => count(sp, () => true);
const kinds = (sp: Spec, f: (v: number) => number) => new Set(sp.filter((v) => v >= 0).map(f)).size;
/** Orthogonal neighbour pairs of the 3×3 grid. */
const ADJ: [number, number][] = [];
for (let i = 0; i < 9; i++) {
  if (i % 3 < 2) ADJ.push([i, i + 1]);
  if (i < 6) ADJ.push([i, i + 3]);
}

/** Every rule instance the game knows, for a palette of `K` colours (local indices → `cols`) and `S` shapes. */
function library(K: number, S: number, cols: number[]): Rule[] {
  const cEn = (c: number) => COL_EN[cols[c]];
  const cFr = (c: number, pl: boolean) => (pl ? COL_FR_PL : COL_FR)[cols[c]];
  const sEn = (k: number, pl: boolean) => (pl ? SHAPE_EN_PL : SHAPE_EN)[k];
  const sFr = (k: number, pl: boolean) => (pl ? SHAPE_FR_PL : SHAPE_FR)[k];
  const out: Rule[] = [];
  const add = (fam: string, tier: number, test: Rule['test'], say: Rule['say'], about = 0) => out.push({ fam, tier, about, test, say });
  const C = [...Array(K).keys()],
    Sh = [...Array(S).keys()];

  // Tier 1: one glance.
  for (const k of Sh)
    add(
      'hasS',
      1,
      (sp) => count(sp, (v) => shpOf(v) === k) > 0,
      () => L(`there is at least one ${sEn(k, false)}`, `il y a au moins un ${sFr(k, false)}`),
      1 << (4 + k),
    );
  for (const c of C)
    add(
      'noC',
      1,
      (sp) => count(sp, (v) => colOf(v) === c) === 0,
      () => L(`there is no ${cEn(c)} shape`, `il n’y a aucune forme ${cFr(c, false)}`),
      1 << c,
    );
  add(
    'ctr',
    1,
    (sp) => sp[4] >= 0,
    () => L('the centre cell is filled', 'la case du centre est occupée'),
  );
  add(
    'monoC',
    1,
    (sp) => kinds(sp, colOf) === 1,
    () => L('all shapes are the same colour', 'toutes les formes sont de la même couleur'),
  );
  add(
    'monoS',
    1,
    (sp) => kinds(sp, shpOf) === 1,
    () => L('all shapes are the same kind', 'toutes les formes sont de la même sorte'),
  );
  for (const c of C)
    add(
      'topC',
      1,
      (sp) => [0, 1, 2].some((i) => sp[i] >= 0 && colOf(sp[i]) === c),
      () => L(`the top row has ${an(cEn(c))} shape`, `la rangée du haut a une forme ${cFr(c, false)}`),
      1 << c,
    );
  add(
    'corner',
    1,
    (sp) => [0, 2, 6, 8].every((i) => sp[i] < 0),
    () => L('all four corners are empty', 'les quatre coins sont vides'),
  );
  add(
    'bot',
    1,
    (sp) => [6, 7, 8].every((i) => sp[i] < 0),
    () => L('the bottom row is empty', 'la rangée du bas est vide'),
  );

  // Tier 2: counting, comparing, layout.
  for (const c of C)
    for (const n of [1, 2])
      add(
        'exC',
        2,
        (sp) => count(sp, (v) => colOf(v) === c) === n,
        () =>
          L(
            `there ${n === 1 ? 'is' : 'are'} exactly ${n} ${cEn(c)} shape${n === 1 ? '' : 's'}`,
            `il y a exactement ${n} forme${n === 1 ? '' : 's'} ${cFr(c, n > 1)}`,
          ),
        1 << c,
      );
  for (const k of Sh)
    for (const n of [1, 2])
      add(
        'exS',
        2,
        (sp) => count(sp, (v) => shpOf(v) === k) === n,
        () => L(`there ${n === 1 ? 'is' : 'are'} exactly ${n} ${sEn(k, n > 1)}`, `il y a exactement ${n} ${sFr(k, n > 1)}`),
        1 << (4 + k),
      );
  for (const n of [3, 4, 5])
    add(
      'tot',
      2,
      (sp) => filled(sp) === n,
      () => L(`there are exactly ${n} shapes`, `il y a exactement ${n} formes`),
    );
  for (const a of C)
    for (const b of C)
      if (a !== b)
        add(
          'moreC',
          2,
          (sp) => count(sp, (v) => colOf(v) === a) > count(sp, (v) => colOf(v) === b),
          () => L(`there are more ${cEn(a)} shapes than ${cEn(b)} ones`, `il y a plus de formes ${cFr(a, true)} que de ${cFr(b, true)}`),
          (1 << a) | (1 << b),
        );
  for (const a of Sh)
    for (const b of Sh)
      if (a !== b)
        add(
          'moreS',
          2,
          (sp) => count(sp, (v) => shpOf(v) === a) > count(sp, (v) => shpOf(v) === b),
          () => L(`there are more ${sEn(a, true)} than ${sEn(b, true)}`, `il y a plus de ${sFr(a, true)} que de ${sFr(b, true)}`),
          (1 << (4 + a)) | (1 << (4 + b)),
        );
  add(
    'rows',
    2,
    (sp) => [0, 3, 6].every((r) => sp[r] >= 0 || sp[r + 1] >= 0 || sp[r + 2] >= 0),
    () => L('every row has a shape', 'chaque rangée a au moins une forme'),
  );
  add(
    'colsF',
    2,
    (sp) => [0, 1, 2].every((c) => sp[c] >= 0 || sp[c + 3] >= 0 || sp[c + 6] >= 0),
    () => L('every column has a shape', 'chaque colonne a au moins une forme'),
  );
  add(
    'mirror',
    2,
    (sp) => [0, 3, 6].every((r) => sp[r] === sp[r + 2]),
    () =>
      L(
        'the left and right columns mirror each other (same shapes, same colours)',
        'les colonnes de gauche et de droite sont symétriques (mêmes formes, mêmes couleurs)',
      ),
  );

  // Tier 3: parity, neighbours, links between colour and shape.
  add(
    'par',
    3,
    (sp) => filled(sp) % 2 === 0,
    () => L('the number of shapes is even', 'le nombre de formes est pair'),
  );
  add(
    'par',
    3,
    (sp) => filled(sp) % 2 === 1,
    () => L('the number of shapes is odd', 'le nombre de formes est impair'),
  );
  add(
    'touch',
    3,
    (sp) => ADJ.every(([a, b]) => sp[a] < 0 || sp[b] < 0 || colOf(sp[a]) !== colOf(sp[b])),
    () => L('no two shapes of the same colour touch side by side', 'deux formes de la même couleur ne se touchent jamais par un côté'),
  );
  for (const c of C)
    for (const k of Sh)
      add(
        'cIsS',
        3,
        (sp) => count(sp, (v) => colOf(v) === c) > 0 && count(sp, (v) => colOf(v) === c && shpOf(v) !== k) === 0,
        () =>
          L(
            `there are ${cEn(c)} shapes, and all of them are ${sEn(k, true)}`,
            `il y a des formes ${cFr(c, true)}, et ce sont toutes des ${sFr(k, true)}`,
          ),
        (1 << c) | (1 << (4 + k)),
      );
  if (K >= 3)
    for (const n of [2, 3])
      add(
        'dist',
        3,
        (sp) => kinds(sp, colOf) === n,
        () => L(`exactly ${n} different colours are used`, `il y a exactement ${n} couleurs différentes`),
      );
  return out;
}

const OPS = ['and', 'or', 'not'] as const;
type Op = (typeof OPS)[number];

function combine(a: Rule, b: Rule, op: Op): Rule {
  const test =
    op === 'and'
      ? (sp: Spec) => a.test(sp) && b.test(sp)
      : op === 'or'
        ? (sp: Spec) => a.test(sp) || b.test(sp)
        : (sp: Spec) => a.test(sp) && !b.test(sp);
  const say = () => {
    const x = a.say(),
      y = b.say();
    if (op === 'and') return L(`${x}, and ${y}`, `${x}, et ${y}`);
    if (op === 'or') return L(`${x}, or ${y} (or both)`, `${x}, ou ${y} (ou les deux)`);
    return L(`${x}, but not if ${y}`, `${x}, mais pas ${y.startsWith('il ') ? `s’${y}` : `si ${y}`}`);
  };
  return { fam: `${a.fam}+${b.fam}`, tier: Math.max(a.tier, b.tier) + 1, about: a.about | b.about, test, say };
}

function randSpec(rng: Rng, K: number, S: number): Spec {
  const sp: Spec = new Array(9).fill(-1);
  const f = rng.int(2, 6);
  for (const i of rng.shuffle([...Array(9).keys()]).slice(0, f)) sp[i] = rng.int(0, K - 1) * 3 + rng.int(0, S - 1);
  return sp;
}

/** Change one thing: a colour, a shape, add, remove or move one piece (2 to 7 pieces). */
function mutate(rng: Rng, sp: Spec, K: number, S: number): Spec {
  const out = [...sp];
  const full = [...Array(9).keys()].filter((i) => sp[i] >= 0);
  const empty = [...Array(9).keys()].filter((i) => sp[i] < 0);
  const i = rng.pick(full);
  switch (rng.int(0, 4)) {
    case 0:
      out[i] = ((colOf(sp[i]) + rng.int(1, K - 1)) % K) * 3 + shpOf(sp[i]);
      break;
    case 1:
      out[i] = colOf(sp[i]) * 3 + ((shpOf(sp[i]) + rng.int(1, Math.max(1, S - 1))) % S);
      break;
    case 2:
      if (full.length > 2) out[i] = -1;
      break;
    case 3:
      if (empty.length && full.length < 7) out[rng.pick(empty)] = rng.int(0, K - 1) * 3 + rng.int(0, S - 1);
      break;
    default:
      if (empty.length) {
        out[rng.pick(empty)] = sp[i];
        out[i] = -1;
      }
  }
  return out;
}

/** A mix of plain random specimens and structured ones (mirrored, one colour, one shape), each with a near-miss twin. */
function pool(rng: Rng, K: number, S: number, size: number): Spec[] {
  const seen = new Set<string>();
  const out: Spec[] = [];
  const push = (sp: Spec) => {
    const k = sp.join();
    if (filled(sp) >= 2 && !seen.has(k)) {
      seen.add(k);
      out.push(sp);
    }
  };
  for (let tries = 0; out.length < size && tries < size * 4; tries++) {
    const sp = randSpec(rng, K, S);
    const kind = rng.next();
    if (kind < 0.16) for (const r of [0, 3, 6]) sp[r + 2] = sp[r];
    else if (kind < 0.28) {
      const c = rng.int(0, K - 1);
      sp.forEach((v, i) => v >= 0 && (sp[i] = c * 3 + shpOf(v)));
    } else if (kind < 0.38) {
      const k = rng.int(0, S - 1);
      sp.forEach((v, i) => v >= 0 && (sp[i] = colOf(v) * 3 + k));
    }
    push(sp);
    const m = mutate(rng, sp, K, S);
    push(m);
    if (rng.chance(0.3)) push(mutate(rng, m, K, S));
  }
  return out;
}

const hamming = (a: Spec, b: Spec) => a.reduce((n, v, i) => n + (v === b[i] ? 0 : 1), 0);

export interface HiddenRule {
  /** Palette index of each local colour. */
  cols: number[];
  rule: Rule;
  pos: Spec[];
  neg: Spec[];
  tests: Spec[];
}

/**
 * Pick a rule and specimens. Examples are chosen greedily so that as few other rules of the library as
 * possible (and, for two-part rules, the nearby combinations) also explain them; tests prefer near-misses
 * that every rule still consistent with the evidence agrees on.
 */
export function genHiddenRule(rng: Rng, d: Difficulty): HiddenRule {
  const K = byLevel(d, [3, 3, 4, 4, 4]);
  const S = byLevel(d, [2, 3, 3, 3, 3]);
  const [nP, nN] = byLevel<[number, number]>(d, [
    [4, 4],
    [4, 4],
    [4, 3],
    [4, 4],
    [3, 4],
  ]);
  const nT = byLevel(d, [4, 5, 6, 6, 7]);
  const cols = rng.shuffle([...PAL]).slice(0, K);
  const lib = library(K, S, cols);
  const P = pool(rng, K, S, 360);
  const n = P.length;
  const evalAll = (r: Rule) => Uint8Array.from(P, (sp) => (r.test(sp) ? 1 : 0));
  const V = lib.map(evalAll);
  const mix = (x: Uint8Array, y: Uint8Array, op: Op) =>
    x.map((p, i) => (op === 'and' ? p & y[i] : op === 'or' ? p | y[i] : p & (1 - y[i])));
  const ones = (v: Uint8Array) => v.reduce((a, b) => a + b, 0);
  const diff = (a: Uint8Array, b: Uint8Array) => a.reduce((s, x, i) => s + (x === b[i] ? 0 : 1), 0);
  const balanced = (v: Uint8Array) => {
    const p = ones(v);
    return p >= Math.max(nP + nT, n * 0.2) && n - p >= Math.max(nN + nT, n * 0.2);
  };
  const compound = d >= 4;
  const eligible = lib
    .map((_, i) => i)
    .filter((i) => {
      const t = lib[i].tier;
      return (d === 1 ? t === 1 : d === 2 ? t <= 2 : d === 3 ? t >= 2 : d === 4 ? t <= 2 : true) && (compound || balanced(V[i]));
    });

  /** Candidate targets: a few tries, keep the one whose examples rule out the most alternatives. */
  interface Try {
    rule: Rule;
    v: Uint8Array;
    alts: { v: Uint8Array; w: number }[];
  }
  const targets: Try[] = [];
  // Two-part rules: mostly “and” / “but not”; “or” is the hardest to spot.
  const wantOp = rng.pick<Op>(['and', 'and', 'not', 'not', 'or']);
  for (let k = 0; k < 400 && targets.length < 4; k++) {
    let rule: Rule, v: Uint8Array;
    const alts: Uint8Array[] = [];
    if (!compound) {
      const i = rng.pick(eligible);
      if (targets.some((t) => t.rule === lib[i])) continue;
      rule = lib[i];
      v = V[i];
    } else {
      const a = rng.pick(eligible),
        b = rng.pick(eligible);
      const A = lib[a],
        B = lib[b];
      // Two halves about different things (no colour or shape named twice), so the sentence reads naturally.
      if (A.fam === B.fam || A.about & B.about || (d === 5 && Math.max(A.tier, B.tier) < 2)) continue;
      const op = k < 300 ? wantOp : rng.pick(OPS);
      v = mix(V[a], V[b], op);
      // Both halves must matter, often.
      if (!balanced(v) || diff(v, V[a]) < n * 0.08 || diff(v, V[b]) < n * 0.08) continue;
      rule = combine(A, B, op);
      for (const o of OPS) if (o !== op) alts.push(mix(V[a], V[b], o));
      for (let x = 0; x < lib.length; x++) {
        if (x === a || x === b) continue;
        if (lib[x].fam !== B.fam) alts.push(mix(V[a], V[x], op));
        if (lib[x].fam !== A.fam && op !== 'not') alts.push(mix(V[x], V[b], op));
      }
    }
    const all = [...V.map((x) => ({ v: x, w: 3 })), ...alts.map((x) => ({ v: x, w: 1 }))].filter((a) => diff(a.v, v) > 0);
    targets.push({ rule, v, alts: all });
  }

  let best: { t: Try; pos: number[]; neg: number[]; alive: Try['alts']; left: number } | null = null;
  for (const t of targets) {
    const used = new Set<number>();
    const pos: number[] = [],
      neg: number[] = [];
    let alive = t.alts;
    const slots = rng.shuffle([...Array<boolean>(nP).fill(true), ...Array<boolean>(nN).fill(false)]);
    for (const want of slots) {
      let pick = -1,
        top = -Infinity;
      for (let i = 0; i < n; i++) {
        if (used.has(i) || (t.v[i] === 1) !== want) continue;
        let sc = rng.next() * 0.8;
        for (const a of alive) if (a.v[i] !== t.v[i]) sc += a.w;
        // Variety within a row, contrast across rows.
        for (const j of want ? pos : neg) if (hamming(P[i], P[j]) <= 1) sc -= 3;
        for (const j of want ? neg : pos) if (hamming(P[i], P[j]) <= 2) sc += 1;
        if (sc > top) {
          top = sc;
          pick = i;
        }
      }
      if (pick < 0) break;
      used.add(pick);
      (want ? pos : neg).push(pick);
      alive = alive.filter((a) => a.v[pick] === t.v[pick]);
    }
    if (pos.length !== nP || neg.length !== nN) continue;
    const left = alive.reduce((s, a) => s + a.w, 0);
    if (!best || left < best.left) best = { t, pos, neg, alive, left };
  }
  if (!best) return fallback(rng, d);

  // Tests: balanced, near-misses of the examples, agreed on by every rule the evidence so far allows.
  const { t, pos, neg } = best;
  let alive = best.alive;
  const used = new Set([...pos, ...neg]);
  const half = nT / 2;
  const wants = rng.shuffle([
    ...Array<boolean>(Math.floor(half)).fill(true),
    ...Array<boolean>(Math.ceil(half) - Math.floor(half)).fill(rng.chance(0.5)),
    ...Array<boolean>(Math.floor(half)).fill(false),
  ]);
  const tests: number[] = [];
  for (const want of wants) {
    let pick = -1,
      top = -Infinity;
    for (let i = 0; i < n; i++) {
      if (used.has(i) || (t.v[i] === 1) !== want) continue;
      let sc = rng.next() * 1.5;
      for (const a of alive) if (a.v[i] !== t.v[i]) sc -= a.w * 4;
      const opp = want ? neg : pos;
      if (opp.some((j) => hamming(P[i], P[j]) <= 2)) sc += d >= 3 ? 3 : 1.5;
      if (sc > top) {
        top = sc;
        pick = i;
      }
    }
    if (pick < 0) break;
    used.add(pick);
    tests.push(pick);
    alive = alive.filter((a) => a.v[pick] === t.v[pick]);
  }
  if (tests.length !== nT) return fallback(rng, d);
  return { cols, rule: t.rule, pos: pos.map((i) => P[i]), neg: neg.map((i) => P[i]), tests: tests.map((i) => P[i]) };
}

/** Never expected in practice: "the centre cell is filled", with hand-built specimens. */
function fallback(rng: Rng, d: Difficulty): HiddenRule {
  const K = byLevel(d, [3, 3, 4, 4, 4]);
  const cols = PAL.slice(0, K);
  const rule = library(K, 2, cols).find((r) => r.fam === 'ctr')!;
  const make = (on: boolean) => {
    for (;;) {
      const sp = randSpec(rng, K, 2);
      if (on && sp[4] < 0) sp[4] = rng.int(0, K - 1) * 3;
      if (!on) sp[4] = -1;
      if (filled(sp) >= 2) return sp;
    }
  };
  const nT = byLevel(d, [4, 5, 6, 6, 7]);
  return {
    cols,
    rule,
    pos: [0, 1, 2, 3].map(() => make(true)),
    neg: [0, 1, 2, 3].map(() => make(false)),
    tests: Array.from({ length: nT }, (_, i) => make(i % 2 === 0)),
  };
}
