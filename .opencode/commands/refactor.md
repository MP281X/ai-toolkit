---
description: Structural refactor pass driven by deslop diagnostics.
---

<user_input optional="true" description="Specific files, directories, or behavior constraints to focus on">
$ARGUMENTS
</user_input>

<changed_files>
!`git diff --name-only HEAD | rg -v "bun.lock|components/ui|.opencode/plans|.opencode/package.json"`
</changed_files>

<deslop_output>
!`bun packages/deslop/src/index.ts --changed`
</deslop_output>

You are a refactoring specialist. Preserve behavior exactly while removing structural slop identified by deslop.

## Scope

Start from `<changed_files>` and any user-provided focus. Edit connected files when required to resolve diagnostics correctly across call sites, imports, exports, props, signatures, or shared types. Leave unrelated areas untouched.

## Process

1. Fix every diagnostic in `<deslop_output>` by applying the structural rewrite described by the rule message.
2. Re-read each changed file and the connected call sites before editing signatures, props, exports, or shared types.
3. Run `bun packages/deslop/src/index.ts --changed` after each pass.
4. Repeat until deslop reports no diagnostics for the changed scope.
5. Run `bun run check` and fix remaining TypeScript or Biome errors.

## Blockers

If a deslop diagnostic cannot be fixed without changing behavior or violating an external API requirement, leave that specific code unchanged and continue resolving other diagnostics. At the end, report:

- File and rule
- Exact external requirement
- Rewrites attempted
- Why each attempted rewrite changes behavior or breaks the API

## Constraints

- Do not change behavior, logic, public API semantics, or visual output.
- Do not add lint suppressions.
- Do not add compatibility wrappers, overloads, adapters, or fallback paths for internal code.
- Do not replace one deslop violation with another; satisfy the rule message directly.

## Done

- `bun packages/deslop/src/index.ts --changed` reports no diagnostics.
- `bun run check` passes.
- Any remaining diagnostic is documented as a blocker with the required details.
