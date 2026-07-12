## Runtime

Workbench discovers repositories and worktrees, controls user-owned processes, and exposes review, diff, branch, publish, usage, and maintenance workflows.

- Terminal sessions and launched processes are long-lived user state.
- Cleanup follows user stop, process exit, command failure, route/script/agent removal, or worktree deletion.
- Passive views read lightweight registry state.
- Opening, closing, or idling a view never owns process lifecycle.
