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

## Project Structure

```
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
    html-to-markdown.ts       # Turndown-based HTML→Markdown with LJ nav link stripping
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

---

## CLI Reference

```
bun run src/index.ts archive <username> [options]

Options:
  --year <year>       Archive only this year (e.g. 2002)
  --month <month>     Archive only this month, 1–12 (requires --year)
  --retries <n>       Retries per page on failure (default: 3)
  --delay <ms>        Wait between requests in ms (default: 1000)
  --output <dir>      Output directory (default: ./archive)
  --verbose           Enable debug-level logging
  --skip-existing     Skip dates that already have a .md file
```

---

## Testing

Tests use `bun:test` (`describe` / `it` / `expect`). **No real HTTP calls are made in tests** — all scrapers are tested against inline mock HTML strings.

```bash
bun test
```

45 tests across 5 files should all pass in under 200 ms.

### When testing the CLI against a live account

When testing the tool, create a subfolder within the repository's `test-output/` folder to have the CLI target.

Example:
```bash
bun run src/index.ts archive mikethecoder --year 2002 --month 1 --output ./test-output/jan-2002 --delay 2000
```

`test-output/` is gitignored — no scraped data is ever committed.

Spot-check output files against the live site to verify correctness. For example, compare `test-output/.../2002-01-24.md` to `https://mikethecoder.livejournal.com/2002/01/24/`.

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
  - `div.text` — entry body HTML
  - Mood/music metadata as styled spans before the body
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

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and PR:
1. `bun install`
2. `bun test`
3. `bun run build`

No publishing step — this project is not distributed to a registry.