# AGENTS.md

## Overview

Workbench is the local control surface for active development work:

- It discovers repositories and worktrees, then presents them as navigable project state
- It runs and observes user-owned processes such as shells, coding agents, package scripts, preview servers, and portless routes
- It provides review, diff, branch, publish, usage, and project-maintenance workflows around those worktrees
- The UI is a client of long-lived backend runtime state; opening, closing, or idling a view must not imply that the underlying user process should disappear

## Runtime Ownership

- Terminal sessions represent user-owned runtime processes and may legitimately run for hours without direct interaction
- Do not put a TTL on terminal sessions or evict them because the UI is idle
- Runtime cleanup must follow explicit lifecycle events such as user stop, process exit, command failure, route/script removal, agent removal, or worktree deletion
- Passive observation paths must stay lightweight and must not create, start, preload, or resolve heavyweight runtime services for unknown idle sessions
- Sidebar and status surfaces should read lightweight backend registry state rather than creating one subscription or service per visible row
