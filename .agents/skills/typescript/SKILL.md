---
name: typescript
description: Use when editing TypeScript implementation code, public types, local helpers, data transformations, or code style.
---

# TypeScript

Write direct TypeScript and let inference carry the program.

## Rules

- Prefer inferred types inside implementation code
- Keep exported types only at schemas, public boundaries, and unavoidable external contracts
- Do not cast or assert to bypass inference
- Redesign the value shape when TypeScript cannot prove it
- Keep data transformations local and readable
- Prefer `pipe`, `flow`, and Effect module functions for transformations
- Prefer literals and `as const` for stable literal values
- Do not destructure objects unless the local API forces it
- Keep repeated local expressions visible when extraction only hides code

## Boundaries

- Inline one-use prop and parameter types at the narrowest call site

## Helpers

Keep a helper only when it encodes:

- domain policy
- an external boundary
- reuse across distance
- a non-trivial transformation that becomes clearer when named

Delete helpers that only hide:

- a constructor
- a property access
- a one-line predicate
- a cast or assertion
- a single caller's local control flow
