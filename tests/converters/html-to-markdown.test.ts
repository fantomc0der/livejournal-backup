import { describe, it, expect } from "bun:test";
import { htmlToMarkdown } from "../../src/converters/html-to-markdown.ts";

describe("htmlToMarkdown", () => {
  it("converts basic paragraph to plain text", () => {
    const result = htmlToMarkdown("<p>Hello world</p>");
    expect(result).toBe("Hello world");
  });

  it("converts bold text", () => {
    const result = htmlToMarkdown("<p><strong>Current Mood:</strong> happy</p>");
    expect(result).toContain("**Current Mood:**");
    expect(result).toContain("happy");
  });

  it("converts italic text", () => {
    const result = htmlToMarkdown("<p><em>emphasized</em></p>");
    expect(result).toContain("_emphasized_");
  });

  it("converts links", () => {
    const result = htmlToMarkdown('<p><a href="https://example.com">click here</a></p>');
    expect(result).toContain("[click here](https://example.com)");
  });

  it("converts headings with atx style", () => {
    const result = htmlToMarkdown("<h1>Title</h1>");
    expect(result).toContain("# Title");
  });

  it("converts unordered lists with dash bullets", () => {
    const result = htmlToMarkdown("<ul><li>item one</li><li>item two</li></ul>");
    expect(result).toMatch(/^-\s+item one/m);
    expect(result).toMatch(/^-\s+item two/m);
  });

  it("converts code blocks with fenced style", () => {
    const result = htmlToMarkdown("<pre><code>const x = 1;</code></pre>");
    expect(result).toContain("```");
    expect(result).toContain("const x = 1;");
  });

  it("removes LJ comment navigation links by URL pattern regardless of link text", () => {
    const result = htmlToMarkdown(
      '<p><a href="https://user.livejournal.com/435.html?view=comments#comments">3 erections</a> | <a href="https://user.livejournal.com/435.html?mode=reply#add_comment">touch me here</a></p>'
    );
    expect(result).not.toContain("erections");
    expect(result).not.toContain("touch me here");
  });

  it("removes comment links with any theme-customized text", () => {
    const result = htmlToMarkdown(
      '<p><a href="https://user.livejournal.com/485.html?view=comments#comments">4 spankings</a></p>'
    );
    expect(result).not.toContain("spankings");
  });

  it("removes post-comment links with any theme-customized text", () => {
    const result = htmlToMarkdown(
      '<p><a href="https://user.livejournal.com/485.html?mode=reply#add_comment">spank me</a></p>'
    );
    expect(result).not.toContain("spank me");
  });

  it("removes comment links with standard text", () => {
    const result = htmlToMarkdown(
      '<p><a href="https://user.livejournal.com/315.html?mode=reply#add_comment">Leave a comment</a></p>'
    );
    expect(result).not.toContain("Leave a comment");
  });

  it("removes comment links using short URL patterns", () => {
    const result = htmlToMarkdown(
      '<p><a href="/435.html?mode=reply#add_comment">post a comment</a></p>'
    );
    expect(result).not.toContain("post a comment");
  });

  it("returns empty string for empty input", () => {
    const result = htmlToMarkdown("");
    expect(result).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    const result = htmlToMarkdown("   ");
    expect(result).toBe("");
  });

  it("preserves mood and music metadata as bold", () => {
    const html = `
      <p><strong>Current Mood:</strong> impressed</p>
      <p><strong>Current Music:</strong> mindless self indulgence - tight</p>
      <p>hey this is my first post here...</p>
    `;
    const result = htmlToMarkdown(html);
    expect(result).toContain("**Current Mood:**");
    expect(result).toContain("**Current Music:**");
    expect(result).toContain("hey this is my first post here...");
  });

  it("strips mood icon images but preserves mood text", () => {
    const html = `
      <p><strong>Current Mood:</strong> <img src="https://imgprx.livejournal.net/abc123/def456" alt="content"> content</p>
      <p><strong>Current Music:</strong> foo fighters - everlong</p>
      <p>hey this is my first post here...</p>
    `;
    const result = htmlToMarkdown(html);
    expect(result).toContain("**Current Mood:** content");
    expect(result).not.toContain("![");
    expect(result).not.toContain("imgprx.livejournal.net");
    expect(result).toContain("**Current Music:**");
    expect(result).toContain("foo fighters - everlong");
    expect(result).toContain("hey this is my first post here...");
  });

  it("strips mood icon from l-stat.livejournal.net", () => {
    const html = `<p><strong>Current Mood:</strong> <img src="https://l-stat.livejournal.net/img/mood/happy.gif" alt="happy"> happy</p>`;
    const result = htmlToMarkdown(html);
    expect(result).toContain("**Current Mood:** happy");
    expect(result).not.toContain("![");
    expect(result).not.toContain("l-stat.livejournal.net");
  });

  it("strips Current Location icon images", () => {
    const html = `<p><strong>Current Location:</strong> <img src="https://imgprx.livejournal.net/loc123" alt="home"> home</p>`;
    const result = htmlToMarkdown(html);
    expect(result).toContain("**Current Location:** home");
    expect(result).not.toContain("![");
  });

  it("preserves non-mood images in entry body", () => {
    const html = `
      <p>Check out this photo:</p>
      <p><img src="https://example.com/photo.jpg" alt="my photo"></p>
      <p>Pretty cool right?</p>
    `;
    const result = htmlToMarkdown(html);
    expect(result).toContain("![my photo](https://example.com/photo.jpg)");
  });

  it("unwraps LJ /away redirect links to direct URLs", () => {
    const html = `<p>check out <a href="https://www.livejournal.com/away?to=http%3A%2F%2Fwww.liquidcode.org%2Fworm.html" rel="nofollow">http://www.liquidcode.org/worm.html</a></p>`;
    const result = htmlToMarkdown(html);
    expect(result).toContain("http://www.liquidcode.org/worm.html");
    expect(result).not.toContain("livejournal.com/away");
  });

  it("unwraps LJ /away links with different link text", () => {
    const html = `<p><a href="https://www.livejournal.com/away?to=http%3A%2F%2Fexample.com%2Fpage">click here</a></p>`;
    const result = htmlToMarkdown(html);
    expect(result).toBe("[click here](http://example.com/page)");
  });

  it("unwraps LJ /away links where text matches destination", () => {
    const html = `<p><a href="https://www.livejournal.com/away?to=http%3A%2F%2Fexample.com">http://example.com</a></p>`;
    const result = htmlToMarkdown(html);
    expect(result).toBe("http://example.com");
  });

  it("strips LJ clearer divs", () => {
    const html = `
      <div class="entry-content">some text</div>
      <div class="clearer">&nbsp;</div>
    `;
    const result = htmlToMarkdown(html);
    expect(result).toBe("some text");
  });

  it("converts non-breaking spaces to regular spaces", () => {
    const result = htmlToMarkdown("<p>hello\u00A0world</p>");
    expect(result).toBe("hello world");
  });

  it("handles real LJ entry structure with currents and clearer", () => {
    const html = `
      <div class="currents">
        <div class="currentmood"><strong>Current Mood:</strong> <img src="https://imgprx.livejournal.net/abc" alt="happy" class="meta-mood-img" align="middle" /> happy</div>
        <div class="currentmusic"><strong>Current Music:</strong> some band - some song</div>
      </div>
      <br />
      <div class="entry-content">this is my post</div>
      <div class="clearer">&nbsp;</div>
    `;
    const result = htmlToMarkdown(html);
    expect(result).toContain("**Current Mood:** happy");
    expect(result).toContain("**Current Music:** some band - some song");
    expect(result).toContain("this is my post");
    expect(result).not.toContain("![");
    expect(result).not.toMatch(/^\s+$/m);
  });

  it("strips entryextra containers with comment links", () => {
    const html = `
      <div>some text</div>
      <ul class="entryextra">
        <li class="entryreadlink"><a href="https://user.livejournal.com/485.html?view=comments#comments">4 spankings</a></li>
        <li class="entrypostlink"><a href="https://user.livejournal.com/485.html?mode=reply#add_comment">spank me</a></li>
      </ul>
    `;
    const result = htmlToMarkdown(html);
    expect(result).toBe("some text");
  });

  it("strips comment links from containers leaving no link text", () => {
    const html = `
      <div class="entry-content">post body</div>
      <div>
        <a href="https://user.livejournal.com/435.html?view=comments#comments">3 erections</a>&nbsp;|&nbsp;
        <a href="https://user.livejournal.com/435.html?mode=reply#add_comment">touch me here</a>
      </div>
    `;
    const result = htmlToMarkdown(html);
    expect(result).not.toContain("erections");
    expect(result).not.toContain("touch me here");
    expect(result).toContain("post body");
  });

  it("strips S1 theme comment links in p/font wrappers", () => {
    const html = `
      <font face="Verdana" size="2">Hello world</font>
      <p align="RIGHT"><font face="Verdana" size="1">(<a href="https://user.livejournal.com/314.html?mode=reply#add_comment">comment on this</a>)</font></p>
    `;
    const result = htmlToMarkdown(html);
    expect(result).not.toContain("comment on this");
    expect(result).toContain("Hello world");
  });

  it("preserves regular links that are not LJ comment links", () => {
    const result = htmlToMarkdown(
      '<p>check out <a href="https://example.com/cool-page.html">this page</a></p>'
    );
    expect(result).toContain("[this page](https://example.com/cool-page.html)");
  });

  it("preserves LJ entry permalink links in content", () => {
    const result = htmlToMarkdown(
      '<p>see <a href="https://user.livejournal.com/1234.html">my other post</a></p>'
    );
    expect(result).toContain("[my other post](https://user.livejournal.com/1234.html)");
  });

  it("collapses multiple blank lines to at most two", () => {
    const html = "<p>First</p><p></p><p></p><p></p><p>Second</p>";
    const result = htmlToMarkdown(html);
    expect(result).not.toMatch(/\n{3,}/);
  });
});
