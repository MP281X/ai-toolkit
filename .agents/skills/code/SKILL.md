---
name: code
description: Use when editing TypeScript or JavaScript implementation code, Effect programs, services, schemas, streams, local helpers, local types, data transforms, or code shape.
---

# Code

## Effect

- Read `.agents/repos/effect/LLMS.md` before nontrivial Effect work.
- Effect is the default application model.
- Entrypoints use platform or Atom runtimes.

## Shape

- Inference and contextual typing first.
- Prefer direct code at the use site.
- Add a helper when it names domain policy, owns lifecycle, isolates an external boundary, handles recursion, or centralizes repeated behavior that should change together.
- Do not add indirection when direct code is clearer.
- Prefer Effect modules, `pipe`, `Match`, early return.
- Diagnostic cleanup removes the unclear shape; it does not introduce helper scaffolding, config objects, or local wrappers that only hide it.
- If a cleanup attempt adds indirection without improving the code, restore the direct shape and choose a smaller change.

## Types

- Public signatures minimal.
- Boundary conformance: `satisfies`.
- Prefer inference and contextual typing for local implementation details.
- Name types when they are public boundaries, reused by real consumers, recursive, or necessary to make a complex data shape readable.
- Redesign value shape when TypeScript cannot prove it.
- Do not add local types only to satisfy diagnostics when contextual typing or `satisfies` can prove the value.

## Data

- Boundary proves type.
- Schemas live in schema modules.

## Services

- Public methods expose `R = never`.
- Constructor input used by every method belongs in layer.
- One package service = one instance; multi-instance ownership lives in app `RcMap`.
- Package services do not own app ids, route ids, tab ids, UI state.
- Mutable service state: `SubscriptionRef`; events/incremental output: `Stream`.
- One fact, one read path.
