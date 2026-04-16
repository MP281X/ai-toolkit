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

## Phase 2 — Refactor

Read every file in `<changed_files>`. Run multiple passes until no simplifications remain:

- Remove dead code, unnecessary variables, redundant logic
- Flatten nesting, simplify control flow
- Deduplicate — merge repeated logic, reuse existing utilities

## Phase 3 — Final check

Run `bun run type-check && bun run lint`. If errors, fix and repeat.

## Constraints

- Never change behavior or logic
- Remove over add. Inline over extract. Simple over clever.

## Definition of Done

- `bun run type-check && bun run lint` passes
- All files in `<changed_files>` are production-ready
