---
name: effect-primitives
description: Load for ALL TypeScript code - standard library modules (pipe, flow, Match, Array, etc.) work everywhere
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


## Return types

Never add explicit return type annotations. TypeScript infers them accurately. Only exception: recursive functions.

```typescript
// Bad - explicit return type when inference works fine
const formatName = (name: string): string => String.trim(name)
function processItems(items: string[]): number {
  return items.length
}

// Good - let TypeScript infer the return type
const formatName = (name: string) => String.trim(name)
function processItems(items: string[]) {
  return items.length
}
```


## Type casting

Never use `as`. It hides real type errors. Fix the actual problem instead.

```typescript
// Bad - using as to silence type errors
const user = fetchUser() as User
const input = event.target as HTMLInputElement
const items = JSON.parse(data) as string[]

// Good - fix the root cause
const user: User = fetchUser() // fix fetchUser's return type
const input = event.target // use proper event typing
const items = JSON.parse(data) // add runtime validation if needed
```


## Imports

Never rename imports.

```typescript
// Bad - aliased imports hide the source module name
import {Schema as S} from 'effect'
import {ToolKind as ToolKindSchema} from './tools.ts'

// Good - use the original name
import {Schema} from 'effect'
import {ToolKind} from './tools.ts'
```


## pipe and flow

Use `flow` when the argument only feeds the first step of a pipeline. Use `pipe` when transforming a value through multiple steps.

Use `pipe()` function for all data transformation pipelines. `.pipe()` method chaining is reserved for Effect runtime operations (retry, provide, runWith) only — never for Match chains or data transforms.

```typescript
// Bad - arrow function where argument only feeds the first step
const createUser = (name: string) => pipe(
  db.insert('users', {name}),
  Effect.mapError(cause => new UsersError({cause}))
)

// Good - flow composes the pipeline without an explicit parameter
const createUser = flow(
  (name: string) => db.insert('users', {name}),
  Effect.mapError(cause => new UsersError({cause}))
)
```

```typescript
// Bad - native method chaining for value transforms
const result = value.trim().toUpperCase()

// Good - pipe for step-by-step transforms
const result = pipe(
  value,
  String.trim,
  String.toUpperCase
)
```


## Nullish handling

Use `undefined`, never `null`. Allow `null` only where React or a library API explicitly requires it.

Use Predicate.isNullish and Predicate.isNotNullish for nullish checks. Use Predicate.isUndefined when the check is specifically about `undefined`.

```typescript
// Bad - loose equality or manual null/undefined checks
if (value == null) return
if (value !== null && value !== undefined) doSomething(value)
if (value === undefined) return

// Good - Predicate functions
if (Predicate.isNullish(value)) return
if (Predicate.isNotNullish(value)) doSomething(value)
if (Predicate.isUndefined(value)) return
```


## Branching and pattern matching

For Match chains, use `pipe(Match.value(x), ...)`. Never use `.pipe()` method for Match chains — `.pipe()` is reserved for Effect runtime operations.


### Brace-less early returns

```typescript
// Bad - braces around a single-operation early return
if (Predicate.isUndefined(record)) {
  return
}

// Good - brace-less
if (Predicate.isUndefined(record)) return
```


### pipe() vs .pipe() for Match

```typescript
// Bad - .pipe() method used for a Match chain
const path = Match.value(pathValue).pipe(
  Match.when(Predicate.isString, String.trim),
  Match.when(String.isNonEmpty, value => value),
  Match.orElse(() => fallbackPath)
)

// Good - pipe() function for Match chains
const path = pipe(
  Match.value(pathValue),
  Match.when(Predicate.isString, String.trim),
  Match.when(String.isNonEmpty, value => value),
  Match.orElse(() => fallbackPath)
)
```


### Nested ternaries

```typescript
// Bad - nested ternaries
const pattern = Predicate.isString(input['pattern'])
  ? String.trim(input['pattern'])
  : Predicate.isString(input['query'])
    ? String.trim(input['query'])
    : undefined

// Good - Match.when for structural branching
const pattern = pipe(
  Match.value(input),
  Match.when({pattern: Predicate.isString}, value => String.trim(value.pattern)),
  Match.when({query: Predicate.isString}, value => String.trim(value.query)),
  Match.orElse(() => undefined)
)
```


### Simple literals

```typescript
// Bad - if-else chain for simple literal matching
if (event.type === 'click') return handleClick()
else if (event.type === 'scroll') return handleScroll()
else return handleOther()

// Good - switch for simple literals
switch (event.type) {
  case 'click': return handleClick()
  case 'scroll': return handleScroll()
  default: return handleOther()
}
```


### Tagged unions

