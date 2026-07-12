---
name: testing
description: 'Test creation, execution, removal; Effect harnesses; public seams; test-first changes.'
---

Tests protect breakable behavior at public seams. They survive implementation replacement because they do not observe internals.

## Harness

```ts
import {assert, describe, it} from '@effect/vitest'

it.effect('behavior', () => Effect.void)
it('pure behavior', () => assert.strictEqual(1, 1))
```

Use `it.effect` for Effect and synchronous `it` for pure behavior. Manual Effect runtimes and custom test harnesses are outside the test boundary.

Colocate tests as `name.test.ts` or `name.test.tsx`.

## Seams

- Test packages through public exports.
- Test app behavior only when a current requirement justifies it.
- Mock commands, APIs, CLIs, and networks at their system boundary through a fake, layer, or in-memory implementation.
- Keep mocks outside implementation mechanics.

A test scenario needs a current requirement, consumer, protocol, or regression risk. Type shape, schema shape, framework shape, method existence, RPC contracts, library behavior, and compile-time guarantees are not test targets.

## Test-first branch

For red-green work, read `references/test-first.md`.
