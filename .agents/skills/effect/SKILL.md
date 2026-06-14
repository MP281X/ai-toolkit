---
name: effect
description: Use when writing Effect programs, services, schemas, RPCs, streams, layers, errors, tracing spans, or reactive state.
---

# Effect

## Programs

- Effect-first when work crosses async, resource, stream, service, state, or error boundaries
- Common primitives: `Effect`, `Stream`, `Layer`, `Context`, `Scope`, `RcMap`, `SubscriptionRef`, `Ref`, `Queue`, `PubSub`, `Schema`
- Use `Effect.gen` or `Effect.fn`; public service methods use `Effect.fn("Service.method")`
- `Effect.fnUntraced`: private hot path or intentionally untraced code only
- Resource lifetime: `Scope`
- Concurrency, scheduling, interruption, and cleanup: Effect APIs when the behavior is intentional

## Services

- Service shape: `Context.Service` + `Layer`
- Public methods expose `R = never`
- Accept stable constructor inputs in the layer when every method needs them
- One package service = one instance
- Multi-instance ownership: app `RcMap`
- No app ids, route ids, tab ids, or UI state in package services

## Reactive Data

- `SubscriptionRef`: held synchronized state/stateful frontend sync
- `Stream`: events, partial results, incremental output
- `Effect`: static or computed values
- `(...args) => Effect`: commands
- Type-said, name-silent: no `stream`, `watch`, `changes`, or service-name suffixes
- One fact, one read path; superset wins

## Schemas

- Schema owns boundary shape and validation
- Schema classes/tagged classes/tagged errors preferred
- Literals/brands over generic strings
- Plain schemas without class constructors keep their inferred type colocated with the schema
- Validate at boundaries; trust typed internals

## Errors

- Each service owns one tagged error class
- Service error shape: optional `cause`, optional `message`
- Public service methods expose only the service error
- RPC handlers may expose the full error channel
- Fail loud; do not hide debuggable failures behind fake success values

## Equality

- Structural equality: schema-backed classes or Effect data structures
- Dedupe/change detection: Effect equality helpers
- No custom string keys when structured comparison works
