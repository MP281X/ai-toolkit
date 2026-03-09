---
name: refactor
description: Load for post-implementation cleanup - remove dead code, defensive checks, thin wrappers
---

## Source files

```
.opencode/resources/effect/packages/effect/src/Effect.ts
.opencode/resources/effect/packages/effect/src/Function.ts
.opencode/resources/effect/packages/effect/src/Match.ts
.opencode/resources/effect/packages/effect/src/String.ts
```


## Required skills

The refactor pass must load and apply every relevant skill.
If a cleaner result exists by applying another skill, take it. This is mandatory.


## Remove defensive checks

Attempt the operation and handle failure. Do not check preconditions before acting.

```typescript
// Bad - check then act
if (!(yield* fs.exists(path))) {
  yield* fs.makeDirectory(path, {recursive: true})
}

// Good - attempt and catch
yield* pipe(
  fs.makeDirectory(path, {recursive: true}),
  Effect.catchAll(() => Effect.void)
)
```


## Remove redundant validation

Do not add validation checks for states that the Effect type system or the upstream operation already guarantees cannot occur. Real errors surface naturally through the effect error channel.

```typescript
// Bad - manually checking a return value that the type already constrains
const value = yield* getSomeValue() // already typed as the expected shape
if (value !== expected) {
  yield* new AppError({message: 'mismatch'}) // unreachable in practice
}

// Good - trust the Effect chain; the error is handled upstream
const value = yield* getSomeValue()
// Continue with value
```


## Flatten nesting

Avoid deeply nested pipe calls. Flatten into a single pipe chain.

```typescript
// Bad - nested pipes
const result = yield* pipe(
  pipe(
    pipe(operation, Effect.map(...)),
    Effect.flatMap(...)
  ),
  Effect.map(...)
)

// Good - flat pipe chain
const result = yield* pipe(
  operation,
  Effect.map(...),
  Effect.flatMap(...),
  Effect.map(...)
)
```


## Inline single-use functions

Never extract a function that is called exactly once and fits on one line. Inline it at the call site.

```typescript
// Bad - single-use, single-line helper that adds no clarity
function formatName(name: string) {
  return String.trim(name)
}
const clean = formatName(input)

// Good - inline at the call site
const clean = String.trim(input)
```

## Delete routing functions

Do not create a function that only branches on a parameter to call one of several other functions. Call the specialized function directly at the call site.

```typescript
// Bad - routing function that adds no logic
function getItems(kind: 'active' | 'archived') {
  if (kind === 'active') return getActiveItems()
  return getArchivedItems()
}

// Good - call the specialized function directly
getActiveItems()
getArchivedItems()
```


## Remove dead code

Delete unused imports, variables, functions, and types. Remove commented-out code. Delete debug console.log statements.

```typescript
// Bad - unused imports, commented-out debug code
import {unused} from './module'
const debugValue = 'temporary'
// console.log('debug:', debugValue)

// Good - only what is used remains, no commented-out code
```


## Process

1. Inspect code for dead code, defensive checks, validation branches, deep nesting, thin wrappers, single-use functions, and custom UI that should use shadcn primitives
2. Load every relevant skill for the touched code before changing it
3. Research .opencode/resources/ to find simpler v4-native patterns
4. Apply simplification even if it means duplicating code or deleting an abstraction
5. Run `bun run fix && bun run check`
6. Report what was simplified and which skills materially changed the result
