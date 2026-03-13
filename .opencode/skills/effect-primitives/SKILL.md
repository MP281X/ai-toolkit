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


## Match for literals

Use Match for all literal matching. Never use switch statements or if-else chains.

```typescript
// Bad - if-else
if (event.type === 'click') return handleClick()
else if (event.type === 'scroll') return handleScroll()

// Bad - switch
switch (event.type) {
  case 'click': return handleClick()
  case 'scroll': return handleScroll()
}

// Good
pipe(
  Match.value(event.type),
  Match.when('click', () => handleClick()),
  Match.when('scroll', () => handleScroll()),
  Match.orElse(() => handleOther())
)
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
