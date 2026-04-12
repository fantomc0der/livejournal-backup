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

const MOCK_DAY_HTML_WITH_MOOD_ICONS = `
<!DOCTYPE html>
<html>
<body>
<div class="content">
  <div class="entry">
    <h4 class="subject"><a href="https://myusername.livejournal.com/435.html" class="subj-link">(no subject)</a> @ 04:34 pm</h4>
    <div class="text">
      <p><strong>Current Mood:</strong> <img src="https://imgprx.livejournal.net/abc123/def456" alt="content"> content</p>
      <p><strong>Current Music:</strong> foo fighters - everlong</p>
      <p>hey this is my first post here...</p>
    </div>
  </div>
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

  it("preserves mood icon img tags in raw HTML content for converter to handle", () => {
    const entries = extractEntriesFromHtml(MOCK_DAY_HTML_WITH_MOOD_ICONS, "myusername");
    expect(entries.length).toBe(1);
    expect(entries[0]?.content).toContain("Current Mood:");
    expect(entries[0]?.content).toContain("imgprx.livejournal.net");
    expect(entries[0]?.content).toContain("Current Music:");
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

  it("extracts body from .entrytext selector (S2 themes like lafunnickita)", () => {
    const html = `<html><body>
      <div class="entry" id="entry315">
        <table><tr><td>
          <span class="entryheader"><a href="https://myusername.livejournal.com/315.html">this is me rambling</a> - 10:34 pm</span>
        </td></tr></table>
        <div class="entrytext">so my best friend has been in france...</div>
        <div class="metadata"><table><tr><td>Current Mood: drained</td></tr></table></div>
        <ul class="entryextra"><li class="entrypostlink"><a href="https://myusername.livejournal.com/315.html?mode=reply#add_comment">Leave a comment</a></li></ul>
      </div>
    </body></html>`;
    const entries = extractEntriesFromHtml(html, "myusername");
    expect(entries.length).toBe(1);
    expect(entries[0]?.content).toContain("best friend");
    expect(entries[0]?.content).not.toContain("mode=reply");
    expect(entries[0]?.content).not.toContain("Leave a comment");
  });

  it("extracts entries from S1 theme (table-based layout with no semantic classes)", () => {
    const html = `<html class="html-s1"><body>
      <table><tr><td>
        <font face="Verdana" size="2">
          <b>8:25p</b><a href="https://testuser.livejournal.com/314.html"><b> - <font color="#FFFFFF">Me</font></b></a>
        </font>
        <br>
        <font face="Verdana" size="2">Hey everyone!! This is my first post.</font>
        <p align="RIGHT"><font face="Verdana" size="1">(<a href="https://testuser.livejournal.com/314.html?mode=reply#add_comment">comment on this</a>)</font></p>
      </td></tr></table>
    </body></html>`;
    const entries = extractEntriesFromHtml(html, "testuser");
    expect(entries.length).toBe(1);
    expect(entries[0]?.url).toBe("https://testuser.livejournal.com/314.html");
    expect(entries[0]?.subject).toBe("Me");
  });

  it("strips comment links from S1 theme content", () => {
    const html = `<html class="html-s1"><body>
      <table><tr><td>
        <font face="Verdana" size="2">
          <b>3:00p</b><a href="https://testuser.livejournal.com/500.html"><b> - <font>My Post</font></b></a>
        </font>
        <br>
        <font face="Verdana" size="2">Post body content here</font>
        <p align="RIGHT"><font size="1">(<a href="https://testuser.livejournal.com/500.html?mode=reply#add_comment">comment on this</a>)</font></p>
      </td></tr></table>
    </body></html>`;
    const entries = extractEntriesFromHtml(html, "testuser");
    expect(entries.length).toBe(1);
    expect(entries[0]?.content).not.toContain("mode=reply");
  });
});
