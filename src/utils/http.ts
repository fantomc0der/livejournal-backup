import type { Logger } from "./logger.ts";

const USER_AGENT = "Mozilla/5.0 (compatible; livejournal-backup/1.0)";

export async function fetchWithRetry(
  url: string,
  retries: number,
  delay: number,
  logger: Logger
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const backoffMs = delay * Math.pow(2, attempt - 1);
      logger.debug(`Retry ${attempt}/${retries} for ${url}, waiting ${backoffMs}ms`);
      await sleep(backoffMs);
    }

    try {
      logger.debug(`Fetching ${url}`);
      const response = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
      }

      return await response.text();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logger.warn(`Request failed (attempt ${attempt + 1}/${retries + 1}): ${lastError.message}`);
    }
  }

  throw lastError ?? new Error(`Failed to fetch ${url} after ${retries + 1} attempts`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
