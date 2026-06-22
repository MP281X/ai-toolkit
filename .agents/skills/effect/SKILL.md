---
name: effect
description: Use when writing Effect programs, services, schemas, RPCs, streams, layers, errors, tracing spans, or reactive state.
---

# Effect

## Source

- Read `.agents/repos/effect/LLMS.md` before nontrivial Effect work.
- Prefer Effect primitives and modules over ad-hoc async/runtime code.

## Programs

- Nullary work: `Effect.gen` value.
- Effectful function with arguments: `Effect.fn("Name")`.
- Public service method: `Effect.fn("Service.method")`.
- `Effect.fnUntraced`: private hot path or intentionally untraced only.
- Effect wrappers own behavior, not delegation.
- Promise interop enters Effect at the boundary.
- Async/await is transitional; convert when the Effect shape stays direct.
- Resource lifetime: `Scope`.
- Concurrency, retry, schedule, interruption, cleanup: Effect APIs.
- Fail loud; no fake empty values, swallowed causes, generic fallback.

## Services

- Service shape: `Context.Service` + `Layer`.
- Public methods expose `R = never`.
- Stable constructor input belongs in layer when every method needs it.
- One package service = one instance.
- Multi-instance ownership: app `RcMap`.
- Package services do not own app ids, route ids, tab ids, UI state.

## State

- Mutable service state: `SubscriptionRef`.
- Events/incremental output: `Stream`.
- Static/computed value: `Effect`.
- Commands with arguments: `(...args) => Effect`.
- Public zero-arg commands: Effect fields, not wrapper methods.
- One fact, one read path; superset wins.
- Names omit type words: no `stream`, `watch`, `changes`, service-name suffix.

## Schemas

- Schema owns type; infer from schema.
- Schema classes/tagged classes/tagged errors preferred.
- Public raw domain strings are branded/literal schemas.
- Plain schema type immediately before schema value.
- Construct tagged values through schema-owned constructors/helpers.
- Validate at boundaries; trust typed internals.

## Equality

- Structured identity over composed string keys.
- Schema-backed classes or Effect data structures for structural equality.
- Dedupe/change detection through Effect equality helpers.
