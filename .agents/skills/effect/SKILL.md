---
name: effect
description: 'Effect architecture and application model; services, schemas, streams, layers, and public package contracts.'
slash: false
---

Use Effect as the application model; keep non-Effect code at boundary interop. For nontrivial API or architecture questions, inspect the configured `effect` Git reference rather than relying on memory.

Entrypoints use platform or Atom runtimes. Decode unknown boundary data with Schema. Schemas live in schema modules.

Keep code at its use site. A helper earns a name only when it owns domain policy, lifecycle, an external boundary, recursion, or behavior that changes as one unit. Use Effect modules, `pipe`, `Match`, and early returns. Wrappers and config objects must own behavior.

When a change affects exported services, schemas, utilities, layers, or package behavior, read `references/package-contract.md`.
