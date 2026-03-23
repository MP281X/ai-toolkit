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

- `.opencode/resources/effect/packages/effect/src/Function.ts`
- `.opencode/resources/effect/packages/effect/src/Predicate.ts`
- `.opencode/resources/effect/packages/effect/src/Match.ts`
- `.opencode/resources/effect/packages/effect/src/Array.ts`
- `.opencode/resources/effect/packages/effect/src/Record.ts`
- `.opencode/resources/effect/packages/effect/src/String.ts`
- `.opencode/resources/effect/packages/effect/src/Option.ts`

## Rules

- ONLY use: `Array`, `String`, `Record`, `Option`, `Predicate`, `Match`, `pipe`, `flow`
- NEVER native prototype methods (`.map()`, `.filter()`, `.trim()`)
- NEVER `typeof` or nullish checks
- Compose with `pipe` and `flow`, not intermediate variables

## Patterns

- `pipe` — value already in hand → `Function.ts`
- `flow` — building reusable composed function → `Function.ts`
- `Match` — branching produces value → `Match.ts`
- Type guards → `Predicate.ts`
- Collections → `Array.ts`, `Record.ts`
- Strings → `String.ts`
- Optionality → `Option.ts`

## Examples

```typescript
// Bad
const names = users.map(user => user.name.trim())

// Good
const names = pipe(users, Array.map(user => pipe(user.name, String.trim)))
```
