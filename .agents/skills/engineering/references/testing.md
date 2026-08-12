# Package behavior tests

## Public behavior across implementations

```ts
// BAD
it.effect('writes memory state', () =>
	pipe(
		Effect.gen(function* () {
			const storage = yield* MemoryStorageRef
			yield* Ref.set(storage, HashMap.make(['1', Item.make({id: '1'})]))
			expect(HashMap.size(yield* Ref.get(storage))).toBe(1)
		}),
		Effect.provide(Items.layerMemory)
	)
)

// GOOD
describe.each([
	['memory', Items.layerMemory],
	['sql', Items.layerSqlTest]
] as const)('%s', (_, layer) => {
	it.effect('saves and reads an item', () =>
		pipe(
			Effect.gen(function* () {
				const items = yield* Items

				yield* items.save(Item.make({id: '1'}))

				expect(yield* items.get('1')).toEqual(Item.make({id: '1'}))
			}),
			Effect.provide(layer)
		)
	)
})
```

| Include                                                                    | Exclude                                          |
| -------------------------------------------------------------------------- | ------------------------------------------------ |
| Public service and helper behavior with independently derived expectations | Static type shape and unreachable decoded inputs |
| Reachable typed failures                                                   | Implementation branches                          |
| Logic across mocked surrounding Layers                                     | External tools, APIs, packages, transports       |
| Current contract across implementations                                    | Removed behavior and compatibility history       |

Colocate `name.test.ts` with `name.ts`. Packages own durable behavior tests; applications use browser acceptance for UI and UX.

## Source

- `.agents/repos/effect/packages/vitest/src/index.ts`
- `.agents/repos/effect/packages/effect/src/testing/TestClock.ts`
