# Tests

## Intent

Protect breakable public behavior with deterministic evidence and visible Effect requirements, lifecycle, time, and failures.

- A scenario needs a current requirement, consumer, protocol, or regression risk.
- Exercise packages through public exports; never import private workspace or test-only implementation paths.
- Mock commands, APIs, CLIs, and networks at their system boundary. Derive expected values independently.
- Colocate tests as `name.test.ts` or `name.test.tsx`.
- Do not test type shape, schema shape, framework shape, method existence, library behavior, or compile-time guarantees.
- For test-first work, prove one failing public behavior, implement the smallest passing vertical slice, and repeat before refactoring.

```ts
import {assert, describe, it} from '@effect/vitest'

it.effect('behavior', () => Effect.void)
it('pure behavior', () => assert.strictEqual(1, 1))
```

- Use `it.effect` for Effect and synchronous `it` for pure behavior.
- Supply requirements through layers or in-memory services.
- Use scoped tests for resources and finalizers, the test clock for time, and the failure channel for typed errors.

**Reject:** manual runtimes, implementation-coupled harnesses, private imports, and assertions copied from implementation logic.
