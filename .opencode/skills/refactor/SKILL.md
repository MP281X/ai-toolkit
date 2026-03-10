---
name: refactor
description: Post-implementation cleanup ONLY
metadata:
  patterns: dead code removal, defensive checks, thin wrappers, simplification
---

## Source files

```
.opencode/resources/effect/packages/effect/src/Effect.ts
.opencode/resources/effect/packages/effect/src/Function.ts
.opencode/resources/effect/packages/effect/src/Match.ts
.opencode/resources/effect/packages/effect/src/String.ts
```


## Required skills

This skill MUST load and apply ALL relevant skills. The refactor pass is the final enforcement of every guideline.

```typescript
// Process:
// 1. Inspect code
// 2. Load all relevant skills
// 3. Research .opencode/resources/
// 4. Apply EVERY skill rule strictly
// 5. Simplify even if code is duplicated
// 6. Run `bun run fix && bun run check`
// 7. Report simplifications and skill violations fixed
```


## Remove defensive checks

Attempt and handle failure.

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

Trust the Effect chain.

```typescript
// Bad - checking what types guarantee
const value = yield* getValue()
if (value !== expected) {
  yield* new AppError({message: 'mismatch'})
}

// Good
const value = yield* getValue()
```


## Flatten nesting

Avoid deeply nested pipes.

```typescript
// Bad - nested
const result = yield* pipe(
  pipe(
    pipe(operation, Effect.map(...)),
    Effect.flatMap(...)
  ),
  Effect.map(...)
)

// Good - flat
const result = yield* pipe(
  operation,
  Effect.map(...),
  Effect.flatMap(...),
  Effect.map(...)
)
```


## Inline single-use functions

Never extract single-use, single-line functions.

```typescript
// Bad
function format(name: string) {
  return String.trim(name)
}
const clean = format(input)

// Good
const clean = String.trim(input)
```


## Inline single-use constants

Never extract single-use constants.

```typescript
// Bad
const emptyParts: readonly Part[] = []
const schema = Schema.withConstructorDefault(() => Option.some(emptyParts))

// Good
const schema = Schema.withConstructorDefault(() => Option.some([]))
```


## Delete routing functions

Don't create functions that only branch to other functions.

```typescript
// Bad
function getItems(kind: 'active' | 'archived') {
  if (kind === 'active') return getActive()
  return getArchived()
}

// Good
getActive()
getArchived()
```


## Remove decorative comments

Remove section banners and obvious comments.

```typescript
// Bad - section banners
// ── Provider Resolution ──
function resolve(config: Config) { ... }

// ── Data Transformation ──
const transformers = { ... }

// Good
function resolve(config: Config) { ... }
const transformers = { ... }

// Bad - obvious comment
// Convert file to base64
async function fileToBase64(file: File) { ... }

// Good
async function fileToBase64(file: File) { ... }
```


## Remove dead code

Delete unused imports, variables, functions, types. Remove commented-out code.

```typescript
// Bad - unused imports, commented code
import {unused} from './module'
const debug = 'temporary'
// console.log('debug:', debug)

// Good
import {used} from './module'
```
