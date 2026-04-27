---
name: ship-pr
description: After code changes are complete, autonomously open a PR, wait for CI, mark it ready, handle Claude review feedback, and verify the auto-merge lands. Covers the full lifecycle from "code is done" to "merged to main" without user intervention.
compatibility: Requires git and gh CLI, both installed and authenticated. Assumes the current branch is the feature branch for the work just completed.
---

# Ship PR

Autonomously carry a finished branch through this repo's full PR lifecycle: open the PR, wait for CI, mark it ready, address any Claude review feedback, and confirm the squash-merge completes. No manual steps by the user.

## When to invoke

Invoke this skill when:
- The user explicitly asks for hands-off PR handling ("ship it", "open a PR and handle it", "auto-merge this", "use ship-pr").
- The user's prompt included this skill name as a suffix or qualifier, e.g. `/{omc-command} make my code do X /ship-pr` or `/{omc-command} ... then ship-pr`.
- Work was done via an OMC command (autopilot, ralph, ultrawork, etc.) and the user indicated upfront they want the full PR flow handled automatically.

Do **not** invoke this skill automatically just because code changes were made. Only fire it when the user has signalled they want hands-off PR handling.

## Assumptions and preconditions

- You are on a **feature branch** (not `main`). If `git rev-parse --abbrev-ref HEAD` returns `main` or the repo default branch, stop and tell the user.
- All code changes are **committed**. If `git status --porcelain` shows uncommitted changes, commit them with a sensible message before proceeding (do not silently drop them or silently include noise like `test-output/`).
- The branch is **ahead of the target** by at least one commit. If not, stop — there is nothing to PR.
- This repo uses the automation documented in `docs/pr-automation.md`: every new PR is auto-converted to a draft by `enforce-draft.yml`, Claude reviews on `ready_for_review`/`synchronize`, and `auto-merge.yml` squash-merges once both CI and Claude vote PASS.

## Step 1 — Open the PR

Follow the `create-pull-request` skill (`.agents/skills/create-pull-request/SKILL.md`) in full for all push, diff-review, title, and body steps. That skill's output is the PR number and URL — capture both.

After `gh pr create` returns:
- Note the PR number for all subsequent `gh` calls.
- The PR will be auto-converted to a draft within seconds by `enforce-draft.yml`. That is expected; do not try to prevent it.

## Step 2 — Wait for CI to pass on the draft

CI Build (`ci-build.yml`) runs on every push regardless of draft state. Poll until all status checks on the current head SHA are complete:

```bash
# Poll every 20 s; give up after 10 min (30 iterations)
gh pr checks <PR> --watch
```

If any check **fails**, read its log:

```bash
gh run view <run-id> --log-failed
```

Diagnose the failure. If it is caused by the code changes (a test failure, type error, or build error), fix the code, commit, and push. The CI checks will re-run automatically. Repeat until CI is green.

If the failure is clearly infrastructure noise (a GitHub Actions runner flake, network timeout, third-party service outage) and the same check passed on a prior run, re-run it:

```bash
gh run rerun <run-id> --failed
```

Do not re-run checks speculatively — only when there is clear evidence of a transient failure.

## Step 3 — Mark the PR ready for review

Once all CI checks are green:

```bash
gh pr ready <PR>
```

This fires the `ready_for_review` event, which triggers `claude-review.yml`. Do not mark ready until CI is green — a failing CI check will prevent the auto-merge gate from opening even after Claude votes PASS.

## Step 4 — Wait for the Claude review

Claude's review runs as a GitHub Actions job (workflow: "Claude PR Review"). Poll until the `review` check completes:

```bash
gh pr checks <PR> --watch
```

Once the job finishes, read the verdict from the PR comments:

```bash
gh pr view <PR> --comments --json comments \
  --jq '[.comments[] | select(.body | test("REVIEW: (PASS|FAIL)"))] | last | .body'
```

### If verdict is REVIEW: PASS

Proceed to Step 5. No code changes needed.

### If verdict is REVIEW: FAIL

Read the full review comment to understand all the issues raised. Also check for any inline diff comments:

```bash
gh api repos/{owner}/{repo}/pulls/<PR>/comments --jq '[.[] | {path: .path, line: .original_line, body: .body}]'
```

Address **every blocking issue** Claude identified. For minor observations Claude flags as non-blocking (phrased as "not blocking on their own", "minor", or "worth noting"), use judgment: fix them if they are quick and clearly correct; leave them if they require non-trivial design decisions, and note this in the push commit message.

After making fixes:
1. Commit with a clear message describing what was addressed.
2. Push the branch.
3. CI will re-run automatically (it triggers on `synchronize`). Wait for CI to go green again (Step 2 logic).
4. Claude will re-review automatically on `synchronize`. Wait for the new verdict (Step 4 logic).

Repeat the fix → push → CI → Claude review loop until the verdict is REVIEW: PASS. If the same issue persists after two fix attempts and you are not making progress, stop and surface the problem to the user rather than looping indefinitely.

## Step 5 — Wait for auto-merge

Once CI is green and Claude's verdict is REVIEW: PASS, the `auto-merge.yml` gate will run and squash-merge the PR. Poll the PR state:

```bash
# Check every 15 s for up to 5 min
for i in $(seq 1 20); do
  state=$(gh pr view <PR> --json state,mergedAt --jq '{state: .state, mergedAt: .mergedAt}')
  echo "$state"
  echo "$state" | grep -q '"MERGED"' && break
  sleep 15
done
```

Confirm the merge:

```bash
gh pr view <PR> --json state,mergedAt,mergeCommit \
  --jq '"PR #<PR> \(.state) at \(.mergedAt) — merge commit \(.mergeCommit.oid)"'
```

If after 5 minutes the PR is still open and all checks are green with REVIEW: PASS, the auto-merge workflow may not have fired. Check its status:

```bash
gh run list --workflow=auto-merge.yml --limit 5
```

If the workflow ran and logged a reason for skipping (head moved, still pending checks, etc.), respond to whatever it logged. If it simply never ran, trigger it by adding an empty commit to re-fire the workflow chain — but first check whether the issue is that the `review` check is showing a stale result:

```bash
gh pr checks <PR>
```

As a last resort (e.g. auto-merge workflow is broken), report the situation to the user and offer to merge manually with `gh pr merge <PR> --squash --delete-branch`.

## Step 6 — Report completion

Tell the user:
- PR number, title, and merge commit SHA.
- A one-line summary of what changed (title is usually sufficient).
- Any notable issues encountered and how they were resolved (CI flakes, review feedback, etc.).

## Hard rules (inherited from repo CLAUDE.md)

- Never include real LiveJournal usernames in commit messages, PR titles, PR bodies, or code comments. Use "the configured user" if a username from `.env` appears in the context.
- Never hard-wrap prose. No line breaks inserted at fixed column widths anywhere.
- Never use `@ts-ignore`, `@ts-expect-error`, or `as any`.
- Never force-push or skip hooks (`--force`, `--no-verify`) without explicit user instruction.

## OMC integration note

This skill is designed to be chained after OMC execution commands. The intended pattern is:

```
/autopilot make my code do X — use ship-pr when done
/ralph implement Y and ship-pr it
```

Claude should recognise "ship-pr", "ship pr", "auto-merge", "hands-off PR" as signals to invoke this skill after the primary work command completes. The skill fires *after* the code work is finished, not concurrently with it. The OMC command handles implementation; this skill handles the PR lifecycle.

If OMC work is done in multiple passes (e.g. autopilot phase 2 → phase 3), wait until the final pass is complete and all code changes are committed before starting Step 1.
