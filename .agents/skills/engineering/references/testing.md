# Tests

## Intent

Protect breakable public behavior with deterministic evidence.

- Test a current requirement, consumer, protocol, or regression risk.
- Exercise packages through public exports.
- Replace commands, APIs, CLIs, and networks at their system boundary.
- Derive expected values independently from implementation logic.
- Colocate tests as `name.test.ts` or `name.test.tsx`.
- Do not test types, schema shape, framework shape, method existence, library behavior, or compile-time guarantees.

```ts
it.effect('behavior', () =>
	Effect.gen(function* () {
		assert.deepStrictEqual(yield* program, expected)
	})
)
it('pure behavior', () => assert.deepStrictEqual(actual, expected))
```

- Supply requirements through layers or in-memory services.
- Use scoped tests for resources and finalizers, the test clock for time, and the failure channel for typed errors.

Reject manual runtimes, private imports, implementation-coupled harnesses, and copied assertions.
