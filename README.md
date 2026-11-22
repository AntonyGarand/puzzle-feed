# puzzle feed

An endless, scroll-snapping feed of short puzzles: 80 games in English and Québec French. It's a static site with no backend; your profile, stats, preferences and unfinished games live in `localStorage`.

**Play:** https://puzzle.garand.dev — installable, and works fully offline once loaded (it's a PWA; a banner offers new versions).

## Development

The toolchain is pinned in [`mise.toml`](mise.toml) (Node 24).

```sh
mise install          # once: installs the pinned Node
npm ci
npm run dev           # dev server on http://localhost:5180 (also on your LAN)
npm run check         # everything CI runs: fmt:check, lint, typecheck, knip, test
```

| Command                             | What it does                                                                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev` / `build` / `preview` | Vite dev server, production build into `dist/`, preview of the build                                                                           |
| `npm run fmt` / `fmt:check`         | Format with [oxfmt](https://oxc.rs)                                                                                                            |
| `npm run lint` / `lint:fix`         | Lint with [oxlint](https://oxc.rs), including type-aware rules (warnings fail)                                                                 |
| `npm run typecheck`                 | Type-check with [tsrs](https://github.com/oxc-project/tsrs), a Rust port of the TypeScript 7 compiler                                          |
| `npm run knip`                      | Unused files, exports and dependencies                                                                                                         |
| `npm test` / `test:watch`           | Vitest: generation speed, resume round-trip, i18n, auto-levelling, consistency rules; then the hint-button suites (`test/hints*`) on their own |
| `npm run test:coverage`             | The same suites minus the hint buttons, with v8 coverage of `src/` (HTML report in `coverage/`)                                                |
| `npm run e2e:audit`                 | Plays games in Chrome against the running dev server                                                                                           |
| `npm run e2e:shots`                 | Screenshots every game into `shots/` (`IDS=`, `LEVELS=`, `LOCALE=fr`, `HELP=1`, `VP=mobile,desktop`)                                           |
| `npm run dict`                      | Rebuilds the word dictionaries from the npm word lists                                                                                         |
| `node scripts/og-image.mjs`         | Re-renders `public/og.png`, the link-preview image (needs Chrome installed)                                                                    |

The same commands are available as mise tasks (`mise run check`, `mise run fix`, …).

**CI and deploy:** pull requests run `npm run check` and a build (`.github/workflows/ci.yml`), plus a coverage report on the run summary. Pushes to `main` run the same check, then deploy `dist/` to GitHub Pages (`deploy.yml`). The custom domain is set by `public/CNAME`. `puzzles.garand.dev` redirects here from the separate [puzzles-redirect](https://github.com/AntonyGarand/puzzles-redirect) repo.

## Layout

```
src/
  main.ts            app shell: tabs, path routing (/, /daily, /daily/<level>/<n>, /games, /game/<id>, /play/<id>, /s/<share code>, /stats, /settings; old #/ links redirect)
  core/              logic and storage, no rendering: types, rng, i18n, store (profile/stats/auto-levelling), saves, daily, xp, share codes
  ui/                DOM building blocks: h/s/btn/pad (dom.ts), sheets, help dialog, win/lost panels, confetti, hint overlay, share widget
  app/               the shell: feed, path routing (nav.ts), update banner, and card/ (one puzzle card: clock, undo history, hint popup, settings sheet, result)
  pages/             Games, single-game view, Daily, Profile, Settings
  games/<id>/        one game per folder: index.ts (auto-registered, see docs/ADDING_GAMES.md), style.css, and its own pure logic (gen.ts, rules.ts…)
  kits/<name>/       engines shared by two or more games (sudoku, latin, logic, grid, path, move, push, card, chess, word, sweep, …)
  styles/            design tokens and shared components (neo-brutalist), imported in cascade order by index.css
test/                vitest suites (happy-dom); test/support/ has the shared game mount, board view and resume check
scripts/             Playwright audit + screenshot tools (use your installed Chrome)
```

Lint enforces the layers: `core` never imports `ui`, `app`, `games` or `kits`; `ui` never imports `app`, `games` or `kits`; kits never import games or the app; a game never imports another game or the app. Files stay under 600 lines of code.

## Games

There are 80 games in seven categories (`src/core/categories.ts`). The 22 marked _(opt-in)_ start switched off in the mixed feed; turn them on in Settings, or play them from the Games tab.

- **Logic:** Sudoku, Jigsaw Sudoku, Killer Sudoku, Cross Sums, Unequal, Skyscrapers, Math Cages, Eclipse, Queens, Stars, Tents, Tiles, Mines, Bridges, Nonogram, Mosaic, Light Up, Singles, Dominoes, Lights, Code Breaker, Galaxies, Fill, Sightlines, Haunted, Black Box; _(opt-in)_ Busy Week, Hidden Rule, Logic Grid, Minefield Mower, Shape Mines, Tetrominoes
- **Paths & links:** Pipes, Connect, Beehive, Tracks, Trail, Loop, Pearls, Untangle, Maze; _(opt-in)_ Mow, Zigzag
- **Numbers:** Target, Merge; _(opt-in)_ Guess, Factory
- **Words:** Anagram, Word Guess, Hunt, Tower; _(opt-in)_ Word Cover
- **Moves:** Slide, Unblock, Push, Gems, Arrange, Arrows, Blocks, Flood, Pegs, Collapse; _(opt-in)_ Copy Paste, Counted Push, Echo, Ice Push, Tether, Tilt, Wall Rush, Worms, Wrap Push
- **Cards & chess:** Solitaire, FreeCell, Spider, Pyramid, Chess (mate in 1 or 2); _(opt-in)_ Capture Chess, Ladders
- **Memory & eyes:** Memory, Pairs

Every game is generated from a seed, has five levels (Easy to Master), a how-to-play tutorial behind its "?" button and an in-game hint button. All games share the same controls, penalties and rewards (see [docs/ADDING_GAMES.md](docs/ADDING_GAMES.md#consistency-rules-actions-punishments-rewards)).

**Word data:**

- **English:** SCOWL, via `wordlist-english`.
- **French:** validation from `an-array-of-french-words`, frequencies from `@zxcvbn-ts/language-fr` (OpenSubtitles, ODC-BY), filtered with `french-badwords-list`.

Each language's dictionary is a lazily loaded chunk.

## Daily challenges

The **Daily** tab has one list of 5 puzzles per difficulty, new every day at local midnight. Lists come from a preset seed mixed with the date and level (`src/core/daily.ts`), so everyone gets the same puzzles on the same day; the first time a player opens a list it's stored in their profile, so it stays put even if a new version adds games. Each puzzle can be retried until it's solved. Daily results count in the regular stats but never in auto-levelling. A day counts toward the daily streak when at least one list is complete; the Profile tab shows streaks and completed lists per difficulty.

## Difficulty

Each game starts on **Auto**:

- **Up a level** after 3 clean solves within par time, or 2 flawless solves in under half of par.
- **Down a level** after 2 misses in a row, where a miss is a failure or a skip.

If you pick a level yourself (on the card or in Settings), it's locked and auto-levelling stops for that game. Choose _Auto_ to turn it back on.

## Adding a game

See [docs/ADDING_GAMES.md](docs/ADDING_GAMES.md). Any `src/games/<id>/index.ts` that exports a `PuzzleDef` is registered automatically. Generate everything from `ctx.rng`, implement `snapshot()`/`ctx.saved` for resume, use the shared UI building blocks, and write every string with `L(en, fr)`.
