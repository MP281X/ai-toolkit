---
name: effect
description: Load when writing Effect programs — services, layers, retries, timeouts, concurrency, streams.
metadata:
  patterns: |
    Effect.gen, Effect.fnUntraced, Effect.service, Effect.provide,
    Layer.effect, Layer.succeed, Layer.merge, ServiceMap.Service,
    Stream., Schedule., Effect.retry, Effect.timeout, Effect.race
---

## Source files

```
.opencode/resources/effect/packages/effect/src/Effect.ts
.opencode/resources/effect/packages/effect/src/Layer.ts
.opencode/resources/effect/packages/effect/src/ServiceMap.ts
.opencode/resources/effect/packages/effect/src/Stream.ts
.opencode/resources/effect/packages/effect/src/Schedule.ts
```

## Key patterns

- Sequential effects → `Effect.ts`: `Effect.gen`, `Effect.fnUntraced`
- Service access → `Effect.ts`: `Effect.service`, `Effect.serviceOption`, `Effect.provide*`
- Service construction → `ServiceMap.ts`, `Layer.ts`: `ServiceMap.Service`, `Layer.effect`, `Layer.succeed`, `Layer.merge`
- Concurrency → `Effect.ts`, `Schedule.ts`: `Effect.forEach` options, `race*`, `timeout*`, `retry*`, `Schedule`
- Streams → `Stream.ts` when the value is really a stream

## Examples

```typescript
// Bad
const readValue = (key: string) => Effect.gen(function* () {
  const store = yield* Effect.service(Store)
  return yield* store.read(key)
})

// Good
const readValue = Effect.fnUntraced(function* (key: string) {
  const store = yield* Effect.service(Store)
  return yield* store.read(key)
})
```

```typescript
// Good
class Store extends ServiceMap.Service<Store, {readonly read: (key: string) => Effect.Effect<string>}>()('Store') {}

const StoreLive = Layer.succeed(Store)({
  read: Effect.fnUntraced(function* (key: string) {
    return `value:${key}`
  })
})
```
