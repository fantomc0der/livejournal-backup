import { describe, it, expect } from "bun:test";
import { extractYearsFromHtml } from "../../src/scrapers/calendar.ts";

const MOCK_CALENDAR_HTML = `
<!DOCTYPE html>
<html>
<head><title>myusername - Calendar</title></head>
<body>
<div class="toolbar">
  <a href="http://www.mypersonalsite.com">My Website</a> |
  <a href="https://myusername.livejournal.com/">Recent Entries</a> |
  Archive |
  <a href="https://myusername.livejournal.com/friends/">Friends</a> |
  <a href="https://myusername.livejournal.com/profile">Profile</a> |
  <a href="https://myusername.livejournal.com/2002/">2002</a> |
  <a href="https://myusername.livejournal.com/2003/">2003</a> |
  <a href="https://myusername.livejournal.com/2004/">2004</a> |
  <a href="https://myusername.livejournal.com/2005/">2005</a> |
  2006
</div>
<div class="content">
  <h2>Calendar for myusername</h2>
</div>
<div class="toolbar">
  <a href="http://www.mypersonalsite.com">My Website</a> |
  <a href="https://myusername.livejournal.com/">Recent Entries</a> |
  Archive |
  <a href="https://myusername.livejournal.com/friends/">Friends</a> |
  <a href="https://myusername.livejournal.com/profile">Profile</a> |
  <a href="https://myusername.livejournal.com/2002/">2002</a> |
  <a href="https://myusername.livejournal.com/2003/">2003</a> |
  <a href="https://myusername.livejournal.com/2004/">2004</a> |
  <a href="https://myusername.livejournal.com/2005/">2005</a> |
  2006
</div>
</body>
</html>
`;

const MOCK_CALENDAR_RELATIVE_LINKS = `
<!DOCTYPE html>
<html>
<body>
<div class="toolbar">
  <a href="/2003/">2003</a> |
  <a href="/2004/">2004</a> |
  2005
</div>
</body>
</html>
`;

describe("extractYearsFromHtml", () => {
  it("extracts years from absolute href links", () => {
    const years = extractYearsFromHtml(MOCK_CALENDAR_HTML, "myusername");
    expect(years).toContain(2002);
    expect(years).toContain(2003);
    expect(years).toContain(2004);
    expect(years).toContain(2005);
  });

  it("extracts current year from plain text", () => {
    const years = extractYearsFromHtml(MOCK_CALENDAR_HTML, "myusername");
    expect(years).toContain(2006);
  });

  it("returns years sorted in ascending order", () => {
    const years = extractYearsFromHtml(MOCK_CALENDAR_HTML, "myusername");
    const sorted = [...years].sort((a, b) => a - b);
    expect(years).toEqual(sorted);
  });

  it("deduplicates years that appear in both toolbars", () => {
    const years = extractYearsFromHtml(MOCK_CALENDAR_HTML, "myusername");
    const unique = new Set(years);
    expect(years.length).toBe(unique.size);
  });

  it("returns empty array for HTML with no years", () => {
    const years = extractYearsFromHtml("<html><body><p>No years here</p></body></html>", "user");
    expect(years).toEqual([]);
  });

  it("ignores years outside 2000-2030 range", () => {
    const html = `<html><body>
      <a href="/1999/">1999</a>
      <a href="/2010/">2010</a>
      <a href="/2031/">2031</a>
    </body></html>`;
    const years = extractYearsFromHtml(html, "user");
    expect(years).not.toContain(1999);
    expect(years).toContain(2010);
    expect(years).not.toContain(2031);
  });

  it("handles relative href links", () => {
    const years = extractYearsFromHtml(MOCK_CALENDAR_RELATIVE_LINKS, "myusername");
    expect(years).toContain(2003);
    expect(years).toContain(2004);
    expect(years).toContain(2005);
  });
});
