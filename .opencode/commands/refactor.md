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

Primary targets (highest priority):
1. Duplicate implementations: functions/schemas/modules that do the same job.
2. Component props: remove unnecessary, redundant, inferable, overlapping, or alias props.
3. Over-complexity: remove edge-case handling, optional branches, and defensive paths not explicitly requested.

Rules for duplicate implementations:
- Keep exactly one canonical implementation.
- Choose the simpler or more complete implementation, merge missing parts if needed, then delete the other one.
- Update all call sites immediately.
- Do not create reusable helpers to "deduplicate". Prefer deleting and converging to one concrete implementation.

Rules for component props:
- Remove props not explicitly needed by behavior.
- Remove props inferable from other props.
- Remove duplicated control channels (for example: boolean state prop + optional callback that represents the same state).
- Collapse to the minimum prop surface that still supports required behavior.

Execution loop (mandatory):
1. Identify the highest-impact simplifications in scope with priority on duplicate implementations and props.
2. Apply the simplest design, even if it requires large structural changes.
3. Update all affected call sites immediately.
4. Delete replaced/obsolete code paths in the same pass.
5. Run `bun run fix && bun run check`.
6. Repeat from step 1.

Stop condition:
- Stop only after a full pass produces no meaningful simplification opportunities and `bun run fix && bun run check` passes.

Output format:
- Short outcome only.
- List API breaks and what was removed.
- No long explanations.
