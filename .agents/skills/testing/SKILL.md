---
name: testing
description: Use when adding, rewriting, removing, or running tests, including performance tests and mocked Effect layers.
---

# Testing

## Tooling

- Vitest through `vite-plus/test`.
- Vite Plus config only.
- Colocated tests: `name.test.ts` / `name.test.tsx`.
- TypeScript tests only.
- Package tests through public exports only.
- Apps no tests by default; app tests allowed for real behavior.

## Scope

- Test breakable public behavior.
- Test real boundary first.
- No private implementation tests.
- No fake AST/context harness when lint/tool boundary exists.
- No test helper that selects target, changes signature, or hides branch.
- No package private imports.
- No RPC contract tests.
- No type/schema/library-shape tests.
- Delete low-value tests for removed private behavior.
- Custom lint rule test: fixture `.test.ts` with intentional violations and matching `oxlint-disable-next-line`.
- Unused disable directive is assertion.
- No exact diagnostic message runtime test.

## Boundaries

- External command/API/CLI/network: fake, mock, layer, in-memory boundary.
- Package public API/state transitions/pure transforms/perf-sensitive paths are valid test targets.

## Performance

- Add perf tests for long sessions, high-frequency streams, large buffers, repeated UI updates.
- Structural/asymptotic assertions > timing-only assertions.
- Representative fixtures.
