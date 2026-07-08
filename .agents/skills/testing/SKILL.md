---
name: testing
description: Use when adding, rewriting, removing, or running tests, including public package tests, Effect tests, and mocked Effect layers.
---

# Testing

## Tooling

- Use `@effect/vitest` for tests.
- Import `assert`, `describe`, and `it` from `@effect/vitest`.
- Use `it.effect` for Effect tests.
- Use normal `it` for pure synchronous tests.
- Do not use manual `Effect.runPromise`, `Effect.runSync`, or custom Effect test harnesses.
- Tooling fixes happen in root Vite Plus config.
- Colocated tests: `name.test.ts` / `name.test.tsx`.
- Apps no tests by default; app tests allowed for real behavior.

## Scope

- Test breakable public behavior.
- Test package behavior through public exports only.
- A test scenario needs current public behavior evidence.
- Import `service.ts`, `schema.ts`, `utils.ts`, and other public package entrypoints only.
- No `internal/*` imports.
- No fake AST/context harness when lint/tool boundary exists.
- No RPC contract tests.
- No type, schema, framework, method-existence, or library-shape tests.
- No tests for behavior already enforced by TypeScript or Schema.
- No historical removal, deprecation, or compatibility tests unless they prove a current public invariant.
- Delete low-value tests for removed private behavior.

## Boundaries

- External command/API/CLI/network: fake, mock, layer, in-memory boundary.
- Package public API behavior and pure public transforms are valid test targets.
- Mock at boundary, not inside implementation mechanics.
