---
name: typescript
description: Use when editing TypeScript implementation code, public types, local helpers, data transformations, or code style.
---

# TypeScript

## Rules

- Inference-first local code
- Exported types only for schemas, public boundaries, external contracts
- No cast/assertion to bypass inference
- Redesign the value shape when TypeScript cannot prove it
- Transformations local, readable, pipeable
- Stable literals: `as const`
- No destructuring unless local API forces it
- Inline one-use prop/parameter/helper types
- Repeated local expressions stay visible when extraction only hides

## Helpers

Keep helpers only for:

- domain policy
- an external boundary
- reuse across distance
- non-trivial transformations that become clearer when named

Delete helpers that only hide constructor/property access/one-line predicate/cast/assertion/local control flow.
