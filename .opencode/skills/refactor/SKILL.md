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


## Inline transient containers

Inline transient containers when extraction adds no reuse.

```typescript
// Bad - extracted container only feeds one schema default
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

Remove commented-out code and abandoned branches.
