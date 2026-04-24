---
name: create-pull-request
description: Create or update a pull request for the current branch using the gh CLI, with a thorough description focused on the WHY and HOW of the changes. Use when the user wants to open a PR for their current branch, asks to "make a PR", "open a PR", "create a pull request", "push this up for review", or asks to refresh an existing PR's description after more commits.
compatibility: Requires git and the gh CLI. Assumes gh is already installed and authenticated against the current repository.
---

# Create Pull Request

Create a pull request for the current branch with a well-structured description that explains *why* the change is being made and *how* it works. Always use the `gh` CLI (assume it is installed and authenticated against the current repo — do not run `gh auth` checks).

Invoking this skill is explicit authorization to push the current branch and create or update a PR on the remote. Do not ask for separate permission for those actions. Still confirm before any destructive or surprising action: force-pushing, rewriting commits, including uncommitted local changes in a new commit, or pushing a branch whose name suggests it belongs to someone else.

## Inputs

The user may pass an optional target branch (e.g. `main`, `develop`). If they don't, derive it from `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`.

## Workflow

### 1. Gather context (run in parallel)

- `git rev-parse --abbrev-ref HEAD` — current branch
- `git status --porcelain` — uncommitted changes
- `git rev-parse --verify '@{u}' 2>/dev/null` — does the branch have an upstream
- `gh repo view --json defaultBranchRef -q .defaultBranchRef.name` — default branch (target, unless user specified one)
- `gh pr list --head <current-branch> --state open --json number,url,title,body,isDraft,baseRefName` — existing PR for this branch, if any

If the current branch equals the target, stop and tell the user — they need to be on a feature branch.

### 2. Handle uncommitted changes

If `git status --porcelain` shows changes, do not silently include or ignore them. Surface them to the user and ask whether to:

- Commit them as part of this PR (ask for a commit message)
- Stash them
- Proceed without them

### 3. Verify the branch is ahead of the target

```bash
git fetch origin <target>
git rev-list --count origin/<target>..HEAD
```

If the count is 0, abort with a clear message — there's nothing to PR.

### 4. Push the branch

If no upstream is set:
```bash
git push -u origin <current-branch>
```

If an upstream exists and `git log @{u}..HEAD` shows unpushed commits, push them:
```bash
git push
```

Never use `--force`, `--force-with-lease`, or `--no-verify` unless the user explicitly asks. If a pre-push hook fails, investigate and fix the underlying issue rather than bypassing it.

### 5. Review the complete diff

Before drafting (or refreshing) the description, read the full diff and commit history of the branch *against the target*, not just the latest commit:

```bash
git log --pretty=format:'%h %s%n%b%n---' origin/<target>..HEAD
git diff --stat origin/<target>...HEAD
git diff origin/<target>...HEAD
```

Note the three-dot syntax — it diffs from the merge-base, matching what GitHub shows.

For each meaningful change, read enough of the surrounding code to understand the *intent*, not just the textual hunk. The point is to write a description that helps a reviewer understand why the diff exists, which means understanding it yourself first.

### 6. Draft the title

- Imperative mood, present tense ("Add X", not "Added X" or "Adds X")
- Under 70 characters
- Specific. "Fix calendar year scraping for 1999-era themes" beats "Bug fixes"
- Honor any project-specific Hard Rules in `CLAUDE.md` / `AGENTS.md` (e.g. forbidden content like real usernames, secrets, environment-specific paths)

### 7. Draft the body

The body must answer **why** before **how**. Use this structure (skip any section that genuinely has nothing to say — an empty section with filler is worse than no section):

```markdown
## Summary

One sentence: what problem this PR solves or what capability it adds. Plain language.

## Why

The motivation. Cover the parts that apply:
- What was wrong, missing, or limiting before this PR
- The user impact, bug, or constraint that drove the work
- Prior discussions, issues, or tickets (link them)
- Why now — what would happen if this didn't ship

## How

The technical approach and the reasoning. Cover:
- The shape of the change (which modules, which interfaces)
- Key design decisions and the alternatives considered
- Tradeoffs — what got better, what got worse
- Anything subtle a reviewer might miss

## Notes for reviewers

Optional. Areas of low confidence, follow-ups intentionally deferred, manual testing performed, things to focus on.
```

Body rules:

- **Never hard-wrap prose.** Let the renderer wrap. One sentence per line is fine; a multi-sentence paragraph on one long line is also fine. Do not insert newlines mid-sentence at column 80 / 100 / etc.
- Be concrete. "Fixes the scraper" is useless; "S1 themes wrap entries in nested `<table>` rather than `div.entry`, so the scraper now falls back to URL-pattern matching when no `div.entry` is found" is useful.
- Don't restate the diff line by line — that's what the diff is for. The description explains why the diff exists.
- No TODO placeholders ("TODO: explain why"). Write the prose or omit the section.
- Honor repo Hard Rules. For this repo specifically: never include real LiveJournal usernames anywhere in the title or body. If `LJ_USERNAME` from `.env` appears in any change context, refer to "the configured user" instead.

### 8. Create or update the PR

Always pass the body via a heredoc to preserve formatting and avoid shell-quoting damage to backticks, dollar signs, and newlines.

**If no PR exists**, create one:

```bash
gh pr create --base <target> --head <current-branch> --title "<title>" --body "$(cat <<'BODY_EOF'
<full body content here>
BODY_EOF
)"
```

**If a PR already exists for this branch**, update the description in place rather than opening a duplicate:

```bash
gh pr edit <number> --body "$(cat <<'BODY_EOF'
<full body content here>
BODY_EOF
)"
```

Only change the title on an existing PR if the user asked, or if the title is clearly stale relative to what the branch now contains.

### 9. Report back

Tell the user:
- Whether the PR was created or updated, plus its number and URL
- Anything noteworthy surfaced during the diff review (scope, surprises, files touched)
- Any follow-ups they should know about (e.g. "the PR opened as a draft because this repo's `enforce-draft.yml` workflow auto-converts non-draft PRs — mark it ready for review when you want the review/merge automation to fire")

## Repo-specific awareness

Before drafting, read any project instruction files in the repo root (`CLAUDE.md`, `AGENTS.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `docs/pr-automation.md`, etc.). Honor:

- Forbidden content rules (real usernames, secrets, environment-specific paths)
- Hard-wrapping policy (most modern projects: don't wrap)
- An existing PR template — if present, fill it out instead of imposing the structure above
- Draft / review automation conventions (e.g. workflows that auto-convert PRs to draft are expected behavior, not an error)

## Failure modes to avoid

- Generic titles like "Updates", "Changes", "WIP"
- Descriptions that paraphrase the diff line by line instead of explaining intent
- TODO placeholders left in the final body
- Hard-wrapped prose
- Force-pushing or skipping hooks (`--force`, `--no-verify`) without explicit user instruction
- Inlining the body as a shell-escaped argument — quoting will mangle backticks and dollar signs; always use a heredoc with `--body "$(cat <<'EOF' ... EOF)"`
- Leaking content forbidden by repo rules (e.g. real usernames in this repo)
- Creating a duplicate PR when one already exists for the branch — always check `gh pr list --head <current-branch>` first
