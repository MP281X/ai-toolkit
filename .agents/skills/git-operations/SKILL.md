---
name: git-operations
description: 'Safe branch, commit, issue, draft pull-request, stack, synchronization, and conflict operations.'
---

## Safety

Inspect status, current branch, default branch, remotes, worktrees, and the relevant pull request before mutation. Preserve unrelated changes and untracked files.

The default branch is read-only for ordinary commits, pushes, rebases, resets, deletion, and other destructive mutation. Direct default-branch mutation requires explicit operation-specific user authority. Integrate the default branch into a feature branch, never the reverse.

Resolve destructive targets before mutation. Outside the default branch, reset, discard, branch/worktree deletion, and unpublished local-history rewrite require an explicit request.

Resolve conflicts from intended final behavior and current source, never by mechanically choosing a side. The user owns ready-for-review transitions.

Published history is immutable: never rebase, amend, squash, reset, or force-push a published branch.

## GitHub

Infer the repository from the checkout. Discover the current-branch pull request with `gh pr view`; require a URL only for another target.

Create and edit real issues with `gh issue create|edit`. Add each created issue to the repository Project with `gh project item-add`; Project membership is the only Project mutation. Keep an issue open until its linked pull request merges.

## Branches

One issue maps to one short semantic branch and one pull request. Do not add an agent or tool prefix. Create implementation branches from current default-branch state. Keep independent work independent; use a stack only when one item depends on another item's unmerged changes.

## Conditional reference

- Commit or pull-request text: `references/messages.md`.
- Stack creation, publication, alignment, merge recovery, or retargeting: `references/stacked-prs.md`.
