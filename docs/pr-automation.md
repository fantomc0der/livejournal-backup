# PR Automation

Solo-dev workflow where Claude reviews every PR and the merge gate handles squash-merging into `main` once both the review and CI Build agree. Optimized for the case where you are the only committer and don't want to manually click "Approve" / "Merge" on work that has already been verified.

## The happy path

1. Create a branch locally, commit your changes, push.
2. Open a pull request against `main`. `enforce-draft.yml` runs on `pull_request: opened`. If the PR was opened as a draft, the workflow's `if: github.event.pull_request.draft == false` guard causes it to skip — the PR is already in the desired state. If the PR was opened non-draft, the workflow converts it to a draft via the GraphQL `convertPullRequestToDraft` mutation and posts an explanatory comment. Either way, every PR ends up as a draft before any review runs.
3. While the PR is a draft: only CI Build runs. Claude does not review, and the auto-merge gate skips draft PRs.
4. When you're ready, click **"Ready for review"**. That fires a `ready_for_review` event. Now two workflows run in parallel:
   - `CI Build` — typecheck, tests, build.
   - `Claude PR Review` — runs `anthropics/claude-code-action` against the diff.
5. Claude posts inline comments on the diff and a summary comment that ends with either `REVIEW: PASS` or `REVIEW: FAIL`.
6. Whenever either workflow finishes (whichever one is last), `Auto Merge` runs and re-evaluates the full gate:
   - PR is still open.
   - PR is not a draft.
   - The SHA that triggered this run is still the PR's head (i.e. you haven't pushed a newer commit in the meantime). If you have, the newer commit's workflow completions will retrigger the gate.
   - The most recent Claude verdict comment is `REVIEW: PASS`.
   - Every status check on the PR head SHA completed successfully (none pending, none failed).
7. If all gates pass, the workflow posts an approving review and calls `gh pr merge --squash --delete-branch`. Done.

If any gate fails, nothing happens and the PR stays open. Push more commits, Claude re-reviews the new head, and the gate re-evaluates.

If you decide mid-review that a PR needs more work, **convert it back to a draft**. The gate will skip while it's a draft, even if checks later complete. Mark it ready again when you're done.

## Files

- `.github/workflows/ci-build.yml` — existing typecheck + test + build workflow.
- `.github/workflows/enforce-draft.yml` — on `pull_request: opened`, if the PR was opened non-draft, converts it to a draft via the GraphQL `convertPullRequestToDraft` mutation and posts an explanatory comment. Enforces that all PRs start as drafts so the gate never fires on in-progress work.
- `.github/workflows/claude-review.yml` — runs the Anthropic action when a PR is opened, synchronized, or marked ready for review. Skipped while the PR is a draft.
- `.github/workflows/auto-merge.yml` — the gate. Triggered by `workflow_run` completion of either `CI Build` or `Claude PR Review`.

## Required secrets

Both stored as repo-level Actions secrets.

| Secret | What it is | Used by |
|---|---|---|
| `ANTHROPIC_API_KEY` | API key from `console.anthropic.com/settings/keys` | `claude-review.yml` |
| `PR_AUTOMATION_PAT` | Fine-grained PAT scoped to this repo with `Contents: write` and `Pull requests: write` | `enforce-draft.yml`, `auto-merge.yml` |

The PAT is shared by both PR-automation workflows. `enforce-draft.yml` needs it because the default `GITHUB_TOKEN` is not permitted to call the `convertPullRequestToDraft` GraphQL mutation — it returns `Resource not accessible by integration` even with `pull-requests: write`. `auto-merge.yml` needs it so that any downstream workflows triggered by a push to `main` will still fire (the default token does not trigger downstream workflows — that is deliberate in GitHub to prevent loops). For this repo right now, the default token would also work for the auto-merge step itself because nothing runs on push to `main` that isn't already running on the PR; reusing the same PAT is both future-proofing and simpler than juggling two secrets.

## Verdict format

Claude is prompted to end its summary comment with exactly one of these lines:

