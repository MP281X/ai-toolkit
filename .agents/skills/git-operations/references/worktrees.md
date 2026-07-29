# Worktrees

## Create

- Fetch the remote and derive the repository default branch.
- Require a clean starting checkout.
- Create a `codex/<issue-or-outcome>` branch from the current default-branch state.
- Choose a sibling worktree path that cannot collide with an existing worktree or branch.
- Install dependencies when the worktree does not share a usable installation.

## Attach and synchronize

- Inspect existing branch and worktree ownership before attachment.
- Fast-forward known local tracking branches; do not merge feature work into the default branch.
- Synchronize a feature branch from the default branch only when the requested workflow needs it.

## Cleanup

Resolve the exact worktree and inspect its status before removal. Dirty worktree removal, branch deletion, and discard require explicit user authority. Never remove another active task's worktree.
