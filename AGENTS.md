## Repository

- Package manager: `vp`; workspaces: `apps/*`, `packages/*`.
- Effect is the application model; non-Effect code is boundary interop.

## Grounding

- Inspect current source, status, and the complete relevant diff before deciding.
- Current repository source and its nearest pattern own application behavior. For versioned tooling and dependencies, the installed package schema, source, and help own available keys and APIs; use version-compatible `.agents/repos/*` for rationale and implementation detail. Memory is last.
- Preserve behavior outside the approved scope.
- Remove empty directories left by repository changes.

## Greenfield

- Remove obsolete architecture before building; solve the owning root cause and leave one direct final path without incremental, transitional, or compatibility layers.

## Authorization

- Subagents never edit repository files. They may run commands and mutate task-scoped runtime or explicitly delegated external state.
- Git and GitHub mutations require workflow or explicit user authority. Agents never merge.

## Verification

Repository changes finish with:

```bash
vp run fix && vp run check && vp run test
```

Resolve related failures at their shared cause.

## Communication

- Use dense GFM, semantic labels, simple technical English, and the most visual useful representation.
- Prefer code or commands, then diagrams or tables, then lists, then prose when each can carry the same fact.
- Represent each fact once. Never recap diagrams, mirror lists in prose, or duplicate skill policy.
- Communicate only the information delta. Lead with the outcome; include evidence or detail only when it changes a decision or action.
- Reports use `Status — clean | blocked | changes required | complete`. Changes required state severity, requirement, evidence, and required state; blocked states requirement, conflict, and missing decision; complete states artifact and result.
- Never present delegated work as completed before its result arrives. Follow workflow-specific final-output contracts.
