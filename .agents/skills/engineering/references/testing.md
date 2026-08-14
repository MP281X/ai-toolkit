# Service and helper behavior tests

## Contract

Test public behavior through the narrowest public seam. Derive expectations independently from the contract, exercise every reachable typed failure, and use deterministic Effect primitives for state, lifetime, concurrency, and time.

| Include                                                               | Exclude                                          |
| --------------------------------------------------------------------- | ------------------------------------------------ |
| Public service and helper behavior                                    | Static type shape                                |
| Reachable typed failures via `Effect.exit`                            | Impossible post-boundary inputs                  |
| Boundary decoding or defaults when observable through the public seam | Private implementation branches                  |
| Current contract across implementations                               | Removed or compatibility behavior                |
| Logic with controlled surrounding Layers                              | Third-party behavior, traces, or live transports |
| Application service behavior                                          | React implementation details                     |

Do not test a schema merely because it exists. Test schema decoding, encoding, arbitrary generation, or transformation only when that schema behavior is itself part of the contract.

## Effect test environment

A standalone `it.effect` creates a fresh `Scope`, `TestClock`, and `TestConsole` for every test invocation. Inside `it.layer`, nested tests retain fresh scopes but share the block's cached `TestClock` and `TestConsole`. `TestClock` starts at epoch zero; advance it with `TestClock.adjust` to run scheduled work. `TestConsole.logLines` and `errorLines` expose flattened call parameters. Use `it.live` only when the contract requires the real clock or console; it provides a fresh `Scope` without the test clock or console.

Use `Effect.exit(program)` to assert typed failure, defect, or interruption as an `Exit` without changing the test effect's error channel. Use `Effect.addFinalizer` for scope-owned cleanup and `Effect.acquireRelease` when the acquired value and its release action form one resource owner; release receives the resource and scope `Exit`.

## Layers and fixtures

| Construction                | Ownership                                                                     |
| --------------------------- | ----------------------------------------------------------------------------- |
| `Layer.succeed(Key, value)` | Already constructed immutable test service                                    |
| `Layer.effect(Key)(effect)` | Effectful or scoped service acquisition; the Layer owns the acquisition scope |
| `it.layer(layer)`           | One memoized Layer context shared by all tests in its block, closed afterward |

Effect v4 has no exported `Layer.scoped` constructor. Express scoped Layer acquisition with `Layer.effect` and an effect requiring `Scope`, normally `Effect.acquireRelease` or `Effect.addFinalizer`.

Prefer a fresh Layer per test. Use `it.layer` only when sharing one expensive fixture or one lifecycle, test clock, and test console across the whole block is intentional; nested `it.effect` tests still receive fresh child scopes. Separate `it.layer` calls allocate distinct memo maps by default; passing the same explicit `memoMap` shares memoized Layer entries. Define a reusable test Layer beside the service owner when multiple tests or implementations need the same public fixture; do not duplicate Layer assembly across consumers.

```ts
const TestService = Layer.effect(Service)(Effect.acquireRelease(acquire, (service, exit) => release(service, exit)))

it.layer(TestService)('shared service lifecycle', it => {
	it.effect('first behavior', () => Service.pipe(Effect.flatMap(useFirst)))
	it.effect('second behavior', () => Service.pipe(Effect.flatMap(useSecond)))
})
```

## State and concurrency

- `Ref` owns atomic mutable test state.
- `Deferred` owns one-shot readiness or completion handshakes. Await readiness instead of sleeping.
- Start supervised test work with `Effect.forkChild`; finish with `Fiber.join` so result and failure propagate.
- `Queue` tests cover capacity, strategy, suspension, typed terminal failure, and offer/take ordering only when public behavior depends on them.
- Subscribe to `PubSub` before publishing unless replay is part of the contract; test the configured bounded, dropping, sliding, or replay behavior, not its internals.
- Use `Semaphore.make` with `semaphore.withPermits(n)(effect)` so permits release on every exit. Test contention or bounds only when externally observable.

For `SubscriptionRef`, subscribe before mutation, use a `Deferred` readiness handshake, collect a finite stream, and compare `Stream.runCollect` directly as an array:

```ts
it.effect('publishes current state and updates', () =>
	Effect.gen(function* () {
		const state = yield* SubscriptionRef.make(0)
		const ready = yield* Deferred.make<void>()
		const values = yield* SubscriptionRef.changes(state).pipe(
			Stream.tap(() => Deferred.succeed(ready, undefined)),
			Stream.take(3),
			Stream.runCollect,
			Effect.forkChild
		)

		yield* Deferred.await(ready)
		yield* SubscriptionRef.set(state, 1)
		yield* SubscriptionRef.set(state, 2)
		expect(yield* Fiber.join(values)).toEqual([0, 1, 2])
	})
)
```

## Generative, schema, and RPC behavior

Use `it.effect.prop` for effectful property tests. Inputs may combine `FastCheck` arbitraries and Effect schemas; put run configuration under `{fastCheck: {...}}`. Use `TestSchema.Asserts` only when decoding, encoding, arbitrary generation, or lossless transformation is contractual. Plain synchronous `it.prop` does not accept schemas.

```ts
it.effect.prop(
	'invariant',
	{value: Schema.Int, suffix: FastCheck.string()},
	({value, suffix}) => Effect.sync(() => expect(render(value, suffix)).toContain(suffix)),
	{fastCheck: {numRuns: 200}}
)
```

Use `RpcTest.makeClient(group)` for RPC behavior through the scoped in-memory no-serialization client/server path. Provide the group's handler Layer and every declared client or server middleware service. Do not replace this seam with a live transport.

```ts
const makeClient = Effect.gen(function* () {
	return yield* RpcTest.makeClient(Rpcs).pipe(Effect.provide(Rpcs.toLayer({Method: handler})))
})
```

## Organization

Colocate `name.test.ts` with `name.ts`. Packages and `apps/*/src/services/**` own durable service tests. Group shared public-behavior suites across implementations; each implementation supplies only its Layer. Applications may test their services, while UI and UX remain Browser acceptance.

## Authoritative sources

- `.agents/repos/effect/packages/vitest/src/index.ts`
- `.agents/repos/effect/packages/vitest/src/internal/internal.ts`
- `.agents/repos/effect/packages/effect/src/{Effect,Fiber,Ref,Deferred,Layer,Queue,PubSub,Semaphore,Stream,SubscriptionRef}.ts`
- `.agents/repos/effect/packages/effect/src/testing/{TestClock,TestConsole,TestSchema}.ts`
- `.agents/repos/effect/packages/effect/src/unstable/rpc/RpcTest.ts`
