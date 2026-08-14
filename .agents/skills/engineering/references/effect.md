# Effect operations

Use current Effect primitives and data models before JavaScript APIs or local helpers.

## Composition

```ts
// BAD
const normalize = (input: Input) => pipe(input, decode, validate, persist)

// GOOD
const normalize = flow(decode, validate, persist)
```

## Evaluate reused effects once

```ts
// BAD
return Effect.all({
	audit: audit(yield * authorize(input.session.user.id)),
	view: render(yield * authorize(input.session.user.id))
})

// GOOD
const permissions = yield * authorize(input.session.user.id)

return Effect.all({audit: audit(permissions), view: render(permissions)})
```

## Immutable ownership

```ts
// BAD
function normalize(input: Item[]) {
	input.sort((left, right) => left.rank - right.rank)
	return input
}

// GOOD
function normalize(input: Item[]) {
	return Array.sortWith(input, item => item.rank, Order.Number)
}
```

Arguments, returned values, and service values remain immutable outside their owner.

## Module map

| Domain        | Modules                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Composition   | `Function` · `Effect` · `Stream` · `Channel` · `Sink`                                                                                                  |
| Values        | `String` · `Number` · `Boolean` · `Array` · `Record` · `Struct` · `Tuple` · `Iterable` · `Data`                                                        |
| Decisions     | `Predicate` · `Filter` · `Match` · `Order` · `Ordering` · `Equivalence` · `Equal` · `Hash`                                                             |
| Outcomes      | `UndefinedOr` · `Option` · `Result` · `Exit` · `Cause`                                                                                                 |
| Collections   | `HashMap` · `HashSet` · `Chunk`                                                                                                                        |
| Schema        | `Schema` · `SchemaAST` · `SchemaGetter` · `SchemaIssue` · `SchemaParser` · `SchemaRepresentation` · `SchemaTransformation` · `JsonSchema` · `Encoding` |
| Configuration | `Config` · `ConfigProvider` · `Redacted` · `PlatformError`                                                                                             |
| Time          | `Duration` · `DateTime` · `Clock` · `Schedule`                                                                                                         |
| State         | `Ref` · `SubscriptionRef` · `SynchronizedRef` · `Queue` · `PubSub`                                                                                     |
| Resources     | `Scope` · `Resource` · `Cache` · `ScopedCache` · `RcMap` · `RcRef` · `LayerMap` · `Pool`                                                               |
| Concurrency   | `Deferred` · `Semaphore` · `Fiber` · `FiberHandle` · `FiberMap` · `FiberSet` · `Request` · `RequestResolver`                                           |
| Observability | `Logger` · `LogLevel` · `Metric` · `Tracer`                                                                                                            |
| Runtime       | `Context` · `Layer` · `ManagedRuntime` · `Runtime`                                                                                                     |
| Platform      | `FileSystem` · `Path` · `Console` · `Terminal` · `Random` · `Crypto`                                                                                   |

Stable source: `.agents/repos/effect/packages/effect/src/<Module>.ts`.

| Entrypoint                   | Material modules                                                                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `effect/unstable/reactivity` | `Atom` · `AsyncResult` · `AtomRpc` · `AtomRegistry` · `AtomRef` · `Reactivity` · `Hydration` · `AtomHttpApi`                                                    |
| `effect/unstable/rpc`        | `Rpc` · `RpcGroup` · `RpcSchema` · `RpcClient` · `RpcServer` · `RpcSerialization` · `RpcMessage` · `RpcMiddleware` · `RpcClientError` · `RpcTest` · `RpcWorker` |
| `effect/unstable/ai`         | `Model` · `LanguageModel` · `EmbeddingModel` · `Tokenizer` · `Chat` · `Prompt` · `Response` · `Tool` · `Toolkit` · `AiError` · `Telemetry`                      |
| `effect/unstable/http`       | `HttpServer` · `HttpRouter` · `HttpServerRequest` · `HttpServerResponse` · `HttpMiddleware` · `HttpClient` · `HttpClientRequest` · `HttpClientResponse`         |
| `effect/unstable/httpapi`    | `HttpApi` · `HttpApiGroup` · `HttpApiEndpoint` · `HttpApiSchema` · `HttpApiBuilder` · `HttpApiClient`                                                           |
| `effect/unstable/process`    | `ChildProcess` · `ChildProcessSpawner`                                                                                                                          |
| `effect/unstable/socket`     | `Socket` · `SocketServer`                                                                                                                                       |
| `effect/unstable/cli`        | `Command` · `Argument` · `Flag` · `Param` · `Primitive` · `CliConfig` · `CliError` · `CliOutput`                                                                |

