import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
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

// LJ S1 legacy themes indent threaded replies in 25px increments per nesting level
const LEGACY_INDENT_PX = 25;

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
  // ?nojs=1 forces LJ to render the static, server-rendered comment tree.
  // Without it, modern themes return an empty .b-tree-root and load comments via JS.
  return `${base}?nojs=1&view=comments`;
}

export function extractCommentsFromHtml(html: string): Comment[] {
  const $ = cheerio.load(html);

  // Modern LJ theme: b-tree-twig wrappers inside b-tree-root
  const twigs = $(".b-tree-twig");
  if (twigs.length > 0) {
    const comments: Comment[] = [];
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

  // S1 legacy theme: <div id="ljcmt{id}" style="margin-left: Npx">
  const legacyContainers = $('[id^="ljcmt"]');
  if (legacyContainers.length > 0) {
    const comments: Comment[] = [];
    legacyContainers.each((_i, el) => {
      const comment = parseLegacyComment($, $(el));
      if (comment) comments.push(comment);
    });
    return comments;
  }

  return [];
}

function extractTwigDepth(className: string): number {
  // b-tree-twig-N where N is the 1-based depth level
  const match = /\bb-tree-twig-(\d+)\b/.exec(className);
  if (match) return parseInt(match[1]!, 10) - 1; // convert to 0-based
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
  const userUrl = rawUserUrl && rawUserUrl !== "#" ? rawUserUrl : "";

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

function parseLegacyComment(
  $: cheerio.CheerioAPI,
  $cmt: cheerio.Cheerio<AnyNode>
): Comment | null {
  const idAttr = $cmt.attr("id") ?? "";
  const threadNumeric = idAttr.replace(/^ljcmt/, "");
  if (!threadNumeric) return null;
  const id = `t${threadNumeric}`;

  const depth = extractLegacyDepth($cmt.attr("style") ?? "");

  const $ljuser = $cmt.find("span.ljuser[data-ljuser]").first();
  let username = ($ljuser.attr("data-ljuser") ?? "").trim();
  let userUrl = "";
  if (username) {
    userUrl = ($ljuser.find("a.i-ljuser-username").first().attr("href") ?? "").trim();
    if (!userUrl) {
      // Fall back to any non-profile anchor inside the ljuser span
      userUrl = ($ljuser.find("a").not(".i-ljuser-profile").first().attr("href") ?? "").trim();
    }
  } else {
    username = "Anonymous";
  }

  const permalinkUrl = findLegacyPermalink($, $cmt, threadNumeric);
  const timestampText = findLegacyTimestamp($, $cmt);
  const contentHtml = extractLegacyBody($, $cmt, threadNumeric);

  return { id, depth, username, userUrl, timestampText, permalinkUrl, contentHtml };
}

function extractLegacyDepth(style: string): number {
  const match = /margin-left\s*:\s*(\d+)\s*px/i.exec(style);
  if (!match) return 0;
  const px = parseInt(match[1]!, 10);
  if (!Number.isFinite(px) || px <= 0) return 0;
  return Math.round(px / LEGACY_INDENT_PX);
}

function findLegacyPermalink(
  $: cheerio.CheerioAPI,
  $cmt: cheerio.Cheerio<AnyNode>,
  threadNumeric: string
): string {
  const exactPattern = new RegExp(`[?&]thread=${threadNumeric}(?:#t${threadNumeric}\\b|\\b)`);
  let permalinkUrl = "";
  $cmt.find("a[href*='thread=']").each((_i, a) => {
    const href = $(a).attr("href") ?? "";
    if (!exactPattern.test(href)) return;
    if (LJ_COMMENT_ACTION_PATTERNS.some((p) => p.test(href))) return;
    permalinkUrl = href;
    return false;
  });
  return permalinkUrl;
}

function findLegacyTimestamp(
  $: cheerio.CheerioAPI,
  $cmt: cheerio.Cheerio<AnyNode>
): string {
  // The timestamp is inside a <span title="..."> within the comment header.
  // Scope to the header region (comment_bar_one for one S1 variant, the first
  // row of the cmtbar table for the other) so user-authored body content like
  // "<span>We met in 2003</span>" can't shadow the real timestamp.
  let $headers: cheerio.Cheerio<AnyNode> = $cmt.find(".comment_bar_one, .comment_bar_alt");
  if ($headers.length === 0) {
    $headers = $cmt.find('table[id^="cmtbar"]').find("> tbody > tr, > tr").first();
  }
  if ($headers.length === 0) $headers = $cmt;

  let timestampText = "";
  $headers.find("span[title]").each((_i, sp) => {
    const text = $(sp).text().trim();
    if (/(?:19|20)\d{2}/.test(text)) {
      timestampText = text;
      return false;
    }
  });
  return timestampText;
}

function extractLegacyBody(
  $: cheerio.CheerioAPI,
  $cmt: cheerio.Cheerio<AnyNode>,
  threadNumeric: string
): string {
  const $clone = $cmt.clone();

  // Drop the named anchor target (<a name="t...">) — has no body content
  $clone.find('a[name^="t"]').remove();

  // Strip metadata header used by some S1 themes ("comment_bar_one" / "comment_bar_alt"
  // contain the userpic + From/Date sub-table; not part of the body)
  $clone.find(".comment_bar_one, .comment_bar_alt").remove();

  // For themes that wrap the entire comment (header + body + footer) in a single
  // <table id="cmtbar{id}">, surgically extract just the body row(s). Walk only the
  // outer rows — find("tr") would also descend into the inner metadata sub-table.
  $clone.find(`table[id^="cmtbar"]`).each((_i, tbl) => {
    const $table = $(tbl);
    const bodyHtmlParts: string[] = [];
    const $rows = $table.find("> tbody > tr, > thead > tr, > tfoot > tr, > tr");
    $rows.each((_j, tr) => {
      const $tr = $(tr);
      // Skip header rows (contain a sub-table or userpic/ljuser markup)
      if ($tr.find("table, span.ljuser, .i-ljuser, img.i-ljuser-userhead").length > 0) return;
      // Skip footer rows (Reply/Parent/Thread links)
      if (rowHasReplyOrParentLink($, $tr)) return;
      $tr.find("> td, > th").each((_k, cell) => {
        bodyHtmlParts.push($(cell).html() ?? "");
      });
    });
    const replacement = bodyHtmlParts.join(" ").trim();
    $table.replaceWith(replacement);
  });

  // Strip any empty wrapper divs that previously contained the metadata table
  $clone.find('div[align="right"].entry').each((_i, d) => {
    const $d = $(d);
    if (($d.text() ?? "").trim() === "" && $d.find("img").length === 0) $d.remove();
  });

  // Strip footer-only divs containing reply/parent/thread links
  $clone.find("div").each((_i, d) => {
    const $d = $(d);
    if (!divIsLegacyFooter($, $d)) return;
    $d.remove();
  });

  // Hidden quick-reply containers
  $clone.find('[id^="ljqrt"], [id="ljqrttopcomment"], [id="ljqrtbottomcomment"]').remove();
  $clone.find("form, input, button, select, textarea").remove();

  // Strip orphan permalink anchors (e.g. a leftover bare "(Link)" line)
  $clone.find("a[href*='thread=']").each((_i, a) => {
    const href = $(a).attr("href") ?? "";
    if (href.includes(`thread=${threadNumeric}`)) {
      $(a).remove();
    }
  });
  // After removing those, prune empty <strong>(...)</strong> wrappers left behind
  $clone.find("strong").each((_i, s) => {
    const $s = $(s);
    const text = ($s.text() ?? "").replace(/[\s()]/g, "");
    if (text === "") $s.remove();
  });

  return ($clone.html() ?? "").trim();
}

function divIsLegacyFooter(
  $: cheerio.CheerioAPI,
  $d: cheerio.Cheerio<AnyNode>
): boolean {
  const $links = $d.find("a");
  if ($links.length === 0) return false;
  // Footer divs only contain Reply/Parent/Thread/Link anchors and decorative punctuation
  const hasReply = $links.toArray().some((a) => {
    const href = $(a as Element).attr("href") ?? "";
    return /[?&]replyto=|[?&]mode=reply/i.test(href);
  });
  if (!hasReply) return false;
  // Don't yank a div that also has substantial non-link prose
  let nonLinkText = ($d.text() ?? "").trim();
  $links.toArray().forEach((a) => {
    const linkText = ($(a as Element).text() ?? "").trim();
    if (linkText) nonLinkText = nonLinkText.replaceAll(linkText, "");
  });
  nonLinkText = nonLinkText.replace(/[()|·•\s]/g, "");
  return nonLinkText.length === 0;
}

function rowHasReplyOrParentLink(
  $: cheerio.CheerioAPI,
  $tr: cheerio.Cheerio<AnyNode>
): boolean {
  const links = $tr.find("a").toArray();
  if (links.length === 0) return false;
  // The "Link" arm is safe here because the only place a "(Link)" anchor appears
  // in a cmtbar layout is inside the metadata sub-table, which the caller already
  // skips via the "row contains a nested <table>" guard before invoking this.
  return links.some((a) => {
    const $a = $(a as Element);
    const href = $a.attr("href") ?? "";
    if (/[?&]replyto=|[?&]mode=reply/i.test(href)) return true;
    const text = ($a.text() ?? "").trim();
    return /^(?:Reply|Parent|Thread|Link)$/i.test(text);
  });
}
