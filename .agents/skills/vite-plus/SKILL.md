---
name: vite-plus
description: Use when changing Vite Plus tooling, package scripts, linting, formatting, tests, builds, workspace tasks, or repo automation.
---

# Vite Plus

Use Vite Plus as the repo toolchain.

## Rules

- Add a package script before introducing repeated project commands
- Keep Vite Plus configuration in `vite.config.ts`
- Do not add `vitest.config.ts`, `oxlint.config.ts`, `.oxlintrc`, or `.oxfmtrc`
- Put root monorepo defaults in the root `vite.config.ts`
- Use Vite Plus overrides for package-specific lint or format behavior

## Workspace Tasks

- Use `vp run -r <task>` inside scripts for recursive workspace tasks
- Use package targets such as `@scope/name#task` inside scripts when one package owns the task
- Prefer `vp run --filter <selector> <task>` inside scripts for scoped workspace automation
