# Package behavior tests

## Public behavior across implementations

```ts
// BAD
it.effect('writes memory state', () =>
	Effect.gen(function* () {
		const storage = yield* MemoryStorageRef
		yield* Ref.set(storage, HashMap.make(['1', Item.make({id: '1'})]))
		expect(yield* Ref.get(storage)).toHaveLength(1)
	}).pipe(Effect.provide(Items.layerMemory))
)

// GOOD
describe.each([
	['memory', Items.layerMemory],
	['sql', Items.layerSqlTest]
])('%s', (_, layer) => {
	it.effect('saves and reads an item', () =>
		Effect.gen(function* () {
			const items = yield* Items

			yield* items.save(Item.make({id: '1'}))

			expect(yield* items.get('1')).toEqual(Item.make({id: '1'}))
		}).pipe(Effect.provide(layer))
	)
})
```

| Include                                                                    | Exclude                                       |
| -------------------------------------------------------------------------- | --------------------------------------------- |
| Public service and helper behavior with independently derived expectations | Type and schema shape                         |
| Reachable typed failures                                                   | Impossible inputs and implementation branches |
| Logic across mocked surrounding Layers                                     | External tools, APIs, packages, transports    |
| Current contract across implementations                                    | Removed behavior and compatibility history    |

Colocate `name.test.ts` with `name.ts`. Packages own durable behavior tests. Applications compose packages, retain minimal application-specific logic, and use browser acceptance for UI and UX.

## Source

- `.agents/repos/effect/packages/vitest/src/index.ts`
- `.agents/repos/effect/packages/effect/src/testing/TestClock.ts`
