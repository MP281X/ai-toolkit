# Effect test mechanics

- Effect behavior uses `it.effect` from `@effect/vitest`; pure behavior uses synchronous `it`.
- Assert expected failure through `Effect.flip`.
- Provide dependencies through explicit layers.
- Lifetimes use `Effect.scoped` or `Effect.forkScoped`.
- Bridge Promise APIs at the external boundary.
- Fake commands, APIs, CLIs, and networks at the public seam.
