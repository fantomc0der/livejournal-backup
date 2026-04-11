import { describe, it, expect } from "bun:test";
import { extractEntriesFromHtml } from "../../src/scrapers/day.ts";

const MOCK_DAY_HTML_WITH_ENTRIES = `
<!DOCTYPE html>
<html>
<head><title>myusername - January 24, 2002</title></head>
<body>
<div class="content">
  <div class="entry">
    <h4 class="subject"><a href="https://myusername.livejournal.com/435.html" class="subj-link">(no subject)</a> @ 04:34 pm</h4>
    <div class="text">
      <p><strong>Current Mood:</strong> impressed</p>
      <p><strong>Current Music:</strong> mindless self indulgence - tight</p>
      <p>hey this is my first post here...</p>
    </div>
  </div>
  <div class="entry">
    <h4 class="subject"><a href="https://myusername.livejournal.com/744.html" class="subj-link">(no subject)</a> @ 05:26 pm</h4>
    <div class="text">
      <p>sitting around right now...</p>
    </div>
  </div>
</div>
</body>
</html>
`;

const MOCK_DAY_HTML_WITH_SUBJECT = `
<!DOCTYPE html>
<html>
<body>
<div class="entry">
  <h4 class="subject"><a href="https://myusername.livejournal.com/1234.html" class="subj-link">My Great Post</a> @ 10:00 am</h4>
  <div class="text">
    <p>This is the entry body.</p>
  </div>
</div>
</body>
</html>
`;

const MOCK_DAY_HTML_NO_ENTRIES = `
<!DOCTYPE html>
<html>
<body>
<div class="content">
  <p>No entries for this day.</p>
</div>
</body>
</html>
`;

describe("extractEntriesFromHtml", () => {
  it("extracts multiple entries from a day page", () => {
    const entries = extractEntriesFromHtml(MOCK_DAY_HTML_WITH_ENTRIES, "myusername");
    expect(entries.length).toBe(2);
  });

  it("extracts entry URL correctly", () => {
    const entries = extractEntriesFromHtml(MOCK_DAY_HTML_WITH_ENTRIES, "myusername");
    expect(entries[0]?.url).toBe("https://myusername.livejournal.com/435.html");
    expect(entries[1]?.url).toBe("https://myusername.livejournal.com/744.html");
  });

  it("uses (no subject) when entry has no title text", () => {
    const entries = extractEntriesFromHtml(MOCK_DAY_HTML_WITH_ENTRIES, "myusername");
    expect(entries[0]?.subject).toBe("(no subject)");
  });

  it("extracts named subject when present", () => {
    const entries = extractEntriesFromHtml(MOCK_DAY_HTML_WITH_SUBJECT, "myusername");
    expect(entries[0]?.subject).toBe("My Great Post");
  });

  it("extracts HTML content for markdown conversion", () => {
    const entries = extractEntriesFromHtml(MOCK_DAY_HTML_WITH_ENTRIES, "myusername");
    expect(entries[0]?.content).toBeTruthy();
    expect(entries[0]?.content).toContain("impressed");
  });

  it("returns empty array when no entries found", () => {
    const entries = extractEntriesFromHtml(MOCK_DAY_HTML_NO_ENTRIES, "myusername");
    expect(entries).toEqual([]);
  });

  it("handles article elements as entries", () => {
    const html = `<html><body>
      <article class="entry">
        <h4 class="subject"><a href="https://user.livejournal.com/100.html" class="subj-link">Title</a> @ 10:00 am</h4>
        <div class="text"><p>Body text</p></div>
      </article>
    </body></html>`;
    const entries = extractEntriesFromHtml(html, "user");
    expect(entries.length).toBeGreaterThan(0);
  });
});
