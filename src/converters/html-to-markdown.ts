import TurndownService from "turndown";

const LJ_NAV_PATTERNS = [
  /\d+\s+(?:comment|comments|erection|erections)/i,
  /touch me here/i,
  /leave a comment/i,
  /read comments/i,
  /post a comment/i,
  /link\s*\|/i,
];

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
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
