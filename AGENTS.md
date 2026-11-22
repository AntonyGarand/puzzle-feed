# Agent notes

- Read `README.md` (commands, layout) and `docs/ADDING_GAMES.md` (game contract, i18n, tutorials) before changing code.
- `npm run check` must pass before committing. Run `npm run fmt` after editing; don't hand-format.
- One game per folder, `src/games/<id>/index.ts` (auto-discovered: don't add a registry entry). Its pure logic goes next to it (`gen.ts`, `rules.ts`), tested in `test/<id>.test.ts`. Engines shared by 2+ games go in `src/kits/<name>/`.
- Layers (lint-enforced): `src/core` has no rendering and imports no other layer; `src/ui` is generic DOM building blocks; `src/app` is the shell (feed, nav, card); games never import each other or the app.
- Tests mount games with `mountGame()` from `test/support/mount.ts`; don't hand-write a `PuzzleCtx`.
- All randomness comes from `ctx.rng` (resume regenerates from the seed). All user-visible text goes through `L(en, fr)`, written in Québec French with "vous".
- Static site on GitHub Pages (puzzle.garand.dev). Don't introduce a backend or server hosting.
