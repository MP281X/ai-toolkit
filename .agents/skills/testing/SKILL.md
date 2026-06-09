---
name: testing
description: Use when adding, rewriting, removing, or running tests, including performance tests and mocked Effect layers.
---

# Testing

Test behavior that can break.

## Tooling

- Use Vitest
- Import from `vite-plus/test`
- Configure tests in `vite.config.ts`
- Do not add another test runner or a standalone test config
- Keep tests colocated with the source file they test
- Use `name.test.ts` or `name.test.tsx` next to `name.ts` or `name.tsx`

## Scope

- Test black-box behavior through the public API the app uses
- Test logic, state transitions, pure transformations, and performance-sensitive behavior
- Do not test facts already guaranteed by TypeScript or schemas
- Do not test library behavior
- Do not test external commands, external APIs, CLIs, or network services directly
- Use fakes, mocks, layers, and in-memory inputs at package boundaries
- Prefer focused tests over broad tests that only lock implementation shape

## Performance

- Add performance tests when the feature has long-running sessions, high-frequency streams, large buffers, or repeated UI updates
- Assert stable asymptotic behavior where possible
- Keep fixtures representative enough to catch regressions
- Avoid timing-only tests unless no structural assertion can prove the property

## Rewrites

- Rewrite outdated tests from scratch when the public interface changes
- Delete compatibility tests for removed behavior
- Keep tests aligned with the new public interface, not the old implementation
