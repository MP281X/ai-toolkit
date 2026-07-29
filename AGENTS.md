## Repository

- Package manager: `vp`; workspaces: `apps/*`, `packages/*`.
- Effect is the application model; non-Effect code is boundary interop.

## Grounding

- Current repository source outranks relevant `.agents/repos/*`; both outrank maintained documentation and memory.
- Use package APIs and the nearest current pattern rather than remembered signatures.
- Preserve behavior outside the approved scope and write the accepted final shape directly.

## Authorization

- Subagents never edit repository files. They may run commands and mutate task-scoped runtime or explicitly delegated external state.
- Git and GitHub mutations require workflow or explicit user authority. Agents never merge.

## Verification

Repository changes finish with:

```bash
vp run fix && vp run check
```

Resolve related failures at their shared cause.

## Communication

- Use dense GFM, semantic labels, and simple technical English.
- Represent each fact once in its most useful form; do not recap diagrams, mirror lists in prose, or duplicate skill policy.
- Ground claims in current evidence. Lead with the outcome and include detail only when it changes a decision or action.
