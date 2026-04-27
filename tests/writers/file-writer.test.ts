import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeDayFile, dayFileExists, getDayFilePath, writeTableOfContents } from "../../src/writers/file-writer.ts";
import { Logger } from "../../src/utils/logger.ts";
import type { JournalEntry, DateEntry } from "../../src/types.ts";

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

const logger = new Logger(false);

let testDir: string;

beforeEach(async () => {
  testDir = join(tmpdir(), `lj-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

const sampleDate: DateEntry = { year: 2002, month: 1, day: 24 };

const sampleEntries: JournalEntry[] = [
  {
    subject: "(no subject)",
    time: "04:34 pm",
    url: "https://myusername.livejournal.com/435.html",
    content: "<p><strong>Current Mood:</strong> impressed</p><p>hey this is my first post here...</p>",
  },
  {
    subject: "(no subject)",
    time: "05:26 pm",
    url: "https://myusername.livejournal.com/744.html",
    content: "<p>sitting around right now...</p>",
  },
];

describe("getDayFilePath", () => {
  it("returns correct path with zero-padded month and day", () => {
    const result = getDayFilePath("/output", { year: 2002, month: 3, day: 5 });
    expect(result).toBe(join("/output", "2002", "2002-03-05.md"));
  });

  it("does not double-pad already two-digit month/day", () => {
    const result = getDayFilePath("/output", { year: 2002, month: 11, day: 24 });
    expect(result).toBe(join("/output", "2002", "2002-11-24.md"));
  });
});

describe("dayFileExists", () => {
  it("returns false when file does not exist", async () => {
    expect(await dayFileExists(testDir, sampleDate)).toBe(false);
  });

  it("returns true after file is written", async () => {
    await writeDayFile(testDir, sampleDate, sampleEntries, logger);
    expect(await dayFileExists(testDir, sampleDate)).toBe(true);
  });
});

describe("writeDayFile", () => {
  it("creates the year directory if it does not exist", async () => {
    await writeDayFile(testDir, sampleDate, sampleEntries, logger);
    const yearDir = join(testDir, "2002");
    expect(await pathExists(yearDir)).toBe(true);
  });

  it("creates a markdown file with correct name", async () => {
    await writeDayFile(testDir, sampleDate, sampleEntries, logger);
    const filePath = join(testDir, "2002", "2002-01-24.md");
    expect(await pathExists(filePath)).toBe(true);
  });

  it("file starts with correct date heading", async () => {
    await writeDayFile(testDir, sampleDate, sampleEntries, logger);
    const content = await readFile(join(testDir, "2002", "2002-01-24.md"), "utf-8");
    expect(content).toMatch(/^# January 24, 2002/);
  });

  it("includes entry headings with time", async () => {
    await writeDayFile(testDir, sampleDate, sampleEntries, logger);
    const content = await readFile(join(testDir, "2002", "2002-01-24.md"), "utf-8");
    expect(content).toContain("## Entry 1 - 04:34 pm");
    expect(content).toContain("## Entry 2 - 05:26 pm");
  });

  it("includes entry body content", async () => {
    await writeDayFile(testDir, sampleDate, sampleEntries, logger);
    const content = await readFile(join(testDir, "2002", "2002-01-24.md"), "utf-8");
    expect(content).toContain("hey this is my first post here");
    expect(content).toContain("sitting around right now");
  });

  it("separates multiple entries with horizontal rule", async () => {
    await writeDayFile(testDir, sampleDate, sampleEntries, logger);
    const content = await readFile(join(testDir, "2002", "2002-01-24.md"), "utf-8");
    expect(content).toContain("---");
  });

  it("does nothing when entries array is empty", async () => {
    await writeDayFile(testDir, sampleDate, [], logger);
    const filePath = join(testDir, "2002", "2002-01-24.md");
    expect(await pathExists(filePath)).toBe(false);
  });

  it("overwrites existing file", async () => {
    await writeDayFile(testDir, sampleDate, sampleEntries, logger);

    const newEntries: JournalEntry[] = [
      {
        subject: "New Entry",
        time: "12:00 pm",
        url: "https://myusername.livejournal.com/999.html",
        content: "<p>New content</p>",
      },
    ];

    await writeDayFile(testDir, sampleDate, newEntries, logger);
    const content = await readFile(join(testDir, "2002", "2002-01-24.md"), "utf-8");
    expect(content).toContain("New content");
    expect(content).not.toContain("hey this is my first post here");
  });

  it("pads month and day with leading zeros in filename", async () => {
    const date: DateEntry = { year: 2002, month: 3, day: 5 };
    const entries: JournalEntry[] = [
      {
        subject: "test",
        time: "10:00 am",
        url: "https://user.livejournal.com/1.html",
        content: "<p>test</p>",
      },
    ];
    await writeDayFile(testDir, date, entries, logger);
    const filePath = join(testDir, "2002", "2002-03-05.md");
    expect(await pathExists(filePath)).toBe(true);
  });

  it("includes named subject as h3 heading", async () => {
    const entries: JournalEntry[] = [
      {
        subject: "My Great Post",
        time: "10:00 am",
        url: "https://user.livejournal.com/1.html",
        content: "<p>body text</p>",
      },
    ];
    await writeDayFile(testDir, sampleDate, entries, logger);
    const content = await readFile(join(testDir, "2002", "2002-01-24.md"), "utf-8");
    expect(content).toContain("### My Great Post");
  });
});

describe("writeTableOfContents", () => {
  it("creates livejournal.md in the output directory", async () => {
    await writeDayFile(testDir, sampleDate, sampleEntries, logger);
    await writeTableOfContents(testDir, "testuser", logger);
    const tocPath = join(testDir, "livejournal.md");
    expect(await pathExists(tocPath)).toBe(true);
  });

  it("includes the username in the heading", async () => {
    await writeDayFile(testDir, sampleDate, sampleEntries, logger);
    await writeTableOfContents(testDir, "testuser", logger);
    const content = await readFile(join(testDir, "livejournal.md"), "utf-8");
    expect(content).toContain("# LiveJournal Backup for testuser");
  });

  it("includes year and month headings", async () => {
    await writeDayFile(testDir, sampleDate, sampleEntries, logger);
    await writeTableOfContents(testDir, "testuser", logger);
    const content = await readFile(join(testDir, "livejournal.md"), "utf-8");
    expect(content).toContain("## 2002");
    expect(content).toContain("### January");
  });

  it("includes relative links to day files", async () => {
    await writeDayFile(testDir, sampleDate, sampleEntries, logger);
    await writeTableOfContents(testDir, "testuser", logger);
    const content = await readFile(join(testDir, "livejournal.md"), "utf-8");
    expect(content).toContain("[January 24](2002/2002-01-24.md)");
  });

  it("groups entries across multiple years and months", async () => {
    const entries: JournalEntry[] = [
      { subject: "test", time: "10:00 am", url: "https://u.livejournal.com/1.html", content: "<p>test</p>" },
    ];
    await writeDayFile(testDir, { year: 2002, month: 1, day: 5 }, entries, logger);
    await writeDayFile(testDir, { year: 2002, month: 3, day: 12 }, entries, logger);
    await writeDayFile(testDir, { year: 2003, month: 6, day: 1 }, entries, logger);
    await writeTableOfContents(testDir, "testuser", logger);
    const content = await readFile(join(testDir, "livejournal.md"), "utf-8");
    expect(content).toContain("## 2002");
    expect(content).toContain("### January");
    expect(content).toContain("### March");
    expect(content).toContain("## 2003");
    expect(content).toContain("### June");
  });

  it("includes date range in the description", async () => {
    const entries: JournalEntry[] = [
      { subject: "test", time: "10:00 am", url: "https://u.livejournal.com/1.html", content: "<p>test</p>" },
    ];
    await writeDayFile(testDir, { year: 2002, month: 1, day: 5 }, entries, logger);
    await writeDayFile(testDir, { year: 2006, month: 12, day: 31 }, entries, logger);
    await writeTableOfContents(testDir, "testuser", logger);
    const content = await readFile(join(testDir, "livejournal.md"), "utf-8");
    expect(content).toContain("January 5, 2002");
    expect(content).toContain("December 31, 2006");
  });

  it("does not create file when no day files exist", async () => {
    await writeTableOfContents(testDir, "testuser", logger);
    const tocPath = join(testDir, "livejournal.md");
    expect(await pathExists(tocPath)).toBe(false);
  });
});

import type { Comment } from "../../src/scrapers/comments.ts";

describe("writeDayFile with comments", () => {
  const entryWithComments: JournalEntry = {
    subject: "(no subject)",
    time: "03:00 pm",
    url: "https://testuser.livejournal.com/1234.html",
    content: "<p>Entry content.</p>",
  };

  const topLevelComment: Comment = {
    id: "t100",
    depth: 0,
    username: "commenter",
    userUrl: "https://commenter.livejournal.com/",
    timestampText: "January 1 2004, 10:00:00 UTC",
    permalinkUrl: "https://testuser.livejournal.com/1234.html?thread=100#t100",
    contentHtml: "Top level comment.",
  };

  const nestedComment: Comment = {
    id: "t200",
    depth: 1,
    username: "replier",
    userUrl: "https://replier.livejournal.com/",
    timestampText: "January 1 2004, 11:00:00 UTC",
    permalinkUrl: "https://testuser.livejournal.com/1234.html?thread=200#t200",
    contentHtml: "Nested reply comment.",
  };

  const deepNestedComment: Comment = {
    id: "t300",
    depth: 2,
    username: "deepreplier",
    userUrl: "https://deepreplier.livejournal.com/",
    timestampText: "January 1 2004, 12:00:00 UTC",
    permalinkUrl: "https://testuser.livejournal.com/1234.html?thread=300#t300",
    contentHtml: "Deeply nested reply.",
  };

  it("renders a collapsible <details> block when comments are present", async () => {
    const commentMap = new Map([
      [entryWithComments.url, [topLevelComment]],
    ]);
    await writeDayFile(testDir, sampleDate, [entryWithComments], logger, commentMap);
    const content = await readFile(join(testDir, "2002", "2002-01-24.md"), "utf-8");
    expect(content).toContain("<details>");
    expect(content).toContain("</details>");
    expect(content).toContain("<summary>1 comment</summary>");
  });

  it("uses plural 'comments' for counts > 1", async () => {
    const commentMap = new Map([
      [entryWithComments.url, [topLevelComment, nestedComment]],
    ]);
    await writeDayFile(testDir, sampleDate, [entryWithComments], logger, commentMap);
    const content = await readFile(join(testDir, "2002", "2002-01-24.md"), "utf-8");
    expect(content).toContain("<summary>2 comments</summary>");
  });

  it("includes username linked to profile URL", async () => {
    const commentMap = new Map([
      [entryWithComments.url, [topLevelComment]],
    ]);
    await writeDayFile(testDir, sampleDate, [entryWithComments], logger, commentMap);
    const content = await readFile(join(testDir, "2002", "2002-01-24.md"), "utf-8");
    expect(content).toContain("[commenter](https://commenter.livejournal.com/)");
  });

  it("includes timestamp linked to comment permalink", async () => {
    const commentMap = new Map([
      [entryWithComments.url, [topLevelComment]],
    ]);
    await writeDayFile(testDir, sampleDate, [entryWithComments], logger, commentMap);
    const content = await readFile(join(testDir, "2002", "2002-01-24.md"), "utf-8");
    expect(content).toContain("[January 1 2004, 10:00:00 UTC](https://testuser.livejournal.com/1234.html?thread=100#t100)");
  });

  it("indents nested comments with blockquote syntax", async () => {
    const commentMap = new Map([
      [entryWithComments.url, [topLevelComment, nestedComment]],
    ]);
    await writeDayFile(testDir, sampleDate, [entryWithComments], logger, commentMap);
    const content = await readFile(join(testDir, "2002", "2002-01-24.md"), "utf-8");
    // depth-0 comment has no leading "> "
    expect(content).toContain("**[commenter]");
    // depth-1 comment has one level of "> " blockquote
    expect(content).toContain("> **[replier]");
  });

  it("uses double blockquote for depth-2 comments instead of 4-space indent", async () => {
    const commentMap = new Map([
      [entryWithComments.url, [topLevelComment, nestedComment, deepNestedComment]],
    ]);
    await writeDayFile(testDir, sampleDate, [entryWithComments], logger, commentMap);
    const content = await readFile(join(testDir, "2002", "2002-01-24.md"), "utf-8");
    // depth-2 must use "> > " not "    " (which would be a code block)
    expect(content).toContain("> > **[deepreplier]");
    expect(content).not.toMatch(/^ {4}\*\*/m);
  });

  it("omits comments block when entry has no comments", async () => {
    const emptyCommentMap = new Map<string, Comment[]>();
    await writeDayFile(testDir, sampleDate, [entryWithComments], logger, emptyCommentMap);
    const content = await readFile(join(testDir, "2002", "2002-01-24.md"), "utf-8");
    expect(content).not.toContain("<details>");
  });

  it("omits comments block when commentsByEntryUrl is undefined", async () => {
    await writeDayFile(testDir, sampleDate, [entryWithComments], logger, undefined);
    const content = await readFile(join(testDir, "2002", "2002-01-24.md"), "utf-8");
    expect(content).not.toContain("<details>");
  });
});
