import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import type { JournalEntry, DateEntry } from "../types.ts";
import { htmlToMarkdown } from "../converters/html-to-markdown.ts";
import type { Logger } from "../utils/logger.ts";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export async function writeDayFile(
  outputDir: string,
  date: DateEntry,
  entries: JournalEntry[],
  skipExisting: boolean,
  logger: Logger
): Promise<void> {
  if (entries.length === 0) return;

  const yearDir = join(outputDir, String(date.year));
  await mkdir(yearDir, { recursive: true });

  const mm = String(date.month).padStart(2, "0");
  const dd = String(date.day).padStart(2, "0");
  const filename = `${date.year}-${mm}-${dd}.md`;
  const filePath = join(yearDir, filename);

  if (skipExisting) {
    const exists = await fileExists(filePath);
    if (exists) {
      logger.debug(`Skipping existing file: ${filePath}`);
      return;
    }
  }

  const content = buildDayMarkdown(date, entries);
  await writeFile(filePath, content, "utf-8");
  logger.info(`Written: ${filePath}`);
}

function buildDayMarkdown(date: DateEntry, entries: JournalEntry[]): string {
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

    if (index < entries.length - 1) {
      lines.push("---");
      lines.push("");
    }
  });

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
