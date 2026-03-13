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


## Effect.gen

Use for multi-step computations with no arguments.

```typescript
// Bad
const load = Effect.fnUntraced(function* () {
  const db = yield* Database
  return yield* db.query('SELECT * FROM users')
})

// Good
const load = Effect.gen(function* () {
  const db = yield* Database
  return yield* db.query('SELECT * FROM users')
})
```


## Effect.fnUntraced

Use for functions with arguments.

```typescript
// Good
const save = Effect.fnUntraced(function* (name: string) {
  const id = yield* db.insert('users', {name})
  yield* log(`created ${id}`)
})
```

Use with `flow` for composition:

```typescript
const saveAndNotify = flow(
  Effect.fnUntraced(function* (name: string) {
    const id = yield* db.insert('users', {name})
    return id
  }),
  Effect.flatMap(id => sendNotification(id))
)
```


## Services

Always use ServiceMap.Service class syntax.

```typescript
// Bad
const Database = {query: (sql: string) => Effect.succeed([])}

// Good
class Database extends ServiceMap.Service<Database, {
  readonly query: (sql: string) => Effect.Effect<ReadonlyArray<unknown>, DbError>
}>()('Database') {}
```

Inside service `make`, use pipe, flow, and Effect.fnUntraced:

```typescript
// Bad
export class Users extends ServiceMap.Service<Users>()('Users', {
  make: Effect.gen(function* () {
    const db = yield* Database
    return {
      delete: (id: string) => Effect.gen(function* () {
        yield* db.exec('DELETE FROM users WHERE id = ?', [id])
      })
    }
  })
}) {}

// Good
export class Users extends ServiceMap.Service<Users>()('Users', {
  make: Effect.gen(function* () {
    const db = yield* Database
    return {
      list: pipe(
        db.query('SELECT * FROM users'),
        Effect.mapError(cause => new UsersError({cause}))
      ),
      delete: Effect.fnUntraced(function* (id: string) {
        yield* db.exec('DELETE FROM users WHERE id = ?', [id])
      })
    }
  })
}) {
  static layer = Layer.effect(this, this.make)
}
```


## Layer.effect

Define the layer inside the service class. Name external implementations with `Live` suffix.

```typescript
// Bad - circular dependency
// sdk.ts:
import {MyService} from './service.ts'
export const MyServiceLayer = Layer.effect(MyService)(makeService)

// Good - layer inside service class
// sdk.ts:
export const MyServiceLive = Effect.gen(function* () {
  return {process, transform}
})
// service.ts:
import {MyServiceLive} from './sdk.ts'
export class MyService extends ServiceMap.Service<...>()('MyService') {
  static layer = Layer.effect(this, MyServiceLive)
}
```


## No dynamic imports

Never use `import()` inside Effect code.

```typescript
// Bad
static layer = MyService.toLayer(
  Effect.gen(function* () {
    const {make} = yield* Effect.promise(() => import('./impl'))
    return yield* make
  })
)

// Good
import {MyServiceLive} from './impl.ts'
export class MyService extends ServiceMap.Service<...>()('MyService') {
  static layer = Layer.effect(this)(MyServiceLive)
}
```


## Domain errors

Each service has one error type using Schema.TaggedErrorClass. Yield domain errors directly and map external causes into that type.

```typescript
export class UsersError extends Schema.TaggedErrorClass<UsersError>()('UsersError', {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.optional(Schema.NonEmptyString)
}) {}

yield* new UsersError({message: 'not found'})

yield* pipe(
  externalOp,
  Effect.mapError(cause => new UsersError({cause}))
)
```


## Streams

Use Effect.forkScoped for background streams.

```typescript
// Bad
yield* Effect.fork(pipe(events, Stream.runDrain))

// Good
yield* Effect.forkScoped(
  pipe(
    events,
    Stream.debounce(Duration.millis(50)),
    Stream.runDrain
  )
)
```


## Layers

Use Layer.mergeAll for composition. Use Layer.provide for wiring.

```typescript
// Bad
Effect.provide(Db.layer)(Effect.provide(Http.layer)(doWork))

// Good
const Live = Layer.mergeAll(Db.layer, Http.layer)
Effect.runPromise(pipe(doWork, Effect.provide(Live)))
```


## Concurrency

Use `unbounded` when parallel is safe.

```typescript
// Bad
Effect.forEach(items, processItem)

// Good
Effect.forEach(items, processItem, {concurrency: 'unbounded'})
Effect.all([effectA, effectB], {concurrency: 'unbounded'})
```
