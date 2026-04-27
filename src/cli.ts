import { Command, InvalidArgumentError } from "commander";
import * as clack from "@clack/prompts";
import pc from "picocolors";
import { runArchive } from "./commands/archive.ts";
import { validateUsername } from "./utils/http.ts";
import { isTTY } from "./tui/tty.ts";
import { parseIsoDate } from "./utils/date.ts";
import type { LocalDate } from "./types.ts";

function logError(message: string): void {
  if (isTTY()) {
    clack.log.error(pc.red(message));
  } else {
    console.error(`Error: ${message}`);
  }
}

function parseIntOption(value: string): number {
  if (!/^-?\d+$/.test(value)) {
    throw new InvalidArgumentError(`Expected an integer, got: ${value}`);
  }
  return parseInt(value, 10);
}

function parsePositiveIntOption(value: string): number {
  const n = parseIntOption(value);
  if (n < 1) {
    throw new InvalidArgumentError(`Expected a positive integer, got: ${value}`);
  }
  return n;
}

function parseIsoDateOption(value: string): LocalDate {
  try {
    return parseIsoDate(value);
  } catch (err) {
    throw new InvalidArgumentError(err instanceof Error ? err.message : String(err));
  }
}

export function buildCli(): Command {
  const program = new Command();

  program
    .name("livejournal-backup")
    .description("Archive LiveJournal entries to markdown files")
    .version("1.0.0");

  program
    .command("archive [username]")
    .description("Archive all journal entries for a LiveJournal user")
    .option("--year <year>", "Only archive a specific calendar year (e.g. 2002)", parseIntOption)
    .option("--start-date <YYYY-MM-DD>", "Start of a date range to archive (requires --days)", parseIsoDateOption)
    .option("--days <n>", "Number of days to archive starting from --start-date (inclusive)", parsePositiveIntOption)
    .option("--retries <n>", "Number of retries per page on failure", parseIntOption, 3)
    .option("--delay <ms>", "Wait time in ms between requests", parseIntOption, 1000)
    .option("--output <dir>", "Output directory", "./archive")
    .option("--verbose", "Enable verbose logging", false)
    .option("--limit <n>", "Max number of days to archive (omit for no limit)", parseIntOption)
    .option("--skip-existing", "Skip dates that already have a markdown file", false)
    .option("--dry-run", "Show what would be archived without downloading or writing files", false)
    .option("--include-comments", "Fetch and include user comments in archived markdown files", false)
    .action(async (usernameArg: string | undefined, opts: {
      year?: number;
      startDate?: LocalDate;
      days?: number;
      limit?: number;
      retries: number;
      delay: number;
      output: string;
      verbose: boolean;
      skipExisting: boolean;
      dryRun: boolean;
      includeComments: boolean;
    }) => {
      const username = usernameArg || process.env.LJ_USERNAME;

      if (!username) {
        logError("No username provided. Pass a username argument or set LJ_USERNAME in your .env file.");
        process.exit(1);
      }

      if ((opts.startDate !== undefined) !== (opts.days !== undefined)) {
        logError("--start-date and --days must be used together");
        process.exit(1);
      }

      if (opts.startDate !== undefined && opts.year !== undefined) {
        logError("--year cannot be combined with --start-date / --days");
        process.exit(1);
      }

      try {
        await validateUsername(username);
      } catch (err) {
        logError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }

      await runArchive({
        username,
        year: opts.year,
        startDate: opts.startDate,
        days: opts.days,
        limit: opts.limit,
        retries: opts.retries,
        delay: opts.delay,
        outputDir: opts.output,
        verbose: opts.verbose,
        skipExisting: opts.skipExisting,
        dryRun: opts.dryRun,
        includeComments: opts.includeComments,
      });
    });

  return program;
}
