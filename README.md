# puzzle feed

An endless, scroll-snapping feed of short puzzles: 59 games in English and Québec French. It's a static site with no backend; your profile, stats, preferences and unfinished games live in `localStorage`.

**Play:** https://puzzle.garand.dev — installable, and works fully offline once loaded (it's a PWA; a banner offers new versions).

## Development

The toolchain is pinned in [`mise.toml`](mise.toml) (Node 24).

```sh
mise install          # once: installs the pinned Node
npm ci
npm run dev           # dev server on http://localhost:5180 (also on your LAN)
npm run check         # everything CI runs: fmt:check, lint, typecheck, knip, test
```

| Command                             | What it does                                                                                          |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `npm run dev` / `build` / `preview` | Vite dev server, production build into `dist/`, preview of the build                                  |
| `npm run fmt` / `fmt:check`         | Format with [oxfmt](https://oxc.rs)                                                                   |
| `npm run lint` / `lint:fix`         | Lint with [oxlint](https://oxc.rs) (warnings fail)                                                    |
| `npm run typecheck`                 | Type-check with [tsrs](https://github.com/oxc-project/tsrs), a Rust port of the TypeScript 7 compiler |
| `npm run knip`                      | Unused files, exports and dependencies                                                                |
| `npm test` / `test:watch`           | Vitest: generation speed, resume round-trip, i18n, auto-levelling                                     |
| `npm run e2e:audit`                 | Plays games in Chrome against the running dev server                                                  |
| `npm run e2e:shots`                 | Screenshots every game into `shots/` (`IDS=`, `LEVELS=`, `LOCALE=fr`, `HELP=1`, `VP=mobile,desktop`)  |
| `npm run dict`                      | Rebuilds the word dictionaries from the npm word lists                                                |

The same commands are available as mise tasks (`mise run check`, `mise run fix`, …).

**CI and deploy:** pull requests run `npm run check` and a build (`.github/workflows/ci.yml`). Pushes to `main` run the same check, then deploy `dist/` to GitHub Pages (`deploy.yml`). The custom domain is set by `public/CNAME`. `puzzles.garand.dev` redirects here from the separate [puzzles-redirect](https://github.com/AntonyGarand/puzzles-redirect) repo.

## Layout

```
src/
  main.ts            app shell: tabs, routing (#/, #/daily, #/daily/<level>/<n>, #/games, #/game/<id>, #/play/<id>, #/s/<share code>, #/stats, #/settings)
  styles.css         design tokens + shared components (neo-brutalist)
  core/              feed, card, store (profile/stats/auto-levelling), saves, i18n, help dialog, ui helpers
  pages/             Games, single-game view, Profile, Settings
  puzzles/<id>.ts    one game per file, auto-registered (see docs/ADDING_GAMES.md)
  puzzles/*kit/      shared engines: sudokukit, logickit, pathkit, movekit, cardkit, chesskit, wordkit
test/                vitest suites (happy-dom)
scripts/             Playwright audit + screenshot tools (use your installed Chrome)
```

## Games

There are 59 games in seven categories (`src/core/categories.ts`):

- **Logic:** Sudoku, Jigsaw Sudoku, Killer Sudoku, Cross Sums, Unequal, Skyscrapers, Math Cages, Eclipse, Queens, Stars, Tents, Tiles, Mines, Bridges, Nonogram, Mosaic, Light Up, Singles, Dominoes, Lights, Code Breaker, Galaxies, Fill, Sightlines, Haunted, Black Box, Hidden rule
- **Paths & links:** Pipes, Connect, Beehive, Tracks, Trail, Loop, Pearls, Untangle, Maze
- **Numbers:** Target, Guess, 2048
- **Words:** Anagram, Word Guess, Hunt, Tower (English and French word lists)
- **Moves:** Slide, Unblock, Push, Gems, Arrange, Blocks, Flood, Pegs, Collapse
- **Cards & chess:** Solitaire, FreeCell, Spider, Pyramid, Chess (mate in 1 or 2)
- **Memory & eyes:** Memory, Pairs

Every game is generated from a seed, has five levels (Easy to Master) and a how-to-play tutorial behind its "?" button.

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

See [docs/ADDING_GAMES.md](docs/ADDING_GAMES.md). Any `src/puzzles/<id>.ts` that exports a `PuzzleDef` is registered automatically. Generate everything from `ctx.rng`, implement `snapshot()`/`ctx.saved` for resume, use the shared UI building blocks, and write every string with `L(en, fr)`.
