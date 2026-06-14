---
name: testing
description: Use when adding, rewriting, removing, or running tests, including performance tests and mocked Effect layers.
---

# Testing

## Tooling

- Vitest, `vite-plus/test`
- Existing Vite Plus config pattern; no standalone test configs
- Colocated tests: `name.test.ts` / `name.test.tsx`

## Scope

- Breakable behavior only: public API, state transitions, pure transforms, perf-sensitive paths
- No type/schema/library/implementation-shape tests
- External command/API/CLI/network: fake, mock, layer, or in-memory boundary

## Performance

- Add perf tests for long sessions, high-frequency streams, large buffers, repeated UI updates
- Structural/asymptotic assertions > timing-only assertions
- Representative fixtures

## Rewrites

- Rewrite stale tests when public interfaces change
- Delete tests for removed behavior
