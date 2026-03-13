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

Use for multi-step computations that cannot be expressed as a pipe.

```typescript
// Bad - fnUntraced with no arguments
const load = Effect.fnUntraced(function* () {
  const a = yield* fetchA()
  const b = yield* fetchB(a)
  return b
})

// Good - gen for multi-step without arguments
const load = Effect.gen(function* () {
  const a = yield* fetchA()
  const b = yield* fetchB(a)
  return b
})
```


## Effect.fnUntraced

Use for functions with arguments that cannot be expressed as a flow.

```typescript
// Good - fnUntraced with arguments
const save = Effect.fnUntraced(function* (name: string) {
  const id = yield* db.insert(name)
  yield* log(`created ${id}`)
})
```

Use with `flow` for composition:

```typescript
const saveAndNotify = flow(
  Effect.fnUntraced(function* (name: string) {
    const id = yield* db.insert(name)
    return id
  }),
  Effect.flatMap(id => sendNotification(id))
)
```


## Services

Always use ServiceMap.Service class syntax.

```typescript
// Bad - plain object
const Database = {query: (sql: string) => Effect.succeed([])}

// Good - Service class
class Database extends ServiceMap.Service<Database, {
  readonly query: (sql: string) => Effect.Effect<ReadonlyArray<unknown>, DbError>
}>()('Database') {}
```

Inside service `make`, use pipe and Effect.fnUntraced:

```typescript
// Bad - nested gen
export class Users extends ServiceMap.Service<Users>()('Users', {
  make: Effect.gen(function* () {
    const db = yield* Database
    return {
      delete: (id: string) => db.exec(id)
    }
  })
}) {}

// Good - pipe and fnUntraced
export class Users extends ServiceMap.Service<Users>()('Users', {
  make: Effect.gen(function* () {
    const db = yield* Database
    return {
      list: pipe(
        db.query('SELECT *'),
        Effect.mapError(cause => new UsersError({cause}))
      ),
      delete: Effect.fnUntraced(function* (id: string) {
        yield* db.exec(id)
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
// Bad - separate layer file
export const MyServiceLayer = Layer.effect(MyService)(makeService)

// Good - layer inside class
export class MyService extends ServiceMap.Service<...>()('MyService') {
  static layer = Layer.effect(this, MyServiceLive)
}
```


## Domain errors

Each service has one error type using Schema.TaggedErrorClass. Yield domain errors directly.

```typescript
export class UsersError extends Schema.TaggedErrorClass<UsersError>()('UsersError', {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.optional(Schema.String)
}) {}

// Yield directly
yield* new UsersError({message: 'not found'})

// Map external errors
yield* pipe(
  externalOp,
  Effect.mapError(cause => new UsersError({cause}))
)
```


## Concurrency

Use `unbounded` when parallel is safe.

```typescript
// Bad
Effect.forEach(items, processItem)

// Good
Effect.forEach(items, processItem, {concurrency: 'unbounded'})
```