```typescript
// Bad - if-else chain for a _tag union
if (part._tag === 'text') return renderText(part)
else if (part._tag === 'file') return renderFile(part)
else if (part._tag === 'tool') return renderTool(part)
else return renderError(part)

// Good - Match.tag
pipe(
  Match.value(part),
  Match.tag('text', part => renderText(part)),
  Match.tag('file', part => renderFile(part)),
  Match.tag('tool', part => renderTool(part)),
  Match.orElse(part => renderError(part))
)
```

### Alias maps

```typescript
// Bad - lookup table for normalization
const toolKindAliases = {
  bash: 'bash',
  shell: 'bash',
  read: 'read',
  view: 'read'
} as const

// Good - Match for normalization
const toolKind = pipe(
  Match.value(String.toLowerCase(name)),
  Match.when(Match.is('bash', 'shell'), () => 'bash' as const),
  Match.when(Match.is('read', 'view'), () => 'read' as const),
  Match.orElse(() => name)
)
```

For reusable normalization functions, combine with `flow`:

```typescript
const resolveLanguage = flow(
  (lang?: string) => Match.value(lang),
  Match.when(Match.is('ts', 'tsx', 'js', 'jsx', 'javascript', 'typescript'), () => 'tsx' as const),
  Match.when(Match.is('sh', 'bash', 'zsh', 'shell'), () => 'shell' as const),
  Match.orElse(() => 'text' as const)
)
```


## Arrays

Outside JSX, prefer effect/Array. Native array methods are allowed only in JSX render lists.

```typescript
// Bad - native methods outside JSX
const names = items.map(item => item.name)
const valid = items.filter(item => item.active)
if (items.length === 0) return

// Good - effect/Array
const names = Array.map(items, item => item.name)
const valid = Array.filter(items, item => item.active)
if (Array.isReadonlyArrayEmpty(items)) return
```

```typescript
// Bad - no type narrowing when checking for non-empty
if (results.length > 0) processFirst(results[0])

// Good - Array.isReadonlyArrayNonEmpty narrows to NonEmptyReadonlyArray
if (Array.isReadonlyArrayNonEmpty(results)) processFirst(results[0])
```


## Records

Prefer Record functions over object spread and mutation.

```typescript
// Bad - object spread and native Object methods
const updated = {...record, key: newValue}
const {removed, ...rest} = record
const allKeys = Object.keys(record)
const empty = {}

// Good - Record functions
const updated = Record.set(record, 'key', newValue)
const rest = Record.remove(record, 'removed')
const allKeys = Record.keys(record)
const empty = Record.empty()
```


## Strings

Use String module functions instead of native string methods.

```typescript
// Bad - native string methods
const trimmed = value.trim()
const lower = value.toLowerCase()
if (value.length === 0) return
if (value.length > 0) doSomething()

// Good - String module functions
const trimmed = String.trim(value)
const lower = String.toLowerCase(value)
if (String.isEmpty(value)) return
if (String.isNonEmpty(value)) doSomething()
```

## Numbers

Use Number module functions instead of native number operations.

```typescript
// Bad - native number operations
const n = parseInt(input)
if (value >= 0 && value <= 100) doSomething()
const clamped = Math.min(Math.max(value, 0), 100)
const rounded = Math.round(value)

// Good - Number module functions
const n = Number.parse(input)
if (Number.between(value, {minimum: 0, maximum: 100})) doSomething()
const clamped = Number.clamp(value, {minimum: 0, maximum: 100})
const rounded = Number.round(value)
```

## Booleans

Use Boolean.match when both branches produce a value from a boolean. Use plain `if` for control flow.

```typescript
// Bad - Boolean.match for control flow that produces no value
Boolean.match(isValid, {
  onTrue: () => doSomething(),
  onFalse: () => {}
})

// Good - if for control flow, Boolean.match for value production
if (isValid) doSomething()

const label = Boolean.match(isActive, {
  onTrue: () => 'Active',
  onFalse: () => 'Inactive'
})
```


## Option

Only consume Option values returned by Effect APIs like Array.head or Record.get. Never create Option values for local control flow.

```typescript
// Bad - wrapping a value in Option for local control flow
const maybeValue = value !== null ? Option.some(value) : Option.none()

// Good - direct branching for local control flow
if (Predicate.isNotNullish(value)) handleValue(value)
```

```typescript
// Bad - accessing Option internals manually
const label = someOption._tag === 'Some' ? someOption.value : 'default'

// Good - Option API for consuming Option values from Effect APIs
const label = Option.getOrElse(someOption, () => 'default')
const maybeValue = Option.getOrUndefined(someOption)
Option.match(someOption, {
  onSome: value => handleValue(value),
  onNone: () => handleEmpty()
})
```
