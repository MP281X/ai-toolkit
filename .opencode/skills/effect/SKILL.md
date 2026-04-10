---
name: effect
description: Load when writing Effect programs — services, layers, retries, timeouts, concurrency, streams.
metadata:
  patterns: |
    Effect.gen, Effect.fnUntraced, Context.Service, Effect.provide,
    Layer.effect, Layer.succeed, Layer.merge, .useSync(
    Stream., Schedule., Effect.retry, Effect.timeout, Effect.race
---

## Source files

- `.opencode/resources/effect/packages/effect/src/Effect.ts`
- `.opencode/resources/effect/packages/effect/src/Layer.ts`
- `.opencode/resources/effect/packages/effect/src/Context.ts`
- `.opencode/resources/effect/packages/effect/src/Stream.ts`
- `.opencode/resources/effect/packages/effect/src/Schedule.ts`

## Patterns

- Sequential effects → `Effect.ts`: `Effect.gen`, `Effect.fnUntraced`
- Service access → `Context.ts`, `Effect.ts`: `yield* Service`, `Service.use`, `Service.useSync`, `Effect.provide*`
- Service construction → `Context.ts`, `Layer.ts`: `Context.Service`, `Layer.effect`, `Layer.succeed`, `Layer.merge`
- Concurrency → `Effect.ts`, `Schedule.ts`: `Effect.forEach` options, `race*`, `timeout*`, `retry*`, `Schedule`
- Streams → `Stream.ts` when value is really a stream

## Examples

```typescript
// Bad
const readValue = (key: string) => Effect.gen(function* () {
  const store = yield* Store
  return yield* store.read(key)
})

// Good
const readValue = Effect.fnUntraced(function* (key: string) {
  const store = yield* Store
  return yield* store.read(key)
})
```

```typescript
// Good
class Store extends Context.Service<Store, {readonly read: (key: string) => Effect.Effect<string>}>()('Store') {}

const StoreLive = Layer.succeed(Store)({
  read: Effect.fnUntraced(function* (key: string) {
    return `value:${key}`
  })
})
```
