import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { fetchWithRetry, sleep } from "../utils/http.ts";
import type { Logger } from "../utils/logger.ts";

export interface Comment {
  id: string;
  depth: number;
  username: string;
  userUrl: string;
  timestampText: string;
  permalinkUrl: string;
  contentHtml: string;
}

const LJ_COMMENT_ACTION_PATTERNS = [
  /[?&]mode=reply/i,
  /[?&]replyto=/i,
  /livejournal\.com\/tools\/content_flag\.bml/i,
  /b-pseudo/,
];

export async function scrapeComments(
  entryUrl: string,
  retries: number,
  delay: number,
  logger: Logger
): Promise<Comment[]> {
  const commentUrl = buildCommentUrl(entryUrl);
  logger.debug(`Fetching comments: ${commentUrl}`);
  const html = await fetchWithRetry(commentUrl, retries, delay, logger);
  await sleep(delay);
  return extractCommentsFromHtml(html);
}

export function buildCommentUrl(entryUrl: string): string {
  const base = entryUrl.replace(/[?#].*$/, "");
  return `${base}?view=comments`;
}

export function extractCommentsFromHtml(html: string): Comment[] {
  const $ = cheerio.load(html);
  const comments: Comment[] = [];

  // Modern LJ theme: b-tree-twig wrappers inside b-tree-root
  const twigs = $(".b-tree-twig");
  if (twigs.length > 0) {
    twigs.each((_i, twig) => {
      const $twig = $(twig);
      const leaf = $twig.children(".b-leaf.comment").first();
      if (leaf.length === 0) return;

      const depth = extractTwigDepth($twig.attr("class") ?? "");
      const comment = parseModernComment($, leaf, depth);
      if (comment) comments.push(comment);
    });
    return comments;
  }

  // Fallback: look for comment elements with thread links (older/custom themes)
  const threadLinks = $('a[href*="thread="]');
  if (threadLinks.length > 0) {
    return extractLegacyComments($);
  }

  return comments;
}

function extractTwigDepth(className: string): number {
  // b-tree-twig-N where N is the 1-based depth level
  const match = /\bb-tree-twig-(\d+)\b/.exec(className);
  if (match) return parseInt(match[1]!, 10) - 1; // convert to 0-based
  // Fallback: parse margin-left from style (30px per level)
  return 0;
}

function parseModernComment(
  $: cheerio.CheerioAPI,
  $leaf: cheerio.Cheerio<AnyNode>,
  depth: number
): Comment | null {
  const id = $leaf.attr("id") ?? "";
  if (!id) return null;

  const username = $leaf.find(".b-leaf-username-name").first().text().trim() || "Anonymous";

  // User profile link — the avatar/name link; anonymous has empty href
  const userLinkEl = $leaf.find(".b-leaf-username a, .b-leaf-userpic-inner").first();
  const rawUserUrl = userLinkEl.attr("href") ?? "";
  const userUrl = rawUserUrl && rawUserUrl !== "#" && rawUserUrl !== "" ? rawUserUrl : "";

  const permalinkEl = $leaf.find(".b-leaf-permalink").first();
  const permalinkUrl = permalinkEl.attr("href") ?? "";
  const timestampText = $leaf.find(".b-leaf-createdtime").first().text().trim();

  const $articleClone = $leaf.find(".b-leaf-article").first().clone();

  // Strip action links (Reply, Like, Report, etc.)
  $articleClone.find("a").each((_i, el) => {
    const href = $(el).attr("href") ?? "";
    const cls = $(el).attr("class") ?? "";
    if (isCommentActionLink(href, cls)) {
      $(el).remove();
    }
  });
  $articleClone.find("form, input, button, .b-leaf-actions, .b-leaf-controls__wrap").remove();

  const contentHtml = $articleClone.html()?.trim() ?? "";

  return { id, depth, username, userUrl, timestampText, permalinkUrl, contentHtml };
}

function isCommentActionLink(href: string, cls: string): boolean {
  if (LJ_COMMENT_ACTION_PATTERNS.some((p) => p.test(href))) return true;
  if (LJ_COMMENT_ACTION_PATTERNS.some((p) => p.test(cls))) return true;
  return false;
}

function extractLegacyComments($: cheerio.CheerioAPI): Comment[] {
  // Older LJ themes may not use b-tree-twig; use thread link anchors as anchors
  const comments: Comment[] = [];
  const seen = new Set<string>();
  const threadPattern = /[?&]thread=(\d+)/;

  $('a[href*="thread="]').each((_i, el) => {
    const href = $(el).attr("href") ?? "";
    const match = threadPattern.exec(href);
    if (!match) return;
    const threadId = `t${match[1]}`;
    if (seen.has(threadId)) return;
    seen.add(threadId);

    // Walk up to find the comment container
    let $container = $(el).closest("[id^='t']");
    if ($container.length === 0) {
      $container = $(el).closest("div, li, td");
    }
    if ($container.length === 0) return;

    const username = $container.find('[class*="username"]').first().text().trim() || "Anonymous";
    const timestampText = $(el).text().trim();
    const $contentClone = $container.clone();
    $contentClone.find("a").each((_j, a) => {
      const aHref = $(a).attr("href") ?? "";
      if (/[?&]replyto=|[?&]mode=reply/.test(aHref)) $(a).remove();
    });

    comments.push({
      id: threadId,
      depth: 0,
      username,
      userUrl: "",
      timestampText,
      permalinkUrl: href,
      contentHtml: $contentClone.html()?.trim() ?? "",
    });
  });

  return comments;
}
