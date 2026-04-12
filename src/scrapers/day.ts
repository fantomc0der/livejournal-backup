import * as cheerio from "cheerio";
import { isTag, type AnyNode, type Element } from "domhandler";
import { fetchWithRetry, sleep } from "../utils/http.ts";
import type { Logger } from "../utils/logger.ts";
import type { JournalEntry } from "../types.ts";

export async function scrapeDay(
  username: string,
  year: number,
  month: number,
  day: number,
  retries: number,
  delay: number,
  logger: Logger
): Promise<JournalEntry[]> {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const url = `https://${username}.livejournal.com/${year}/${mm}/${dd}/`;
  logger.info(`Fetching day page: ${url}`);
  const html = await fetchWithRetry(url, retries, delay, logger);
  await sleep(delay);
  return extractEntriesFromHtml(html, username);
}

export function extractEntriesFromHtml(html: string, username: string): JournalEntry[] {
  const $ = cheerio.load(html);
  const entries: JournalEntry[] = [];

  const entrySelectors = [
    ".entry",
    "div.entry",
    "article.entry",
    "article",
    ".j-e-body",
    ".entry-content",
  ];

  let entryElements: cheerio.Cheerio<AnyNode> | null = null;
  for (const selector of entrySelectors) {
    const found = $(selector);
    if (found.length > 0) {
      entryElements = found;
      break;
    }
  }

  if (!entryElements || entryElements.length === 0) {
    return extractEntriesFromTitleAnchors($, username);
  }

  entryElements.each((_i, el) => {
    if (!isTag(el)) return;
    const entry = parseEntryElement($, el, username);
    if (entry) {
      entries.push(entry);
    }
  });

  return entries;
}

function parseEntryElement(
  $: cheerio.CheerioAPI,
  el: Element,
  username: string
): JournalEntry | null {
  const $el = $(el);

  const titleEl = $el.find("h4.subject a, h3 a, h2 a, h4 a, .entry-title a, .subj-link").first();
  const subject = titleEl.text().trim() || "(no subject)";

  const entryUrl = resolveEntryUrl(titleEl.attr("href") ?? "", username);

  const subjectEl = $el.find("h4.subject, h3.subject, h2.subject, .entry-title").first();
  let time = "";
  if (subjectEl.length > 0) {
    const subjectText = subjectEl.text();
    const timeMatch = /@ (\d{1,2}:\d{2}\s*(?:am|pm))/i.exec(subjectText);
    time = timeMatch?.[1] ?? "";
  }
  if (!time) {
    const timeEl = $el.find(".time, time, .entry-time, .datetime").first();
    time = timeEl.text().trim();
  }

  const bodyEl = $el.find(".entry-content, .j-e-body, .entry-body, .text").first();
  const content = bodyEl.length > 0 ? bodyEl.html() ?? "" : $el.html() ?? "";

  if (!content.trim()) return null;

  return { subject, time, url: entryUrl, content };
}

function extractEntriesFromTitleAnchors(
  $: cheerio.CheerioAPI,
  username: string
): JournalEntry[] {
  const entries: JournalEntry[] = [];
  const entryPattern = new RegExp(`https?://${username}\\.livejournal\\.com/\\d+\\.html`);

  $("h3 a, h2 a, h4 a").each((_i, el) => {
    const $el = $(el);
    const href = $el.attr("href") ?? "";
    if (!entryPattern.test(href)) return;

    const subject = $el.text().trim() || "(no subject)";
    const url = href;

    const $heading = $el.closest("h3, h2, h4");
    const headingText = $heading.text();
    const timeMatch = /(\d{1,2}:\d{2}\s*(?:am|pm))/i.exec(headingText);
    const time = timeMatch?.[1] ?? "";

    const $nextContent = $heading.nextUntil("h3, h2, h4");
    const content = $nextContent.map((_j, node) => $.html(node)).get().join("");

    entries.push({ subject, time, url, content });
  });

  return entries;
}

function resolveEntryUrl(href: string, username: string): string {
  if (!href) return "";
  if (href.startsWith("http")) return href;
  return `https://${username}.livejournal.com${href}`;
}
