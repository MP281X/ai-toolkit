---
name: effect
description: Use when writing Effect programs, services, schemas, RPCs, streams, layers, errors, tracing spans, or reactive state.
---

# Effect

## Programs

- Effect-first: no ad-hoc async/runtime when an Effect primitive exists
- Use `Effect.gen` or `Effect.fn`; public service methods use `Effect.fn("Service.method")`
- `Effect.fnUntraced`: private hot path or intentionally untraced code only
- Resource lifetime: `Scope`
- Concurrency, retry, schedule, interruption, cleanup: Effect APIs

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

- Schema-owned types: infer from schema, not inverse
- Schema classes/tagged classes/tagged errors preferred
- Literals/brands over generic strings
- Plain schemas: `type Name = typeof Name.Type` immediately before `const Name = ...`
- Validate at boundaries; trust typed internals

## Errors

- Each service owns one tagged error class
- Service error shape: optional `cause`, optional `message`
- Public service methods expose only the service error
- RPC handlers may expose the full error channel
- Fail loud: no suppression, fake empty values, or generic fallback

## Equality

- Structural equality: schema-backed classes or Effect data structures
- Dedupe/change detection: Effect equality helpers
- No custom string keys when structured comparison works
