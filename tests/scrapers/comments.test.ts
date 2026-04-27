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
  it("appends ?nojs=1&view=comments to a plain entry URL", () => {
    expect(buildCommentUrl("https://user.livejournal.com/12345.html"))
      .toBe("https://user.livejournal.com/12345.html?nojs=1&view=comments");
  });

  it("strips existing query params before appending", () => {
    expect(buildCommentUrl("https://user.livejournal.com/12345.html?view=flat"))
      .toBe("https://user.livejournal.com/12345.html?nojs=1&view=comments");
  });

  it("strips fragment before appending", () => {
    expect(buildCommentUrl("https://user.livejournal.com/12345.html#comments"))
      .toBe("https://user.livejournal.com/12345.html?nojs=1&view=comments");
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

// Mirrors the LJ S1 "comment_bar_one" theme: each comment is a <div id="ljcmt{id}">
// containing a header <div class="comment_bar_one"> with the userpic + From/Date table,
// then a sibling <div> for the body, then a small footer div with reply/thread links.
const LEGACY_COMMENT_BAR_HTML = `
<!DOCTYPE html>
<html>
<body>
<div class="comments">
  <div id="ljcmt500" style="margin-left: 0px; margin-top: 5px">
    <a name="t500"></a>
    <div class="comment_bar_one">
      <table><tr><td><img src="userpic.jpg" /></td>
      <td>
        <table><tr><th>From:</th>
          <td><span class="ljuser i-ljuser i-ljuser-type-P" data-ljuser="commenter1" lj:user="commenter1"><a href="https://commenter1.livejournal.com/profile/" class="i-ljuser-profile"><img class="i-ljuser-userhead" src="ujpic.svg" /></a><a href="https://commenter1.livejournal.com/" class="i-ljuser-username"><b>commenter1</b></a></span></td>
        </tr><tr><th>Date:</th>
          <td><span title="11 minutes after journal entry">June 18th, 2003 09:57 am (UTC)</span></td>
        </tr></table>
      </td></tr><tr><td></td><td><strong>(<a href="https://author.livejournal.com/99.html?thread=500#t500">Link</a>)</strong></td></tr></table>
    </div>
    <div style="margin-left: 5px">ur no fun!</div>
    <div style="margin-top: 3px; font-size: smaller"> (<a href="https://author.livejournal.com/99.html?replyto=500">Reply</a>) (<a href="https://author.livejournal.com/99.html?thread=500#t500">Thread</a>)</div>
  </div>
  <div id="ljcmt600" style="margin-left: 0px; margin-top: 5px">
    <a name="t600"></a>
    <div class="comment_bar_one">
      <table><tr><td><img src="userpic2.jpg" /></td>
      <td>
        <table><tr><th>From:</th>
          <td><span class="ljuser i-ljuser i-ljuser-type-P" data-ljuser="commenter2" lj:user="commenter2"><a href="https://commenter2.livejournal.com/profile/" class="i-ljuser-profile"><img class="i-ljuser-userhead" src="ujpic.svg" /></a><a href="https://commenter2.livejournal.com/" class="i-ljuser-username"><b>commenter2</b></a></span></td>
        </tr><tr><th>Date:</th>
          <td><span title="54 minutes after journal entry">June 18th, 2003 07:34 pm (UTC)</span></td>
        </tr></table>
      </td></tr><tr><td></td><td><strong>(<a href="https://author.livejournal.com/99.html?thread=600#t600">Link</a>)</strong></td></tr></table>
    </div>
    <div style="margin-left: 5px">second reply on this entry</div>
    <div style="margin-top: 3px; font-size: smaller"> (<a href="https://author.livejournal.com/99.html?replyto=600">Reply</a>) (<a href="https://author.livejournal.com/99.html?thread=600#t600">Thread</a>)</div>
  </div>
</div>
</body>
</html>
`;

// Mirrors the LJ S1 "cmtbar table" theme used by some custom layouts: the entire
// comment (header + body + footer) lives inside a single <table id="cmtbar{id}">.
const LEGACY_CMTBAR_HTML = `
<!DOCTYPE html>
<html>
<body>
<div id="ljcmt700" style="margin-left:0px;">
  <a name="t700"></a>
  <div align='right' class='entry'>
    <table id='cmtbar700' width='95%'>
      <tr><td>
        <table><tr>
          <td><img src='userpic.jpg' /><span class="ljuser i-ljuser i-ljuser-type-P" data-ljuser="commenter3" lj:user="commenter3"><a href="https://commenter3.livejournal.com/profile/" class="i-ljuser-profile"><img class="i-ljuser-userhead" src="ujpic.svg" /></a><a href="https://commenter3.livejournal.com/" class="i-ljuser-username"><b>commenter3</b></a></span></td>
          <td><table><tr><td>Subject:</td><td>Re: </td></tr><tr><td>Link:</td><td>(<a href='https://author.livejournal.com/49.html?thread=700#t700'>Link</a>)</td></tr><tr><td>Time:</td><td><span title="1 day after journal entry">2004-02-09 05:46 am (UTC)</span></td></tr></table></td>
        </tr></table>
      </td></tr>
      <tr><td>top-level body content</td></tr>
      <tr><td>(<a href="https://author.livejournal.com/49.html?replyto=700">Reply</a>) (<a href='https://author.livejournal.com/49.html?thread=700#t700'>Thread</a>)</td></tr>
    </table>
  </div>
</div>
<div id="ljcmt750" style="margin-left:25px;">
  <a name="t750"></a>
  <div align='right' class='entry'>
    <table id='cmtbar750' width='95%'>
      <tr><td>
        <table><tr>
          <td><img src='userpic.jpg' /><span class="ljuser i-ljuser i-ljuser-type-P" data-ljuser="commenter4" lj:user="commenter4"><a href="https://commenter4.livejournal.com/profile/" class="i-ljuser-profile"><img class="i-ljuser-userhead" src="ujpic.svg" /></a><a href="https://commenter4.livejournal.com/" class="i-ljuser-username"><b>commenter4</b></a></span></td>
          <td><table><tr><td>Subject:</td><td>Re: </td></tr><tr><td>Link:</td><td>(<a href='https://author.livejournal.com/49.html?thread=750#t750'>Link</a>)</td></tr><tr><td>Time:</td><td><span title="2 days after journal entry">2004-02-10 02:17 am (UTC)</span></td></tr></table></td>
        </tr></table>
      </td></tr>
      <tr><td>nested reply content</td></tr>
      <tr><td>(<a href="https://author.livejournal.com/49.html?replyto=750">Reply</a>) (<a href='https://author.livejournal.com/49.html?thread=700#t700'>Parent</a>) (<a href='https://author.livejournal.com/49.html?thread=750#t750'>Thread</a>)</td></tr>
    </table>
  </div>
</div>
</body>
</html>
`;

describe("extractCommentsFromHtml S1 legacy comment_bar layout", () => {
  it("extracts comments from comment_bar_one structure", () => {
    const comments = extractCommentsFromHtml(LEGACY_COMMENT_BAR_HTML);
    expect(comments.length).toBe(2);
  });

  it("extracts thread id from ljcmt{id} container", () => {
    const comments = extractCommentsFromHtml(LEGACY_COMMENT_BAR_HTML);
    expect(comments[0]?.id).toBe("t500");
    expect(comments[1]?.id).toBe("t600");
  });

  it("extracts username from data-ljuser attribute", () => {
    const comments = extractCommentsFromHtml(LEGACY_COMMENT_BAR_HTML);
    expect(comments[0]?.username).toBe("commenter1");
    expect(comments[1]?.username).toBe("commenter2");
  });

  it("extracts user profile URL from i-ljuser-username anchor", () => {
    const comments = extractCommentsFromHtml(LEGACY_COMMENT_BAR_HTML);
    expect(comments[0]?.userUrl).toBe("https://commenter1.livejournal.com/");
  });

  it("extracts visible date text from the title-bearing span", () => {
    const comments = extractCommentsFromHtml(LEGACY_COMMENT_BAR_HTML);
    expect(comments[0]?.timestampText).toBe("June 18th, 2003 09:57 am (UTC)");
  });

  it("extracts permalink URL pointing at the comment thread", () => {
    const comments = extractCommentsFromHtml(LEGACY_COMMENT_BAR_HTML);
    expect(comments[0]?.permalinkUrl).toBe("https://author.livejournal.com/99.html?thread=500#t500");
  });

  it("captures the body text and excludes header/footer artifacts", () => {
    const comments = extractCommentsFromHtml(LEGACY_COMMENT_BAR_HTML);
    expect(comments[0]?.contentHtml).toContain("ur no fun!");
    expect(comments[0]?.contentHtml).not.toContain("From:");
    expect(comments[0]?.contentHtml).not.toContain("replyto=");
    expect(comments[0]?.contentHtml).not.toContain("Reply");
    expect(comments[0]?.contentHtml).not.toContain("Thread");
    expect(comments[0]?.contentHtml).not.toContain("data-ljuser");
  });
});

describe("extractCommentsFromHtml S1 legacy cmtbar layout", () => {
  it("extracts comments wrapped in cmtbar{id} table structure", () => {
    const comments = extractCommentsFromHtml(LEGACY_CMTBAR_HTML);
    expect(comments.length).toBe(2);
  });

  it("computes nesting depth from margin-left style", () => {
    const comments = extractCommentsFromHtml(LEGACY_CMTBAR_HTML);
    expect(comments[0]?.depth).toBe(0);
    expect(comments[1]?.depth).toBe(1);
  });

  it("captures the body row content from inside cmtbar table", () => {
    const comments = extractCommentsFromHtml(LEGACY_CMTBAR_HTML);
    expect(comments[0]?.contentHtml).toContain("top-level body content");
    expect(comments[1]?.contentHtml).toContain("nested reply content");
  });

  it("excludes metadata and footer from cmtbar body", () => {
    const comments = extractCommentsFromHtml(LEGACY_CMTBAR_HTML);
    for (const c of comments) {
      expect(c.contentHtml).not.toContain("Subject:");
      expect(c.contentHtml).not.toContain("Time:");
      expect(c.contentHtml).not.toContain("replyto=");
      expect(c.contentHtml).not.toContain("Parent");
      expect(c.contentHtml).not.toContain("data-ljuser");
    }
  });

  it("extracts permalink url pointing at the right thread id", () => {
    const comments = extractCommentsFromHtml(LEGACY_CMTBAR_HTML);
    expect(comments[0]?.permalinkUrl).toContain("thread=700");
    expect(comments[1]?.permalinkUrl).toContain("thread=750");
  });

  it("treats anonymous comments as Anonymous when no ljuser span is present", () => {
    const html = `<!DOCTYPE html><html><body>
      <div id="ljcmt900" style="margin-left:0px;">
        <a name="t900"></a>
        <div class="comment_bar_one">
          <table><tr><td><table><tr><th>From:</th><td>(Anonymous)</td></tr>
          <tr><th>Date:</th><td><span title="2 hours after journal entry">January 1st, 2004 12:00:00 (UTC)</span></td></tr>
          </table></td></tr><tr><td><strong>(<a href="https://author.livejournal.com/9.html?thread=900#t900">Link</a>)</strong></td></tr></table>
        </div>
        <div style="margin-left: 5px">anon body</div>
      </div>
    </body></html>`;
    const comments = extractCommentsFromHtml(html);
    expect(comments[0]?.username).toBe("Anonymous");
    expect(comments[0]?.userUrl).toBe("");
    expect(comments[0]?.contentHtml).toContain("anon body");
  });
});
