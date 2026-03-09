---
name: effect-core
description: Effect v4 runtime patterns - services, layers, errors, Effect.gen, fnUntraced, streams
---

## Source files

```
.opencode/resources/effect/packages/effect/src/Effect.ts
.opencode/resources/effect/packages/effect/src/Function.ts
.opencode/resources/effect/packages/effect/src/ServiceMap.ts
.opencode/resources/effect/packages/effect/src/Layer.ts
.opencode/resources/effect/packages/effect/src/Stream.ts
.opencode/resources/effect/packages/effect/src/Schema.ts
.opencode/resources/effect/migration/services.md
.opencode/resources/effect/migration/error-handling.md
.opencode/resources/effect/migration/forking.md
.opencode/resources/effect/migration/yieldable.md
.opencode/resources/effect/migration/fiber-keep-alive.md
.opencode/resources/effect/migration/layer-memoization.md
.opencode/resources/effect/migration/scope.md
```


## Choosing the right pattern

Effect provides multiple ways to compose computations. Choose based on your use case:

- Use `flow` when you have a linear pipeline and the argument is only used in the first step
- Use `pipe` when you need to transform a value through multiple steps  
- Use `Effect.gen` when you have a multi-step computation with no arguments
- Use `Effect.fnUntraced` when you have a function with arguments that needs multiple steps
- Use arrow function + pipe when you have a function with arguments and a single pipeline


### DO: Use flow for linear pipelines

```typescript
const createUser = flow(
  (name: string) => db.insert('users', {name}),
  Effect.mapError(cause => new UsersError({cause}))
)
```


### DO: Use pipe to transform values

```typescript
const cwd = yield* pipe(
  exec('git', ['rev-parse', '--show-toplevel']),
  Effect.map(String.trim),
  Effect.mapError(cause => new AppError({cause}))
)
```


### DO: Use Effect.gen for computations without arguments

```typescript
make: Effect.gen(function* () {
  const db = yield* Database
  const ref = yield* Effect.andThen(loadAll, SubscriptionRef.make)
  return {db, ref}
})
```


### DO: Use Effect.fnUntraced for functions with arguments

```typescript
const saveUser = Effect.fnUntraced(function* (name: string) {
  const id = yield* db.insert('users', {name})
  yield* log(`created ${id}`)
})
```


### DON'T: Write functions that return Effect.gen

```typescript
// Bad - avoid this pattern
const saveUser = (name: string) => Effect.gen(function* () {
  const id = yield* db.insert('users', {name})
  yield* log(`created ${id}`)
})

// Good - use Effect.fnUntraced instead
const saveUser = Effect.fnUntraced(function* (name: string) {
  const id = yield* db.insert('users', {name})
  yield* log(`created ${id}`)
})
```


## Services

Always define services using the class syntax from ServiceMap.Service. This provides proper typing and integration with Effect's dependency injection.


### DO: Define services without default implementation

```typescript
class Database extends ServiceMap.Service<Database, {
  readonly query: (sql: string) => Effect.Effect<ReadonlyArray<unknown>, DatabaseError>
}>()('Database') {}
```


### DO: Define services with default implementation

```typescript
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

Access services using `yield*` inside Effect.gen. Only use Service.use when a one-liner is genuinely clearer.

Name the primary layer as `layer`. Use descriptive suffixes for variants like `layerTest`.


## Domain errors

Each service has one error type using Schema.TaggedErrorClass. Convert all internal errors at the service boundary. Keep the error channel clean with a single error type per service.

Errors are yieldable. Never use Effect.fail for domain errors. Wrap foreign errors with Effect.mapError.


### DO: Define domain errors

```typescript
export class UsersError extends Schema.TaggedErrorClass<UsersError>()('UsersError', {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.optional(Schema.NonEmptyString)
}) {}
```


### DO: Yield errors directly

```typescript
yield* new UsersError({message: 'user not found'})

yield* pipe(
  externalOperation,
  Effect.mapError(cause => new UsersError({cause}))
)
```


### DON'T: Use Effect.fail for domain errors

```typescript
// Bad
yield* Effect.fail(new Error('user not found'))

// Good
yield* new UsersError({message: 'user not found'})
```


## Streams

Compose streams with pipe and stream operators. Use Effect.forkScoped to run a stream in the background tied to a scope.


### DO: Run streams in background

```typescript
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


### DO: Merge layers

```typescript
const LiveLayers = Layer.mergeAll(Database.layer, HttpClient.layer)
```


### DO: Provide services at entrypoint

```typescript
void Effect.runPromise(
  pipe(
    doWork,
    Effect.provide(Users.layer),
    Effect.provide(Database.layer)
  )
)
```

Provide services at the application entrypoint. Only provide at intermediate levels for dynamic injection or per-request instantiation.

If you need to capture the current environment to run an effect later, use Effect.services<R>() and Effect.runForkWith(services).


## Concurrency

Use `unbounded` concurrency for parallel execution when you do not need to limit parallelism.


### DO: Run effects in parallel

```typescript
Effect.forEach(items, processItem, {concurrency: 'unbounded'})
Effect.all([effectA, effectB], {concurrency: 'unbounded'})
```
