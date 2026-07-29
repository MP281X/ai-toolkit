# Effect testing

## Intent

Exercise Effect behavior with its real requirements, lifecycle, time, and failure channel visible to the test.

```ts
import {assert, describe, it} from '@effect/vitest'

it.effect('behavior', () => Effect.void)
it('pure behavior', () => assert.strictEqual(1, 1))
```

- Use `it.effect` for Effect and synchronous `it` for pure behavior.
- Supply dependencies through layers or in-memory service implementations.
- Use scoped tests for finalizers and resources; use the test clock for time.
- Assert typed failures in the failure channel.
- Do not create manual runtimes or implementation-coupled harnesses.
