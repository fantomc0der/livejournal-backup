# Agent Instructions — livejournal-backup

A TypeScript/Bun CLI that scrapes a LiveJournal user's journal entries and archives them as local markdown files.

---

## Runtime & Package Manager

- **Runtime**: [Bun](https://bun.sh) (not Node). Use `bun` for all install/run/test commands.
- **Install deps**: `bun install`
- **Run CLI**: `bun run src/index.ts <command>`
- **Run tests**: `bun test`
- **Build**: `bun run build` → outputs `dist/lj-backup.js`

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

**For agents**: Always read `LJ_USERNAME` from `.env` to determine which username to test against. Never hardcode a username in commands, commits, or code.

---

## Project Structure

```
.env.example                  # Environment variable template (committed)
.env                          # Local env values — gitignored, never committed
src/
  index.ts                    # Entry point — wires CLI
  cli.ts                      # Commander setup, option parsing
  types.ts                    # Shared interfaces: JournalEntry, ArchiveOptions, DateEntry
  commands/
    archive.ts                # Orchestrates the full scrape-and-write flow
  scrapers/
    calendar.ts               # Fetches /{username}/calendar/ → extracts available years
    year.ts                   # Fetches /{username}/{year}/ → extracts dates with entries
    day.ts                    # Fetches /{username}/{year}/{mm}/{dd}/ → extracts entries
  converters/
    html-to-markdown.ts       # Turndown-based HTML→Markdown with LJ artifact stripping
  writers/
    file-writer.ts            # Writes {outputDir}/{year}/{YYYY}-{MM}-{DD}.md
  utils/
    http.ts                   # fetchWithRetry with exponential backoff + sleep
    logger.ts                 # Leveled logger (verbose/info/warn/error/debug)
tests/
  scrapers/                   # Unit tests for each scraper (no real HTTP calls)
  converters/                 # Unit tests for html-to-markdown
  writers/                    # Unit tests for file-writer
.github/workflows/ci.yml      # CI: bun install → bun test → bun run build
```

---

## Key Architectural Decisions

- **No `require()`** — ES modules only (`import`/`export`).
- **No `axios`/`node-fetch`** — native `fetch` (built into Bun).
- **No `@ts-ignore` or `as any`** — strict TypeScript throughout.
- **Scraper resilience**: selectors try multiple fallbacks in order; year extraction scans both `<a href>` patterns and plain text nodes so it doesn't break if LJ restructures the toolbar.
- **Commander v14 quirk**: `parseInt` cannot be passed directly as a Commander option parser because it receives two arguments (`value, previousDefault`). Use the local `parseIntOption` wrapper in `cli.ts`.
- **No hard wrapping** — do not insert line breaks to wrap prose at a fixed column width. This applies everywhere: markdown files, commit messages, code comments, and any other written text. Let the editor or renderer handle soft wrapping. Hard wraps create noisy diffs when sentences are edited and serve no purpose in a modern toolchain.

---

## CLI Reference

```
bun run src/index.ts archive [username] [options]

Options:
  --year <year>       Archive only this year (e.g. 2002)
  --month <month>     Archive only this month, 1–12 (requires --year)
  --day <day>         Archive only this day, 1–31 (requires --year and --month)
  --retries <n>       Retries per page on failure (default: 3)
  --delay <ms>        Wait between requests in ms (default: 1000)
  --output <dir>      Output directory (default: ./archive)
  --verbose           Enable debug-level logging
  --skip-existing     Skip dates that already have a .md file
```

The `username` argument is optional. If omitted, the CLI reads `LJ_USERNAME` from `.env`. A CLI argument always takes priority over the env value.

---

## Testing

Tests use `bun:test` (`describe` / `it` / `expect`). **No real HTTP calls are made in tests** — all scrapers are tested against inline mock HTML strings.

```bash
bun test
```

56 tests across 5 files should all pass in under 200 ms.

### When testing the CLI against a live account

Ensure `.env` has `LJ_USERNAME` set (see **Environment** above). When testing, create a subfolder within the repository's `test-output/` folder to have the CLI target.

Example:
```bash
bun run src/index.ts archive --year 2002 --month 1 --output ./test-output/jan-2002 --delay 2000
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
- Each entry is a `div.entry` containing:
  - `h4.subject` — entry title + timestamp (e.g. `(no subject) @ 04:34 pm`)
  - `div.text` — entry body HTML, which contains:
    - `div.currents` — metadata block with mood/music/location as child divs
    - `div.currentmood` — mood text + an `<img class="meta-mood-img">` icon (stripped during conversion)
    - `div.currentmusic` — music text
    - `div.entry-content` — the actual post body
    - `div.clearer` — layout spacer with `&nbsp;` (stripped during conversion)
  - `div.comments` — comment/reply links (stripped during conversion)
- External links are wrapped by LJ through `https://www.livejournal.com/away?to=<encoded-url>` — unwrapped during conversion to point directly at the destination.
- Falls back to scanning `h3 a / h2 a / h4 a` for entry permalink patterns if `div.entry` is absent.

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

**Never commit any real usernames into the repository.** Test commands, commit messages, and code must not contain actual LiveJournal usernames.

### Navigating LiveJournal pages

For a given username, the key page URLs are:

- **Calendar (all years):** `https://{username}.livejournal.com/calendar/`
- **Specific year:** `https://{username}.livejournal.com/{year}/`
- **Specific day:** `https://{username}.livejournal.com/{year}/{mm}/{dd}/`

If you are investigating a problem visible in an output file under `archive/` or `test-output/`, you can derive the date from the filename (e.g. `2002/2002-01-24.md` → year 2002, month 01, day 24) and construct the source URL from the username.

### Testing a single day

Use the `--day` flag to archive a single day without scraping the calendar or year pages:

```bash
bun run src/index.ts archive --year 2002 --month 1 --day 24 --output ./test-output/debug --delay 2000
```

This is much faster than pulling a whole month when you only need to verify one day's output.

### Viewing source HTML

To inspect the raw HTML that the tool will scrape, fetch the day page URL directly (e.g. via `curl`, PowerShell `Invoke-WebRequest`, or a web browser's View Source). Look for the `div.entry` elements and their child structure (`div.text`, `div.currents`, `div.entry-content`). LJ's `robots.txt` blocks some automated fetchers, so you may need to use tools that don't send bot-like user-agent strings.

---

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and PR:
1. `bun install`
2. `bun test`
3. `bun run build`

No publishing step — this project is not distributed to a registry.