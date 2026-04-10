---
name: typescript
description: Type inference rules and functional data transformation with pipe, flow, Match, Array, Record, String, Option, Predicate.
---

## Rules

- Never annotate types or return types — trust inference
- Never use `as` — if inference fails, redesign
- Compose with `pipe` and `flow` — no intermediate variables
- Never use native prototype methods (`.map()`, `.filter()`, `.trim()`)
- Never use `typeof` or nullish checks — use `Predicate`

## Patterns

- `pipe` — value in hand, transform step by step
- `flow` — build reusable composed function
- `Match` — branching that produces a value
- `Predicate` — type guards and checks
- `Array`, `Record` — collection transforms
- `String` — string operations
- `Option` — explicit optionality

## Examples

```typescript
// Bad
const names = users.map(user => user.name.trim())

// Good
const names = pipe(users, Array.map(user => pipe(user.name, String.trim)))
```
