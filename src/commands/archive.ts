import type { ArchiveOptions, DateEntry, LocalDate } from "../types.ts";
import * as clack from "@clack/prompts";
import pc from "picocolors";
import { Logger } from "../utils/logger.ts";
import { TuiLogger } from "../tui/logger.ts";
import { isTTY } from "../tui/tty.ts";
import { dualProgress, type DualProgress } from "../tui/progress.ts";
import { scrapeCalendar } from "../scrapers/calendar.ts";
import { scrapeYear } from "../scrapers/year.ts";
import { scrapeDay } from "../scrapers/day.ts";
import { writeDayFile, dayFileExists, getDayFilePath, writeTableOfContents } from "../writers/file-writer.ts";
import { addDays, formatDate, isDateInRange, yearsInRange } from "../utils/date.ts";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDate(month: number, day: number): string {
  return `${MONTH_SHORT[month - 1]} ${day}`;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
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

type YearPlan = { kind: "explicit"; years: number[] } | { kind: "discover" };

interface ResolvedRange {
  plan: YearPlan;
  dateFilter: ((d: DateEntry) => boolean) | null;
  rangeLabel: string | null;
  singleDate: LocalDate | null;
}

function resolveRange(options: ArchiveOptions): ResolvedRange {
  if (options.startDate !== undefined && options.days !== undefined) {
    const start = options.startDate;
    const end = addDays(start, options.days - 1);
    const years = yearsInRange(start, end);
    const plural = options.days === 1 ? "day" : "days";
    const rangeLabel = options.days === 1
      ? formatDate(start)
      : `${formatDate(start)} → ${formatDate(end)} (${options.days} ${plural})`;
    return {
      plan: { kind: "explicit", years },
      dateFilter: (d) => isDateInRange(d, start, end),
      rangeLabel,
      singleDate: options.days === 1 ? start : null,
    };
  }
  if (options.year !== undefined) {
    return {
      plan: { kind: "explicit", years: [options.year] },
      dateFilter: null,
      rangeLabel: null,
      singleDate: null,
    };
  }
  return { plan: { kind: "discover" }, dateFilter: null, rangeLabel: null, singleDate: null };
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

  const range = resolveRange(options);
  if (range.rangeLabel) {
    logger.info(`Date range: ${range.rangeLabel}`);
  }

  let totalEntries = 0;
  let totalDays = 0;

  const limitReached = (): boolean =>
    options.limit !== undefined && totalDays >= options.limit;

  if (!options.dryRun && range.singleDate) {
    const date = range.singleDate;
    const dateLabel = formatDate(date);
    logger.info(`Archiving single day: ${dateLabel}`);
    if (options.skipExisting && await dayFileExists(options.outputDir, date)) {
      logger.debug(`Skipping existing file for ${dateLabel}`);
    } else {
      const entries = await scrapeDay(options.username, date.year, date.month, date.day, options.retries, options.delay, logger);
      if (entries.length > 0) {
        await writeDayFile(options.outputDir, date, entries, logger);
        totalEntries += entries.length;
        totalDays++;
      } else {
        logger.debug(`No entries found for ${dateLabel}`);
      }
    }
  } else {
    let years: number[];
    if (range.plan.kind === "discover") {
      logger.info("Discovering years with journal entries...");
      years = await scrapeCalendar(options.username, options.retries, options.delay, logger);
      logger.info(`Years with journal entries: ${years.join(", ")}`);
    } else {
      years = range.plan.years;
      if (range.rangeLabel === null && years.length === 1) {
        logger.info(`Archiving year: ${years[0]}`);
      }
    }

    for (const year of years) {
      if (limitReached()) break;
      logger.info(`Processing year ${year}...`);

      let dates = await scrapeYear(options.username, year, options.retries, options.delay, logger);
      if (range.dateFilter) {
        dates = dates.filter(range.dateFilter);
      }
      logger.info(`Found ${dates.length} dates with journal entries in ${year}`);

      for (const date of dates) {
        if (limitReached()) break;
        if (options.dryRun) {
          logDryRunEntryPlain(logger, options.outputDir, date);
          totalEntries += date.entryCount ?? 0;
          totalDays++;
          continue;
        }
        if (options.skipExisting && await dayFileExists(options.outputDir, date)) {
          logger.debug(`Skipping existing file for ${formatDate(date)}`);
          continue;
        }
        const entries = await scrapeDay(options.username, date.year, date.month, date.day, options.retries, options.delay, logger);
        if (entries.length > 0) {
          await writeDayFile(options.outputDir, date, entries, logger);
          totalEntries += entries.length;
          totalDays++;
        } else {
          logger.debug(`No entries found for ${formatDate(date)}`);
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
    logger.info(`${pc.magenta("Dry run")} for archive complete: ${fmt(totalEntries)} journal entries across ${fmt(totalDays)} days`);
  } else {
    logger.info(`Archive complete: ${fmt(totalEntries)} journal entries across ${fmt(totalDays)} days`);
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
      clack.outro(`${pc.magenta("Dry run")} for archive complete: ${pc.bold(fmt(totalEntries))} journal entries across ${pc.bold(fmt(totalDays))} days (${elapsed})`);
    } else {
      clack.outro(`Archive complete: ${pc.bold(fmt(totalEntries))} journal entries across ${pc.bold(fmt(totalDays))} days (${elapsed})`);
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

  const range = resolveRange(options);
  if (range.rangeLabel) {
    clack.log.info(`Range: ${pc.dim(range.rangeLabel)}`);
  }

  const limitReached = (): boolean =>
    options.limit !== undefined && totalDays >= options.limit;

  if (!options.dryRun && range.singleDate) {
    const date = range.singleDate;
    const dateLabel = formatDate(date);
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
    return { totalEntries, totalDays };
  }

  let years: number[];
  if (range.plan.kind === "discover") {
    startSpinner(state, logger, "Discovering years with journal entries...");
    years = await scrapeCalendar(options.username, options.retries, options.delay, logger);
    stopSpinner(state, logger, `Years with journal entries: ${pc.cyan(years.join(", "))}`);
  } else {
    years = range.plan.years;
    if (range.rangeLabel === null && years.length === 1) {
      clack.log.info(`Archiving year: ${pc.cyan(String(years[0]))}`);
    }
  }

  for (const year of years) {
    if (limitReached()) break;

    let yearEntries = 0;
    let yearDays = 0;

    startSpinner(state, logger, `Scanning ${year}...`);
    let dates = await scrapeYear(options.username, year, options.retries, options.delay, logger);
    if (range.dateFilter) {
      dates = dates.filter(range.dateFilter);
    }
    stopSpinner(state, logger, `${pc.cyan(String(year))}: Found ${dates.length} dates with journal entries`);

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
      clack.log.message(`${pc.green("✓")} Would save ${pc.bold(fmt(yearEntries))} journal entries across ${pc.bold(fmt(yearDays))} days`);
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

        prog.stop(`${pc.green("✓")} Saved ${fmt(yearEntries)} journal entries across ${fmt(yearDays)} days`);
        logger.clearProgress();
        state.activeProgress = null;
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