```
REVIEW: PASS
REVIEW: FAIL
```

The auto-merge gate pulls the *last* comment on the PR containing that pattern and checks the verdict. So if Claude initially voted FAIL and then re-reviewed after you pushed a fix and voted PASS, the latest one wins.

## How the race is handled

CI Build and Claude review run in parallel. When the first one finishes, `Auto Merge` runs. If Claude's verdict isn't posted yet (or status checks are still pending), it logs and exits. When the second workflow finishes, `Auto Merge` runs again with both signals available and merges.

The `concurrency` block in `auto-merge.yml` groups by head SHA, so two runs for the same commit won't race each other.

## Overriding the automation

If you need to merge without going through Claude (e.g. Anthropic API is down, or Claude keeps incorrectly failing a PR), just use the GitHub UI or `gh pr merge` directly — the auto-merge workflow is additive, not blocking. There is no branch protection requiring Claude's approval.  

## Pros and cons of this setup

### Pros

- Zero friction for small, self-contained work. Push branch, open PR, walk away.
- Forces an actual review pass on every change instead of "I'll push straight to main, it's fine." The review step gives you a second pair of eyes (albeit an LLM's) that catches the dumb stuff — typos in error messages, forgotten tests, type leaks, obvious regressions.
- The squash-merge pattern keeps `main`'s history clean and linear.
- Completely bypassable. If the automation gets in your way you ignore it and do the merge yourself.

### Cons and risks

- **False PASS is the big one.** LLMs miss subtle logic bugs, performance regressions, and anything that requires runtime verification (e.g. "does this scraper selector actually match the LJ 2005-era theme?"). CI Build catches what the tests cover; Claude catches what's visible in the diff; neither catches what nobody thought to check. If Claude gets sycophantic and starts rubber-stamping everything, you will not notice until something breaks in production.
- **Single gate.** With a human reviewer you get a second mental model. Here you get one LLM's read plus whatever your tests happen to cover. If either has a blind spot in a given area, you merge broken code.
- **Dependency on Anthropic availability.** If the API is down or rate-limited, no PRs merge automatically. Recoverable (manual merge), but worth knowing.
- **Cost scales with PR churn.** Every open/synchronize triggers a full review. Pushing ten fixups to a PR triggers ten reviews. Typical review is well under $0.10 but it adds up if you use the repo heavily.
- **PAT blast radius.** If the PAT leaks, an attacker can merge arbitrary code to `main`. Mitigated by the fine-grained scope (only this repo, only two permissions) and an expiration date. Rotate it when the PAT expires instead of extending indefinitely.
- **"Passing CI Build" is necessary but not sufficient.** CI Build only runs the tests that exist. New code without tests can pass CI Build and a Claude review and still be broken. This is the same risk as any CI Build-gated workflow but it's worth saying out loud since there's no human stopgap here.

### When this works well

- Solo hobby projects where you want friction-free shipping and downside of a bad merge is "revert and move on."
- Repos with strong test coverage — the tests become the load-bearing safety net, the LLM is the tiebreaker on style/obvious-bug stuff.
- Anything where you can easily roll back (small, fast-moving, no database migrations, no published package).

### When to reconsider

- Repos that ship to users or production where a bad merge is expensive to recover from.
- Multi-contributor repos. At that point branch protection + required human approval is worth more than the convenience of automatic merging.
- Areas of the code where the tests are thin. Claude doesn't compensate for missing test coverage; it just reads the diff.

### Practical mitigations

- Keep tests comprehensive. The LLM gate is a complement to tests, not a substitute.
- Read Claude's comments even when they say PASS. Calibrate your trust over time — if you notice it missing real issues, tighten the prompt or add a "when in doubt, FAIL" clause.
- Rotate the PAT on a schedule. Fine-grained PATs expire by default, so this is mostly automatic.
- If you ever merge a bad PR that the automation approved, examine what the review missed and consider whether to add test coverage, tighten the prompt, or add a specific rule to `CLAUDE.md` that the review prompt references.
