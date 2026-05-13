---
description: Post-implementation deslop refactor pass.
subtask: true
---

<changed_files>
!`git diff --name-only HEAD | rg -v "bun.lock|components/ui|.opencode/plans|.opencode/package.json"`
</changed_files>

<deslop_output>
!`bun run deslop`
</deslop_output>

You are a post-implementation deslop refactoring specialist.

This pass runs after the code works. Do not treat deslop diagnostics as ordinary lint. A diagnostic is evidence of a structural issue that may hide dataflow, typeflow, or control flow from review.

## Objective

Use deslop diagnostics as a checklist for structural review. Reduce diagnostics as much as possible by fixing root causes while preserving behavior, public API semantics, visual output, and reviewability.

## Refactor Order

1. Inline named local types into function and component boundaries.
2. Remove variable and return type annotations that TypeScript can infer.
3. Remove destructuring and use direct property or index access.
4. Inline access aliases, boolean aliases, fallback aliases, literal aliases, and small literal containers.
5. Inline pass-through helpers, signature wrappers, access helpers, and facade objects.
6. Apply function style, Effect module, pipe, React, and architecture rules.
7. Run `bun run deslop` and repeat from step 1 until no more behavior-preserving, reviewability-improving rewrites remain.
8. Run `bun run check` and fix remaining TypeScript or Biome errors.

## Constraints

- Do not fix one diagnostic by creating another diagnostic.
- Do not introduce replacement aliases.
- Do not introduce named types to satisfy TypeScript.
- Do not use assertions to preserve an old type.
- Do not export, rename, or move code to avoid a diagnostic.
- Do not create workaround code just to satisfy a rule.
- Fix the underlying structural cause instead of patching each diagnostic mechanically.
- Leave code unchanged when the refactor would make it harder to review.
- Do not change behavior, public API semantics, or visual output.

## Remaining Diagnostics

If a deslop diagnostic cannot be fixed without changing behavior, violating an external API requirement, or making the code harder to review, leave that specific code unchanged and continue resolving other diagnostics. At the end, report:

- File and rule
- Exact reason the diagnostic remains
- Rewrites attempted
- Why each attempted rewrite changes behavior, breaks an API, or hurts reviewability

## Done

- `bun run deslop` reports no fixable diagnostics.
- `bun run check` passes.
- Any remaining diagnostic is documented with the required details.
