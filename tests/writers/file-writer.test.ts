import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeDayFile } from "../../src/writers/file-writer.ts";
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

describe("writeDayFile", () => {
  it("creates the year directory if it does not exist", async () => {
    await writeDayFile(testDir, sampleDate, sampleEntries, false, logger);
    const yearDir = join(testDir, "2002");
    expect(await pathExists(yearDir)).toBe(true);
  });

  it("creates a markdown file with correct name", async () => {
    await writeDayFile(testDir, sampleDate, sampleEntries, false, logger);
    const filePath = join(testDir, "2002", "2002-01-24.md");
    expect(await pathExists(filePath)).toBe(true);
  });

  it("file starts with correct date heading", async () => {
    await writeDayFile(testDir, sampleDate, sampleEntries, false, logger);
    const content = await readFile(join(testDir, "2002", "2002-01-24.md"), "utf-8");
    expect(content).toMatch(/^# January 24, 2002/);
  });

  it("includes entry headings with time", async () => {
    await writeDayFile(testDir, sampleDate, sampleEntries, false, logger);
    const content = await readFile(join(testDir, "2002", "2002-01-24.md"), "utf-8");
    expect(content).toContain("## Entry 1 - 04:34 pm");
    expect(content).toContain("## Entry 2 - 05:26 pm");
  });

  it("includes entry body content", async () => {
    await writeDayFile(testDir, sampleDate, sampleEntries, false, logger);
    const content = await readFile(join(testDir, "2002", "2002-01-24.md"), "utf-8");
    expect(content).toContain("hey this is my first post here");
    expect(content).toContain("sitting around right now");
  });

  it("separates multiple entries with horizontal rule", async () => {
    await writeDayFile(testDir, sampleDate, sampleEntries, false, logger);
    const content = await readFile(join(testDir, "2002", "2002-01-24.md"), "utf-8");
    expect(content).toContain("---");
  });

  it("does nothing when entries array is empty", async () => {
    await writeDayFile(testDir, sampleDate, [], false, logger);
    const filePath = join(testDir, "2002", "2002-01-24.md");
    expect(await pathExists(filePath)).toBe(false);
  });

  it("skips existing file when skipExisting is true", async () => {
    await writeDayFile(testDir, sampleDate, sampleEntries, false, logger);
    const filePath = join(testDir, "2002", "2002-01-24.md");
    const originalContent = await readFile(filePath, "utf-8");

    const newEntries: JournalEntry[] = [
      {
        subject: "New Entry",
        time: "12:00 pm",
        url: "https://myusername.livejournal.com/999.html",
        content: "<p>This should not be written</p>",
      },
    ];

    await writeDayFile(testDir, sampleDate, newEntries, true, logger);
    const afterContent = await readFile(filePath, "utf-8");
    expect(afterContent).toBe(originalContent);
  });

  it("overwrites existing file when skipExisting is false", async () => {
    await writeDayFile(testDir, sampleDate, sampleEntries, false, logger);

    const newEntries: JournalEntry[] = [
      {
        subject: "New Entry",
        time: "12:00 pm",
        url: "https://myusername.livejournal.com/999.html",
        content: "<p>New content</p>",
      },
    ];

    await writeDayFile(testDir, sampleDate, newEntries, false, logger);
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
    await writeDayFile(testDir, date, entries, false, logger);
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
    await writeDayFile(testDir, sampleDate, entries, false, logger);
    const content = await readFile(join(testDir, "2002", "2002-01-24.md"), "utf-8");
    expect(content).toContain("### My Great Post");
  });
});
