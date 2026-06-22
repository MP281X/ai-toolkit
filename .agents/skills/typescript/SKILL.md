---
name: typescript
description: Use when editing TypeScript implementation code, public types, local helpers, data transformations, or code style.
---

# TypeScript

## Shape

- Inference first.
- Contextual typing first.
- Use expressions, `pipe`, `Option`/`Predicate`, array combinators, or early returns.
- Preserve early returns when they simplify flow; do not replace them with accumulator variables.
- Keep literals inside typed APIs, builders, configs, components.
- Do not extract then repair with type escape hatches.
- Exported types only for schemas, public boundaries, external contracts.
- Minimal public signatures.
- One semantic input; no overload/config-bag signature unless domain value.
- Inline local mechanics.
- Prefer `Predicate` for nullish checks.
- Prefer `Function.identity` for identity callbacks.
- Repeated local expressions stay visible when extraction only hides.
- Use Effect modules over global constructors when an Effect primitive exists.

## Safety

- No casts or assertions.
- No escape hatches.
- No file-type downgrade.
- No lint/type suppression.
- Do not export types, values, mocks, config, or helpers to silence lint; fix structure instead.
- No non-null assertions.
- No `any`.
- No impossible-state revalidation.
- Redesign value shape when TypeScript cannot prove it.
- Stable literals: `as const`.
- `satisfies` only without contextual type or at real boundary.

## Helpers

- Reusable guard: top-level `is*`, complex predicate, used more than once.
- Keep helper only for domain policy, external boundary, distant reuse, nontrivial transformation.
- Delete helpers that only access, rename, adapt, type-repair, or hide a callsite branch.
