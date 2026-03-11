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


## Return types

Never add explicit return type annotations. TypeScript infers them.

```typescript
// Bad
const format = (name: string): string => String.trim(name)
function process(items: string[]): number { return items.length }

// Good
const format = (name: string) => String.trim(name)
function process(items: string[]) { return items.length }
```


## Type casting

Never use `as`. Fix the actual problem.

```typescript
// Bad
const user = fetchUser() as User
const items = JSON.parse(data) as string[]

// Good
const user: User = fetchUser()
const items = JSON.parse(data)
```


## Imports

Never rename imports.

```typescript
// Bad
import {Schema as S} from 'effect'

// Good
import {Schema} from 'effect'
```

Same-package imports use relative paths with `.ts` extension.

```typescript
// Bad
import {Config} from '@myapp/core/config'

// Good
import {Config} from './config.ts'
```

Use subpath aliases from package.json when available.

```typescript
// Bad
import {utils} from '../../lib/utils.ts'

// Good
import {utils} from '#lib/utils.ts'
```


## Callback types

Only annotate standalone function arguments.

```typescript
// Bad
Array.map(items, (item: string) => item.trim())
onChange={(value: string) => setValue(value)}
Array.filter(ids, (id: number) => id > 0)

// Good
Array.map(items, item => String.trim(item))
onChange={value => setValue(value)}
Array.filter(ids, id => id > 0)
```


## pipe vs flow

Use `flow` when the argument only feeds the first step. Use `pipe` for multi-step transforms.

```typescript
// Bad
const create = (name: string) => pipe(
  db.insert('users', {name}),
  Effect.mapError(cause => new UsersError({cause}))
)

// Good
const create = flow(
  (name: string) => db.insert('users', {name}),
  Effect.mapError(cause => new UsersError({cause}))
)
```


## pipe() function vs .pipe() method

Use `pipe()` function for data. Reserve `.pipe()` for Effect runtime only.

```typescript
// Bad
Match.value(status).pipe(
  Match.when('online', () => 'Online'),
  Match.orElse(() => 'Offline')
)

// Good
pipe(
  Match.value(status),
  Match.when('online', () => 'Online'),
  Match.orElse(() => 'Offline')
)
```


## Match chains

Always use `pipe(Match.value(x), ...)`.

```typescript
// Bad
Match.value(path).pipe(
  Match.when(Predicate.isString, String.trim),
  Match.orElse(() => fallback)
)

// Good
pipe(
  Match.value(path),
  Match.when(Predicate.isString, String.trim),
  Match.orElse(() => fallback)
)
```


## Brace-less early returns

Omit braces for single-operation early returns.

```typescript
// Bad
if (Predicate.isUndefined(record)) { return }

// Good
if (Predicate.isUndefined(record)) return
```

Prefer bare `return` instead of `return undefined` or `return null`.

```typescript
// Bad
if (Predicate.isNullish(value)) return undefined

// Good
if (Predicate.isNullish(value)) return
```


## Simple literals

Use switch for simple literal matching.

```typescript
// Bad
if (event.type === 'click') return handleClick()
else if (event.type === 'scroll') return handleScroll()
else return handleOther()

// Good
switch (event.type) {
  case 'click': return handleClick()
  case 'scroll': return handleScroll()
  default: return handleOther()
}
```


## Tagged unions

Use Match.tag for _tag unions.

```typescript
// Bad
if (part._tag === 'text') return renderText(part)
else if (part._tag === 'file') return renderFile(part)

// Good
pipe(
  Match.value(part),
  Match.tag('text', p => renderText(p)),
  Match.tag('file', p => renderFile(p)),
  Match.orElse(p => renderError(p))
)
```


## Alias maps

Use Match for normalization.

```typescript
// Bad
const aliases = {bash: 'bash', shell: 'bash', read: 'read', view: 'read'} as const

// Good
pipe(
  Match.value(String.toLowerCase(name)),
  Match.when(Match.is('bash', 'shell'), () => 'bash' as const),
  Match.when(Match.is('read', 'view'), () => 'read' as const),
  Match.orElse(() => name)
)
```

Reusable normalization with `flow`:

```typescript
const resolveLang = flow(
  (lang?: string) => Match.value(lang),
  Match.when(Match.is('ts', 'tsx', 'js'), () => 'tsx' as const),
  Match.orElse(() => 'text' as const)
)
```


## Nullish handling

Use `undefined`, never `null`. Use Predicate functions for nullish checks.

```typescript
// Bad
if (value == null) return
if (value !== null && value !== undefined) doSomething(value)

// Good
if (Predicate.isNullish(value)) return
if (Predicate.isNotNullish(value)) doSomething(value)
```


## Arrays

Use effect/Array. Native methods only allowed in JSX render lists.

```typescript
// Bad
const names = items.map(item => item.name)
const valid = items.filter(item => item.active)

// Good
const names = Array.map(items, item => item.name)
const valid = Array.filter(items, item => item.active)
```

Use Array.isReadonlyArrayNonEmpty for type narrowing:

```typescript
// Bad
if (results.length > 0) processFirst(results[0])

// Good
if (Array.isReadonlyArrayNonEmpty(results)) processFirst(results[0])
```


## Records

Use Record functions over object spread.

```typescript
// Bad
const updated = {...record, key: newValue}
const {removed, ...rest} = record

// Good
const updated = Record.set(record, 'key', newValue)
const rest = Record.remove(record, 'removed')
```


## Strings

Use String module functions.

```typescript
// Bad
const trimmed = value.trim()
if (value.length === 0) return

// Good
const trimmed = String.trim(value)
if (String.isEmpty(value)) return
```


## Numbers

Use Number module functions.

```typescript
// Bad
const n = parseInt(input)
if (value >= 0 && value <= 100) doSomething()

// Good
const n = Number.parse(input)
if (Number.between(value, {minimum: 0, maximum: 100})) doSomething()
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


## Option

Only consume Option from Effect APIs. Never create Option for local control flow.

```typescript
// Bad
const maybe = value !== null ? Option.some(value) : Option.none()

// Good
if (Predicate.isNotNullish(value)) handleValue(value)
```

Use Option API for consuming:

```typescript
// Bad
const label = option._tag === 'Some' ? option.value : 'default'

// Good
const label = Option.getOrElse(option, () => 'default')
```

Inline single-use Option.match:

```typescript
// Bad
const label = Option.match(opt, {onSome: m => m.name, onNone: () => fallback})
consume(label)

// Good
consume(Option.match(opt, {onSome: m => m.name, onNone: () => fallback}))
```


## Simple checks

Inline trivial single-use checks.

```typescript
// Bad
const isUser = message.role === 'user'
render(isUser)

// Good
render(message.role === 'user')
```


## Access-only variables

Do not extract access-only variables.

```typescript
// Bad
const file = props.part.file
consume(file.name)

// Good
consume(props.part.file.name)
```
