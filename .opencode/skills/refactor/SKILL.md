---
name: refactor
description: Simplify code, remove unnecessary code, and cleanup legacy patterns
metadata:
  patterns: simplification, dead code removal, defensive checks, flattening
---

## Source files

```
.opencode/resources/effect/packages/effect/src/Effect.ts
.opencode/resources/effect/packages/effect/src/Function.ts
.opencode/resources/effect/packages/effect/src/Match.ts
.opencode/resources/effect/packages/effect/src/String.ts
```


## Remove defensive checks

Attempt and handle failure instead of checking first.

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

Trust the types and Effect chain.

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

Inline when extraction adds no reuse.

```typescript
// Bad - extracted for single use
const empty: readonly Item[] = []
const schema = Schema.withConstructorDefault(() => Option.some(empty))

// Good
const schema = Schema.withConstructorDefault(() => Option.some([]))
```


## Delete routing functions

Do not create functions that only branch.

```typescript
// Bad - pure branching
function getItems(kind: 'a' | 'b') {
  if (kind === 'a') return getA()
  return getB()
}

// Good - call directly
getA()
getB()
```


## Remove decorative comments

Remove section banners and obvious comments.

```typescript
// Bad - section banner
// ── Helpers ──
function helper() { ... }

// Bad - obvious comment
// Convert to string
function toString(x: number) { ... }

// Good
function helper() { ... }
function toString(x: number) { ... }
```


## Remove dead code

Remove commented-out code and unused code.

```typescript
// Bad - commented code
// function old() { ... }

// Bad - unused function
function unused() { ... }

// Good - delete both
```
