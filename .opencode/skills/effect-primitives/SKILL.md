---
name: effect-primitives
description: REQUIRED for all TypeScript code
metadata:
  patterns: pipe, flow, Match, Array, String, Record, Predicate, Option
---

## Source files

```
.opencode/resources/effect/packages/effect/src/Function.ts
.opencode/resources/effect/packages/effect/src/Predicate.ts
.opencode/resources/effect/packages/effect/src/Match.ts
.opencode/resources/effect/packages/effect/src/Array.ts
.opencode/resources/effect/packages/effect/src/Record.ts
.opencode/resources/effect/packages/effect/src/String.ts
.opencode/resources/effect/packages/effect/src/Option.ts
```

## Purpose

- Use Effect modules as the default TypeScript vocabulary in this repo
- Start with these modules before reaching for native JS methods, nullish checks, or ad-hoc helpers
- If the code becomes hard to infer or compose, simplify and use the Effect primitives

## Where to look

- Composition style: `Function.ts` for `pipe`, `flow`, `dual`, `identity`, `constant`, `tap`
- Value-producing branching: `Match.ts`
- Type guards and reusable checks: `Predicate.ts`
- Array / object transforms: `Array.ts`, `Record.ts`
- String transforms: `String.ts`
- Nullish / optional values: `Option.ts`

## Best practices

- Reach for Effect modules before native JS methods, `typeof`, or nullish checks
- Use `flow` when only the first step needs the input and `pipe` when you already have the value in hand
- Use `Match` when branching produces a value and the imperative version starts to sprawl
