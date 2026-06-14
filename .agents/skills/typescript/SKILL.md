---
name: typescript
description: Use when editing TypeScript implementation code, public types, local helpers, data transformations, or code style.
---

# TypeScript

## Rules

- Redesign the value shape when TypeScript cannot prove it
- Transformations local, readable, pipeable
- Name types only for schemas, public boundaries, external contracts, or domain concepts
- Keep repeated local expressions visible when extraction only hides context

## Helpers

Keep helpers only for:

- domain policy
- an external boundary
- reuse across distance
- non-trivial transformations that become clearer when named

Delete helpers when inlining makes the review path shorter and no domain policy or distant reuse remains.
