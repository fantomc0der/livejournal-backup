# Agent Instructions — livejournal-backup

A TypeScript/Bun CLI that scrapes a LiveJournal user's journal entries and archives them as local markdown files.

---

## Hard Rules

These rules apply to every action — code, commits, comments, markdown, and CLI commands. No exceptions.

1. **No real usernames in committed content.** Never include actual LiveJournal usernames in code, commit messages, branch names, or any other content that gets committed to the repository. Read `LJ_USERNAME` from `.env` at runtime; refer to users generically (e.g. "the configured user", "a test user") in prose.
2. **No hard wrapping.** Do not insert line breaks to wrap prose at a fixed column width. This applies everywhere: markdown files, commit messages, code comments, PR descriptions, and any other written text. Let the editor or renderer handle soft wrapping. Hard wraps create noisy diffs when sentences are edited and serve no purpose in a modern toolchain.
3. **No type-safety escape hatches.** Never use `@ts-ignore`, `@ts-expect-error`, or `as any`.

---

## Runtime & Package Manager

- **Runtime**: [Bun](https://bun.sh) (not Node). Use `bun` for all install/run/test commands.
- **Install deps**: `bun install`
- **Run CLI**: `bun run src/index.ts <command>`
- **Run tests**: `bun test`
- **Build**: `bun run build` → outputs `dist/livejournal-backup.js`

---

## Environment

The project uses a `.env` file (gitignored) to store the default LiveJournal username for local runs and testing.

- **`.env.example`** — committed template showing required variables.
- **`.env`** — local copy with real values. **Never committed.**

Before running the CLI locally, check that `.env` exists and has `LJ_USERNAME` set. If it doesn't exist, copy from the template:

```bash
cp .env.example .env
```

Bun loads `.env` automatically — no extra dependencies required.

| Variable | Purpose | Required |
|---|---|---|
| `LJ_USERNAME` | Default LiveJournal username for the `archive` command | Yes (unless username is passed as a CLI argument) |

**For agents**: Always read `LJ_USERNAME` from `.env` to determine which username to test against. Never hardcode a username in commands, commits, or code (see **Hard Rules** above).

---

## Project Structure

```
.env.example                  # Environment variable template (committed)
.env                          # Local env values — gitignored, never committed
.github/workflows/
  ci-build.yml                # CI Build: bun install → bun test → bun run build
  typecheck-review.yml        # Posts/updates a PR comment with any tsc errors on the diff
  claude-review.yml           # LLM review on PR ready-for-review (see docs/pr-automation.md)
  enforce-draft.yml           # Auto-converts new PRs to draft (see docs/pr-automation.md)
  auto-merge.yml              # Squash-merge gate after CI + Claude review (see docs/pr-automation.md)
  claude-fix.yml              # Runs claude-code-action when a PR comment contains @claude
src/
  index.ts                    # Entry point — wires CLI
  cli.ts                      # Commander setup, option parsing
  types.ts                    # Shared interfaces: JournalEntry, ArchiveOptions, DateEntry
  commands/
    archive.ts                # Orchestrates the full scrape-and-write flow
  converters/
    html-to-markdown.ts       # Turndown-based HTML→Markdown with LJ artifact stripping
  scrapers/
    calendar.ts               # Fetches /{username}/calendar/ → extracts available years
    year.ts                   # Fetches /{username}/{year}/ → extracts dates with entries
    day.ts                    # Fetches /{username}/{year}/{mm}/{dd}/ → extracts entries
  tui/
    tty.ts                    # isTTY() — checks whether stdout is an interactive terminal
    logger.ts                 # TuiLogger (extends Logger) — routes log calls through clack/spinners/progress
    progress.ts               # dualProgress — two-line progress bar renderer (info line + bar line)
  utils/
    date.ts                   # LocalDate helpers: parseIsoDate, addDays, compareDate
    http.ts                   # fetchWithRetry with exponential backoff + sleep
    logger.ts                 # Leveled logger (verbose/info/warn/error/debug)
  writers/
    file-writer.ts            # Writes {outputDir}/{year}/{YYYY}-{MM}-{DD}.md
tests/
  scrapers/                   # Unit tests for each scraper (no real HTTP calls)
  converters/                 # Unit tests for html-to-markdown
  writers/                    # Unit tests for file-writer
```

---

## Key Architectural Decisions

- **No `require()`** — ES modules only (`import`/`export`).
- **No `axios`/`node-fetch`** — native `fetch` (built into Bun).
- **No `@ts-ignore` or `as any`** — strict TypeScript throughout (see **Hard Rules**).
- **Scraper resilience**: selectors try multiple fallbacks in order; year extraction scans both `<a href>` patterns and plain text nodes so it doesn't break if LJ restructures the toolbar.
- **Commander v14 quirk**: `parseInt` cannot be passed directly as a Commander option parser because it receives two arguments (`value, previousDefault`). Use the local `parseIntOption` wrapper in `cli.ts`. It validates with `/^-?\d+$/` and throws `InvalidArgumentError` for non-integer input.
- **TUI / non-TTY dual path**: On interactive terminals (`process.stdout.isTTY`), the archive command uses `TuiLogger` with `@clack/prompts` for spinners, progress bars, and colored output. On non-interactive terminals (piped output, CI), it falls back to the plain `Logger` with `[INFO]`/`[DEBUG]` text — zero ANSI escape codes. The gate is `isTTY()` in `src/tui/tty.ts`.
- **TuiLogger extends Logger**: Scrapers, writers, and `http.ts` accept `Logger` as a parameter. At runtime in TTY mode they receive a `TuiLogger` via polymorphism. Tests use plain `Logger` directly and are unaffected by TUI changes.
- **Spinner/progress log suppression**: When a clack spinner or progress bar is active, `TuiLogger` suppresses `info()`/`log()` calls (the animation already communicates status). `debug()` routes through `spinner.message()` / `progress.message()` when verbose is on. `warn()` and `error()` also route through `.message()` to avoid terminal corruption from stopping/restarting animations.
- **No hard wrapping** — do not insert line breaks to wrap prose at a fixed column width. This applies everywhere: markdown files, commit messages, code comments, and any other written text. Let the editor or renderer handle soft wrapping. Hard wraps create noisy diffs when sentences are edited and serve no purpose in a modern toolchain (see **Hard Rules**).

---

## CLI Reference

```
bun run src/index.ts archive [username] [options]

Options:
  --year <year>              Archive only this calendar year (e.g. 2002)
  --start-date <YYYY-MM-DD>  Start of a date range to archive (requires --days)
  --days <n>                 Number of days to archive starting from --start-date (inclusive)
  --limit <n>                Max number of days to archive (omit for no limit)
  --retries <n>              Retries per page on failure (default: 3)
  --delay <ms>               Wait between requests in ms (default: 1000)
  --output <dir>             Output directory (default: ./archive)
  --verbose                  Enable debug-level logging
  --skip-existing            Skip dates that already have a .md file
  --dry-run                  Show what would be archived without downloading or writing files
```

The `username` argument is optional. If omitted, the CLI reads `LJ_USERNAME` from `.env`. A CLI argument always takes priority over the env value.

`--year` and `--start-date`/`--days` are mutually exclusive. `--start-date` and `--days` must always be used together. If no date args are provided, the CLI discovers all years from the user's calendar page and archives everything.

---

## Testing

Tests use `bun:test` (`describe` / `it` / `expect`). **No real HTTP calls are made in tests** — all scrapers are tested against inline mock HTML strings.

```bash
bun test
```

79 tests across 5 files should all pass in under 200 ms.

### When testing the CLI against a live account

Ensure `.env` has `LJ_USERNAME` set (see **Environment** above). When testing, **always** use a subfolder within the repository's `test-output/` directory as the output target. Never write test output to directories outside the repo.

Example:
```bash
bun run src/index.ts archive --year 2002 --output ./test-output/2002 --delay 2000
```

`test-output/` is gitignored — no scraped data is ever committed.

Spot-check output files against the live site to verify correctness.

---

## LiveJournal HTML Structure (reference)

### Calendar page (`/{username}/calendar/`)
- Toolbar navigation appears **twice** (top and bottom of page).
- Year links: `<a href="/{username}/{year}/">` or absolute `https://{username}.livejournal.com/{year}/`.
- The **current year** is plain text (not a link) — extracted via regex scan of text nodes.

### Year page (`/{username}/{year}/`)
- Shows a calendar grid per month.
- Days with entries are linked: `<a href="/{username}/{year}/{mm}/{dd}/">{day} ({n})</a>`.
- Days without entries are plain text numbers.

### Day page (`/{username}/{year}/{mm}/{dd}/`)

LJ themes vary significantly in HTML structure. The scraper handles three extraction strategies in priority order:

**S2 themes (most common)** — `div.entry` with semantic CSS classes:
  - `h4.subject` — entry title + timestamp (e.g. `(no subject) @ 04:34 pm`)
  - `div.text` or `div.entrytext` — entry body HTML, which contains:
    - `div.currents` — metadata block with mood/music/location as child divs
    - `div.currentmood` — mood text + an `<img class="meta-mood-img">` icon (stripped during conversion)
    - `div.currentmusic` — music text
    - `div.entry-content` — the actual post body
    - `div.clearer` — layout spacer with `&nbsp;` (stripped during conversion)
  - `div.comments` or `ul.entryextra` — comment/reply links (stripped during conversion)

**S2 heading-based fallback** — scans `h3 a / h2 a / h4 a` for entry permalink URL patterns if `div.entry` is absent.

**S1 themes (legacy table-based layouts)** — no semantic CSS classes. Entries are in nested `<table>` / `<font>` elements. The scraper finds entry permalink links (`username.livejournal.com/NNNNN.html`) and extracts surrounding content from the containing `<td>`.

Comment/navigation links are detected and stripped by **URL pattern** (not link text), since LJ themes can customize link text to anything. The consistent URL patterns are:
- View comments: `?view=comments#comments`
- Post comment: `?mode=reply#add_comment`
- Threaded comments: `?thread=`

External links are wrapped by LJ through `https://www.livejournal.com/away?to=<encoded-url>` — unwrapped during conversion to point directly at the destination.

---

## Output Format

```
{outputDir}/
  {year}/
    {YYYY}-{MM}-{DD}.md
```

Each file contains all entries for that day:

```markdown
# January 24, 2002

## Entry 1 - 04:34 pm

**Current Mood:** impressed
**Current Music:** mindless self indulgence - tight

hey this is my first post here...

---

## Entry 2 - 05:26 pm

sitting around right now...
```

---

## Troubleshooting with Live LJ Pages

When debugging scraping or conversion issues, you may need to view the original LiveJournal HTML to understand what the tool is working with.

### Finding a username to test against

1. Check the `LJ_USERNAME` environment variable.
2. If not set, read `LJ_USERNAME` from the `.env` file in the project root.
3. If neither exists, ask the user for a username to use.

**Never commit any real usernames into the repository** (see **Hard Rules**). Test commands, commit messages, and code must not contain actual LiveJournal usernames.

### Navigating LiveJournal pages

For a given username, the key page URLs are:

- **Calendar (all years):** `https://{username}.livejournal.com/calendar/`
- **Specific year:** `https://{username}.livejournal.com/{year}/`
- **Specific day:** `https://{username}.livejournal.com/{year}/{mm}/{dd}/`

If you are investigating a problem visible in an output file under `archive/` or `test-output/`, you can derive the date from the filename (e.g. `2002/2002-01-24.md` → year 2002, month 01, day 24) and construct the source URL from the username.

### Testing a single day

Use `--start-date` with `--days 1` to archive a single day:

```bash
bun run src/index.ts archive --start-date 2002-01-24 --days 1 --output ./test-output/debug --delay 2000
```

This is much faster than pulling a whole year when you only need to verify one day's output.

### Quick smoke test with `--limit`

To verify the full archive pipeline without scraping an entire journal, use `--limit 1` without any date filters. This crawls the calendar and year pages normally but stops after writing one day file:

```bash
bun run src/index.ts archive --limit 1 --output ./test-output/smoke --delay 2000
```

This is the fastest way to confirm end-to-end functionality (calendar → year → day → markdown) during development. Combine with `--year` to limit which year is scraped first, or use `--start-date`/`--days` with `--limit` for a bounded range:

```bash
bun run src/index.ts archive --year 2002 --limit 3 --output ./test-output/first-three --delay 2000
bun run src/index.ts archive --start-date 2002-06-01 --days 90 --limit 3 --output ./test-output/sample --delay 2000
```

### Viewing source HTML

To inspect the raw HTML that the tool will scrape, fetch the day page URL directly (e.g. via `curl`, PowerShell `Invoke-WebRequest`, or a web browser's View Source). Look for the `div.entry` elements and their child structure (`div.text`, `div.currents`, `div.entry-content`). LJ's `robots.txt` blocks some automated fetchers, so you may need to use tools that don't send bot-like user-agent strings.

---

## CI

GitHub Actions (`.github/workflows/ci-build.yml`, workflow name "CI Build") runs on every push and PR:
1. `bun install`
2. `bun test`
3. `bun run build`

No publishing step — this project is not distributed to a registry.

In addition to CI Build, the repo has five PR-automation workflows:

- **`typecheck-review.yml`** — runs `bun run typecheck` against the PR and posts a single updating comment listing any tsc errors grouped by file, with deep links into the diff. Independent of the Claude review flow.
- **`enforce-draft.yml`** — on `pull_request: opened`, converts any non-draft PR to a draft so the merge gate never fires on in-progress work.
- **`claude-review.yml`** — runs `anthropics/claude-code-action` on a ready-for-review PR (triggers: `ready_for_review`, `synchronize`; intentionally not `opened` — see `docs/pr-automation.md`). Posts inline comments and a summary ending in `REVIEW: PASS` or `REVIEW: FAIL`.
- **`auto-merge.yml`** — triggered by `workflow_run` completion of `CI Build` or `Claude PR Review`. Approves and squash-merges the PR only if every gate passes.
- **`claude-fix.yml`** — triggered by PR comments containing `@claude`. Runs `anthropics/claude-code-action` to push fixes directly to the branch.

See `docs/pr-automation.md` for the full happy path, required secrets, and the bypass procedure.
