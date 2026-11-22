// Static checks for the consistency rules in docs/ADDING_GAMES.md, so every game keeps the same
// actions, look and feel as new games are added.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Games and the engines they share: everything that renders inside a card.
const ROOT = join(__dirname, '..', 'src');
const DIRS = ['games', 'kits'].map((d) => join(ROOT, d));

function walk(dir: string, ext: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p, ext) : p.endsWith(ext) ? [p] : [];
  });
}
const rel = (p: string) => relative(ROOT, p).replaceAll('\\', '/');
const TS = DIRS.flatMap((d) => walk(d, '.ts'));
const CSS = DIRS.flatMap((d) => walk(d, '.css'));

/** Every match of `re` in the files, as "file:line  text". */
function offenders(files: string[], re: RegExp, allow: (file: string, line: string) => boolean = () => false) {
  const out: string[] = [];
  for (const f of files) {
    readFileSync(f, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (re.test(line) && !allow(rel(f), line)) out.push(`${rel(f)}:${i + 1}  ${line.trim()}`);
      });
  }
  return out;
}

/** Split a selector list on its top-level commas (not the ones inside `:is()` / `:not()`). */
function splitTop(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of list) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  return [...out, cur];
}

/** Top-level selectors of a stylesheet (outside @keyframes), with their line numbers. */
function selectors(css: string): { sel: string; line: number }[] {
  const out: { sel: string; line: number }[] = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  const stack: string[] = [];
  let buf = '';
  let line = 1;
  let start = 1;
  for (const ch of text) {
    if (ch === '{') {
      const pre = buf.trim();
      if (pre.startsWith('@')) stack.push(pre.includes('keyframes') ? 'kf' : 'at');
      else {
        if (!stack.includes('kf')) for (const s of splitTop(pre)) out.push({ sel: s.trim(), line: start });
        stack.push('rule');
      }
      buf = '';
    } else if (ch === '}') {
      stack.pop();
      buf = '';
    } else {
      if (!buf.trim() && ch.trim()) start = line;
      buf += ch;
    }
    if (ch === '\n') line++;
  }
  return out;
}

describe('consistency rules', () => {
  it('footer buttons use undoBtn / restartBtn / clearBtn, never hand-written labels', () => {
    expect(offenders(TS, /btn\(\s*L\(\s*'(Undo|Restart|Reset|Clear)'/)).toEqual([]);
  });

  it('no Math.random in games (resume regenerates from the seed)', () => {
    expect(offenders(TS, /Math\.random/)).toEqual([]);
  });

  it('every puzzle stylesheet rule is scoped to its game', () => {
    // Elements that live outside the card (drag ghosts appended to <body>) are the only exception.
    const OUTSIDE = new Set(['.arr-ghost']);
    const bad: string[] = [];
    for (const f of CSS) {
      for (const { sel, line } of selectors(readFileSync(f, 'utf8'))) {
        const ok =
          /^(:root[^ ]* )?(\.card[\w.-]*)?\[data-puzzle/.test(sel) ||
          /^(\.card[\w.-]*)?:is\(\[data-puzzle/.test(sel) ||
          /^(from|to|\d+%)$/.test(sel) ||
          [...OUTSIDE].some((o) => sel.startsWith(o));
        if (!ok) bad.push(`${rel(f)}:${line}  ${sel}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('puzzle stylesheets use colour tokens, not literal colours', () => {
    // Declarations only (comments may say "black" and "white"); `white-space` and `black-box` aren't colours.
    const colour = /:[^;{]*(#[0-9a-fA-F]{3,8}\b|\b(rgb|hsl)a?\(|(?<![\w-])(white|black)(?![\w-]))/;
    const comment = (_f: string, line: string) => /^\s*(\/\*|\*)/.test(line);
    expect(offenders(CSS, colour, comment)).toEqual([]);
  });
});
