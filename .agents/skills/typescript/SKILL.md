---
name: typescript
description: Use when editing TypeScript implementation code, public types, local helpers, data transformations, or code style.
---

# TypeScript

## Shape

- Inference first.
- Contextual typing first.
- Keep literals inside typed APIs, builders, configs, components.
- Do not extract then repair with aliases, casts, annotations, `satisfies`.
- Exported types only for schemas, public boundaries, external contracts.
- Minimal public signatures.
- One semantic input; no overload/config-bag signature unless domain value.
- Inline one-use prop, parameter, helper, expression, type.
- Inline local types.
- No object destructuring; use property access.
- Array destructuring allowed.
- Inline access aliases.
- Inline simple boolean aliases.
- Repeated local expressions stay visible when extraction only hides.
- Global `Object` banned; use Effect `Record`, `Struct`, `Array`, or direct access.

## Safety

- No casts/assertions.
- No escape hatches.
- No file-type downgrade.
- No lint/type suppression.
- No non-null assertions.
- No `any`.
- No impossible-state revalidation.
- Redesign value shape when TypeScript cannot prove it.
- Stable literals: `as const`.
- `satisfies` only without contextual type or at real boundary.

## Helpers

- Reusable guard: top-level `is*`, complex predicate, used more than once.
- Keep helper only for domain policy, external boundary, distant reuse, nontrivial transformation.
- Delete one-line helper.
- Delete access helper.
- Delete predicate wrapper.
- Delete signature adapter.
- Delete callsite-branch helper.
- Delete one-use helper.
- Delete helper that needs types only because it exists.
