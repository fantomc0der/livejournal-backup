import { mkdir, writeFile, access, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import type { JournalEntry, DateEntry } from "../types.ts";
import type { Comment } from "../scrapers/comments.ts";
import { htmlToMarkdown } from "../converters/html-to-markdown.ts";
import type { Logger } from "../utils/logger.ts";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function getDayFilePath(outputDir: string, date: DateEntry): string {
  const mm = String(date.month).padStart(2, "0");
  const dd = String(date.day).padStart(2, "0");
  const filename = `${date.year}-${mm}-${dd}.md`;
  return join(outputDir, String(date.year), filename);
}

export async function dayFileExists(outputDir: string, date: DateEntry): Promise<boolean> {
  return fileExists(getDayFilePath(outputDir, date));
}

export async function writeDayFile(
  outputDir: string,
  date: DateEntry,
  entries: JournalEntry[],
  logger: Logger,
  commentsByEntryUrl?: Map<string, Comment[]>
): Promise<void> {
  if (entries.length === 0) return;

  const filePath = getDayFilePath(outputDir, date);
  await mkdir(join(outputDir, String(date.year)), { recursive: true });

  const content = buildDayMarkdown(date, entries, commentsByEntryUrl);
  await writeFile(filePath, content, "utf-8");
  logger.info(`Written: ${filePath}`);
}

function buildDayMarkdown(
  date: DateEntry,
  entries: JournalEntry[],
  commentsByEntryUrl?: Map<string, Comment[]>
): string {
  const monthName = MONTH_NAMES[date.month - 1] ?? String(date.month);
  const lines: string[] = [
    `# ${monthName} ${date.day}, ${date.year}`,
    "",
  ];

  entries.forEach((entry, index) => {
    const entryNum = index + 1;
    const timeLabel = entry.time ? ` - ${entry.time}` : "";
    lines.push(`## Entry ${entryNum}${timeLabel}`);
    lines.push("");

    if (entry.subject && entry.subject !== "(no subject)") {
      lines.push(`### ${entry.subject}`);
      lines.push("");
    }

    const bodyMd = htmlToMarkdown(entry.content);
    if (bodyMd) {
      lines.push(bodyMd);
      lines.push("");
    }

    if (commentsByEntryUrl) {
      const comments = commentsByEntryUrl.get(entry.url) ?? [];
      if (comments.length > 0) {
        lines.push(buildCommentsSection(comments));
        lines.push("");
      }
    }

    if (index < entries.length - 1) {
      lines.push("---");
      lines.push("");
    }
  });

  return lines.join("\n");
}

function buildCommentsSection(comments: Comment[]): string {
  const lines: string[] = [
    `<details>`,
    `<summary>${comments.length} ${comments.length === 1 ? "comment" : "comments"}</summary>`,
    "",
  ];

  for (const comment of comments) {
    buildCommentLines(comment, lines);
  }

  lines.push("</details>");
  return lines.join("\n");
}

function buildCommentLines(comment: Comment, lines: string[]): string[] {
  const indent = "  ".repeat(comment.depth);
  const userDisplay = comment.userUrl
    ? `[${comment.username}](${comment.userUrl})`
    : comment.username;
  const timestampDisplay = comment.permalinkUrl
    ? `[${comment.timestampText}](${comment.permalinkUrl})`
    : comment.timestampText;

  const headerLine = `${indent}**${userDisplay}** — ${timestampDisplay}`;
  lines.push(headerLine);
  lines.push("");

  const contentMd = htmlToMarkdown(comment.contentHtml);
  if (contentMd) {
    for (const contentLine of contentMd.split("\n")) {
      lines.push(`${indent}${contentLine}`);
    }
    lines.push("");
  }

  return lines;
}

export async function writeTableOfContents(
  outputDir: string,
  username: string,
  logger: Logger
): Promise<void> {
  const dayFiles = await collectDayFiles(outputDir);
  if (dayFiles.length === 0) return;

  const content = buildTableOfContents(username, dayFiles);
  const tocPath = join(outputDir, "livejournal.md");
  await writeFile(tocPath, content, "utf-8");
  logger.info(`Written: ${tocPath}`);
}

interface DayFile {
  year: number;
  month: number;
  day: number;
  relativePath: string;
}

async function collectDayFiles(outputDir: string): Promise<DayFile[]> {
  const dayFiles: DayFile[] = [];

  let yearDirs: string[];
  try {
    yearDirs = await readdir(outputDir);
  } catch {
    return dayFiles;
  }

  for (const entry of yearDirs) {
    if (!/^\d{4}$/.test(entry)) continue;

    let files: string[];
    try {
      files = await readdir(join(outputDir, entry));
    } catch {
      continue;
    }

    for (const file of files) {
      const match = file.match(/^(\d{4})-(\d{2})-(\d{2})\.md$/);
      if (!match) continue;

      const filePath = join(outputDir, entry, file);
      const rel = relative(outputDir, filePath).split("\\").join("/");
      dayFiles.push({
        year: parseInt(match[1]!, 10),
        month: parseInt(match[2]!, 10),
        day: parseInt(match[3]!, 10),
        relativePath: rel,
      });
    }
  }

  dayFiles.sort((a, b) =>
    a.year - b.year || a.month - b.month || a.day - b.day
  );

  return dayFiles;
}

function buildTableOfContents(
  username: string,
  dayFiles: DayFile[]
): string {
  const firstDate = dayFiles[0]!;
  const lastDate = dayFiles[dayFiles.length - 1]!;
  const fmt = (d: DayFile) =>
    `${MONTH_NAMES[d.month - 1]} ${d.day}, ${d.year}`;

  const lines: string[] = [
    `# LiveJournal Backup for ${username}`,
    "",
    `Archived ${dayFiles.length} days of journal entries from ${fmt(firstDate)} to ${fmt(lastDate)}.`,
    "",
  ];

  // Group by year, then by month
  const byYear = new Map<number, Map<number, DayFile[]>>();
  for (const file of dayFiles) {
    if (!byYear.has(file.year)) byYear.set(file.year, new Map());
    const monthMap = byYear.get(file.year)!;
    if (!monthMap.has(file.month)) monthMap.set(file.month, []);
    monthMap.get(file.month)!.push(file);
  }

  for (const [year, months] of byYear) {
    lines.push(`## ${year}`);
    lines.push("");

    for (const [month, files] of months) {
      lines.push(`### ${MONTH_NAMES[month - 1]}`);
      lines.push("");

      for (const file of files) {
        lines.push(`- [${MONTH_NAMES[file.month - 1]} ${file.day}](${file.relativePath})`);
      }

      lines.push("");
    }
  }

  return lines.join("\n");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
