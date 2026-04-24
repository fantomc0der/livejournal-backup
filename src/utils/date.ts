import type { LocalDate } from "../types.ts";

const MS_PER_DAY = 86_400_000;

export function parseIsoDate(value: string): LocalDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match || !match[1] || !match[2] || !match[3]) {
    throw new Error(`Expected YYYY-MM-DD, got: ${value}`);
  }
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month || d.getUTCDate() !== day) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
  return { year, month, day };
}

export function addDays(date: LocalDate, n: number): LocalDate {
  const ms = Date.UTC(date.year, date.month - 1, date.day) + n * MS_PER_DAY;
  const d = new Date(ms);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function compareDate(a: LocalDate, b: LocalDate): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

export function isDateInRange(date: LocalDate, start: LocalDate, end: LocalDate): boolean {
  return compareDate(date, start) >= 0 && compareDate(date, end) <= 0;
}

export function formatDate(date: LocalDate): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

export function yearsInRange(start: LocalDate, end: LocalDate): number[] {
  const years: number[] = [];
  for (let y = start.year; y <= end.year; y++) years.push(y);
  return years;
}
