export interface JournalEntry {
  subject: string;
  time: string;
  url: string;
  content: string; // HTML content
}

export interface LocalDate {
  year: number;
  month: number;
  day: number;
}

export interface ArchiveOptions {
  username: string;
  year?: number;
  startDate?: LocalDate;
  days?: number;
  limit?: number;
  retries: number;
  delay: number;
  outputDir: string;
  verbose: boolean;
  skipExisting: boolean;
  dryRun: boolean;
}

export interface DateEntry extends LocalDate {
  entryCount?: number;
}
