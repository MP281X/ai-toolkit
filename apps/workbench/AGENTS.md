# AGENTS.md

## Overview

Workbench is the local control surface for active development work:

- It discovers repositories and worktrees, then presents them as navigable project state
- It runs and observes user-owned processes such as shells, coding agents, package scripts, preview servers, and portless routes
- It provides review, diff, branch, publish, usage, and project-maintenance workflows around those worktrees
- The UI is a client of long-lived backend runtime state; opening, closing, or idling a view must not imply that the underlying user process should disappear

## Runtime Ownership

- Terminal sessions are user-owned runtime processes and may run for hours without direct interaction
- Runtime cleanup follows explicit lifecycle events: user stop, process exit, command failure, route/script removal, agent removal, or worktree deletion
- Passive observation paths stay lightweight
- Sidebar and status surfaces read lightweight backend registry state
