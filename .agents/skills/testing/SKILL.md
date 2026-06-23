---
name: testing
description: Use when adding, rewriting, removing, or running tests, including performance tests and mocked Effect layers.
---

# Testing

## Tooling

- Vitest through `vite-plus/test`.
- Tooling fixes happen in root Vite Plus config.
- Colocated tests: `name.test.ts` / `name.test.tsx`.
- Apps no tests by default; app tests allowed for real behavior.

## Scope

- Test breakable public behavior.
- Test real boundary first.
- No private implementation tests.
- No fake AST/context harness when lint/tool boundary exists.
- No RPC contract tests.
- No type/schema/library-shape tests.
- Delete low-value tests for removed private behavior.

## Boundaries

- External command/API/CLI/network: fake, mock, layer, in-memory boundary.
- Package public API/state transitions/pure transforms/perf-sensitive paths are valid test targets.
- Mock at boundary, not inside implementation mechanics.

## Performance

- Add perf tests for long sessions, high-frequency streams, large buffers, repeated UI updates.
- Structural/asymptotic assertions > timing-only assertions.
