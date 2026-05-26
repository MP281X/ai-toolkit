# Local WIP Stack Review Plan

## Objective

Replace the staged/unstaged diff workflow with a local WIP-stack review workflow.

The diff page should support a workflow where frequent local `wip: ...` commits act like stack checkpoints. The user can review the full feature from its base, create new WIP commits, and restore the worktree files from older WIP commits without rewriting Git history.

## Desired Mental Model

```txt
base branch
  |
  wip: first working version
  |
  wip: refactor structure
  |
  wip: polish behavior
  |
current worktree changes
```

WIP commits are normal local Git commits. They are not hidden checkpoints and are not model-managed state.

The user eventually squashes the WIP stack into a clean commit before pushing.

## Non-Goals

- Do not keep staged/unstaged as the primary review UI.
- Do not implement hard reset.
- Do not run `git reset --hard`, `git checkout -f`, or `git clean`.
- Do not require force-push semantics.
- Do not introduce hidden Git snapshot state.
- Do not implement Mermaid graph visualization in v1.
- Do not implement WIP squashing in the first diff-page refactor.
- Do not change the existing queued comment workflow unless required by the new review target model.

## Core UX

Refactor `apps/agent/src/routes/(home)/$worktree/diff.tsx` around one active review target.

Current model:

```txt
Unstaged changes
Staged changes
```

Target model:

```txt
Review: Base -> worktree
```

The page should have:

- Review target/base selector.
- Changed files for the selected review target.
- Commit/WIP list.
- Selected file diff.
- Existing queued comment actions.
- Create WIP button.
- Safe restore-from-commit action.

## Initial Review Targets

Support these targets first:

- `Base -> worktree`: all feature changes, including uncommitted worktree changes.
- `Base -> HEAD`: committed WIP stack only.
- `HEAD -> worktree`: uncommitted changes only.
- `Selected commit -> worktree`: review all changes since a chosen WIP/commit.
- `Selected commit parent -> selected commit`: review only one commit.
- Custom ref/range, if the backend already has a simple path for it.

Friendly labels can be:

- All feature changes.
- Committed stack only.
- Uncommitted changes.
- Review from this WIP.
- This WIP only.
- Custom range.

## Base Branch

Git does not reliably persist "the branch this branch was created from" as durable branch metadata.

Use an explicit base selector and auto-suggest a likely base.

Suggested default order:

1. Previously selected base for this worktree/current branch, if app state already exists for this.
2. Current branch upstream/default branch if available.
3. `origin/main`.
4. `origin/master`.
5. `main`.
6. `master`.

The UI should show the selected base clearly:

```txt
Base: main
Review: Base -> worktree
```

For PR-like comparisons, use the merge base:

```txt
merge-base(selected base, HEAD) -> target
```

For `Base -> worktree`, `target` means committed changes plus current uncommitted worktree changes.

## WIP Commits

A WIP commit is a regular commit with a message convention:

```txt
wip: <message>
```

The diff page should provide a `Create WIP` action.

Flow:

1. User clicks `Create WIP`.
2. User enters a short message.
3. App stages all current changes.
4. App creates `git commit -m "wip: <message>"`.
5. App refreshes review targets, commit list, and current diff.

If there are no changes, disable the action or show a clear "No changes to commit" message.

The model must not create or manage WIP commits automatically.

## Restore Behavior

Restore must preserve commit history.

Restoring a WIP/commit means restoring the worktree files from that commit while leaving `HEAD` and later commits intact.

Conceptually:

```txt
git restore --source=<commit> -- .
```

After restore:

- `HEAD` stays unchanged.
- Later WIP commits still exist.
- The worktree now matches the selected commit's files.
- The user can create a new WIP commit from the restored state.

Dirty worktree behavior for v1:

- If the worktree has uncommitted changes, block restore.
- Offer `Create WIP first` and `Cancel`.
- Do not offer destructive discard in v1.

## Commit List

Show recent commits on the current branch, with WIP commits visually marked.

