# livejournal-backup

TypeScript/Bun CLI for archiving [LiveJournal](https://www.livejournal.com) journal entries to local markdown files.

## Requirements

- [Bun](https://bun.sh) runtime (v1.0+)

## Installation

```bash
bun install
```

## Setup

Copy the example env file and set your LiveJournal username:

```bash
cp .env.example .env
```

Then edit `.env`:

```
LJ_USERNAME=myusername
```

This lets you run the CLI without passing a username every time. The `.env` file is gitignored and will never be committed.

## Usage

> **Shortcut:** the examples below use `bun run src/index.ts` for clarity, but the repo ships with `cli.sh` and `cli.ps1` wrappers that forward to the `start` script in `package.json`. You can replace `bun run src/index.ts` with `./cli.sh` (bash) or `.\cli.ps1` (PowerShell) in any command — e.g. `./cli.sh archive --year 2002`.

### Archive all entries (using username from .env)

```bash
bun run src/index.ts archive
```

### Archive with an explicit username (overrides .env)

```bash
bun run src/index.ts archive myusername
```

### Archive a specific year

```bash
bun run src/index.ts archive --year 2002
```

### Archive a date range

Archive a window of N days starting from (and including) a specific date:

```bash
bun run src/index.ts archive --start-date 2002-12-20 --days 30
```

Ranges can cross year boundaries — the CLI fetches each year's calendar page and filters down to the dates inside your window.

### All options

```
bun run src/index.ts archive [username] [options]

Options:
  --year <year>              Only archive a specific calendar year (e.g. 2002)
  --start-date <YYYY-MM-DD>  Start of a date range to archive (requires --days)
  --days <n>                 Number of days to archive starting from --start-date (inclusive)
  --limit <n>                Max number of days to archive (omit for no limit)
  --retries <n>              Number of retries per page on failure (default: 3)
  --delay <ms>               Wait time in ms between requests (default: 1000)
  --output <dir>             Output directory (default: ./archive)
  --verbose                  Enable verbose logging
  --skip-existing            Skip dates that already have a markdown file
  --dry-run                  Show what would be archived without downloading or writing files
  -h, --help                 Display help
  -V, --version              Display version
```

`--year` and `--start-date`/`--days` are mutually exclusive. If no date args are provided, the CLI discovers all available years from the user's calendar page and archives everything.

The username argument is optional. If omitted, the CLI reads `LJ_USERNAME` from your `.env` file. If neither is provided, the CLI exits with an error.

### Examples

```bash
# Archive everything with a 2-second delay (username from .env)
bun run src/index.ts archive --delay 2000 --output ./my-journal

# Archive 2003 only, skip files already downloaded
bun run src/index.ts archive --year 2003 --skip-existing

# Verbose mode to see all requests
bun run src/index.ts archive --year 2005 --verbose

# Override .env username for a one-off run
bun run src/index.ts archive otherusername --year 2005

# Archive a 30-day window starting from a specific date
bun run src/index.ts archive --start-date 2002-12-15 --days 30

# Archive a single day
bun run src/index.ts archive --start-date 2002-01-24 --days 1

# Archive only the first 5 days (useful for quick testing)
bun run src/index.ts archive --limit 5

# Dry run — see what would be archived without writing any files
bun run src/index.ts archive --dry-run

# Dry run for a specific year
bun run src/index.ts archive --year 2002 --dry-run

# Dry run for a date range
bun run src/index.ts archive --start-date 2002-12-15 --days 30 --dry-run
```

## Output Structure

```
archive/
  2002/
    2002-01-24.md
    2002-02-03.md
    ...
  2003/
    2003-01-15.md
    ...
```

Each markdown file contains all journal entries for that day:

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

## Terminal Output

On interactive terminals, the CLI displays a polished TUI with animated spinners, progress bars, and colored output powered by [@clack/prompts](https://github.com/bombshell-dev/clack). When output is piped or running in CI, it falls back to plain `[INFO]`/`[DEBUG]` text with no ANSI escape codes.

## Development

```bash
# Run tests
bun test

# Build standalone binary
bun run build
```

## Architecture

```
src/
  index.ts                    # Entry point
  cli.ts                      # Commander CLI setup
  types.ts                    # TypeScript interfaces
  commands/
    archive.ts                # Archive command orchestration
  scrapers/
    calendar.ts               # Discovers available years
    year.ts                   # Discovers entry dates in a year
    day.ts                    # Extracts entries from a day page
  converters/
    html-to-markdown.ts       # HTML to Markdown conversion
  writers/
    file-writer.ts            # Writes markdown files to disk
  utils/
    http.ts                   # Fetch with exponential backoff retry
    logger.ts                 # Leveled logger (plain text)
    tui.ts                    # TUI logger with @clack/prompts (TTY only)
tests/
  scrapers/                   # Unit tests for scrapers
  converters/                 # Unit tests for converter
  writers/                    # Unit tests for file writer
```
