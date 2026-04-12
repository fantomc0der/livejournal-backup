import TurndownService from "turndown";

const LJ_COMMENT_URL_PATTERNS = [
  /livejournal\.com\/\d+\.html\?mode=reply/i,
  /livejournal\.com\/\d+\.html\?view=comments/i,
  /livejournal\.com\/\d+\.html\?thread=/i,
  /\?mode=reply/i,
  /\?view=comments/i,
];

const LJ_NAV_CONTAINER_CLASSES = [
  "comments",
  "entryextra",
  "entryreadlink",
  "entrypostlink",
];

const LJ_METADATA_LABELS = /Current\s+(Mood|Music|Location):/i;

function isLjCommentLink(href: string): boolean {
  return LJ_COMMENT_URL_PATTERNS.some((p) => p.test(href));
}

function containsOnlyLjNavLinks(node: Node): boolean {
  const links = (node as HTMLElement).querySelectorAll?.("a");
  if (!links || links.length === 0) return false;
  const textWithoutLinks = (node.textContent ?? "").replace(/\s+/g, "").trim();
  const linkText = Array.from(links)
    .map((a) => (a.textContent ?? "").replace(/\s+/g, "").trim())
    .join("");
  const nonLinkText = textWithoutLinks.replace(new RegExp(linkText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "").replace(/[|()]/g, "").trim();
  return (
    nonLinkText.length === 0 &&
    Array.from(links).every((a) => isLjCommentLink(a.getAttribute("href") ?? ""))
  );
}

function createTurndownService(): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });

  td.addRule("remove-lj-nav", {
    filter: (node) => {
      if (node.nodeName !== "A") return false;
      const href = (node as HTMLAnchorElement).getAttribute("href") ?? "";
      return isLjCommentLink(href);
    },
    replacement: () => "",
  });

  td.addRule("unwrap-lj-away-links", {
    filter: (node) => {
      if (node.nodeName !== "A") return false;
      const href = (node as HTMLAnchorElement).getAttribute("href") ?? "";
      return /livejournal\.com\/away\?to=/i.test(href);
    },
    replacement: (_content, node) => {
      const href = (node as HTMLAnchorElement).getAttribute("href") ?? "";
      const match = /[?&]to=([^&]+)/.exec(href);
      const captured = match?.[1];
      const destination = captured ? decodeURIComponent(captured) : href;
      const text = node.textContent ?? "";
      if (text === destination || text === "") {
        return destination;
      }
      return `[${text}](${destination})`;
    },
  });

  td.addRule("remove-lj-mood-icons", {
    filter: (node) => {
      if (node.nodeName !== "IMG") return false;
      const parent = node.parentNode;
      if (!parent) return false;
      const parentText = parent.textContent ?? "";
      return LJ_METADATA_LABELS.test(parentText);
    },
    replacement: () => "",
  });

  td.addRule("remove-lj-clearer", {
    filter: (node) => {
      if (node.nodeName !== "DIV") return false;
      const el = node as HTMLElement;
      return el.className === "clearer";
    },
    replacement: () => "",
  });

  td.addRule("remove-lj-nav-containers", {
    filter: (node) => {
      if (!["UL", "DIV", "SPAN", "P", "LI"].includes(node.nodeName)) return false;
      const el = node as HTMLElement;
      const className = el.className ?? "";
      if (LJ_NAV_CONTAINER_CLASSES.some((cls) => className.split(/\s+/).includes(cls))) {
        return true;
      }
      if ((node.textContent?.length ?? 0) < 200) {
        return containsOnlyLjNavLinks(node);
      }
      return false;
    },
    replacement: () => "",
  });

  return td;
}

const turndownService = createTurndownService();

export function htmlToMarkdown(html: string): string {
  if (!html.trim()) return "";
  const md = turndownService.turndown(html);
  return md
    .replace(/\u00A0/g, " ")
    .replace(/ {2,}/g, " ")
    .replace(/^\s+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