Unstable source: `.agents/repos/effect/packages/effect/src/unstable/<entrypoint>/index.ts` and adjacent modules.

## Operation shape

| Shape                                       | Primitive                                  |
| ------------------------------------------- | ------------------------------------------ |
| Pure reusable composition                   | `flow`                                     |
| Immediate linear composition                | `pipe`                                     |
| Argument + direct delegation                | arrow                                      |
| Argument + internal branching or sequencing | `Effect.fnUntraced`                        |
| Argument + public service checkpoint        | named `Effect.fn`                          |
| Zero-input branching or sequencing          | `Effect.gen`                               |
| Zero-input traced checkpoint                | `Effect.withSpan(Effect.gen(...), 'name')` |

```ts
// BAD
save: input =>
	Effect.gen(function* () {
		return yield* storage.save(input)
	})

// GOOD
save: input => storage.save(input)
```

```ts
// BAD
save: input =>
	pipe(
		storage.read(input.id),
		Effect.flatMap(current => (current.value === input.value ? Effect.succeed(current) : storage.write(input)))
	)

// GOOD
save: Effect.fnUntraced(function* (input) {
	const current = yield* storage.read(input.id)

	if (current.value === input.value) return current

	return yield* storage.write(input)
})
```

```ts
// BAD
refresh: Effect.fn('Items.refresh')(function* () {
	yield* storage.clear
	yield* storage.load
})()

// GOOD
refresh: Effect.withSpan(
	Effect.gen(function* () {
		yield* storage.clear
		yield* storage.load
	}),
	'Items.refresh'
)
```

## Trace ownership

| Operation                              | Owner             |
| -------------------------------------- | ----------------- |
| RPC transport                          | RPC runtime       |
| Public service logic                   | named `Effect.fn` |
| Direct delegation to traced logic      | existing span     |
| Distinct costly or failure-prone stage | one named span    |
| Pure transformation                    | none              |
| Infinite RPC stream                    | RPC runtime       |
| Finite unowned Stream operation        | `Stream.withSpan` |

```ts
// BAD
save: Effect.fn('Rpc.save')(input => Effect.withSpan(items.save(input), 'Items.save'))

// GOOD
save: input => items.save(input)
```

```ts
// BAD
const exported = pipe(
	documents,
	Stream.mapEffect(document => storage.export(document))
)

// GOOD
const exported = Stream.withSpan('Document.exportAll')(
	pipe(
		documents,
		Stream.mapEffect(document => storage.export(document), {concurrency})
	)
)
```

## RPC callbacks

```ts
// BAD
'notes.changes': Effect.fnUntraced(
	() => Effect.succeed(SubscriptionRef.changes(notes.state)),
	Stream.unwrap
)

// GOOD
'notes.changes': () => SubscriptionRef.changes(notes.state)
```

```ts
// BAD
return NotesRpcs.of({
	'notes.changes': input =>
		Effect.gen(function* () {
			const notes = yield* NotesMap.get(input.workspaceId)
			return SubscriptionRef.changes(notes.state)
		})
})

// GOOD
return NotesRpcs.of({
	'notes.changes': Effect.fnUntraced(function* (input) {
		const notes = yield* NotesMap.get(input.workspaceId)
		return SubscriptionRef.changes(notes.state)
	}, Stream.unwrap)
})
```

## Contract-required failure accumulation

```ts
// BAD: every operation must run
return yield * Effect.forEach(input.ids, repository.read, {concurrency: input.concurrency})

// GOOD: every operation must run
return yield * Effect.validate(input.ids, repository.read, {concurrency: input.concurrency})
```

## Source

| API                              | Import                                  |
| -------------------------------- | --------------------------------------- |
| Core modules                     | `effect`                                |
| `Rpc` · `RpcGroup` · RPC runtime | `effect/unstable/rpc`                   |
| Process · HTTP · Socket · CLI    | matching `effect/unstable/*` entrypoint |

- `.agents/repos/effect/packages/effect/src/Effect.ts`
- `.agents/repos/effect/packages/effect/src/Stream.ts`
