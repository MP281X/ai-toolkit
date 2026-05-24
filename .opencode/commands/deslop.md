---
description: Post-implementation simplification pass for changed files.
subtask: true
---

<changed_files>
!`git diff --name-only HEAD | rg -v "bun.lock|components/ui|.opencode/plans|.opencode/package.json"`
</changed_files>

You are cleaning up code that already works.

Make the changed implementation direct, linear, and reviewable. Remove indirection unless the surrounding code proves it carries real policy, reuse, ownership, or external API boundary semantics.

## Objective

Simplify the changed files while preserving behavior, public API semantics, visual output, and reviewability.

Run at least two rounds. Each round must make the code smaller, more direct, or easier to review. Stop when another behavior-preserving simplification would hurt reviewability or cross an external API/framework boundary.

## Scope

- Work only on changed source files from `<changed_files>`.
- Ignore generated files, lockfiles, plans, package manager metadata, and shadcn/ui output.
- Do not broaden the pass into unrelated cleanup.
- Do not add new lint infrastructure, custom rules, tests, migration code, or compatibility layers.

## Simplify

Inline local names that only obscure nearby dataflow:

- one-use constants
- boolean, fallback, and access aliases
- literal aliases and tiny object/array containers
- local type aliases that only name a nearby function, component, or object shape
- pass-through helpers, wrappers, facades, and helpers with one real consumer

Prefer direct code over ceremony:

- Replace workaround control flow with the direct branch, expression, or module call.
- Collapse temporary transform chains into direct calls or one meaningful `pipe(...)`.
- Remove compatibility branches, adapters, and fallback paths that current types or APIs make unnecessary.
- Remove destructuring when direct property or index access makes ownership and dataflow clearer.
- Keep a helper only when it encodes policy, has real reuse, names a domain concept, or marks a meaningful boundary.

For TypeScript:

- Remove explicit return type annotations from functions, methods, arrows, callbacks, and components.
- Remove parameter, variable, property, and generic annotations when TypeScript can infer them from the initializer, default value, call site, or surrounding typed boundary.
- Prefer typing the boundary value or data shape over annotating implementation internals.
- Keep type annotations only when removing them changes the exported contract, loses required generic constraints, breaks overload behavior, or makes the code harder to review.

For React:

- Keep Tailwind class strings visible at the JSX site unless there is real shared styling policy.
- Keep hook calls in obvious local bindings.
- Remove manual memoization patterns if any remain after linting.

For Effect:

- Use `Effect.fnUntraced` for parameterized functions that return Effects.
- Use top-level Effect values for parameterless programs.
- Remove `Effect.gen` wrappers that only yield or map one Effect.
- Prefer direct Effect module calls and `flow(...)` for callbacks that only pipe their argument.
- Avoid `Option` for plain optional values when normal TypeScript optionality is clearer.

## Static Rules

Do not duplicate oxlint or oxfmt policy in this manual pass. If static analysis already covers something, let `bun run check` enforce it.

Treat TypeScript, oxlint, and formatter diagnostics as design feedback. Rewrite the code instead of suppressing, bypassing, or working around diagnostics.

## Round Loop

1. Inspect every changed source file.
2. Apply the simplifications above.
3. Run `bun run check`.
4. Repeat until a full round finds no behavior-preserving, reviewability-improving simplification.

## Constraints

- Do not introduce replacement aliases.
- Do not export, rename, or move code to avoid simplification.
- Do not create workaround code just to satisfy a rule.
- Do not keep legacy paths, duplicate implementations, or fallback branches unless the request explicitly requires them.
- Do not change behavior, public API semantics, or visual output.
- Leave code unchanged when the refactor would make it harder to review.

## Report Blockers

If a simplification is blocked, leave that specific code unchanged and continue elsewhere. At the end, report:

- File and symbol or syntax
- Exact reason the simplification remains blocked
- Rewrites attempted
- Why each attempted rewrite changes behavior, breaks an API, or hurts reviewability

## Done

- Every changed file has gone through at least two simplification rounds.
- A final round finds no further behavior-preserving, reviewability-improving simplification.
- `bun run check` passes.
- Remaining blockers are documented with the required details.
