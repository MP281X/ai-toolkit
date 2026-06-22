---
name: typescript
description: Use when editing TypeScript implementation code, public types, local helpers, data transformations, or code style.
---

# TypeScript

## Shape

- Inference first.
- Contextual typing first.
- Use expressions, `pipe`, Effect modules, `Predicate`, or early returns.
- Preserve early returns when they simplify flow.
- Keep literals inside typed APIs, builders, configs, components.
- Exported types only for schemas, public boundaries, external contracts.
- Local types only when schema-owned, recursive, or reused by real signatures.
- Inline schema decoder expressions.
- Minimal public signatures.
- One semantic input; no overload/config-bag signature unless domain value.
- Inline local mechanics.
- Prefer `Predicate` for nullish checks.
- Prefer Effect modules over native prototype methods and global constructors.
- JSON enters/leaves through Schema.
- Native collections only for JS, React, DOM, or third-party interop.
- Consume existing `Option` values; do not construct Options from plain values.
- Do not route around `Option` rules with temporary wrappers.
- Context-owned callbacks infer parameters.
- Standalone `Effect.fn` arguments may be typed.

## Safety

- Prove types through value shape, schema, or boundary APIs.
- Redesign value shape when TypeScript cannot prove it.
- Stable literals: `as const`.
- Boundary conformance: `satisfies`.

## Helpers

- Keep helpers for domain policy, external boundary, distant reuse, or nontrivial transformation.
- Inline wrappers, accessors, aliases, trivial handlers, one-step transforms, and type repair.
- Inline static return functions.
- Do not use mutable holder objects to bypass `let`.
- Do not duplicate inline structural types.
