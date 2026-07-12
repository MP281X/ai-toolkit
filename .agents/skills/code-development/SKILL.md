---
name: code-development
description: 'TypeScript/JavaScript; Effect; services, schemas, streams; public package contracts.'
---

## Effect

Read `.agents/repos/effect/LLMS.md` for nontrivial Effect work.

Entrypoints use platform or Atom runtimes. Unknown boundary data is decoded with Schema.

## Shape

Keep code at its use site. A helper earns a name only when it owns domain policy, lifecycle, an external boundary, recursion, or behavior that must change as one unit.

Use Effect modules, `pipe`, `Match`, and early returns. Diagnostic fixes produce the simplest provable value and control shape; wrappers and config objects must own behavior.

Schemas live in schema modules. Use `satisfies` for boundary conformance.

## Public boundaries

When a change affects exported services, schemas, utilities, layers, or package behavior, read `references/package-contract.md`.
