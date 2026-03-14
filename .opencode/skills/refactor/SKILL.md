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


## No trivial wrapper functions

Before extracting a function, ask these questions in order:

1. Does it make the code harder to review by forcing readers to jump to the definition? If yes, inline it.
2. Does it reduce actual complexity, or just line count/duplication? If it only reduces lines, inline it.
3. Do some branches target specific call sites where only one branch is ever hit? Inline those branches at the call site and remove them from the function. After removing those branches, re-evaluate: if the function now has little logic or few uses, inline the rest too.
4. Does it have real logic (branching and simple checks are NOT logic)? If not, inline it.
5. Does it wrap a function just to set defaults or change the signature? If yes, inline it.
6. Is the remaining logic simple enough to read inline? If yes, inline it.
7. Is it used only 1-2 times? Inline it regardless of complexity.

Exported functions are allowed to be simple wrappers since they define a package API boundary.

```typescript
// Bad - wraps a constructor with defaults
function createMessage(content: readonly Part[]) {
  return makeMessage('assistant', {content: [...content]})
}

// Bad - simple ternary on a property
function keepState(state: State) {
  return state.done ? state : {items: state.items, done: false}
}

// Bad - simple property check, used twice
function getLast(messages: readonly Message[]) {
  const last = messages[messages.length - 1]
  return last?.role === 'assistant' ? last : undefined
}

// Good - real computational logic
function pickRandom(palette: readonly string[]) {
  return palette[Math.floor(Math.random() * palette.length)] ?? '#000'
}

// Good - exported package API
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```


## Prefer duplication over extraction

Duplicate short inline expressions rather than extracting helper functions. The cost of searching a function definition to discover it does nothing meaningful far outweighs the cost of repeated code. A simple conditional, property access, spread, or constructor call is not logic worth extracting. Optimize for reviewability, not line count.

```typescript
// Bad - extracted for no benefit
function isActive(item: Item) {
  return item.status === 'active'
}
const active = items.filter(isActive)

// Good - inline the check
const active = items.filter(item => item.status === 'active')
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
