# Refactor Diff Review Page And packages/git

## Summary

Make the diff review page (`apps/workbench/src/routes/(home)/$worktree/diff.tsx`) and `@deslop/git`
genuinely useful for reviewing agent work. Today the file tree is built only from changed git-tracked
files, filtering is hardcoded server-side, staged and unstaged changes are merged into one blob, merge
commits show everything that was merged in (noise), and every file's patch/content is streamed
eagerly. This refactor adds a full-worktree tree, a frontend-controlled filter, a staged/unstaged
split, a conflicts-only merge view, a more flexible diff/file component, an auto-updating tree, and a
lazy loading model.

Checkpoints / undo tree are explicitly out of scope.

## Key Changes

### 1. View-mode switch: unfiltered vs filtered (most important)

Two modes, toggled with the **Tab key** (same convention as the diff/file toggle already in the diff
pane), not a header button:

- **Unfiltered** — the entire worktree file tree: every file, tracked or untracked, regardless of
  change status (honoring `.gitignore` so deps/build output stay out). No exclusion rules applied.
- **Filtered** — only changed files, applying the existing exclusion rules _and_ hiding deleted files.

Tab cycles the view mode when the file-tree/list panel is focused; the diff pane keeps its existing
Tab behavior (diff ↔ file view), so the two usages are scoped by focus. Exclusion filtering
(`reviewExclusionPathspecs` + `isReviewExcludedPath` in `packages/git/src/service.ts`) stops being
unconditional and becomes part of Filtered mode only.

### 2. Working changes: split Staged / Unstaged + keep Merged

Replace the single "Changes" scope with three selectable scopes in `CommitList`:

- **Unstaged** — worktree vs index, plus untracked files.
- **Staged** — index vs HEAD.
- **Merged** — both together (today's behavior), default.

All three flow through the view-mode switch and the existing mark/comment/review state.

### 3. Conflicts-only merge commits

For merge commits, show only the resolution diff — what the committer changed relative to an automatic
re-merge of the parents (resolved conflicts + manual edits). Cleanly-merged files are hidden.
Non-merge commits are unchanged. Replaces the current first-parent diff used in
`GitReview.commitDiffs`.

### 4. Flexible diff/file component

Rework `PatchDiff` (`packages/components/src/components/render/diff.tsx`) to render from whatever it is
given instead of assuming a diff is always present:

- diff only → diff view
- file content only → full file view
- both → toggle between the two (as today)
- neither yet → request content

This lets the full tree open an **unchanged** file and show its contents.

### 5. Auto-updating file tree

The file tree refreshes automatically whenever the worktree changes (file edits, staging, new
commits) — for the active scope and view mode — reusing the existing fs-watch streaming that already
drives `watchReviewMetadata` / `watchReviewDiffs`. The tree stays live without manual refresh; the
currently selected file's diff/content re-loads when it changes.

### 6. Efficient loading

Separate _listing_ from _content_ so the full-worktree tree is cheap:

- Load a lightweight file listing (path + status only) for the active scope + view mode — no patches,
  no file contents.
- Load each file's diff/content lazily on selection, and cache it.
- Drive the auto-update (feature 5) from the lightweight listing stream only.

This removes the current eager streaming of every file's patch/content, the main blocker for showing
the whole worktree.

## Key Files

- `packages/git/src/service.ts` — `GitReview`: staged/unstaged/merged diffs; full-worktree listing;
  lightweight listing vs per-file content; conflicts-only merge diff; exclusion filtering as a
  parameter; fs-watch driven listing stream.
- `packages/git/src/schema.ts` — staged/unstaged review targets, a view-mode parameter, and a
  lightweight file-entry schema (path + status, no patch).
- `apps/workbench/src/rpcs/contracts.ts` + `apps/workbench/src/rpcs/handlers.ts` — RPCs for the file
  listing (streamed) and for per-file diff/content; thread the view-mode param.
- `apps/workbench/src/routes/(home)/$worktree/diff.tsx` — Tab view-mode switch,
  staged/unstaged/merged scope rows, tree from the lightweight listing, lazy per-file content loading.
  Reuses `buildFileTree`, `collapseSingleChildDirectory`, `gitReviewMarksForDiff`,
  `gitReviewStateForMarks`.
- `packages/components/src/components/render/diff.tsx` — `PatchDiff` renders based on provided
  diff/content.

## Test Plan

- Add `@deslop/git` tests (none exist today) for the staged/unstaged split, the exclusion-mode
  parameter, and the conflicts-only merge diff.
- `vp run check` after code/schema/RPC changes; `vp run test` after behavior changes.
- Manual (via `/run`):
  - Tab to switch Unfiltered ↔ Filtered (whole worktree vs changed-only with deleted hidden).
  - Switch Staged / Unstaged / Merged on the working changes.
  - Open a merge commit and confirm only resolutions show.
  - In Unfiltered mode, open an unchanged file and see its contents.
  - Edit/stage a file and confirm the tree updates without manual refresh.
  - Confirm the tree loads quickly with file content fetched lazily on selection.

## Assumptions

- "Every file" in Unfiltered mode means tracked + untracked files honoring `.gitignore` (ignored
  deps/build output excluded), not literally every path on disk.
- Conflicts-only merge view uses git's re-merge/combined diff semantics; non-merge commits keep their
  current diff.
- Auto-update reuses the existing fs-watch mechanism and applies to the file listing; no new watcher
  infrastructure is introduced.
