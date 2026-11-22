// @vitest-environment happy-dom
import { afterAll, describe, expect, it } from 'vitest';
import { _setLocaleForTests, type Locale } from '../src/core/i18n';
import { PUZZLES } from '../src/games';

afterAll(() => _setLocaleForTests('en'));

describe.each(['en', 'fr'] as Locale[])('locale %s', (loc) => {
  it.each(PUZZLES.map((p) => [p.id, p] as const))('%s has a name, short rules and a tutorial', (_id, def) => {
    _setLocaleForTests(loc);
    expect(def.name.length).toBeGreaterThan(0);
    expect(def.rules.length, def.rules).toBeLessThanOrEqual(60);
    const help = def.help?.();
    expect(help, 'help() missing').toBeTruthy();
    expect(help!.goal.length).toBeGreaterThan(10);
    expect(help!.steps.length).toBeGreaterThanOrEqual(3);
  });

  it('translates names and rules (French differs from English for most games)', () => {
    _setLocaleForTests('en');
    const en = PUZZLES.map((p) => p.rules);
    _setLocaleForTests('fr');
    const fr = PUZZLES.map((p) => p.rules);
    _setLocaleForTests(loc);
    const same = en.filter((r, i) => r === fr[i]);
    expect(same, 'untranslated rules').toEqual([]);
  });
});
