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
- Research the local source files above before assuming helper names or signatures
- If the code becomes hard to infer or compose, simplify and use the Effect primitives

## flow vs pipe

- Use `flow` when the input only feeds the first step
- Use `pipe` for multi-step value transforms

```typescript
// Bad
const normalize = (value: string) => pipe(value, String.trim, String.toUpperCase)

// Good
const normalize = flow(String.trim, String.toUpperCase)
```

## Match for value-producing branches

- Prefer `Match` when branching produces a value

```typescript
// Bad
const normalize = (value: string) => value === 'bash' ? 'sh' : value

// Good
const normalize = flow(
  (value: string) => Match.value(value),
  Match.when('bash', () => 'sh'),
  Match.orElse(Function.identity)
)
```
