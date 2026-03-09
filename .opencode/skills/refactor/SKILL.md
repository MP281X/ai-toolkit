---
name: refactor
description: Aggressive simplification pass - remove dead code, defensive checks, thin wrappers
---

## Source files

```
.opencode/resources/effect/packages/effect/src/Effect.ts
.opencode/resources/effect/packages/effect/src/Function.ts
.opencode/resources/effect/packages/effect/src/Match.ts
.opencode/resources/effect/packages/effect/src/String.ts
All skill files for patterns to apply
```


## Overview

Delete more than you add. Remove dead code, unused branches, legacy leftovers. Inline small helpers. Delete pass-through layers and thin wrappers.

This is a mandatory cleanup pass after implementation completes.


## Required skills

The refactor pass must load and apply every relevant skill.
If a cleaner result exists by applying another skill, take it. This is mandatory.


## Remove defensive checks

Prefer try and catch over check then do. Attempt the operation and handle failure rather than checking preconditions.


### DON'T: Check before acting

```typescript
// Bad
if (!(yield* fs.exists(path))) {
  yield* fs.makeDirectory(path, {recursive: true})
}

// Good
yield* pipe(
  fs.makeDirectory(path, {recursive: true}),
  Effect.catchAll(() => Effect.void)
)
```


## Remove validation branches

Do not validate states that should not occur. Real errors surface naturally through the effect system.


### DON'T: Validate expected states

```typescript
// Bad
const value = yield* getSomeValue()
if (value !== expected) {
  yield* new AppError({message: 'mismatch'})
}

// Good
// Remove validation. Let the effect fail if the state is wrong.
const value = yield* getSomeValue()
// Continue with value
```


## Flatten nesting

Avoid deeply nested pipe calls. Flatten into a single pipe chain.


### DON'T: Nest pipe calls

```typescript
// Bad
const result = yield* pipe(
  pipe(
    pipe(operation, Effect.map(...)),
    Effect.flatMap(...)
  ),
  Effect.map(...)
)

// Good
const result = yield* pipe(
  operation,
  Effect.map(...),
  Effect.flatMap(...),
  Effect.map(...)
)
```


## Inline single-use functions

If a function is called once and is short, inline it at the call site.


### DON'T: Create single-use functions

```typescript
// Bad
function formatName(name: string) {
  return String.trim(name)
}
const clean = formatName(input)

// Good
const clean = String.trim(input)
```


## Delete branch-heavy generics

Prefer duplicated specialized code over branch-heavy reusable components.


### DON'T: Create branch-heavy functions

```typescript
// Bad
function getItems(kind: 'active' | 'archived') {
  if (kind === 'active') return getActiveItems()
  return getArchivedItems()
}

// Good
const getActiveItems = ...
const getArchivedItems = ...

// Use directly at call sites
getActiveItems()
getArchivedItems()
```


## Remove dead code

Delete unused imports, variables, functions, and types. Remove commented-out code. Delete console.log statements used for debugging.


### DON'T: Leave unused code

```typescript
// Bad
import { unused } from './module'
const debugValue = 'temporary'
// console.log('debug:', debugValue)

// Good
// Only keep what is actually used
```


## Process

1. Inspect code for dead code, defensive checks, validation branches, deep nesting, thin wrappers, single-use functions, and custom UI that should use shadcn primitives
2. Load every relevant skill for the touched code before changing it
3. Research .opencode/resources/ to find simpler v4-native patterns
4. Apply simplification even if it means duplicating code or deleting an abstraction
5. Run `bun run fix && bun run check`
6. Report what was simplified and which skills materially changed the result
