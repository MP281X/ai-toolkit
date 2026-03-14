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
.opencode/resources/effect/packages/effect/src/Number.ts
.opencode/resources/effect/packages/effect/src/Boolean.ts
.opencode/resources/effect/packages/effect/src/Option.ts
```


## pipe vs flow

Use `flow` when the argument only feeds the first step. Use `pipe` for multi-step transforms.

```typescript
// Bad
const create = (name: string) => pipe(
  db.insert(name),
  Effect.mapError(cause => new Error({cause}))
)

// Good
const create = flow(
  (name: string) => db.insert(name),
  Effect.mapError(cause => new Error({cause}))
)
```


## pipe() function

Always use the `pipe()` function. Never use the `.pipe()` method.

```typescript
// Bad
Match.value(status).pipe(Match.when(...))

// Good
pipe(Match.value(status), Match.when(...))
```


## Match chains

Always use `pipe(Match.value(x), ...)`.

```typescript
// Bad
Match.value(path).pipe(Match.when(...))

// Good
pipe(
  Match.value(path),
  Match.when(Predicate.isString, String.trim),
  Match.orElse(() => fallback)
)
```


## Control flow

Never use `else` or `else if`. Use `if` for early returns only. Use `switch` for matching discriminators. Use `Match` module for everything else.

```typescript
// Good - if for early return
if (Predicate.isNullish(value)) return
if (items.length === 0) return fallback

// Good - switch for discriminators
switch (event.type) {
  case 'click': return handleClick()
  case 'scroll': return handleScroll()
}

// Good - Match for complex matching
pipe(
  Match.value(status),
  Match.when('active', () => handleActive()),
  Match.when(Predicate.isString, String.trim),
  Match.orElse(() => fallback)
)

// Bad - else (use early return instead)
if (condition) {
  doA()
} else {
  doB()
}

// Good - early return eliminates else
if (condition) {
  doA()
  return
}
doB()
```


## Brace-less early returns

Omit braces for single-operation early returns.

```typescript
// Bad
if (Predicate.isNullish(value)) { return }

// Good
if (Predicate.isNullish(value)) return
```


## Alias maps

Use Match for normalization with flow.

```typescript
// Bad
const aliases = {bash: 'bash', zsh: 'bash'} as const

// Good
const resolveLang = flow(
  (lang: string) => Match.value(lang),
  Match.when(Match.is('bash', 'zsh'), () => 'bash' as const),
  Match.orElse(() => 'sh' as const)
)
```


## Records

Use Record functions over object spread.

```typescript
// Bad
const updated = {...record, key: value}

// Good
const updated = Record.set(record, 'key', value)
```


## Booleans

Use Boolean.match for value production. Use `if` for control flow.

```typescript
// Bad
Boolean.match(isValid, {onTrue: () => doSomething(), onFalse: () => {}})

// Good
if (isValid) doSomething()

const label = Boolean.match(isActive, {
  onTrue: () => 'Active',
  onFalse: () => 'Inactive'
})
```
