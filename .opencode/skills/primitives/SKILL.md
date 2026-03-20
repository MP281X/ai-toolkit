---
name: primitives
description: Load when transforming data — pipe, flow, Match, Array, Record, String, Option, Predicate.
metadata:
  patterns: |
    pipe(, flow(, Match.value(, Match.when(, Match.orElse(,
    Array.map(, Array.filter(, Array.findFirst(,
    Record., String., Option.fromNullable(, Option.map(,
    Predicate.isString, Predicate.isNullish, Predicate.hasProperty
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

## Key patterns

- Effect modules are the ONLY vocabulary for data transforms in this repo
- `pipe` when the value is already in hand → `Function.ts`
- `flow` when building a reusable composed function → `Function.ts`
- `Match` when branching produces a value → `Match.ts`
- Composition helpers → `Function.ts`: `dual`, `identity`, `constant`
- Type guards → `Predicate.ts`
- Collections → `Array.ts`, `Record.ts`
- Strings → `String.ts`
- Optionality → `Option.ts`: `fromNullable`, `map`, `flatMap`

## Examples

```typescript
// Bad
const names = users.map(user => user.name.trim())

// Good
const names = pipe(users, Array.map(user => pipe(user.name, String.trim)))
```
