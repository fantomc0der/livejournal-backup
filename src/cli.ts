import { Command, InvalidArgumentError } from "commander";
import * as clack from "@clack/prompts";
import pc from "picocolors";
import { runArchive } from "./commands/archive.ts";
import { isTTY } from "./utils/tui.ts";

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

export function buildCli(): Command {
  const program = new Command();

  program
    .name("livejournal-backup")
    .description("Archive LiveJournal entries to markdown files")
    .version("1.0.0");

  program
    .command("archive [username]")
    .description("Archive all journal entries for a LiveJournal user")
    .option("--year <year>", "Only archive a specific year (e.g. 2002)", parseIntOption)
    .option("--month <month>", "Only archive a specific month 1-12 (requires --year)", parseIntOption)
    .option("--day <day>", "Only archive a specific day 1-31 (requires --year and --month)", parseIntOption)
    .option("--retries <n>", "Number of retries per page on failure", parseIntOption, 3)
    .option("--delay <ms>", "Wait time in ms between requests", parseIntOption, 1000)
    .option("--output <dir>", "Output directory", "./archive")
    .option("--verbose", "Enable verbose logging", false)
    .option("--limit <n>", "Max number of days to archive (omit for no limit)", parseIntOption)
    .option("--skip-existing", "Skip dates that already have a markdown file", false)
    .option("--dry-run", "Show what would be archived without downloading or writing files", false)
    .action(async (usernameArg: string | undefined, opts: {
      year?: number;
      month?: number;
      day?: number;
      limit?: number;
      retries: number;
      delay: number;
      output: string;
      verbose: boolean;
      skipExisting: boolean;
      dryRun: boolean;
    }) => {
      const username = usernameArg || process.env.LJ_USERNAME;

      if (!username) {
        logError("No username provided. Pass a username argument or set LJ_USERNAME in your .env file.");
        process.exit(1);
      }

      if (opts.month !== undefined && opts.year === undefined) {
        logError("--month requires --year to be specified");
        process.exit(1);
      }

      if (opts.day !== undefined && (opts.year === undefined || opts.month === undefined)) {
        logError("--day requires both --year and --month to be specified");
        process.exit(1);
      }

      await runArchive({
        username,
        year: opts.year,
        month: opts.month,
        day: opts.day,
        limit: opts.limit,
        retries: opts.retries,
        delay: opts.delay,
        outputDir: opts.output,
        verbose: opts.verbose,
        skipExisting: opts.skipExisting,
        dryRun: opts.dryRun,
      });
    });

  return program;
}
