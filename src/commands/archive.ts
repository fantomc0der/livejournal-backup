import type { ArchiveOptions, DateEntry } from "../types.ts";
import { Logger } from "../utils/logger.ts";
import { scrapeCalendar } from "../scrapers/calendar.ts";
import { scrapeYear } from "../scrapers/year.ts";
import { scrapeDay } from "../scrapers/day.ts";
import { writeDayFile, dayFileExists, getDayFilePath, writeTableOfContents } from "../writers/file-writer.ts";

export async function runArchive(options: ArchiveOptions): Promise<void> {
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
      // In single-day dry run, we need the year page to get the entry count
      const datesForYear = await scrapeYear(
        options.username,
        options.year,
        options.retries,
        options.delay,
        logger
      );
      const matched = datesForYear.find((d) => d.month === options.month && d.day === options.day);
      if (matched) {
        logDryRunEntry(logger, options.outputDir, matched);
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
        const entries = await scrapeDay(
          options.username,
          date.year,
          date.month,
          date.day,
          options.retries,
          options.delay,
          logger
        );

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
      logger.info("Discovering years from calendar...");
      years = await scrapeCalendar(
        options.username,
        options.retries,
        options.delay,
        logger
      );
      logger.info(`Found years: ${years.join(", ")}`);
    }

    for (const year of years) {
      if (limitReached()) break;

      logger.info(`Processing year ${year}...`);

      let dates: DateEntry[];

      if (options.month !== undefined) {
        const datesForYear = await scrapeYear(
          options.username,
          year,
          options.retries,
          options.delay,
          logger
        );
        dates = datesForYear.filter((d) => d.month === options.month);
        logger.info(`Found ${dates.length} days in ${year}/${options.month}`);
      } else {
        dates = await scrapeYear(
          options.username,
          year,
          options.retries,
          options.delay,
          logger
        );
        logger.info(`Found ${dates.length} days in ${year}`);
      }

      for (const date of dates) {
        if (limitReached()) break;

        if (options.dryRun) {
          logDryRunEntry(logger, options.outputDir, date);
          totalEntries += date.entryCount ?? 0;
          totalDays++;
          continue;
        }

        if (options.skipExisting && await dayFileExists(options.outputDir, date)) {
          logger.debug(`Skipping existing file for ${date.year}/${date.month}/${date.day}`);
          continue;
        }

        const entries = await scrapeDay(
          options.username,
          date.year,
          date.month,
          date.day,
          options.retries,
          options.delay,
          logger
        );

        if (entries.length > 0) {
          await writeDayFile(
            options.outputDir,
            date,
            entries,
            logger
          );
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
    logger.info(`Dry run complete: ${totalEntries} entries across ${totalDays} days`);
  } else {
    logger.info(`Archive complete: ${totalEntries} entries across ${totalDays} days`);
  }
}

function logDryRunEntry(logger: Logger, outputDir: string, date: DateEntry): void {
  const filePath = getDayFilePath(outputDir, date);
  const count = date.entryCount;
  const countLabel = count !== undefined
    ? `${count} ${count === 1 ? "entry" : "entries"}`
    : "unknown entries";
  logger.log(`${filePath}  (${countLabel})`);
}
