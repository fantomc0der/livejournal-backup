import { describe, it, expect } from "bun:test";
import { extractCommentsFromHtml, buildCommentUrl } from "../../src/scrapers/comments.ts";

const MODERN_COMMENTS_HTML = `
<!DOCTYPE html>
<html>
<body>
<div id="comments" class="b-grove">
  <div class=" b-tree b-tree-root">
    <div class=" b-tree-twig b-tree-twig-1 b-tree-twig-deep-0 " data-tid="t100" style="margin-left: 0px">
      <div id="t100" class=" b-leaf comment p-comment " data-username="testuser" data-full="1">
        <div class="b-leaf-inner">
          <div class="b-leaf-header">
            <div class="b-leaf-userpic">
              <a href="https://testuser.livejournal.com/" class="b-leaf-userpic-inner"><img src="userpic.jpg" alt=""></a>
            </div>
            <div class="b-leaf-details">
              <p class="b-leaf-username"><span class="b-leaf-username-name">testuser</span></p>
              <p class="b-leaf-meta">
                <a href="https://author.livejournal.com/12345.html?thread=100#t100" class="b-leaf-permalink">
                  <span class="b-leaf-createdtime">January 1 2004, 09:57:17 UTC</span>
                </a>
              </p>
              <ul class="b-leaf-actions">
                <li><a href="https://author.livejournal.com/12345.html?replyto=100" class="b-pseudo">Reply</a></li>
              </ul>
            </div>
          </div>
          <div class="b-leaf-article">This is a top-level comment.</div>
          <div class="b-leaf-footer">
            <ul class="b-leaf-actions b-leaf-footer-actions">
              <li><a href="https://author.livejournal.com/12345.html?replyto=100">Reply</a></li>
            </ul>
          </div>
        </div>
      </div>
    </div>
    <div class=" b-tree-twig b-tree-twig-2 b-tree-twig-deep-0 " data-tid="t200" style="margin-left: 30px">
      <div id="t200" class=" b-leaf comment p-comment " data-username="replyuser" data-full="1">
        <div class="b-leaf-inner">
          <div class="b-leaf-header">
            <div class="b-leaf-userpic">
              <a href="https://replyuser.livejournal.com/" class="b-leaf-userpic-inner"><img src="userpic2.jpg" alt=""></a>
            </div>
            <div class="b-leaf-details">
              <p class="b-leaf-username"><span class="b-leaf-username-name">replyuser</span></p>
              <p class="b-leaf-meta">
                <a href="https://author.livejournal.com/12345.html?thread=200#t200" class="b-leaf-permalink">
                  <span class="b-leaf-createdtime">January 1 2004, 10:30:00 UTC</span>
                </a>
              </p>
            </div>
          </div>
          <div class="b-leaf-article">This is a reply to the first comment.</div>
        </div>
      </div>
    </div>
    <div class=" b-tree-twig b-tree-twig-1 b-tree-twig-deep-0 " data-tid="t300" style="margin-left: 0px">
      <div id="t300" class=" b-leaf comment p-comment " data-username="" data-full="1">
        <div class="b-leaf-inner">
          <div class="b-leaf-header">
            <div class="b-leaf-userpic">
              <a href="" class="b-leaf-userpic-inner"><img src="anon.jpg" alt=""></a>
            </div>
            <div class="b-leaf-details">
              <p class="b-leaf-username"><span class="b-leaf-username-name">Anonymous</span></p>
              <p class="b-leaf-meta">
                <a href="https://author.livejournal.com/12345.html?thread=300#t300" class="b-leaf-permalink">
                  <span class="b-leaf-createdtime">January 2 2004, 12:00:00 UTC</span>
                </a>
              </p>
            </div>
          </div>
          <div class="b-leaf-article">Anonymous comment here.</div>
        </div>
      </div>
    </div>
  </div>
</div>
</body>
</html>
`;

const NO_COMMENTS_HTML = `
<!DOCTYPE html>
<html>
<body>
<div id="comments" class="b-grove">
  <div class="b-tree b-tree-root"></div>
</div>
</body>
</html>
`;

describe("buildCommentUrl", () => {
  it("appends ?view=comments to a plain entry URL", () => {
    expect(buildCommentUrl("https://user.livejournal.com/12345.html"))
      .toBe("https://user.livejournal.com/12345.html?view=comments");
  });

  it("strips existing query params before appending", () => {
    expect(buildCommentUrl("https://user.livejournal.com/12345.html?view=flat"))
      .toBe("https://user.livejournal.com/12345.html?view=comments");
  });

  it("strips fragment before appending", () => {
    expect(buildCommentUrl("https://user.livejournal.com/12345.html#comments"))
      .toBe("https://user.livejournal.com/12345.html?view=comments");
  });
});

