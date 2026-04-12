import TurndownService from "turndown";

const LJ_NAV_PATTERNS = [
  /\d+\s+(?:comment|comments|erection|erections)/i,
  /touch me here/i,
  /leave a comment/i,
  /read comments/i,
  /post a comment/i,
  /link\s*\|/i,
];

const LJ_METADATA_LABELS = /Current\s+(Mood|Music|Location):/i;

function createTurndownService(): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });

  td.addRule("remove-lj-nav", {
    filter: (node) => {
      if (node.nodeName !== "A") return false;
      const text = node.textContent ?? "";
      return LJ_NAV_PATTERNS.some((p) => p.test(text));
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

  td.addRule("remove-lj-nav-spans", {
    filter: (node) => {
      if (!["SPAN", "DIV", "P"].includes(node.nodeName)) return false;
      const text = node.textContent ?? "";
      return LJ_NAV_PATTERNS.some((p) => p.test(text)) && (node.textContent?.length ?? 0) < 100;
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
