---
description: Hyper-aggressive iterative refactor and simplification
subtask: true
---

Run an extremely aggressive refactor/simplification pass.
This command is the dedicated cleanup phase after feature work.
Assume aggressive simplification is delegated here.

Requested scope: $ARGUMENTS
Default scope when no arguments are provided: staged files only.
Staged files:
!`git diff --staged --name-only`

If no arguments are provided and no files are staged, stop and report "no staged files".

Operating mode:
- Greenfield project.
- Breaking APIs is preferred when it simplifies the design.
- No backward compatibility.
- No migration code, no deprecation layers, no compatibility wrappers, no legacy props.
- Happy path only.
- MVP/prototyping bias: remove complexity that is not explicitly required.
- Prefer flat, direct code.
- Effect-first implementation is mandatory when possible. Use Effect and Effect modules aggressively to simplify control flow and consistency.
- Do not keep accidental/wrong intermediate edits. Re-read current files before each iteration and normalize regressions immediately.

External source-of-truth requirements:
- For libraries with local mirrors in `.opencode/resources/<library>/`, inspect those sources first.
- For external integrations, inspect upstream/local source types in parallel with local implementation.
- Never rely on memory for external API shapes when the source is available.

Type-safety and style requirements:
- Prefer inference from existing runtime schemas and external source types. Do not manually define types unless required by TypeScript.
- Avoid type casts (except `as const`).
- Prefer `Effect.fnUntraced` for effectful functions.
- Prefer Effect modules (`Array`, `String`, `Predicate`, `Match`, `Config`, `Schema`, `Stream`, `pipe`, `flow`) over custom utilities.
- Remove custom helpers when equivalent library/framework helpers exist.
- Keep transformations single-purpose, direct, and consistent across files.

Primary targets (highest priority):
1. Duplicate implementations: functions/schemas/modules that do the same job.
2. Component props: remove unnecessary, redundant, inferable, overlapping, or alias props.
3. Over-complexity: remove edge-case handling, optional branches, and defensive paths not explicitly requested.
4. Schema drift: keep schemas and transforms aligned with actual runtime inputs/outputs and preserve important metadata only.
5. Refactor regressions: eliminate incorrect edits introduced during previous iterations.

Rules for duplicate implementations:
- Keep exactly one canonical implementation.
- Choose the simpler or more complete implementation, merge missing parts if needed, then delete the other one.
- Update all call sites immediately.
- Do not create reusable helpers to "deduplicate". Prefer deleting and converging to one concrete implementation.

Rules for schemas and transforms:
- Keep only schemas that are required by actual input/output boundaries.
- Remove legacy/unused schema variants.
- Avoid schema duplication by extracting shared schema fragments only when it reduces total complexity.
- Preserve metadata that is semantically relevant to runtime behavior.
- Keep transform code minimal and symmetric where applicable.

Rules for API boundaries:
- If the user requests preserving an external API, treat it as locked and refactor internals only.
- If no API-preservation constraint is provided, break APIs freely for simplification.

Rules for component props:
- Remove props not explicitly needed by behavior.
- Remove props inferable from other props.
- Remove duplicated control channels (for example: boolean state prop + optional callback that represents the same state).
- Collapse to the minimum prop surface that still supports required behavior.

Execution loop (mandatory):
1. Re-read current files in scope and identify regressions/wrong edits.
2. Inspect mirrored library/source types in parallel (`.opencode/resources/...`) for touched integrations.
3. Identify highest-impact simplifications with priority on duplicates, schema drift, and unnecessary abstractions.
4. Apply the simplest design, even if it requires structural change.
5. Update all affected call sites immediately.
6. Delete replaced/obsolete code paths in the same pass.
7. Run `bun run fix && bun run check`.
8. Repeat from step 1.

Stop condition:
- Stop only after a full pass produces no meaningful simplification opportunities and `bun run fix && bun run check` passes.

Output format:
- Short outcome only.
- List API breaks and what was removed.
- No long explanations.
