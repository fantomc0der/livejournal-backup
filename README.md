# livejournal-backup

TypeScript/Bun CLI for archiving LiveJournal journal entries to local markdown files.

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

### Archive a specific month

```bash
bun run src/index.ts archive --year 2002 --month 1
```

### All options

```
bun run src/index.ts archive [username] [options]

Options:
  --year <year>       Only archive a specific year (e.g. 2002)
  --month <month>     Only archive a specific month 1-12 (requires --year)
  --day <day>         Only archive a specific day 1-31 (requires --year and --month)
  --limit <n>         Max number of days to archive (omit for no limit)
  --retries <n>       Number of retries per page on failure (default: 3)
  --delay <ms>        Wait time in ms between requests (default: 1000)
  --output <dir>      Output directory (default: ./archive)
  --verbose           Enable verbose logging
  --skip-existing     Skip dates that already have a markdown file
  -h, --help          Display help
  -V, --version       Display version
```

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

# Archive only the first 5 days (useful for quick testing)
bun run src/index.ts archive --limit 5
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
    logger.ts                 # Leveled logger
tests/
  scrapers/                   # Unit tests for scrapers
  converters/                 # Unit tests for converter
  writers/                    # Unit tests for file writer
```
