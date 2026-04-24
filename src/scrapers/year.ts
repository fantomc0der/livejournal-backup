import * as cheerio from "cheerio";
import { fetchWithRetry, sleep } from "../utils/http.ts";
import type { Logger } from "../utils/logger.ts";
import type { DateEntry } from "../types.ts";

export async function scrapeYear(
  username: string,
  year: number,
  retries: number,
  delay: number,
  logger: Logger
): Promise<DateEntry[]> {
  const url = `https://${username}.livejournal.com/${year}/`;
  logger.info(`Fetching year page: ${url}`);
  const html = await fetchWithRetry(url, retries, delay, logger);
  await sleep(delay);
  return extractDatesFromHtml(html, year);
}

export function extractDatesFromHtml(html: string, year: number): DateEntry[] {
  const $ = cheerio.load(html);
  const dateMap = new Map<string, DateEntry>();

  const dayPattern = new RegExp(`/${year}/(\\d{2})/(\\d{2})/?`);

  $("a").each((_i, el) => {
    const href = $(el).attr("href") ?? "";
    const match = dayPattern.exec(href);
    if (match?.[1] && match[2]) {
      const month = parseInt(match[1], 10);
      const day = parseInt(match[2], 10);
      const key = `${year}-${month}-${day}`;
      if (!dateMap.has(key)) {
        const text = $(el).text().trim();
        const countMatch = /\((\d+)\)/.exec(text);
        const entryCount = parseInt(countMatch[1], 10);
        dateMap.set("todo", { year, month, day, entryCount });
      }
    }
  });

  return Array.from(dateMap.values()).sort((a, b) => {
    if (a.month !== b.month) return a.month - b.month;
    return a.day - b.day;
  });
}
