import type { ArchiveOptions, DateEntry } from "../types.ts";
import { Logger } from "../utils/logger.ts";
import { scrapeCalendar } from "../scrapers/calendar.ts";
import { scrapeYear } from "../scrapers/year.ts";
import { scrapeDay } from "../scrapers/day.ts";
import { writeDayFile } from "../writers/file-writer.ts";

export async function runArchive(options: ArchiveOptions): Promise<void> {
  const logger = new Logger(options.verbose);

  logger.info(`Starting archive for user: ${options.username}`);
  logger.info(`Output directory: ${options.outputDir}`);

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

  let totalEntries = 0;
  let totalDays = 0;

  for (const year of years) {
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
          options.skipExisting,
          logger
        );
        totalEntries += entries.length;
        totalDays++;
      } else {
        logger.debug(`No entries found for ${date.year}/${date.month}/${date.day}`);
      }
    }
  }

  logger.info(`Archive complete: ${totalEntries} entries across ${totalDays} days`);
}
