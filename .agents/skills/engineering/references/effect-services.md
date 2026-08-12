# Effect services

## Service class owns the inline contract and every named Layer

```ts
// BAD: service.ts
export class Notes extends Context.Service<Notes>()('Notes', {
	make: Effect.gen(function* () {
		const storage = yield* MemoryStorage

		return {create: input => storage.create(input)}
	})
}) {}

// GOOD: service.ts
// fallow-ignore-file circular-dependency -- Service modules own implementation constructor dispatch.
import {makeMemory} from './internal/memory.ts'
import {makeSql} from './internal/sql.ts'

export class Notes extends Context.Service<
	Notes,
	{create: (input: CreateNote) => Effect.Effect<Note, NoteError>; state: SubscriptionRef.SubscriptionRef<Note[]>}
>()('Notes') {
	static layerMemory = Layer.effect(this, makeMemory)
	static layerSql = Layer.effect(this, makeSql)
}

// GOOD: internal/memory.ts
import {Notes} from '#service'

export const makeMemory = Effect.gen(function* () {
	const storage = yield* MemoryStorage

	return Notes.of({create: input => storage.create(input), state: storage.state})
})
```

## Live state

```ts
// BAD
return Workspace.of({
	changes: SubscriptionRef.changes(state),
	current: SubscriptionRef.get(state),
	set: value => SubscriptionRef.set(state, value)
})

// GOOD
const equivalent = Schema.toEquivalence(WorkspaceState)

return Workspace.of({
	state,
	update: Effect.fn('Workspace.update')(input =>
		SubscriptionRef.modifySome(state, current => {
			const next = WorkspaceState.make({...current, name: input.name})

			if (equivalent(current, next)) return Tuple.make(undefined, Option.none())

			return Tuple.make(undefined, Option.some(next))
		})
	)
})
```

Only the service implementation mutates its exposed `SubscriptionRef`.

## Keyed lifetime

| Value                          | Owner                      |
| ------------------------------ | -------------------------- |
| One application instance       | named static service Layer |
| Keyed service dependency graph | `LayerMap`                 |
| Keyed scoped value             | `RcMap`                    |
| Reused unscoped lookup         | `Cache`                    |
| Reused scoped lookup           | `ScopedCache`              |

```ts
// BAD
const workspaces = new Map<string, Workspace>()

// GOOD
const workspaces = yield * LayerMap.make(input => Workspace.layerLocal(input), {idleTimeToLive: Duration.minutes(5)})
```

```ts
// BAD
const sessions = new Map<string, Session>()

// GOOD
const sessions = yield * RcMap.make({lookup: input => Session.make(input), idleTimeToLive: Duration.minutes(5)})
```

## Scoped resources

```ts
// BAD
const connection = yield * driver.connect(input.url)

// GOOD
const connection = yield * Effect.acquireRelease(driver.connect(input.url), connection => driver.close(connection))
```

## Source

- `.agents/repos/effect/packages/effect/src/Context.ts`
- `.agents/repos/effect/packages/effect/src/Layer.ts`
- `.agents/repos/effect/packages/effect/src/SubscriptionRef.ts`
- `.agents/repos/effect/packages/effect/src/LayerMap.ts`
- `.agents/repos/effect/packages/effect/src/RcMap.ts`
- `.agents/repos/effect/packages/effect/src/Cache.ts`
- `.agents/repos/effect/packages/effect/src/ScopedCache.ts`
- `.agents/repos/effect/packages/effect/src/Duration.ts`
- `.agents/repos/effect/packages/effect/src/Scope.ts`
