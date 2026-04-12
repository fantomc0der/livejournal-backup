import * as cheerio from "cheerio";
import { isTag, type AnyNode, type Element } from "domhandler";
import { fetchWithRetry, sleep } from "../utils/http.ts";
import type { Logger } from "../utils/logger.ts";
import type { JournalEntry } from "../types.ts";

const LJ_NAV_URL_PATTERNS = [
  /[?&]mode=reply/i,
  /[?&]view=comments/i,
  /[?&]thread=/i,
  /livejournal\.com\/update\.bml/i,
  /livejournal\.com\/tools\/content_flag\.bml/i,
  /livejournal\.com\/allpics\.bml/i,
];

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
    ".entryHolder",
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
    const fromAnchors = extractEntriesFromTitleAnchors($, username);
    if (fromAnchors.length > 0) return fromAnchors;
    return extractEntriesFromPermalinks($, username);
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
    const timeEl = $el.find(".time, time, .entry-time, .datetime, .entryHeaderDate").first();
    time = timeEl.text().trim();
  }

  const bodySelectors = ".entry-content, .j-e-body, .entry-body, .text, .entrytext, .entryText, .s2-entrytext";
  const bodyEl = $el.find(bodySelectors).first();

  let content: string;
  if (bodyEl.length > 0) {
    content = bodyEl.html() ?? "";
  } else {
    content = stripLjChrome($, $el.clone(), username);
  }

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

function extractEntriesFromPermalinks(
  $: cheerio.CheerioAPI,
  username: string
): JournalEntry[] {
  const entries: JournalEntry[] = [];
  const entryPattern = new RegExp(`https?://${username}\\.livejournal\\.com/(\\d+)\\.html$`);
  const seen = new Set<string>();

  $("a").each((_i, el) => {
    const $el = $(el);
    const href = $el.attr("href") ?? "";
    const match = entryPattern.exec(href);
    if (!match) return;
    if (seen.has(href)) return;
    seen.add(href);

    const subject = extractPermalinkSubject($el) || "(no subject)";

    const $container = findEntryContainer($, $el);
    if (!$container || $container.length === 0) return;

    const time = extractPermalinkTime($container);
    const content = stripLjChrome($, $container.clone(), username);

    if (!content.trim()) return;

    entries.push({ subject, time, url: href, content });
  });

  return entries;
}

function extractPermalinkSubject($el: cheerio.Cheerio<AnyNode>): string {
  const linkText = $el.text().trim().replace(/^[\s\-–—]+/, "").trim();
  if (linkText && linkText !== "(no subject)") return linkText;
  return "";
}

function findEntryContainer(
  $: cheerio.CheerioAPI,
  $link: cheerio.Cheerio<AnyNode>
): cheerio.Cheerio<AnyNode> | null {
  let $candidate = $link.closest("td");
  if ($candidate.length > 0) return $candidate;
  $candidate = $link.parent();
  for (let i = 0; i < 5 && $candidate.length > 0; i++) {
    if ($candidate.is("td, div, article, section")) return $candidate;
    $candidate = $candidate.parent();
  }
  return null;
}

function extractPermalinkTime($container: cheerio.Cheerio<AnyNode>): string {
  const containerText = $container.text();
  const timeMatch = /\b(\d{1,2}:\d{2}\s*(?:am|pm|[ap]))\b/i.exec(containerText);
  return timeMatch?.[1] ?? "";
}

function stripLjChrome(
  $: cheerio.CheerioAPI,
  $clone: cheerio.Cheerio<AnyNode>,
  username: string
): string {
  const permalinkPattern = new RegExp(`https?://${username}\\.livejournal\\.com/\\d+\\.html$`);

  $clone.find("a").each((_i, el) => {
    const href = $(el).attr("href") ?? "";
    if (isLjNavUrl(href)) {
      removeWithContainer($, $(el));
    }
  });

  $clone.find("a").each((_i, el) => {
    const href = $(el).attr("href") ?? "";
    if (/allpics\.bml/i.test(href)) {
      $(el).remove();
    }
  });

  $clone.find(".ljuser, .i-ljuser, [data-ljuser]").each((_i, el) => {
    $(el).remove();
  });

  $clone.find("a").each((_i, el) => {
    const href = $(el).attr("href") ?? "";
    if (permalinkPattern.test(href)) {
      removeWithContainer($, $(el));
    }
  });

  $clone.find('a[href^="#"]').each((_i, el) => {
    removeWithContainer($, $(el));
  });

  return $clone.html() ?? "";
}

function isLjNavUrl(href: string): boolean {
  return LJ_NAV_URL_PATTERNS.some((p) => p.test(href));
}

function removeWithContainer($: cheerio.CheerioAPI, $el: cheerio.Cheerio<AnyNode>): void {
  const $parent = $el.parent();
  if ($parent.length > 0 && ["li", "p", "font"].includes($parent.prop("tagName")?.toLowerCase() ?? "")) {
    const siblingText = $parent.contents().filter((_i, node) => node !== $el.get(0)).text().trim().replace(/[|•·()]/g, "").trim();
    if (siblingText.length === 0) {
      $parent.remove();
      return;
    }
  }
  $el.remove();
}

function resolveEntryUrl(href: string, username: string): string {
  if (!href) return "";
  if (href.startsWith("http")) return href;
  return `https://${username}.livejournal.com${href}`;
}
