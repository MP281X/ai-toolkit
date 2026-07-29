---
name: git-operations
description: 'Branches, worktrees, commits, issues, pull requests, stacks, synchronization, and conflicts.'
---

## Safety

Inspect status, current branch, default branch, remotes, worktrees, and the relevant pull request before mutation. Preserve unrelated changes and untracked files.

The default branch is read-only for ordinary commits, pushes, rebases, resets, deletion, and other destructive mutation. Direct default-branch mutation requires explicit operation-specific user authority. Integrate the default branch into a feature branch, never the reverse.

Resolve destructive targets before mutation. Outside the default branch, reset, discard, branch/worktree deletion, and shared-history rewrite require an explicit request. Use `--force-with-lease` only for an explicitly accepted stack rewrite.

Resolve conflicts from intended final behavior and current source, never by mechanically choosing a side. The user owns ready-for-review transitions.

## GitHub

Infer the repository from the checkout. Discover the current-branch pull request with `gh pr view`; require a URL only for another target.

Create and edit real issues with `gh issue create|edit`. Add each created issue to the repository Project with `gh project item-add`; Project membership is the only Project mutation. Keep an issue open until its linked pull request merges.

## Branches

One issue maps to one branch and one pull request. Create implementation branches from current default-branch state. Keep independent work on independent branches; use a stack only when one item depends on another item's unmerged changes.

## Conditional reference

- Commit, pull-request, or issue text: `references/messages.md`.
- Worktree creation, attachment, synchronization, or cleanup: `references/worktrees.md`.
- Stack mutation or recovery: `references/stacked-prs.md`.
