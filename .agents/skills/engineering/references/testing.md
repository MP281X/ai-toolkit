# Service and helper behavior tests

## Public stream behavior across implementations

```ts
// BAD
it.effect('writes memory state', () =>
	Effect.gen(function* () {
		const storage = yield* MemoryStorageRef
		yield* Ref.set(storage, HashMap.make(['1', Item.make({id: '1'})]))
		expect(HashMap.size(yield* Ref.get(storage))).toBe(1)
	})
)

// GOOD
describe.each([
	['memory', Items.layerMemory],
	['sql', Items.layerSqlTest]
] as const)('%s', (_, layer) => {
	it.effect('publishes current state and updates', () =>
		pipe(
			Effect.gen(function* () {
				const items = yield* Items
				const ready = yield* Deferred.make()
				const first = Item.make({id: '1'})
				const second = Item.make({id: '2'})
				const values = yield* pipe(
					SubscriptionRef.changes(items.state),
					Stream.tap(() => Deferred.succeed(ready, undefined)),
					Stream.take(3),
					Stream.runCollect,
					Effect.forkChild
				)

				yield* Deferred.await(ready)
				yield* items.save(first)
				yield* items.save(second)

				expect(yield* Fiber.join(values)).toEqual([[], [first], [first, second]])
			}),
			Effect.provide(layer)
		)
	)
})
```

`Stream.runCollect` already returns `A[]`; compare it directly.

| Include                                                                    | Exclude                                          |
| -------------------------------------------------------------------------- | ------------------------------------------------ |
| Public service and helper behavior with independently derived expectations | Static type shape and unreachable decoded inputs |
| Reachable typed failures                                                   | Implementation branches                          |
| Logic across mocked surrounding Layers                                     | External tools, APIs, packages, transports       |
| Current contract across implementations                                    | Removed behavior and compatibility history       |
| Boundary decoding/default behavior through its public seam                 | React component and UI behavior                  |

Colocate `name.test.ts` with `name.ts`. Packages and `apps/*/src/services/**` own durable service tests; applications use browser acceptance for UI and UX.

## Source

- `.agents/repos/effect/packages/vitest/src/index.ts`
- `.agents/repos/effect/packages/effect/src/testing/TestClock.ts`
