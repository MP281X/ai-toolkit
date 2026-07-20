---
name: git-operations
description: 'Use for approved Git history and pull-request state; return safe commits, pushes, and pull requests.'
---

## Invariant

- `main`: read-only.
- The current user-provided task branch is the expected topology for implementation, commits, pushes, and history changes.
- Human merges.

## State

- Inspect repository state, task branch, remotes, named target; preserve unrelated work.
- Resolve conflicts from intended behavior and current source.
- Branch, worktree, or stack topology changes require explicit task-packet authority; they are not a routine fallback.
- Publish to the named target only after required gates and authorization.

## References

- `references/messages.md`: commit or pull-request text.
- `references/stacked-prs.md`: use only when explicit task-packet authority names stacked work.
