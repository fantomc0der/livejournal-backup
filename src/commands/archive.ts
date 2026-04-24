import type { ArchiveOptions, DateEntry } from "../types.ts";
import * as clack from "@clack/prompts";
import pc from "picocolors";
import { Logger } from "../utils/logger.ts";
import { TuiLogger, isTTY } from "../utils/tui.ts";
import { dualProgress, type DualProgress } from "../utils/dual-progress.ts";
import { scrapeCalendar } from "../scrapers/calendar.ts";
import { scrapeYear } from "../scrapers/year.ts";
import { scrapeDay } from "../scrapers/day.ts";
import { writeDayFile, dayFileExists, getDayFilePath, writeTableOfContents } from "../writers/file-writer.ts";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDate(month: number, day: number): string {
  return `${MONTH_SHORT[month - 1]} ${day}`;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const label = totalSeconds < 60
    ? `${totalSeconds}s`
    : `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`;
  if (totalSeconds >= 300) return pc.green(label);
  if (totalSeconds >= 60) return pc.yellow(label);
  return label;
}

export async function runArchive(options: ArchiveOptions): Promise<void> {
  if (isTTY()) {
    return runArchiveTui(options);
  }
  return runArchivePlain(options);
}

async function runArchivePlain(options: ArchiveOptions): Promise<void> {
  const logger = new Logger(options.verbose);
  logger.info(`Starting archive for user: ${options.username}`);
  if (options.dryRun) {
    logger.info("Dry run mode — no files will be written");
  } else {
    logger.info(`Output directory: ${options.outputDir}`);
  }
  if (options.limit !== undefined) {
    logger.info(`Limit: ${options.limit} day(s)`);
  }

  let totalEntries = 0;
  let totalDays = 0;

  const limitReached = (): boolean =>
    options.limit !== undefined && totalDays >= options.limit;

  if (options.day !== undefined && options.month !== undefined && options.year !== undefined) {
    const date: DateEntry = { year: options.year, month: options.month, day: options.day };

    if (options.dryRun) {
      const datesForYear = await scrapeYear(options.username, options.year, options.retries, options.delay, logger);
      const matched = datesForYear.find((d) => d.month === options.month && d.day === options.day);
      if (matched) {
        logDryRunEntryPlain(logger, options.outputDir, matched);
        totalEntries += matched.entryCount ?? 0;
        totalDays++;
      } else {
        logger.info(`No entries found for ${date.year}/${date.month}/${date.day}`);
      }
    } else {
      logger.info(`Archiving single day: ${date.year}/${date.month}/${date.day}`);
      if (options.skipExisting && await dayFileExists(options.outputDir, date)) {
        logger.debug(`Skipping existing file for ${date.year}/${date.month}/${date.day}`);
      } else {
        const entries = await scrapeDay(options.username, date.year, date.month, date.day, options.retries, options.delay, logger);
        if (entries.length > 0) {
          await writeDayFile(options.outputDir, date, entries, logger);
          totalEntries += entries.length;
          totalDays++;
        } else {
          logger.debug(`No entries found for ${date.year}/${date.month}/${date.day}`);
        }
      }
    }
  } else {
    let years: number[];
    if (options.year !== undefined) {
      years = [options.year];
      logger.info(`Archiving year: ${options.year}`);
    } else {
      logger.info("Discovering years with journal entries...");
      years = await scrapeCalendar(options.username, options.retries, options.delay, logger);
      logger.info(`Years with journal entries: ${years.join(", ")}`);
    }

    for (const year of years) {
      if (limitReached()) break;
      logger.info(`Processing year ${year}...`);

      let dates: DateEntry[];
      if (options.month !== undefined) {
        const datesForYear = await scrapeYear(options.username, year, options.retries, options.delay, logger);
        dates = datesForYear.filter((d) => d.month === options.month);
        logger.info(`Found ${dates.length} days with journal entries in ${year}/${options.month}`);
      } else {
        dates = await scrapeYear(options.username, year, options.retries, options.delay, logger);
        logger.info(`Found ${dates.length} days with journal entries in ${year}`);
      }

      for (const date of dates) {
        if (limitReached()) break;
        if (options.dryRun) {
          logDryRunEntryPlain(logger, options.outputDir, date);
          totalEntries += date.entryCount ?? 0;
          totalDays++;
          continue;
        }
        if (options.skipExisting && await dayFileExists(options.outputDir, date)) {
          logger.debug(`Skipping existing file for ${date.year}/${date.month}/${date.day}`);
          continue;
        }
        const entries = await scrapeDay(options.username, date.year, date.month, date.day, options.retries, options.delay, logger);
        if (entries.length > 0) {
          await writeDayFile(options.outputDir, date, entries, logger);
          totalEntries += entries.length;
          totalDays++;
        } else {
          logger.debug(`No entries found for ${date.year}/${date.month}/${date.day}`);
        }
      }
    }
  }

  if (limitReached()) {
    logger.info(`Limit of ${options.limit} day(s) reached`);
  }
  if (!options.dryRun && totalDays > 0) {
    await writeTableOfContents(options.outputDir, options.username, logger);
  }
  if (options.dryRun) {
    logger.info(`Dry run complete: ${totalEntries} journal entries across ${totalDays} days`);
  } else {
    logger.info(`Archive complete: ${totalEntries} journal entries across ${totalDays} days`);
  }
}

