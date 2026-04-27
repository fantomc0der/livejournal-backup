---
name: ship-pr
description: After code changes are complete, autonomously open a PR, wait for CI, mark it ready, handle Claude review feedback, and verify the auto-merge lands. Covers the full lifecycle from "code is done" to "merged to main" without user intervention.
compatibility: Requires git and gh CLI, both installed and authenticated.
---

# Ship PR

Autonomously carry finished work through this repo's full PR lifecycle: create a feature branch, open the PR, wait for CI, mark it ready, address any Claude review feedback, confirm the squash-merge completes, and clean up. No manual steps by the user.

## When to invoke

Invoke this skill when:
- The user explicitly asks for hands-off PR handling ("ship it", "open a PR and handle it", "auto-merge this", "use ship-pr").
- The user's prompt included this skill name as a suffix or qualifier, e.g. `/{omc-command} make my code do X /ship-pr` or `/{omc-command} ... then ship-pr`.
- Work was done via an OMC command (autopilot, ralph, ultrawork, etc.) and the user indicated upfront they want the full PR flow handled automatically.

Do **not** invoke this skill automatically just because code changes were made. Only fire it when the user has signalled they want hands-off PR handling.

## Assumptions and preconditions

- All code changes are **committed**. If `git status --porcelain` shows uncommitted changes, commit them with a sensible message before proceeding (do not silently drop them or silently include noise like `test-output/`).
- This repo uses the automation documented in `docs/pr-automation.md`: every new PR is auto-converted to a draft by `enforce-draft.yml`, Claude reviews on `ready_for_review`/`synchronize`, and `auto-merge.yml` squash-merges once both CI and Claude vote PASS.

## Workflow Steps 

### Step 1 — Create and switch to a new feature branch

Before opening the PR, ensure the work is on a dedicated feature branch based off `origin/main`. This must always be done — never open a PR directly from `main`.

```bash
git fetch origin main
git checkout -b <branch-name> origin/main
```

Choose a short, descriptive branch name in `kebab-case` that reflects the work (e.g. `add-table-formatting`, `fix-calendar-scraper`). Never use names that contain real usernames or environment-specific values.

If you are already on a feature branch (i.e. the current branch is not `main` and it was created for this work), skip the checkout and just ensure any commits are present on it. If you are on `main` with commits that need to move to a new branch:

```bash
git fetch origin main
git checkout -b <branch-name>
# commits already present; origin/main is behind, so nothing to reset
```

### Step 2 — Open the PR

Follow the `create-pull-request` skill (`.agents/skills/create-pull-request/SKILL.md`) in full for all push, diff-review, title, and body steps. That skill's output is the PR number and URL — capture both.

After `gh pr create` returns:
- Note the PR number for all subsequent `gh` calls.
- The PR will be auto-converted to a draft within seconds by `enforce-draft.yml`. That is expected; do not try to prevent it.

### Step 3 — Wait for CI to pass on the draft

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

### Step 4 — Mark the PR ready for review

Once all CI checks are green:

```bash
gh pr ready <PR>
```

This fires the `ready_for_review` event, which triggers `claude-review.yml`. Do not mark ready until CI is green — a failing CI check will prevent the auto-merge gate from opening even after Claude votes PASS.

### Step 5 — Wait for the Claude review

Claude's review runs as a GitHub Actions job (workflow: "Claude PR Review"). Poll until the `review` check completes:

```bash
gh pr checks <PR> --watch
```

Once the job finishes, read the verdict from the PR comments:

```bash
gh pr view <PR> --comments --json comments \
  --jq '[.comments[] | select(.body | test("REVIEW: (PASS|FAIL)"))] | last | .body'
```

#### If verdict is REVIEW: PASS

Proceed to Step 6. No code changes needed.

#### If verdict is REVIEW: FAIL

Read the full review comment to understand all the issues raised. Also check for any inline diff comments:

```bash
gh api repos/{owner}/{repo}/pulls/<PR>/comments --jq '[.[] | {path: .path, line: .original_line, body: .body}]'
```

Address **every blocking issue** Claude identified. For minor observations Claude flags as non-blocking (phrased as "not blocking on their own", "minor", or "worth noting"), use judgment: fix them if they are quick and clearly correct; leave them if they require non-trivial design decisions, and note this in the push commit message.

After making fixes:
1. Commit with a clear message describing what was addressed.
2. Push the branch.
3. CI will re-run automatically (it triggers on `synchronize`). Wait for CI to go green again (Step 3 logic).
4. Claude will re-review automatically on `synchronize`. Wait for the new verdict (Step 5 logic).

Repeat the fix → push → CI → Claude review loop until the verdict is REVIEW: PASS. If the same issue persists after two fix attempts and you are not making progress, stop and surface the problem to the user rather than looping indefinitely.

### Step 6 — Wait for auto-merge

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

### Step 7 — Clean up the branch

Once the merge is confirmed, switch back to `main` and delete the local feature branch:

```bash
git checkout main
git pull origin main
git branch -d <branch-name>
```

The remote branch is deleted automatically — both by the `--delete-branch` flag in `auto-merge.yml` and by the repo's "Automatically delete head branches" GitHub setting. Do not run `git push origin --delete`; the branch will already be gone and the command will error.

### Step 8 — Report completion

Tell the user:
- PR number, title, and merge commit SHA.
- A one-line summary of what changed (title is usually sufficient).
- Any notable issues encountered and how they were resolved (CI flakes, review feedback, etc.).
- Confirmation that the feature branch has been deleted and `main` is checked out.

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

If OMC work is done in multiple passes (e.g. autopilot phase 2 → phase 3), wait until the final pass is complete and all code changes are committed before starting Step 1 (branch creation).
