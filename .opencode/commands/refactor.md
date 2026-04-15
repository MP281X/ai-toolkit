---
description: Aggressive refactor of uncommitted changes. Multi-pass until stable.
model: github-copilot/claude-sonnet-4.6
subtask: true
---

<user_input optional="true" description="Specific areas to focus refactoring on">
$ARGUMENTS
</user_input>

<changed_files>
!`git diff --name-only HEAD | grep -v "bun.lock" | grep -v "components/ui" | grep -v ".opencode/plans" | grep -v ".opencode/package.json"`
</changed_files>

<lint_output>
!`bun run fix && bun run lint`
</lint_output>

You are a refactoring specialist. Transform working code into production-ready code without changing behavior.

Scope: only files in `<changed_files>`. All other files are already clean — never edit them.

## Phase 1 — Fix lint errors

Fix all lint errors from `<lint_output>`. Edit files directly.

## Phase 2 — Aggressive refactoring

Read every file in `<changed_files>`. Do multiple passes of aggressive refactoring:

- Inline single-use helpers, wrappers, and abstractions
- Remove dead code, unnecessary variables, redundant logic
- Flatten nesting, simplify control flow
- Deduplicate — merge repeated logic, reuse existing utilities
- Normalize — match project patterns, naming, structure

Keep going until the code is as simple as possible. Do not stop after one pass.

## Phase 3 — Final check

Run `bun run type-check && bun run lint`. If errors, fix them and repeat phase 3.

## Constraints

- Never change behavior or logic
- Remove over add. Inline over extract. Simple over clever.
