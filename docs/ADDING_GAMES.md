# Adding a game

Only turn-based games belong here: check the game against [Which feed?](../README.md#which-feed) first (anything with a clock, things moving on their own, timing or physical skill goes to arcade feed).

Each game is a `PuzzleDef` (see `src/core/types.ts`) in its own folder: `src/games/<id>/index.ts`. Any `index.ts` there that exports a `PuzzleDef` is registered automatically, so there's no list to edit.

## Where code goes

```
src/games/<id>/index.ts   the PuzzleDef: create(), rendering, input, text
src/games/<id>/style.css  the game's styles (scoped, see below)
src/games/<id>/*.ts       this game's pure logic: gen.ts (generator), rules.ts (rules, check/hint reasoning,
                          save parsing), solve.ts… No DOM and no ctx, so tests can call it directly.
src/kits/<name>/          engines shared by two or more games (sudoku, latin, logic, grid, path, move, push,
                          card, chess, word, sweep, …). Code used by one game belongs in that game's folder.
```

Keep `create()` about the board: when it grows past a few hundred lines, move the rules into `rules.ts` (see `week`, `arrange`, `logic-grid`, `capture-chess`) and test them in `test/<id>.test.ts`. Lint enforces the boundaries: a game imports only from `src/core`, `src/ui`, `src/kits` and its own folder (never another game, `src/app` or `src/pages`), and files stay under 600 lines of code.

Read these first:

- `src/core/types.ts`: `PuzzleDef`, `PuzzleCtx`, `PuzzleInstance`, `byLevel`
- `src/ui/dom.ts`: `h` / `s` (DOM/SVG builders), `board()`, `btn()`, `pad()`, `shake()`, `PALETTE`
- `src/core/categories.ts`: category ids
- `src/styles/`: tokens (`tokens.css`) and shared classes (`controls.css`: `.grid`, `.cell` and its states, `.pad`, `.key`, `.btn`, `.big`, `.dots`, `.input`)
- Example games (`src/games/…`): `sudoku` (board, number pad, selection, keyboard), `pipes` (SVG inside cells), `nonogram` (drag painting with pointer events), `maze` (canvas, drag/swipe), `codebreaker` (rows of pegs, palette), `target` (chips, undo/reset controls), `capture-chess` (pure `rules.ts` with its own tests)

## Contract

- `create(ctx)` builds the game inside `ctx.root` and may return a `PuzzleInstance`.
- Call `ctx.touch()` on the first interaction. Call `ctx.mistake()` only for a genuinely wrong move. Call `ctx.solved()` or `ctx.failed()` once. Use `ctx.status(text)` for a short footer line (moves left, counts, …) and `ctx.controls(...buttons)` for extra footer buttons (Undo, mode toggles, …).
- **All randomness must come from `ctx.rng`.** Resuming re-creates the game from the same seed, so `Math.random` breaks resume.
- **Implement `snapshot()`** returning JSON-serialisable progress, and restore it defensively from `ctx.saved`. After a resume, the visible board (every element, attribute and text, apart from the input pad's mode and short-lived animations) must be identical, including the current selection. `test/resume.test.ts` checks this automatically by clicking random buttons.
- **Undo:** for perfect-information games (no hidden tiles, lives, random spawns or scores), set `undo: true` instead of building an Undo button. Build your own with `undoBtn()` only when undo follows game rules the snapshots can't express (Flood and Slide give back the spent move; Flood's dead-end hint points at the button). The card then shows Undo (and handles Ctrl/Cmd+Z), stepping back through `snapshot()` states by re-creating the game from `ctx.saved`. Top-level `sel` / `cur` count as selection, not moves. `test/undo.test.ts` checks that restoring is exact.
- A new puzzle must never start already solved.
- Validate by the rules, not by comparing with a stored solution, unless the generator guarantees a unique solution.
- Difficulty 1 to 5 (Easy, Medium, Hard, Expert, Master) must make a real difference: size, givens, constraints, move limits. `par(d)` is a realistic target solve time in seconds and drives auto-levelling.
- Generation must be fast: under about 300 ms typically, and never over 1500 ms at any level (tested with 15 seeds × 5 levels). Use node/attempt budgets with a fallback.
- `rules` is one line of 60 characters or fewer.
- Use generic genre names. Don't use trademarked game names, and don't copy another site's look, art or levels.

## Look & feel (neo-brutalist, shared everywhere)

- Use `board(cols, rows, extraClass)` and `.cell` for grids. Its width is `var(--board)`, so the game fits any screen. Keep total height within about `var(--board)` plus 120 px for pads and palettes.
- Reuse `.cell.on`, `.sel`, `.given`, `.err`, `.miss`, `.hint`, `.x`, plus `btn()`, `undoBtn()` / `restartBtn()` / `clearBtn()`, `pad()`, `.key.swatch` with `--c:${PALETTE[i]}`, `.dots`, `.big` and `.input`. Don't invent new button or tile styles.
- Tokens: `--ink` (borders and shadows), `--bw` (border width), `--sh` (shadow offset), `--cell` / `--cell-alt` (surfaces), `--fg`, `--muted`, `--accent` (the game's tone), `--accent-soft`, `--on-tone` (text on bright fills), `--good`, `--bad`, `--p1`…`--p8` (palette), `--r`, `--r-cell`.
- For extra CSS, create `src/games/<id>/style.css`, import it from the module (`import './style.css';`), and scope every rule under `[data-puzzle='<id>']`. Set the game's tone there: `[data-puzzle='<id>'] { --accent: var(--pN); }`.
- For drag interactions, use pointer events with `touch-action: none` on the drag surface. Don't use HTML5 drag-and-drop. The feed scrolls vertically, so swipes inside a game must not leak into it.
- Light and dark themes both come from the tokens. Never hard-code black or white; use `--ink`, `--cell` and `--on-tone`.
- Physical objects that must look the same in both themes (card faces, chess pieces, black/white pearls) use `--paper`, `--paper-alt` and `--coal`. Never use these for UI surfaces.
- Borders, shadows and radii use the tokens (`var(--bw)`, `var(--sh)`, `var(--r)`, `var(--r-cell)`), not literal pixel values.
- A broken rule is shown with `.err` (clue tallies use `countClue()` / `setTally()`). Don't reuse `.hint` or `.sel` for other states, such as a drag preview.

## Consistency rules (actions, punishments, rewards)

Every game follows the same rules, so a player who knows one game knows how all of them react.

**Actions**

- Footer buttons come only from `undoBtn()`, `restartBtn()` and `clearBtn()` (all ghost, in `src/ui/dom.ts`), plus at most one `btn(…, 'primary')` for a commit action (Check, Guess, Finish). Order: the primary action, then Undo, then Restart or Clear; the card's own Undo (`undo: true`) sits before them. Never write the labels by hand.
- Every game has a way back to the start. Games with a move history offer **Undo** and **Restart**. Games where the player marks or draws the answer offer **Clear**. Restart and Clear can themselves be undone when the game has Undo.
- Keys: `Z` / `Backspace` undo, `R` restart, arrows / WASD move (`keyDir` in `src/kits/move/kit.ts`; an arrow moves the thing you control in that direction). Don't bind `R` to anything else.
- Key rows are built with `pad()`. Never hand-build `.key` buttons.
- Tap cycles put the main mark first, then the secondary mark (✕ or dot), then empty. Secondary marks also go on long-press. Modes such as notes or rule-out are a `.key.sel` toggle inside the pad, never a footer button that swaps variants.

**Punishments**

- **Illegal move** (the game refuses it: a blocked step, a bad drop, a rule the game enforces): `shake()` the board or the piece. It isn't a mistake. A drop that snaps back shakes too.
- **Mistake** (`ctx.mistake()`): a committed move that is wrong.
  - An entry or placement that breaks a visible rule. Use `ruleBreaks(board, ctx.mistake)` and call it after rendering each player move (`false` for moves that never count: marks, clear, restore). Never call `ctx.mistake()` for these yourself: `ruleBreaks` only judges once the board has been left alone for `SETTLE_MS` (1 s), hiding new `.err` marks until then, so cycling through a wrong state on the way to the right one is neither shown nor counted. Write `.err` styles as `.err:not([data-hold])`. Red marks that never count (lines, loops) still get the same delay with `ruleBreaks(board, () => {})`.
  - An answer the game rejects as wrong, such as a word, a pair, a check, or a move that isn't mate.
  - A lost life.
  - These never count: drawing or erasing lines, marks (✕, flags, dots), exploratory moves in move and card games, and attempts in guess-limited games (each guess is information).
- **Lives**: call `ctx.lives(left, max)` on every render. The card shows the hearts in its header, so don't repeat them in the status. Losing a life also calls `mistake()` and shakes. In Zen mode (`ctx.zen`) lives never run out: keep counting mistakes, but don't call `failed()` when the last one goes.
- **Failure** (`ctx.failed()`): only when a hard budget runs out (lives, guesses, a move limit) or the player sets off a mine.
- **Dead ends**: a dead end in a game with Undo is not a failure. Say so in the status, ending with `· undo` / `· annulez`, and have `check()` return a `stuck` hint. The player can always skip.

**Rewards and status**

- Solving is just `ctx.solved()`. The card pops the board, shows the win card and plays the confetti. Games don't add their own win flash, and they don't rewrite the status on a solve (the footer is replaced anyway).
- Failing is just `ctx.failed()`. The card shakes the board.
- Every game keeps a status line while playing. Join facts with `·`. Write progress as `have / total noun` with spaces around the slash. Write counts and budgets with `P()` (`3 moves left`, never `3 moves` built by hand).
- Endless games call `ctx.solved({ keepPlaying: true })` when they reach the goal and add a primary **Finish** button.

**Colour and contrast**

- Use tokens, never literal colours. Fills: `--accent`, `--good`, `--bad`, `--p1`…`--p8`. Text, thin lines and ✓ ✗ marks on a surface use `--accent-ink`, `--good-ink` or `--bad-ink`, which hold 4.5:1 in both themes. Text on a bright fill is `--on-tone`.
- Dimmed text (placeholders, empty slots, a satisfied clue) is `color: var(--faint)`, never `opacity`. `--faint` still holds 4.5:1.
- Region tints come from `tint(i, pct)` in `src/kits/logic/kit.ts`. It is pastel in light mode and a deep jewel tone in dark mode.
- Shaded ("black") cells use `background: var(--shade) var(--shade-hatch); border-color: var(--shade)`.
- Colour is never the only cue. When pieces must be matched by colour, add `mark(k)` / `svgMark(k, …)` from `src/ui/symbols.ts` (the "Colour symbols" setting), or a pattern (Word Guess stripes its "wrong place" tiles).
- Thin coloured lines on the board get an ink casing underneath (Connect, Arrows, Tether, Worms).
- `npm run e2e:a11y` (needs `npm run dev`) checks contrast, names and target sizes in every game, in light and dark. It must report 0 problems. Add an exception to its `IGNORE` list only with a reason.

## Checking your work

```sh
npm run check               # fmt:check, lint, typecheck (tsrs), knip, tests — must pass
npm run fix                 # (or `mise run fix`) format + lint autofixes
IDS=<id1>,<id2> LEVELS=1,3,5 npm run e2e:shots   # screenshots of your games (needs `npm run dev`)
```

The screenshot script writes contact sheets (`sheet-*.png`) into the output folder. Look at them.

## Languages (English + Québec French) and tutorials

- Every user-visible string goes through `L(en, fr)` from `src/core/i18n.ts`. For counts, use `P(n, ['move', 'moves'], ['coup', 'coups'])`. That covers the status line, buttons, labels, aria-labels, titles, messages and on-screen keyboards. The locale is fixed for the page's lifetime (switching reloads), so calling `L()` at render time is fine.
- `name` and `rules` must be getters so they follow the locale:
  ```ts
  get name() { return L('Pipes', 'Tuyaux'); },
  get rules() { return L('Rotate tiles until everything joins the source.', 'Tournez les tuiles pour tout relier à la source.'); },
  ```
  Both languages must stay at 60 characters or fewer.
- Write in Québec French: use "vous" and natural Québec usage. Follow OQLF typography: no space before `? ! ;`, a space before `:`, and « guillemets » if you need quotes. Card ranks are A, R, D, V; suits are pique, cœur, carreau, trèfle. Chess pieces are roi, dame, tour, fou, cavalier, pion.
- **Tutorial:** add `help: () => ({ goal, steps, tips })`, with every string in `L()`:
  - `goal`: one or two sentences on what you are trying to achieve.
  - `steps`: 3 to 6 short numbered steps covering the rules, then the controls (tap, drag, long-press, keyboard keys, footer buttons).
  - `tips`: 1 to 3 strategy hints for a beginner.

  It shows in a dialog behind the "?" next to the title. Keep it concrete, short and friendly, and make it match what the game actually does.

- **Guide:** return `hint()` from the instance. The "?" sheet replays an Easy board (difficulty 1, fixed seed) with up to 6 hints in a row: it outlines `why` (the clue), draws an arrow to `at` (where the move goes), shows `text`, then calls `play()`. See `Hint` in `src/core/types.ts` and `mines.ts` for a full example.
  - `text` explains the _reasoning_, not just the move: "This 2 touches exactly two closed tiles, so both are mines." Mention the actual numbers or letters from the board. Keep it to one or two short sentences, in both languages.
  - Prefer moves a person can deduce from what's visible, simplest rule first, and vary the rules over consecutive steps. Use the solution only to choose among equally good moves, or for games without pure logic (cards, memory, word guesses), where the text explains the strategy.
  - `play()` must go through the same code path as a player's tap or drag, so the board animates and updates normally. The hint must reflect the _current_ state, since it's called again after every `play()`.
  - Return `null` when solved or when there's nothing useful left.
  - Check it with `IDS=<id> node scripts/guide.mjs` (needs `npm run dev`). It prints each caption and writes one screenshot per step to `shots/guide/`.
- Word games whose content depends on the language set `localized: true` and must generate from the current locale's word list.
