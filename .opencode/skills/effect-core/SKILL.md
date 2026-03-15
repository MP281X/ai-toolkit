---
name: effect-core
description: Effect runtime, services, and async operations
metadata:
  patterns: Effect.gen, fnUntraced, ServiceMap, Layer, Stream, errors
---

## Source files

```
.opencode/resources/effect/packages/effect/src/Effect.ts
.opencode/resources/effect/packages/effect/src/ServiceMap.ts
.opencode/resources/effect/packages/effect/src/Layer.ts
.opencode/resources/effect/packages/effect/src/Stream.ts
```

## Purpose

- Research the local source files above before using runtime APIs
- Use `Effect.gen` for lazy sequential Effects with no arguments
- Use `Effect.fnUntraced` for lazy sequential Effect functions with arguments
- When you define a service boundary, use `ServiceMap.Service`, keep the layer close, and model one tagged domain error intentionally

## Effect.gen

```typescript
// Bad
const loadUser = pipe(
  repo.getCurrent(),
  Effect.flatMap(user =>
    pipe(
      loadProfile(user.id),
      Effect.map(profile => ({user, profile}))
    )
  )
)

// Good
const loadUser = Effect.gen(function* () {
  const user = yield* repo.getCurrent()
  const profile = yield* loadProfile(user.id)
  return {user, profile}
})
```

## Effect.fnUntraced

```typescript
// Bad
const loadUser = flow(
  repo.get,
  Effect.flatMap(user =>
    pipe(
      loadProfile(user.id),
      Effect.map(profile => ({user, profile}))
    )
  )
)

// Good
const loadUser = Effect.fnUntraced(function* (id: string) {
  const user = yield* repo.get(id)
  const profile = yield* loadProfile(user.id)
  return {user, profile}
})
```

## Layer.effect

- Define the layer inside the service class. Name external implementations with `Live` suffix.

```typescript
// Bad
export const MyServiceLayer = Layer.effect(MyService, makeService)

// Good
export class MyService extends ServiceMap.Service<MyService>()('MyService') {
  static layer = Layer.effect(this, MyServiceLive)
}
```


## Concurrency

- Research concurrency helpers like `concurrency: 'unbounded'` when work is independent

```typescript
// Bad
yield* Effect.forEach(items, runItem)

// Good
yield* Effect.forEach(items, runItem, {concurrency: 'unbounded'})
```
