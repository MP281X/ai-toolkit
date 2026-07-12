---
name: git-operations
description: 'Branches, worktrees, commits, issues, Projects, pull requests, stacks, synchronization, conflicts.'
---

## Safety

Inspect status, current branch, default branch, remotes, and the relevant pull request before mutation. Preserve unrelated changes and untracked files.

The default branch is read-only for commits, pushes, history rewrites, and destructive Git mutations. Outside it, reset, discard, branch/worktree deletion, and shared-history rewrite require an explicit request. Use `--force-with-lease` only for an accepted stack rebase.

Resolve conflicts from intended final behavior and current source, never by mechanically choosing a side. Integrate the default branch into feature or stack branches, never the reverse. The user merges pull requests.

## GitHub

Infer the repository from the checkout. Discover the current-branch pull request with `gh pr view`; require a URL only for another target.

Create and edit real issues with `gh issue create|edit`. Add each created issue to the repository Project with `gh project item-add`; Project membership is the only Project mutation. Keep the issue open until its linked pull request merges.

## Branches

One issue maps to one branch and one pull request. Create implementation branches from current default-branch state. Keep independent work on independent branches; use a stack only when one item depends on another item's unmerged changes.

## Conditional reference

- Before writing commit or pull-request text, read `references/messages.md`.
- Before stack mutation or recovery, read `references/stacked-prs.md`.