Example:

```txt
wip: polish review UI        abc123
wip: add diff target picker  def456
feat: initial route          ghi789
```

Initial interaction:

- Click commit: review from this commit to worktree.
- Secondary action: restore files from this commit.
- Optional secondary action: review only this commit.

Keep the first implementation simple. A graph can be added later if a linear list is not enough.

## Diff Semantics

The current review API is scoped around staged/unstaged concepts. Add a range-based review API instead of extending those names too far.

Possible RPC shape:

```ts
review.diff({cwd, from, to})
```

Possible streaming shape, if the page still needs live updates:

```ts
review.watchRange({cwd, from, to})
```

`from` should support:

- commit hash.
- branch/ref.
- `HEAD`.
- merge-base with selected base.

`to` should support:

- commit hash.
- `HEAD`.
- worktree.

Required comparisons:

- `HEAD -> worktree`.
- `merge-base(base, HEAD) -> HEAD`.
- `merge-base(base, HEAD) -> worktree`.
- `commit parent -> commit`.
- `commit -> worktree`.

## Frontend Changes

In `apps/agent/src/routes/(home)/$worktree/diff.tsx`:

- Remove the fixed staged/unstaged split.
- Replace `changesAtom` and `stagedAtom` with a single atom keyed by selected review target.
- Replace staged/unstaged selection scope values with review target identity.
- Keep queued comments and copy/delete behavior mostly unchanged.
- Remove `Enter` stage/unstage shortcut.
- Remove stage/unstage actions from the page.
- Keep copy comments and delete comments shortcuts.
- Add review target selector.
- Add base selector.
- Add commit/WIP list.
- Add `Create WIP` action.
- Add safe restore-from-commit action with dirty-worktree blocking.

The page should be read-only for diffs by default. File mutation happens through explicit `Create WIP` and `Restore files from commit` actions.

## Backend Changes

Likely implementation areas:

- `@packages/git` for Git operations.
- `apps/agent/src/rpcs/contracts.ts` for RPC contracts.
- Agent RPC handlers for review range, WIP commit creation, and restore-from-commit.

Minimal operations:

```ts
git.commits({cwd})
git.suggestBase({cwd})
git.diffRange({cwd, from, to})
git.createWipCommit({cwd, message})
git.restoreWorktreeFromCommit({cwd, commit})
```

Use existing package and RPC naming conventions after reading the current implementation.

## Safety Rules

Never use:

```txt
git reset --hard
git checkout -f
git clean
```

WIP creation may use:

```txt
git add -A
git commit -m "wip: <message>"
```

Restore should preserve history and only modify the worktree/index as intentionally designed.

Prefer restoring into the worktree. The later WIP creation command can stage everything when needed.

## Comment Workflow

Keep comments local and copied as Markdown.

Possible later improvement:

```md
# Review comments

Review: base main -> worktree

## file.ts

- line:42: comment
```

Do not make this required in the first implementation.

## Implementation Order

1. Read the current review RPC and Git service implementation.
2. Add Git operations for commit list, base suggestion, range diff, WIP commit, and restore-from-commit.
3. Add RPC contracts and handlers.
4. Refactor `diff.tsx` to one selected review target and one file list.
5. Add base selector and review target picker.
6. Add commit/WIP list.
7. Add WIP commit button.
8. Add safe restore-from-commit action.
9. Remove staged/unstaged UI and shortcuts.
10. Run `bun run check`.
11. Run `bun run test`.

## Open Decisions

Base persistence:

- Recommended v1: remember selected base per worktree/current branch if app state already has an obvious place for it.
- Otherwise start with auto-suggest plus manual selector.

Squashing WIP stack:

- Recommended later: separate command or page for squashing WIP commits into a clean commit.
- Do not include this in the first diff-page refactor.

Commit graph:

- Recommended later: add graph visualization only if the linear commit/WIP list becomes insufficient.
- Mermaid is likely more useful for nonlinear checkpoint/branch visualization than for the v1 stack review flow.
