## Repository

- Package manager: `vp`; workspaces: `apps/*`, `packages/*`.
- Effect is the application model; non-Effect code is boundary interop.

## Grounding

- Inspect current source, status, and the complete relevant diff before deciding.
- Current repository source and its nearest pattern own application behavior. For versioned tooling and dependencies, the installed package schema, source, and help own available keys and APIs; use version-compatible `.agents/repos/*` for rationale and implementation detail. Memory is last.
- Preserve behavior outside the approved scope and write the accepted final shape directly.
- Remove empty directories left by repository changes.

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
- Represent each fact once. Never recap diagrams, mirror lists in prose, or duplicate skill policy.
- Communicate only the information delta. Lead with the outcome; include evidence or detail only when it changes a decision or action.
- Never present delegated work as completed before its result arrives. Follow workflow-specific final-output contracts.