interface TuiState {
  activeSpinner: ReturnType<typeof clack.spinner> | null;
  activeProgress: DualProgress | null;
}

function cleanupTui(state: TuiState, logger: TuiLogger): void {
  if (state.activeSpinner) {
    logger.clearSpinner();
    state.activeSpinner.stop(pc.red("Aborted"));
    state.activeSpinner = null;
  }
  if (state.activeProgress) {
    logger.clearProgress();
    state.activeProgress.stop(pc.red("Aborted"));
    state.activeProgress = null;
  }
}

async function runArchiveTui(options: ArchiveOptions): Promise<void> {
  const logger = new TuiLogger(options.verbose);
  const state: TuiState = { activeSpinner: null, activeProgress: null };
  const startTime = Date.now();

  clack.intro(pc.bgCyan(pc.black(" livejournal-backup ")) + (options.dryRun ? pc.dim(" dry run") : ""));
  if (!options.dryRun) {
    clack.log.info(`Output: ${pc.dim(options.outputDir)}`);
  }
  if (options.limit !== undefined) {
    clack.log.info(`Limit: ${pc.dim(String(options.limit))} day(s)`);
  }

  try {
    const { totalEntries, totalDays } = await archiveTuiCore(options, logger, state);
    const elapsed = formatElapsed(Date.now() - startTime);

    if (options.limit !== undefined && totalDays >= options.limit) {
      clack.log.warn(`Limit of ${options.limit} day(s) reached`);
    }
    if (!options.dryRun && totalDays > 0) {
      clack.log.step("Writing table of contents...");
      await writeTableOfContents(options.outputDir, options.username, logger);
      clack.note(
        `${pc.green("✓")} ${totalDays} days archived\n${pc.green("✓")} ${totalEntries} journal entries\n${pc.green("✓")} Output: ${options.outputDir}`,
        "Summary",
      );
    }
    if (options.dryRun) {
      clack.outro(`Dry run complete: ${pc.bold(String(totalEntries))} journal entries across ${pc.bold(String(totalDays))} days (${elapsed})`);
    } else {
      clack.outro(`Archive complete: ${pc.bold(String(totalEntries))} journal entries across ${pc.bold(String(totalDays))} days (${elapsed})`);
    }
  } catch (err) {
    cleanupTui(state, logger);
    const message = err instanceof Error ? err.message : String(err);
    clack.log.error(pc.red(message));
    clack.outro(pc.red("Archive failed"));
    process.exit(1);
  }
}

function formatDryRunCount(count: number | undefined): string {
  if (count === undefined) return pc.dim("unknown entries");
  const label = `${count} ${count === 1 ? "entry" : "entries"}`;
  if (count >= 6) return pc.green(label);
  if (count >= 3) return pc.yellow(label);
  return label;
}

function startSpinner(state: TuiState, logger: TuiLogger, message: string): ReturnType<typeof clack.spinner> {
  const s = clack.spinner();
  s.start(message);
  state.activeSpinner = s;
  logger.setSpinner(s);
  return s;
}

function stopSpinner(state: TuiState, logger: TuiLogger, message: string): void {
  logger.clearSpinner();
  state.activeSpinner?.stop(message);
  state.activeSpinner = null;
}

