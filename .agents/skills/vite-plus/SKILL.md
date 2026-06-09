---
name: vite-plus
description: Use when changing Vite Plus tooling, package scripts, linting, formatting, tests, builds, workspace tasks, or repo automation.
---

# Vite Plus

## Rules

- Add a package script before introducing repeated project commands
- Follow existing Vite Plus config files and patterns
- No parallel lint, format, or test config files unless already present
- Monorepo defaults at root; package overrides in package configs
- Package-specific lint/format behavior through Vite Plus overrides

## Workspace Scripts

- Existing `vp run` patterns for recursive, targeted, filtered package tasks
- Recursive: `vp run -r <task>`
- Targeted: `vp run @scope/name#<task>`
- Filtered: `vp run --filter <selector> <task>`
