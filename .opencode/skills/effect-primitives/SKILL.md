---
name: effect-primitives
description: Effect module replacements for raw JS - Predicate, Match, Array, Record, String, Number, Boolean, Option
---

## Source files

```
.opencode/resources/effect/packages/effect/src/Predicate.ts
.opencode/resources/effect/packages/effect/src/Match.ts
.opencode/resources/effect/packages/effect/src/Array.ts
.opencode/resources/effect/packages/effect/src/Record.ts
.opencode/resources/effect/packages/effect/src/String.ts
.opencode/resources/effect/packages/effect/src/Number.ts
.opencode/resources/effect/packages/effect/src/Boolean.ts
.opencode/resources/effect/packages/effect/src/Option.ts
```


## Overview

Use Effect modules instead of raw JavaScript when an equivalent helper exists. Import directly from `effect` without aliasing. This ensures consistency and leverages Effect's optimized implementations.


## Nullish handling

Use `undefined`, never `null`. Allow `null` only where React or a library API explicitly requires it.

Use Predicate.isNullish and Predicate.isNotNullish for nullish checks.


### DO: Use Predicate for nullish checks

```typescript
if (Predicate.isNullish(value)) return
if (Predicate.isNotNullish(value)) doSomething(value)
```


### DON'T: Use loose equality checks

```typescript
// Bad
if (value == null) return
if (value !== null && value !== undefined) doSomething(value)

// Good
if (Predicate.isNullish(value)) return
if (Predicate.isNotNullish(value)) doSomething(value)
```


## Branching and pattern matching

Use the right tool for the branching complexity:

- Simple early returns and conditions: use `if`
- Simple literal matching: use `switch`
- `_tag` unions: use `Match.tag`
- Non-tag structural matching: use `Match.when`


### DO: Use switch for simple literals

```typescript
switch (event.type) {
  case 'click': return handleClick()
  case 'scroll': return handleScroll()
  default: return handleOther()
}
```


### DO: Use Match for tagged unions

```typescript
Match.value(part).pipe(
  Match.tag('text', part => renderText(part)),
  Match.tag('file', part => renderFile(part)),
  Match.tag('tool', part => renderTool(part)),
  Match.orElse(part => renderError(part))
)
```


### DON'T: Chain if-else for tagged unions

```typescript
// Bad
if (part._tag === 'text') return renderText(part)
else if (part._tag === 'file') return renderFile(part)
else if (part._tag === 'tool') return renderTool(part)
else return renderError(part)

// Good
Match.value(part).pipe(
  Match.tag('text', part => renderText(part)),
  Match.tag('file', part => renderFile(part)),
  Match.tag('tool', part => renderTool(part)),
  Match.orElse(part => renderError(part))
)
```

Match.tag accepts multiple tags in one clause. Use Match.exhaustive when all cases must be handled.


## Arrays

Outside JSX, prefer effect/Array. Native array methods are allowed only in JSX render lists.


### DO: Use effect/Array outside JSX

```typescript
const names = Array.map(items, item => item.name)
const valid = Array.filter(items, item => item.active)
if (Array.isReadonlyArrayEmpty(items)) return
```


### DO: Check for non-empty arrays

```typescript
if (Array.isReadonlyArrayNonEmpty(results)) {
  // results is narrowed to NonEmptyReadonlyArray
}
```


### DON'T: Use native array methods outside JSX

```typescript
// Bad
const names = items.map(item => item.name)
const valid = items.filter(item => item.active)
if (items.length === 0) return

// Good
const names = Array.map(items, item => item.name)
const valid = Array.filter(items, item => item.active)
if (Array.isReadonlyArrayEmpty(items)) return
```


## Records

Prefer Record functions over object spread and mutation. This provides better type safety and consistency.


### DO: Use Record functions

```typescript
const updated = Record.set(record, 'key', newValue)
const rest = Record.remove(record, 'removed')
const allKeys = Record.keys(record)
const empty = Record.empty()
```


### DON'T: Use object spread for record operations

```typescript
// Bad
const updated = {...record, key: newValue}
const {removed, ...rest} = record
const allKeys = Object.keys(record)
const empty = {}

// Good
const updated = Record.set(record, 'key', newValue)
const rest = Record.remove(record, 'removed')
const allKeys = Record.keys(record)
const empty = Record.empty()
```


## Strings

Use String module functions instead of native string methods.


### DO: Use String functions

```typescript
const trimmed = String.trim(value)
if (String.isEmpty(value)) return
if (String.isNonEmpty(value)) doSomething()
```


### DON'T: Use native string methods

```typescript
// Bad
const trimmed = value.trim()
if (value.length === 0) return
if (value.length > 0) doSomething()

// Good
const trimmed = String.trim(value)
if (String.isEmpty(value)) return
if (String.isNonEmpty(value)) doSomething()
```

Also use String.capitalize, String.startsWith, and String.endsWith when appropriate.


## Numbers

Use Number module functions instead of native number operations.


### DO: Use Number functions

```typescript
const n = Number.parse(input)
if (Number.between(value, {minimum: 0, maximum: 100})) doSomething()
const clamped = Number.clamp(value, {minimum: 0, maximum: 100})
const rounded = Number.round(value)
```


### DON'T: Use native number operations

```typescript
// Bad
const n = parseInt(input)
if (value >= 0 && value <= 100) doSomething()
const clamped = Math.min(Math.max(value, 0), 100)
const rounded = Math.round(value)

// Good
const n = Number.parse(input)
if (Number.between(value, {minimum: 0, maximum: 100})) doSomething()
const clamped = Number.clamp(value, {minimum: 0, maximum: 100})
const rounded = Number.round(value)
```

Also use Number.min and Number.max for pairwise comparisons.


## Booleans

Use Boolean.match when both branches produce a value from a boolean. Do not use it to replace simple early-return if statements.


### DO: Use Boolean.match for value production

```typescript
const label = Boolean.match(isActive, {
  onTrue: () => 'Active',
  onFalse: () => 'Inactive'
})
```


### DON'T: Use Boolean.match for early returns

```typescript
// Bad - overkill for simple control flow
Boolean.match(isValid, {
  onTrue: () => doSomething(),
  onFalse: () => {}
})

// Good
if (isValid) doSomething()
```


## Option

Only consume existing Option values returned by Effect APIs like Array.head or Record.get. Never create new Option values for local control flow. Use Predicate.isNullish and direct branching instead.


### DO: Consume Option from Effect APIs

```typescript
Option.match(someOption, {
  onSome: value => handleValue(value),
  onNone: () => handleEmpty()
})

const value = Option.getOrElse(someOption, () => defaultValue)
const maybeValue = Option.getOrUndefined(someOption)
```


### DON'T: Create Option for local control flow

```typescript
// Bad
const maybeValue = value !== null ? Option.some(value) : Option.none()

// Good
if (Predicate.isNotNullish(value)) handleValue(value)
```

Exception: Schema.withConstructorDefault(() => Option.some(...)) is required by the Schema API and is the one place where creating Option values is expected.
