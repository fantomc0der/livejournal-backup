export interface JournalEntry {
  subject: string;
  time: string;
  url: string;
  content: string; // HTML content
}

export interface ArchiveOptions {
  username: string;
  year?: number;
  month?: number;
  day?: number;
  limit?: number;
  retries: number;
  delay: number;
  outputDir: string;
  verbose: boolean;
  skipExisting: boolean;
  dryRun: boolean;
}

export interface DateEntry {
  year: number;
  month: number;
  day: number;
  entryCount?: number;
}