describe("extractCommentsFromHtml", () => {
  it("returns empty array when no comments present", () => {
    const comments = extractCommentsFromHtml(NO_COMMENTS_HTML);
    expect(comments).toEqual([]);
  });

  it("extracts correct number of comments", () => {
    const comments = extractCommentsFromHtml(MODERN_COMMENTS_HTML);
    expect(comments.length).toBe(3);
  });

  it("extracts comment id", () => {
    const comments = extractCommentsFromHtml(MODERN_COMMENTS_HTML);
    expect(comments[0]?.id).toBe("t100");
    expect(comments[1]?.id).toBe("t200");
    expect(comments[2]?.id).toBe("t300");
  });

  it("extracts depth from b-tree-twig-N class (0-based)", () => {
    const comments = extractCommentsFromHtml(MODERN_COMMENTS_HTML);
    expect(comments[0]?.depth).toBe(0); // b-tree-twig-1 → depth 0
    expect(comments[1]?.depth).toBe(1); // b-tree-twig-2 → depth 1
    expect(comments[2]?.depth).toBe(0); // b-tree-twig-1 → depth 0
  });

  it("extracts username", () => {
    const comments = extractCommentsFromHtml(MODERN_COMMENTS_HTML);
    expect(comments[0]?.username).toBe("testuser");
    expect(comments[1]?.username).toBe("replyuser");
  });

  it("uses Anonymous for anonymous comments", () => {
    const comments = extractCommentsFromHtml(MODERN_COMMENTS_HTML);
    expect(comments[2]?.username).toBe("Anonymous");
  });

  it("extracts permalink URL", () => {
    const comments = extractCommentsFromHtml(MODERN_COMMENTS_HTML);
    expect(comments[0]?.permalinkUrl).toBe("https://author.livejournal.com/12345.html?thread=100#t100");
  });

  it("extracts timestamp text", () => {
    const comments = extractCommentsFromHtml(MODERN_COMMENTS_HTML);
    expect(comments[0]?.timestampText).toBe("January 1 2004, 09:57:17 UTC");
  });

  it("extracts content from b-leaf-article", () => {
    const comments = extractCommentsFromHtml(MODERN_COMMENTS_HTML);
    expect(comments[0]?.contentHtml).toContain("top-level comment");
    expect(comments[1]?.contentHtml).toContain("reply to the first comment");
  });

  it("strips reply action links from content", () => {
    const comments = extractCommentsFromHtml(MODERN_COMMENTS_HTML);
    // Reply links should not appear in content
    for (const comment of comments) {
      expect(comment.contentHtml).not.toContain("replyto=");
    }
  });

  it("extracts user profile URL for named users", () => {
    const comments = extractCommentsFromHtml(MODERN_COMMENTS_HTML);
    // userUrl should be set to the profile link
    expect(comments[0]?.userUrl).toBeTruthy();
  });

  it("sets empty userUrl for anonymous comments", () => {
    const comments = extractCommentsFromHtml(MODERN_COMMENTS_HTML);
    expect(comments[2]?.userUrl).toBe("");
  });
});

const LEGACY_COMMENTS_HTML = `
<!DOCTYPE html>
<html>
<body>
<table>
  <tr>
    <td id="t500">
      <div class="username-holder">olduser</div>
      <a href="https://author.livejournal.com/99.html?thread=500">January 5 2003, 12:00:00 UTC</a>
      <p>Legacy comment content here.</p>
      <a href="https://author.livejournal.com/99.html?replyto=500">Reply</a>
    </td>
  </tr>
  <tr>
    <td id="t600">
      <div class="username-holder">otheruser</div>
      <a href="https://author.livejournal.com/99.html?thread=600#t600">January 5 2003, 14:00:00 UTC</a>
      <p>Another legacy comment.</p>
      <a href="https://author.livejournal.com/99.html?replyto=600">Reply</a>
    </td>
  </tr>
</table>
</body>
</html>
`;

describe("extractCommentsFromHtml legacy fallback", () => {
  it("extracts comments from pages without b-tree-twig structure", () => {
    const comments = extractCommentsFromHtml(LEGACY_COMMENTS_HTML);
    expect(comments.length).toBe(2);
  });

  it("extracts thread id from thread= URL without #t anchor", () => {
    const comments = extractCommentsFromHtml(LEGACY_COMMENTS_HTML);
    expect(comments[0]?.id).toBe("t500");
  });

  it("extracts thread id from thread= URL with #t anchor", () => {
    const comments = extractCommentsFromHtml(LEGACY_COMMENTS_HTML);
    expect(comments[1]?.id).toBe("t600");
  });

  it("strips reply links from legacy comment content", () => {
    const comments = extractCommentsFromHtml(LEGACY_COMMENTS_HTML);
    for (const comment of comments) {
      expect(comment.contentHtml).not.toContain("replyto=");
    }
  });
});
