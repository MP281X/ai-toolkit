# Effect Tests

- Effect behavior: `it.effect` from `@effect/vitest`; pure behavior: synchronous `it`.
- Expected failure: assert through `Effect.flip`.
- Dependencies: explicit layers.
- Lifetimes: `Effect.scoped` or `Effect.forkScoped`.
- Promise APIs: bridge at the external boundary.
- Commands, APIs, CLIs, networks: fake, layer, or in-memory implementation at the public seam.
- Selection: add a test only when the scenario protects a current requirement, consumer behavior, external protocol, or evidenced regression risk. Do not test Effect, Vitest, TypeScript, or foreign-tool behavior.
