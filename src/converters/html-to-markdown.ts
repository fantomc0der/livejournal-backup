import * as cheerio from "cheerio";
import TurndownService from "turndown";

const LJ_NAV_URL_PATTERNS = [
  /\?mode=reply/i,
  /\?view=comments/i,
  /[?&]thread=/i,
  /livejournal\.com\/update\.bml/i,
  /livejournal\.com\/tools\/content_flag\.bml/i,
  /livejournal\.com\/allpics\.bml/i,
];

const LJ_METADATA_LABELS = /Current\s+(Mood|Music|Location):/i;

function isLjNavLink(href: string): boolean {
  return LJ_NAV_URL_PATTERNS.some((p) => p.test(href));
}

function containsOnlyLjNavLinks(node: Node): boolean {
  const links = (node as HTMLElement).querySelectorAll?.("a");
  if (!links || links.length === 0) return false;
  const textWithoutLinks = (node.textContent ?? "").replace(/\s+/g, "").trim();
  const linkText = Array.from(links)
    .map((a) => (a.textContent ?? "").replace(/\s+/g, "").trim())
    .join("");
  const nonLinkText = textWithoutLinks.replace(new RegExp(linkText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "").replace(/[|() ·•\-–—]/g, "").trim();
  return (
    nonLinkText.length === 0 &&
    Array.from(links).every((a) => isLjNavLink(a.getAttribute("href") ?? ""))
  );
}

function preprocessHtml(html: string): string {
  const $ = cheerio.load(html, undefined, false);

  $("form, input, button, select, textarea").remove();

  let changed = true;
  while (changed) {
    changed = false;
    const tables = $("table").toArray();
    for (const el of tables) {
      const $table = $(el);
      const $rows = $table.find("> tbody > tr, > thead > tr, > tfoot > tr, > tr");
      if ($rows.length !== 1) continue;
      const $cells = $rows.first().find("> td, > th");
      if ($cells.length !== 1) continue;
      const $cell = $cells.first();
      if ($cell.find("table").length === 0) continue;
      $table.replaceWith($cell.contents());
      changed = true;
    }
  }

  return $.html();
}

function findFirstTr(root: Node): Node | null {
  for (let i = 0; i < root.childNodes.length; i++) {
    const child = root.childNodes[i];
    if (!child) continue;
    if (child.nodeName === "TR") return child;
    if (child.nodeName === "TABLE") continue;
    const recursive = findFirstTr(child);
    if (recursive) return recursive;
  }
  return null;
}

function getEnclosingTable(node: Node): Node | null {
  let parent: Node | null = node.parentNode;
  while (parent && parent.nodeName !== "TABLE") {
    parent = parent.parentNode;
  }
  return parent;
}

function isFirstRowInTable(node: Node): boolean {
  const table = getEnclosingTable(node);
  if (!table) return false;
  return findFirstTr(table) === node;
}

function countDirectCells(parent: Node | null): number {
  if (!parent) return 0;
  let count = 0;
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i];
    if (!child) continue;
    if (child.nodeName === "TD" || child.nodeName === "TH") {
      const span = parseInt((child as HTMLElement).getAttribute?.("colspan") ?? "1", 10);
      count += Number.isFinite(span) && span > 0 ? span : 1;
    }
  }
  return count;
}

function directCellIndex(node: Node): number {
  const parent = node.parentNode;
  if (!parent) return 0;
  let idx = 0;
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i];
    if (!child) continue;
    if (child === node) return idx;
    if (child.nodeName === "TD" || child.nodeName === "TH") idx++;
  }
  return idx;
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
      return isLjNavLink(href);
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

  td.addRule("table", {
    filter: "table",
    replacement: (content) => "\n\n" + content.trim() + "\n\n",
  });

  td.addRule("table-section", {
    filter: ["thead", "tbody", "tfoot"],
    replacement: (content) => content,
  });

  td.addRule("table-row", {
    filter: "tr",
    replacement: (content, node) => {
      let result = "\n" + content;
      if (isFirstRowInTable(node)) {
        const cellCount = countDirectCells(node);
        if (cellCount > 0) {
          const separator = "| " + Array(cellCount).fill("---").join(" | ") + " |";
          result += "\n" + separator;
        }
      }
      return result;
    },
  });

  td.addRule("table-cell", {
    filter: ["td", "th"],
    replacement: (content, node) => {
      const text = content.replace(/[\r\n]+/g, " ").replace(/\|/g, "\\|").trim();
      const index = directCellIndex(node);
      const prefix = index === 0 ? "| " : " ";
      return prefix + text + " |";
    },
  });

  // Registered last so it takes precedence over the table rule for nav-only
  // wrappers — turndown's addRule unshifts, so later additions are matched first.
  td.addRule("remove-lj-nav-containers", {
    filter: (node) => {
      if (!["UL", "DIV", "SPAN", "P", "LI", "TABLE"].includes(node.nodeName)) return false;
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
  const preprocessed = preprocessHtml(html);
  const md = turndownService.turndown(preprocessed);
  return md
    .replace(/ /g, " ")
    .replace(/ {2,}/g, " ")
    .replace(/^\s+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
