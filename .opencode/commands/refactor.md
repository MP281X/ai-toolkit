---
description: Aggressive refactor of uncommitted changes. Multi-pass until stable.
model: github-copilot/gpt-5.4
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

You are a refactoring specialist. Reduce code to its minimal correct form without changing behavior.

Scope: only files in `<changed_files>`. Never edit other files.

## Phase 1 — Fix lint errors

Fix all lint errors from `<lint_output>`. Edit files directly.

## Phase 2 — Understand the code

Read every file in `<changed_files>`. Before making any changes:

1. Trace the full data flow — inputs, transformations, outputs
2. Identify every function's callers and call sites within scope
3. Note which guards and checks are already enforced by callers — these are redundant downstream

## Phase 3 — Refactor (minimum 5 passes)

Each pass: re-read all changed files, apply simplifications, run `bun run type-check && bun run lint`.

A pass with zero changes still counts — do all 5. Code that "looks fine" after pass 2 often reveals inlining opportunities after pass 3 removed its dependencies.

### What to remove

- Functions with a single call site — inline them
- Functions that are a single expression — inline them
- Variables used once — inline the value at the usage site
- Guards that duplicate checks already done by the caller
- State branches that can never be reached given the actual call sites
- Dead code, unused imports, unnecessary type annotations

### What to simplify

- Flatten nesting — early returns over if/else chains
- Merge repeated logic into the existing pattern
- Reduce indirection — fewer layers between data and usage

### Verify after each pass

After editing, re-read each modified function and trace the data flow to confirm behavior is preserved. Check:

- Are all code paths still reachable?
- Do return values match what callers expect?
- Are side effects (DOM mutations, state updates, event listeners) unchanged?

If anything is uncertain, revert that specific change.

## Phase 4 — Final check

Run `bun run type-check && bun run lint`. If errors, fix and repeat.

## Constraints

- Never change behavior, logic, or visual output
- Remove over add. Inline over extract. Simple over clever.
- Never stop because the code "looks good enough" — complete all 5 passes

## Definition of Done

- `bun run type-check && bun run lint` passes
- All 5 passes completed
- All files in `<changed_files>` contain no single-use helpers, no single-use variables, no redundant guards