async function archiveTuiCore(
  options: ArchiveOptions,
  logger: TuiLogger,
  state: TuiState,
): Promise<{ totalEntries: number; totalDays: number }> {
  let totalEntries = 0;
  let totalDays = 0;

  const limitReached = (): boolean =>
    options.limit !== undefined && totalDays >= options.limit;

  if (options.day !== undefined && options.month !== undefined && options.year !== undefined) {
    const date: DateEntry = { year: options.year, month: options.month, day: options.day };
    const dateLabel = `${date.year}/${String(date.month).padStart(2, "0")}/${String(date.day).padStart(2, "0")}`;

    if (options.dryRun) {
      startSpinner(state, logger, `Scanning ${options.year}...`);
      const datesForYear = await scrapeYear(options.username, options.year, options.retries, options.delay, logger);
      stopSpinner(state, logger, `Found ${datesForYear.length} days with journal entries in ${options.year}`);

      const matched = datesForYear.find((d) => d.month === options.month && d.day === options.day);
      if (matched) {
        const filePath = getDayFilePath(options.outputDir, matched);
        clack.log.message(`${pc.dim(filePath)} (${formatDryRunCount(matched.entryCount)})`);
        totalEntries += matched.entryCount ?? 0;
        totalDays++;
      } else {
        clack.log.message(pc.dim(`⊘ No entries found for ${dateLabel}`));
      }
    } else {
      startSpinner(state, logger, `Archiving ${dateLabel}...`);

      if (options.skipExisting && await dayFileExists(options.outputDir, date)) {
        stopSpinner(state, logger, pc.dim("Skipped"));
        clack.log.message(pc.dim(`⊘ Skipped ${dateLabel} (file exists)`));
      } else {
        const entries = await scrapeDay(options.username, date.year, date.month, date.day, options.retries, options.delay, logger);
        if (entries.length > 0) {
          await writeDayFile(options.outputDir, date, entries, logger);
          const filePath = getDayFilePath(options.outputDir, date);
          stopSpinner(state, logger, pc.green("Done"));
          clack.log.success(`Wrote ${pc.dim(filePath)}`);
          totalEntries += entries.length;
          totalDays++;
        } else {
          stopSpinner(state, logger, pc.dim("No entries"));
          clack.log.message(pc.dim(`⊘ No entries found for ${dateLabel}`));
        }
      }
    }
  } else {
    let years: number[];

    if (options.year !== undefined) {
      years = [options.year];
      clack.log.info(`Archiving year: ${pc.cyan(String(options.year))}`);
    } else {
      startSpinner(state, logger, "Discovering years with journal entries...");
      years = await scrapeCalendar(options.username, options.retries, options.delay, logger);
      stopSpinner(state, logger, `Years with journal entries: ${pc.cyan(years.join(", "))}`);
    }

    for (const year of years) {
      if (limitReached()) break;

      let yearEntries = 0;
      let yearDays = 0;

      startSpinner(state, logger, `Scanning ${year}...`);
      let dates: DateEntry[];
      if (options.month !== undefined) {
        const datesForYear = await scrapeYear(options.username, year, options.retries, options.delay, logger);
        dates = datesForYear.filter((d) => d.month === options.month);
      } else {
        dates = await scrapeYear(options.username, year, options.retries, options.delay, logger);
      }
      stopSpinner(state, logger, `Found ${dates.length} days with journal entries in ${year}`);

      if (options.dryRun) {
        for (const date of dates) {
          if (limitReached()) break;
          const filePath = getDayFilePath(options.outputDir, date);
          clack.log.message(`${pc.dim(filePath)} (${formatDryRunCount(date.entryCount)})`);
          totalEntries += date.entryCount ?? 0;
          totalDays++;
          yearEntries += date.entryCount ?? 0;
          yearDays++;
        }
        clack.log.info(`${pc.cyan(String(year))}: ${pc.bold(String(yearEntries))} journal entries across ${pc.bold(String(yearDays))} days`);
      } else {
        let eligible = dates;
        if (options.skipExisting) {
          const filtered: DateEntry[] = [];
          let skippedCount = 0;
          for (const date of dates) {
            if (await dayFileExists(options.outputDir, date)) {
              skippedCount++;
            } else {
              filtered.push(date);
            }
          }
          if (skippedCount > 0) {
            clack.log.message(pc.dim(`⊘ Skipping ${skippedCount} existing file(s)`));
          }
          eligible = filtered;
        }

        if (eligible.length === 0) {
          clack.log.message(pc.dim(`No new days to archive in ${year}`));
        } else {
          const prog = dualProgress({ max: eligible.length });
          prog.start(`Archiving ${pc.bold(String(year))}`);
          state.activeProgress = prog;
          logger.setProgress(prog);

          for (const date of eligible) {
            if (limitReached()) break;

            prog.message(`${pc.cyan(shortDate(date.month, date.day))} ${pc.dim("fetching…")}`);
            const entries = await scrapeDay(options.username, date.year, date.month, date.day, options.retries, options.delay, logger);
            if (entries.length > 0) {
              await writeDayFile(options.outputDir, date, entries, logger);
              const filePath = getDayFilePath(options.outputDir, date);
              prog.advance(1, `${pc.green("✓")} ${pc.cyan(shortDate(date.month, date.day))} ${pc.dim(filePath)}`);
              totalEntries += entries.length;
              totalDays++;
              yearEntries += entries.length;
              yearDays++;
            } else {
              prog.advance(1, pc.dim(`⊘ no entries ${shortDate(date.month, date.day)}`));
            }
          }

          prog.stop(`${pc.green("✓")} ${year}: ${yearEntries} journal entries across ${yearDays} days`);
          logger.clearProgress();
          state.activeProgress = null;
        }
      }
    }
  }

  return { totalEntries, totalDays };
}

function logDryRunEntryPlain(logger: Logger, outputDir: string, date: DateEntry): void {
  const filePath = getDayFilePath(outputDir, date);
  const count = date.entryCount;
  const countLabel = count !== undefined
    ? `${count} ${count === 1 ? "entry" : "entries"}`
    : "unknown entries";
  logger.log(`${filePath}  (${countLabel})`);
}
