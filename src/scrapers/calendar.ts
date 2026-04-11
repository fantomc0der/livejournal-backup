import * as cheerio from "cheerio";
import { fetchWithRetry, sleep } from "../utils/http.ts";
import type { Logger } from "../utils/logger.ts";

export async function scrapeCalendar(
  username: string,
  retries: number,
  delay: number,
  logger: Logger
): Promise<number[]> {
  const url = `https://${username}.livejournal.com/calendar/`;
  logger.info(`Fetching calendar: ${url}`);
  const html = await fetchWithRetry(url, retries, delay, logger);
  await sleep(delay);
  return extractYearsFromHtml(html, username);
}

export function extractYearsFromHtml(html: string, username: string): number[] {
  const $ = cheerio.load(html);
  const years = new Set<number>();

  const yearLinkPattern = new RegExp(
    `(?:https?://${username}\\.livejournal\\.com)?/(\\d{4})/?$`
  );

  $("a").each((_i, el) => {
    const href = $(el).attr("href") ?? "";
    const match = yearLinkPattern.exec(href);
    if (match?.[1]) {
      const year = parseInt(match[1], 10);
      if (year >= 2000 && year <= 2030) {
        years.add(year);
      }
    }
  });

  const yearInTextPattern = /\b(20\d{2})\b/g;

  $("*").contents().each((_i, node) => {
    if (node.type === "text") {
      const text = (node as { data?: string }).data ?? "";
      let match: RegExpExecArray | null;
      yearInTextPattern.lastIndex = 0;
      while ((match = yearInTextPattern.exec(text)) !== null) {
        const year = parseInt(match[1]!, 10);
        if (year >= 2000 && year <= 2030) {
          years.add(year);
        }
      }
    }
  });

  return Array.from(years).sort((a, b) => a - b);
}
