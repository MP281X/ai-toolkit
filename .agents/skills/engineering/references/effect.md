# Effect operations

## Operation shape

| Shape                                       | Primitive                                  |
| ------------------------------------------- | ------------------------------------------ |
| Pure reusable composition                   | `flow`                                     |
| Immediate linear composition                | `pipe`                                     |
| Argument + direct delegation                | arrow                                      |
| Argument + internal branching or sequencing | `Effect.fnUntraced`                        |
| Argument + public service checkpoint        | named `Effect.fn`                          |
| Zero-input branching or sequencing          | `Effect.gen`                               |
| Zero-input traced checkpoint                | `Effect.withSpan('name')(Effect.gen(...))` |

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
refresh: Effect.withSpan('Items.refresh')(
	Effect.gen(function* () {
		yield* storage.clear
		yield* storage.load
	})
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
save: Effect.fn('Rpc.save')(input => Effect.withSpan('Items.save')(items.save(input)))

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
		Stream.mapEffect(document => storage.export(document), {concurrency: 4})
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
return yield * Effect.forEach(input.ids, repository.read, {concurrency: 8})

// GOOD: every operation must run
return yield * Effect.validate(input.ids, repository.read, {concurrency: 8})
```

## Source

| API                              | Import                                  |
| -------------------------------- | --------------------------------------- |
| Core modules                     | `effect`                                |
| `Rpc` · `RpcGroup` · RPC runtime | `effect/unstable/rpc`                   |
| Process · HTTP · Socket · CLI    | matching `effect/unstable/*` entrypoint |

- `.agents/repos/effect/packages/effect/src/Effect.ts`
- `.agents/repos/effect/packages/effect/src/Stream.ts`
