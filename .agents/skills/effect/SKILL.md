---
name: effect
description: Use when writing Effect programs, services, schemas, RPCs, streams, layers, errors, tracing spans, or reactive state.
---

# Effect

Treat Effect as the programming model.

## Programs

- Use `Effect`, `Stream`, `Layer`, `Context`, `Scope`, `RcMap`, `SubscriptionRef`, `Ref`, `Queue`, `PubSub`, and `Schema` before custom runtime code
- Use `Effect.gen` or `Effect.fn` for effectful functions
- Use `Effect.fn("Service.method")` for public service methods so spans are attached
- Use `Effect.fnUntraced` only for private hot helpers or code that should not create spans
- Keep resource lifetime in `Scope`
- Keep concurrency, retries, scheduling, and cleanup inside Effect primitives
- Do not wrap TypeScript async code in Effect as an afterthought

## Services

- Define services with `Context.Service`
- Provide dependencies through `Layer`
- Keep service methods free of external requirements when exposed publicly
- Accept stable constructor inputs in the layer when every method needs them
- Model a single service instance; put multi-instance ownership in the app with `RcMap`
- Do not put ids in a package service only because an app needs multiple instances

## Reactive Data

- Use `SubscriptionRef` for state that is held and synchronized
- Use `Stream` for events, partial results, and incremental output
- Use `Effect` for static or computed values
- Use functions returning `Effect` for commands
- Do not add `stream`, `watch`, `changes`, or service-name suffixes when the type already says it
- Do not expose duplicate ways to read the same information
- If one value is a superset of another, expose only the superset

## Schemas

- Prefer `Schema.Class`, `Schema.TaggedClass`, and `Schema.TaggedErrorClass`
- Prefer literals and branded schemas over generic strings
- Infer types from schemas
- For non-class schemas, define `type Name = typeof Name.Type` next to `const Name = ...`
- Validate at external boundaries and trust typed values inside the program

## Errors

- Each service owns one typed error class
- Service errors may contain optional `cause` and optional `message`
- Public service methods expose only the service error in the error channel
- RPC handlers may expose the full error channel
- Do not recover, suppress, or convert failures to empty fallback values unless the domain requires it

## Equality

- Prefer schema-backed classes and Effect data structures for structural comparison
- Use Effect equality helpers for dedupe and state-change detection
- Do not create custom string keys when a structured value can be compared directly
