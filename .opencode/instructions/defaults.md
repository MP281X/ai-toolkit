# Defaults

- One thread owns one worktree for the active objective.
- The user does not edit files or local Git state in that worktree during the thread.
- Every uncommitted change in the worktree belongs to the thread.
- One user owns the branch.
- No concurrent remote commits target the branch.
- Do not perform routine reconciliation.
