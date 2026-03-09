---
name: effect-core
description: Load when using Effect runtime - services, layers, errors, Effect.gen, fnUntraced, streams
---

## Source files

```
.opencode/resources/effect/packages/effect/src/Effect.ts
.opencode/resources/effect/packages/effect/src/ServiceMap.ts
.opencode/resources/effect/packages/effect/src/Layer.ts
.opencode/resources/effect/packages/effect/src/Stream.ts
```


## Choosing the right pattern

Effect provides multiple ways to compose computations. Choose based on your use case:

- Use `Effect.gen` when you have a multi-step computation with no arguments
- Use `Effect.fnUntraced` when you have a function with arguments that needs multiple steps
- Use `flow` (from effect-primitives) when building a function where additional Effect operators follow, including wrapping `Effect.fnUntraced`

```typescript
// Bad - arrow function returning Effect.gen
const saveUser = (name: string) => Effect.gen(function* () {
  const id = yield* db.insert('users', {name})
  yield* log(`created ${id}`)
})

// Good - Effect.fnUntraced for multi-step functions with arguments
const saveUser = Effect.fnUntraced(function* (name: string) {
  const id = yield* db.insert('users', {name})
  yield* log(`created ${id}`)
})

// Good - flow + Effect.fnUntraced when composing with additional Effect operators
const saveUserAndNotify = flow(
  Effect.fnUntraced(function* (name: string) {
    const id = yield* db.insert('users', {name})
    return id
  }),
  Effect.flatMap(id => sendNotification(id))
)
```

```typescript
// Bad - Effect.fnUntraced when there are no arguments
const loadUsers = Effect.fnUntraced(function* () {
  const db = yield* Database
  return yield* db.query('SELECT * FROM users')
})

// Good - Effect.gen for computations without arguments
const loadUsers = Effect.gen(function* () {
  const db = yield* Database
  return yield* db.query('SELECT * FROM users')
})
```


## Services

Always define services using the class syntax from ServiceMap.Service. This provides proper typing and integration with Effect's dependency injection.

```typescript
// Bad - plain object service, no dependency injection
const Database = {
  query: (sql: string) => Effect.succeed([] as unknown[])
}

// Good - ServiceMap.Service class syntax without default
class Database extends ServiceMap.Service<Database, {
  readonly query: (sql: string) => Effect.Effect<ReadonlyArray<unknown>, DatabaseError>
}>()('Database') {}
```

```typescript
// Bad - method using arrow+Effect.gen instead of fnUntraced or flow
export class Users extends ServiceMap.Service<Users>()('Users', {
  make: Effect.gen(function* () {
    const db = yield* Database
    return {
      delete: (id: string) => Effect.gen(function* () {
        yield* db.exec('DELETE FROM users WHERE id = ?', [id])
        yield* log(`deleted ${id}`)
      })
    }
  })
}) {}

// Good - use pipe, flow, and Effect.fnUntraced inside make
export class Users extends ServiceMap.Service<Users>()('Users', {
  make: Effect.gen(function* () {
    const db = yield* Database
    return {
      list: pipe(
        db.query('SELECT * FROM users'),
        Effect.mapError(cause => new UsersError({cause}))
      ),
      create: flow(
        (name: string) => db.insert('users', {name}),
        Effect.mapError(cause => new UsersError({cause}))
      ),
      delete: Effect.fnUntraced(function* (id: string) {
        yield* db.exec('DELETE FROM users WHERE id = ?', [id])
        yield* log(`deleted ${id}`)
      })
    }
  })
}) {
  static layer = Layer.effect(this, this.make)
}
```

## Domain errors

Each service has one error type using Schema.TaggedErrorClass. Convert all internal errors at the service boundary. Keep the error channel clean with a single error type per service.

Errors are yieldable. Never use Effect.fail for domain errors. Wrap foreign errors with Effect.mapError.

```typescript
// Bad - yields generic Error, loses type information
yield* Effect.fail(new Error('user not found'))

// Good - define a typed domain error and yield it directly
export class UsersError extends Schema.TaggedErrorClass<UsersError>()('UsersError', {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.optional(Schema.NonEmptyString)
}) {}

yield* new UsersError({message: 'user not found'})

yield* pipe(
  externalOperation,
  Effect.mapError(cause => new UsersError({cause}))
)
```


## Streams

Compose streams with pipe and stream operators. Use Effect.forkScoped to run a stream in the background tied to a scope.

```typescript
// Bad - fork without scope, stream outlives its context
yield* Effect.fork(pipe(events, Stream.runDrain))

// Good - forkScoped ties the stream lifecycle to the current scope
yield* Effect.forkScoped(
  pipe(
    events,
    Stream.debounce(Duration.millis(50)),
    Stream.tap(event => Ref.update(state, s => [...s, event])),
    Stream.runDrain
  )
)
```


## Layers

Use Layer.mergeAll for direct composition. Use Layer.provide or Layer.provideMerge when wiring dependencies.

```typescript
// Bad - providing layers one at a time inline
Effect.provide(Database.layer)(Effect.provide(HttpClient.layer)(doWork))

// Good - merge first, then provide once
const LiveLayers = Layer.mergeAll(Database.layer, HttpClient.layer)

void Effect.runPromise(
  pipe(
    doWork,
    Effect.provide(LiveLayers)
  )
)
```

## Concurrency

Use `unbounded` concurrency for parallel execution when you do not need to limit parallelism.

```typescript
// Bad - default sequential execution when parallel is safe
Effect.forEach(items, processItem)

// Good - explicit unbounded concurrency
Effect.forEach(items, processItem, {concurrency: 'unbounded'})
Effect.all([effectA, effectB], {concurrency: 'unbounded'})
```
