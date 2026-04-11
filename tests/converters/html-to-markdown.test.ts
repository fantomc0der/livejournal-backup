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

  it("removes LJ comment navigation links", () => {
    const result = htmlToMarkdown(
      '<p><a href="/435.html?mode=reply">3 erections</a> | <a href="/435.html">touch me here</a></p>'
    );
    expect(result).not.toContain("erections");
    expect(result).not.toContain("touch me here");
  });

  it("removes leave a comment links", () => {
    const result = htmlToMarkdown(
      '<p><a href="/post">leave a comment</a></p>'
    );
    expect(result).not.toContain("leave a comment");
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

  it("collapses multiple blank lines to at most two", () => {
    const html = "<p>First</p><p></p><p></p><p></p><p>Second</p>";
    const result = htmlToMarkdown(html);
    expect(result).not.toMatch(/\n{3,}/);
  });
});
