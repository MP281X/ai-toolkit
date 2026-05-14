# CLI behavior

## Scopes flag

Default behavior runs every scope:

```bash
deslop --changed
```

Equivalent to:

```bash
deslop --changed --scopes base,react,effect
```

When `--scopes` is passed, it becomes an explicit allowlist:

```bash
deslop --changed --scopes base
deslop --changed --scopes base,react
deslop --changed --scopes base,react,effect
```

Valid scopes:

```txt
base
react
effect
```

Behavior:

```txt
No --scopes flag        -> run base + react + effect
--scopes base           -> run only base
--scopes base,react     -> run only base + react
--scopes base,effect    -> run only base + effect
--scopes react          -> run only react
```

This intentionally allows non-Effect projects to run:

```bash
deslop --changed --scopes base,react
```

## Fix flag

```bash
deslop --changed --fix
deslop --changed --fix --scopes base,react
```

`--fix` should be aggressive. It should rewrite as much as possible, even when the rewrite may need a follow-up refactor pass by the agent.

Expected behavior:

```txt
Apply all available fixes.
Print remaining diagnostics.
Exit 0 only if no diagnostics remain after fixing.
Exit 1 if any diagnostics remain.
```

## Hardcoded exclusions

Only exclude:

```txt
**/components/ui/**
**/routeTree.gen.ts
**/routeTree.gen.tsx
```

The TanStack Router generated file in this repo is imported as `routeTree.gen.ts`, so both `.ts` and `.tsx` should be ignored.

---

# Base scope

## `base/no-type-assertion-except-as-const`

**Message**

```txt
Type assertions are banned. Remove the assertion and make the value producer return the correct type.
```

**Bad**

```ts
const user = value as User
const id = input!.id
const element = node as HTMLDivElement
```

**Good**

```ts
const user = decodeUser(value)
const id = input.id
const element = node
```

`as const` remains allowed:

```ts
const status = 'ready' as const
```

**Auto-fix**

Yes, aggressive.

Fixable:

```ts
value as User
```

to:

```ts
value
```

```ts
input!.id
```

to:

```ts
input.id
```

```ts
class User {
	name!: string
}
```

to:

```ts
class User {
	name: string
}
```

The fix may expose real type errors. That is acceptable; the refactoring agent should fix the producer type or add a runtime decode.

---

## `base/prefer-readonly-types`

**Message**

```txt
Mutable type shapes are banned. Add readonly to object properties and use readonly arrays/tuples.
```

**Bad**

```ts
type User = {
	name: string
	tags: string[]
	coordinates: [number, number]
}
```

**Good**

```ts
type User = {
	readonly name: string
	readonly tags: readonly string[]
	readonly coordinates: readonly [number, number]
}
```

**Auto-fix**

Yes.

Fixable:

```ts
name: string
```

to:

```ts
readonly name: string
```

```ts
string[]
```

to:

```ts
readonly string[]
```

```ts
;[number, number]
```

to:

```ts
readonly[(number, number)]
```

---

## `base/prefer-undefined-over-null`

**Message**

```txt
Use undefined for absence. Replace null with undefined or omit the optional value.
```

**Bad**

```ts
const value = null

type State = {
	readonly user: User | null
}
```

**Good**

```ts
const value = undefined

type State = {
	readonly user?: User
}
```

**Auto-fix**

Yes, aggressive.

Fixable:

```ts
null
```

to:

```ts
undefined
```

```ts
User | null
```

to:

```ts
User | undefined
```

If this breaks an external API boundary, the refactoring agent should adjust that boundary explicitly.

---

## `base/prefer-optional-property`

**Message**

```txt
Use an optional property instead of a property unioned with undefined.
```

**Bad**

```ts
type Props = {
	readonly title: string | undefined
}
```

**Good**

```ts
type Props = {
	readonly title?: string
}
```

**Auto-fix**

Yes.

Fixable:

```ts
readonly title: string | undefined
```

to:

```ts
readonly title?: string
```

---

## `base/no-redundant-type-syntax`

**Message**

```txt
This type syntax repeats what TypeScript already knows. Remove the annotation, generic argument, or useless constraint.
```

**Bad**

```ts
const name: string = 'Matteo'

function getName(): string {
	return 'Matteo'
}

parse<string>('value')

type Box<T extends unknown> = {
	readonly value: T
}
```

**Good**

```ts
const name = 'Matteo'

function getName() {
	return 'Matteo'
}

parse('value')

type Box<T> = {
	readonly value: T
}
```

**Auto-fix**

Yes.

Fixable:

```ts
const value: string = 'x'
```

to:

```ts
const value = 'x'
```

```ts
function value(): string {
	return 'x'
}
```

to:

```ts
function value() {
	return 'x'
}
```

```ts
fn<string>(value)
```

to:

```ts
fn(value)
```

```ts
T extends unknown
```

to:

```ts
T
```

---

## `base/no-redundant-type-system-check`

**Message**

```txt
This check handles a case that the type system already excludes. Remove the unreachable check or fallback.
```

**Bad**

```ts
const name = user?.name

const count = value ?? 0

if (user !== undefined) {
	return user.name
}

if (Array.isArray(items)) {
	return items.length
}
```

when `user`, `value`, or `items` are already non-nullish / array-typed.

**Good**

```ts
const name = user.name

const count = value

return user.name

return items.length
```

**Auto-fix**

Yes, aggressive.

Fixable:

```ts
user?.name
```

to:

```ts
user.name
```

```ts
value ?? fallback
```

to:

```ts
value
```

```ts
if (user !== undefined) return user.name
```

to:

```ts
return user.name
```

For complex `if/else` blocks, fix the obvious branch and leave remaining diagnostics if the rewrite is ambiguous.

---

## `base/no-unnecessary-named-type`

**Message**

```txt
Named types are banned unless they are inferred from a runtime contract. Inline the type or derive it from a schema.
```

**Bad**

```ts
type Props = {
  readonly title: string
}

function Card(props: Props) {
  return <div>{props.title}</div>
}
```

**Good**

```tsx
function Card(props: {readonly title: string}) {
	return <div>{props.title}</div>
}
```

**Bad**

```ts
export type UserId = string & Brand.Brand<'UserId'>
```

**Good**

```ts
export const UserId = Schema.String.pipe(Schema.brand('UserId'))
```

**Auto-fix**

Yes, aggressive for local aliases.

Fixable:

```ts
type Props = {
	readonly title: string
}

function Card(props: Props) {}
```

to:

```ts
function Card(props: {readonly title: string}) {}
```

Fix single-use aliases, then delete the alias. Leave exported/runtime-contract cases for remaining diagnostics if not clearly fixable.

---

## `base/no-destructuring`

**Message**

```txt
Destructuring is banned. Access properties or indexes directly so the source value stays visible.
```

**Bad**

```ts
const {id, name} = user
```

**Good**

```ts
user.id
user.name
```

**Bad**

```ts
const [value, setValue] = useState('')
```

**Good**

```ts
const state = useState('')
const value = state[0]
const setValue = state[1]
```

**Bad**

```tsx
function Card({title}: {readonly title: string}) {
	return <div>{title}</div>
}
```

**Good**

```tsx
function Card(props: {readonly title: string}) {
	return <div>{props.title}</div>
}
```

**Auto-fix**

Yes, aggressive.

Fixable:

```ts
const {id, name} = user
```

to direct `user.id` / `user.name` references.

Fixable:

```ts
function Card({title}: Props) {
	return title
}
```

to:

```ts
function Card(props: Props) {
	return props.title
}
```

Fixable:

```ts
const [value, setValue] = useState('')
```

to index access.

Nested destructuring and defaults should still be rewritten when possible, even if the result is verbose.

---

## `base/no-spread-syntax`

**Message**

```txt
Spread syntax is banned. Write every property or element explicitly so the produced shape is visible.
```

**Bad**

```ts
const next = {...user, name}
```

**Good**

```ts
const next = {
	id: user.id,
	email: user.email,
	name
}
```

**Bad**

```ts
const all = [...left, ...right]
```

**Good**

```ts
const all = left.concat(right)
```

In Effect scope, prefer:

```ts
const all = Array.appendAll(left, right)
```

**Bad**

```tsx
return <Button {...props} />
```

**Good**

```tsx
return <Button disabled={props.disabled} onClick={props.onClick} />
```

**Auto-fix**

Yes, aggressive.

Fixable when the source shape is statically knowable:

```ts
{...user, name}
```

to explicit properties.

Fixable:

```tsx
<Button {...buttonProps} />
```

to explicit JSX props if `buttonProps` is a local object literal or has a known type shape.

Array spread should be rewritten when a clear equivalent exists. In `effect` scope, prefer Effect `Array` helpers.

---

## `base/no-single-use-local-binding`

**Message**

```txt
This local binding has only one use. Inline the value at the use site and delete the binding.
```

**Bad**

```ts
const name = user.profile.name

return name
```

**Good**

```ts
return user.profile.name
```

**Bad**

```tsx
const content = props.loading ? <Loading /> : <Content />

return <section>{content}</section>
```

**Good**

```tsx
return <section>{props.loading ? <Loading /> : <Content />}</section>
```

**Auto-fix**

Yes, aggressive.

Fixable:

```ts
const value = expression

return value
```

to:

```ts
return expression
```

Fix JSX single-use bindings too. Preserve hook bindings, because `react/prefer-hook-variable` intentionally requires local hook variables.

---

## `base/no-simple-local-binding`

**Message**

```txt
This binding only names a simple value. Inline it instead of creating a local alias.
```

**Bad**

```ts
const enabled = props.status === 'ready'

if (enabled) start()
```

**Good**

```ts
if (props.status === 'ready') start()
```

**Bad**

```ts
const options = {
	enabled: true,
	retry: 3
}

run(options)
```

**Good**

```ts
run({
	enabled: true,
	retry: 3
})
```

**Bad**

```ts
const ids = ['a', 'b', 'c']

send(ids)
```

**Good**

```ts
send(['a', 'b', 'c'])
```

**Auto-fix**

Yes, aggressive.

Fixable simple bindings:

```txt
literal
property access
boolean expression
small object literal
small array literal
small union/type literal
```

Inline even if reused, when the value is simple enough. The refactoring agent can clean up readability if duplication becomes excessive.

---

## `base/no-vacuous-abstraction`

**Message**

```txt
This abstraction does not add behavior. Inline the target expression or call the underlying symbol directly.
```

**Bad**

```ts
function getUserName(user: User) {
	return user.name
}

return getUserName(user)
```

**Good**

```ts
return user.name
```

**Bad**

```ts
const UserApi = {
	loadUser,
	saveUser
}

UserApi.loadUser(id)
```

**Good**

```ts
loadUser(id)
```

**Bad**

```ts
function parseUser(input: unknown) {
	return Schema.decodeUnknown(User)(input)
}
```

**Good**

```ts
Schema.decodeUnknown(User)(input)
```

**Auto-fix**

Yes, aggressive.

Fixable:

```txt
single-return forwarding helpers
facade objects
duplicate helpers with identical bodies
single-use helper functions
single-variant type abstractions
single-implementation interfaces
```

Prefer deleting the abstraction and rewriting all references.

---

## `base/prefer-function-declaration`

**Message**

```txt
Use a function declaration for named functions. Keep arrow functions for callbacks.
```

**Bad**

```ts
const parseUser = (input: unknown) => {
	return decodeUser(input)
}
```

**Good**

```ts
function parseUser(input: unknown) {
	return decodeUser(input)
}
```

**Bad**

```tsx
const Button = (props: {readonly children: React.ReactNode}) => {
	return <button>{props.children}</button>
}
```

**Good**

```tsx
function Button(props: {readonly children: React.ReactNode}) {
	return <button>{props.children}</button>
}
```

**Auto-fix**

Yes.

Fixable:

```ts
const name = (...) => { ... }
const name = function (...) { ... }
```

to:

```ts
function name(...) { ... }
```

Do not rewrite semantic non-function values like `Effect.gen(...)`, schema values, service values, atoms, or RcMaps.

---

## `base/prefer-arrow-callback`

**Message**

```txt
Use an arrow function for callbacks. Function expressions are only allowed for required generator callbacks.
```

**Bad**

```ts
items.map(function (item) {
	return item.name
})
```

**Good**

```ts
items.map(item => {
	return item.name
})
```

**Allowed**

```ts
Effect.gen(function* () {
	return yield* program
})
```

**Auto-fix**

Yes.

Fixable non-generator callback function expressions:

```ts
fn(function (value) {
	return value.id
})
```

to:

```ts
fn(value => {
	return value.id
})
```

Do not rewrite `function*`.

---

## `base/prefer-node-subpath-import`

**Message**

```txt
Use node: imports for Node built-ins.
```

**Bad**

```ts
import fs from 'fs'
import path from 'path'
```

**Good**

```ts
import fs from 'node:fs'
import path from 'node:path'
```

**Auto-fix**

Yes.

Fixable:

```ts
'fs'
'path'
'os'
'crypto'
'stream'
```

to:

```ts
'node:fs'
'node:path'
'node:os'
'node:crypto'
'node:stream'
```

---

## `base/no-local-namespace-import`

**Message**

```txt
Local namespace imports are banned. Import the used symbols directly.
```

**Bad**

```ts
import * as Utils from './utils.ts'

Utils.formatName(name)
```

**Good**

```ts
import {formatName} from './utils.ts'

formatName(name)
```

**Allowed**

```ts
import * as Rpc from 'effect/unstable/rpc'
```

**Auto-fix**

Yes, aggressive.

Fixable when member accesses are static:

```ts
Utils.formatName(...)
Utils.parseName(...)
```

to:

```ts
import {formatName, parseName} from './utils.ts'

formatName(...)
parseName(...)
```

If the namespace object is passed around as a value, leave a diagnostic.

---

## `base/no-default-export-except-config`

**Message**

```txt
Default exports are banned. Use a named export, except in config files.
```

**Bad**

```ts
export default function Button() {
  return <button />
}
```

**Good**

```ts
export function Button() {
  return <button />
}
```

**Allowed**

```ts
export default defineConfig({})
```

in:

```txt
*.config.ts
*.config.tsx
*.config.mts
*.config.cts
```

**Auto-fix**

Yes, aggressive.

Fixable named defaults:

```ts
export default function Button() {}
```

to:

```ts
export function Button() {}
```

Fixable anonymous defaults by creating a named export from the filename when possible:

```ts
export default function () {}
```

to:

```ts
export function ComponentName() {}
```

The agent can rename if needed.

---

## `base/no-plain-class`

**Message**

```txt
Classes are banned.
```

**Bad**

```ts
class User {}
```

**Good**

```ts
class TokenNode extends lexical.TextNode {}
```

**Good**

```ts
class User extends Schema.Class<User>()('User', {
	name: Schema.String
}) {}
```

**Auto-fix**

No.

A class without `extends` requires a semantic rewrite.

---

# React scope

## `react/no-jsx-props-object`

**Message**

```txt
JSX props objects are banned. Inline every prop on the JSX element.
```

**Bad**

```tsx
const buttonProps = {
	type: 'button',
	disabled: props.disabled,
	onClick: props.onClick
}

return <Button {...buttonProps} />
```

**Good**

```tsx
return <Button type="button" disabled={props.disabled} onClick={props.onClick} />
```

**Bad**

```tsx
const inputProps = getInputProps(field)

return <Input {...inputProps} />
```

**Good**

```tsx
return (
	<Input
		id={field.name}
		name={field.name}
		value={field.state.value}
		onBlur={field.handleBlur}
		onChange={event => field.handleChange(event.currentTarget.value)}
	/>
)
```

**Auto-fix**

Yes, aggressive.

Fixable:

```tsx
const props = {a, b, c}

return <Component {...props} />
```

to:

```tsx
return <Component a={a} b={b} c={c} />
```

If `getInputProps(...)` is used, leave a diagnostic unless the returned object shape is statically knowable.

---

## `react/no-tailwind-class-indirection`

**Message**

```txt
Tailwind class indirection is banned. Keep classes in JSX and use cn only inline for conditional classes.
```

**Bad**

```tsx
const className = 'flex items-center gap-2'

return <div className={className} />
```

**Good**

```tsx
return <div className="flex items-center gap-2" />
```

**Bad**

```tsx
const buttonClass = cn('flex', active && 'text-primary')

return <button className={buttonClass} />
```

**Good**

```tsx
return <button className={cn('flex', active && 'text-primary')} />
```

**Bad**

```tsx
const styles = {
	root: 'flex items-center',
	icon: 'size-4'
}

return <div className={styles.root} />
```

**Good**

```tsx
return <div className="flex items-center" />
```

**Auto-fix**

Yes, aggressive.

Fixable:

```tsx
const className = '...'
```

inline into every `className={className}` use.

Fixable:

```tsx
const className = cn(...)
```

inline into every `className={className}` use.

If this duplicates class strings, that is acceptable.

---

## `react/no-manual-memoization`

**Message**

```txt
Manual React memoization is banned. Remove memo, useMemo, and useCallback.
```

**Bad**

```tsx
const value = useMemo(() => compute(props.value), [props.value])

const onClick = useCallback(() => save(), [])

export default memo(Component)
```

**Good**

```tsx
const value = compute(props.value)

const onClick = () => save()

export default Component
```

**Auto-fix**

Yes, aggressive.

Fixable:

```tsx
useMemo(() => expression, deps)
```

to:

```tsx
expression
```

```tsx
useCallback(() => body, deps)
```

to:

```tsx
;() => body
```

```tsx
memo(Component)
```

to:

```tsx
Component
```

---

## `react/no-forward-ref`

**Message**

```txt
forwardRef is banned. Accept ref as a normal prop.
```

**Bad**

```tsx
const Input = forwardRef<HTMLInputElement, Props>(function Input(props, ref) {
	return <input ref={ref} />
})
```

**Good**

```tsx
function Input(props: Props & {readonly ref?: React.Ref<HTMLInputElement>}) {
	return <input ref={props.ref} />
}
```

**Auto-fix**

Yes, aggressive.

Fix simple `forwardRef` wrappers by turning the callback into a function declaration and moving `ref` into props.

Leave remaining diagnostics for generic or highly complex cases.

---

## `react/no-use-state-lazy-initializer`

**Message**

```txt
useState lazy initializers are banned. Pass the initial value directly.
```

**Bad**

```tsx
const state = useState(() => initialValue)
```

**Good**

```tsx
const state = useState(initialValue)
```

**Auto-fix**

Yes.

Fixable:

```tsx
useState(() => value)
```

to:

```tsx
useState(value)
```

```tsx
useState(function () {
	return value
})
```

to:

```tsx
useState(value)
```

---

## `react/prefer-hook-variable`

**Message**

```txt
Hook calls must be assigned to a local binding before use.
```

**Bad**

```tsx
return <Provider value={useSomething()} />
```

**Good**

```tsx
const value = useSomething()

return <Provider value={value} />
```

**Bad**

```tsx
const value = compute(useSomething())
```

**Good**

```tsx
const something = useSomething()
const value = compute(something)
```

**Auto-fix**

Yes, aggressive.

Fix inline hook calls by hoisting them to local bindings before the expression.

Hook bindings are allowed even if they are single-use.

---

## `react/no-property-mutation-outside-ref-current`

**Message**

```txt
Property mutation is banned outside ref.current. Return a new value or keep mutation behind ref.current.
```

**Bad**

```ts
props.user.name = name
items.push(item)
map.set(key, value)
```

**Good**

```ts
const nextUser = {
	id: props.user.id,
	name
}
```

**Good**

```ts
ref.current = value
```

**Auto-fix**

Partial, aggressive only for obvious cases.

Fixable:

```ts
array.push(item)
```

to an immutable append expression when the assigned result can be inferred.

Fixable:

```ts
object.property = value
```

only when it is inside a simple local object construction pattern.

Most mutation diagnostics should remain for the agent.

---

# Effect scope

## `effect/no-standard-global-modules`

**Message**

```txt
Global Object is banned. Use Record or Struct from effect.
```

**Bad**

```ts
Object.keys(record)
Object.entries(record)
Object.values(record)
Object.fromEntries(entries)
Object.assign(target, source)
```

**Good**

```ts
Record.keys(record)
Record.toEntries(record)
Record.values(record)
Record.fromEntries(entries)
```

For visible object construction:

```ts
const next = {
	id: user.id,
	name: user.name
}
```

**Auto-fix**

Yes, aggressive.

Fixable:

```ts
Object.keys(value)
```

to:

```ts
Record.keys(value)
```

```ts
Object.entries(value)
```

to:

```ts
Record.toEntries(value)
```

```ts
Object.values(value)
```

to:

```ts
Record.values(value)
```

```ts
Object.fromEntries(entries)
```

to:

```ts
Record.fromEntries(entries)
```

Do not attempt complex `Object.assign`, descriptors, prototypes, or reflective APIs unless the replacement is obvious.

---

## `effect/no-standard-prototype-methods`

**Message**

```txt
Standard prototype methods are banned. Use Effect modules and pipe for multi-step composition.
```

**Bad**

```ts
users.map(user => user.name)
```

**Good**

```ts
Array.map(users, user => user.name)
```

**Bad**

```ts
input.trim()
```

**Good**

```ts
String.trim(input)
```

**Bad**

```ts
users.map(user => user.name).filter(String.isNonEmpty)
```

**Good**

```ts
pipe(
	users,
	Array.map(user => user.name),
	Array.filter(String.isNonEmpty)
)
```

**Auto-fix**

Yes, aggressive.

Fix single prototype calls:

```ts
value.map(fn)
value.filter(fn)
value.flatMap(fn)
value.reduce(fn, initial)
value.some(fn)
value.every(fn)
value.find(fn)
value.includes(item)
value.slice(start, end)
value.join(separator)
value.trim()
value.toLowerCase()
value.toUpperCase()
value.startsWith(prefix)
value.endsWith(suffix)
```

to Effect module calls.

Fix chains into `pipe(...)`.

---

## `effect/no-single-operation-pipe`

**Message**

```txt
Do not use pipe for a single operation. Call the module function directly.
```

**Bad**

```ts
const names = pipe(
	users,
	Array.map(user => user.name)
)
```

**Good**

```ts
const names = Array.map(users, user => user.name)
```

**Bad**

```ts
const name = pipe(input, String.trim)
```

**Good**

```ts
const name = String.trim(input)
```

**Auto-fix**

Yes.

Always fix 2-argument `pipe(value, operation)` into direct module call when the operation shape is known.

---

## `effect/prefer-pipe-for-multi-operation-composition`

**Message**

```txt
Use pipe for multi-step composition. Keep every transformation step visible in order.
```

**Bad**

```ts
const names = Array.filter(
	Array.map(users, user => user.name),
	String.isNonEmpty
)
```

**Good**

```ts
const names = pipe(
	users,
	Array.map(user => user.name),
	Array.filter(String.isNonEmpty)
)
```

**Bad**

```ts
const value = String.toLowerCase(String.trim(input))
```

**Good**

```ts
const value = pipe(input, String.trim, String.toLowerCase)
```

**Auto-fix**

Yes, aggressive.

Fix nested Effect module calls into `pipe(...)`.

Fix standard prototype chains together with `effect/no-standard-prototype-methods`.

---

## `effect/prefer-effect-fn-untraced`

**Message**

```txt
Functions with arguments that return Effect must use Effect.fnUntraced.
```

**Bad**

```ts
function loadUser(id: string) {
	return Effect.gen(function* () {
		return yield* getUser(id)
	})
}
```

**Good**

```ts
const loadUser = Effect.fnUntraced(function* (id: string) {
	return yield* getUser(id)
})
```

**Bad**

```ts
const loadUser = (id: string) => {
	return pipe(
		getUser(id),
		Effect.map(user => user.name)
	)
}
```

**Good**

```ts
const loadUser = Effect.fnUntraced(function* (id: string) {
	const user = yield* getUser(id)
	return user.name
})
```

**Auto-fix**

Yes, aggressive.

Fix simple functions with parameters returning an `Effect`.

The rewrite may still require the agent to clean up yielded expressions, but it should create the `Effect.fnUntraced(function* (...) { ... })` shape.

---

## `effect/prefer-effect-gen-program`

**Message**

```txt
No-argument functions that return Effect must be Effect values.
```

**Bad**

```ts
function program() {
	return Effect.gen(function* () {
		return yield* load()
	})
}
```

**Good**

```ts
const program = Effect.gen(function* () {
	return yield* load()
})
```

**Auto-fix**

Yes, aggressive.

Fix no-argument functions that only wrap and return an `Effect`.

---

## `effect/no-floating-effect`

**Message**

```txt
This Effect is not used. Yield it, return it, compose it, or run it only at a runtime boundary.
```

**Bad**

```ts
Effect.log('saved')
saveUser(user)
```

inside an Effect generator.

**Good**

```ts
yield * Effect.log('saved')
yield * saveUser(user)
```

**Auto-fix**

Partial, aggressive.

Fixable inside `Effect.gen` / `Effect.fnUntraced` generator bodies:

```ts
program
```

to:

```ts
yield * program
```

Fixable at final statement of an Effect-returning function:

```ts
program
```

to:

```ts
return program
```

Leave diagnostics elsewhere.

---

## `effect/no-effect-run-away-from-boundary`

**Message**

```txt
Effects can only be run at runtime boundaries. Return or compose the Effect instead.
```

**Bad**

```ts
Effect.runPromise(program)
```

outside runtime boundary files.

**Good**

```ts
return program
```

**Auto-fix**

No.

This requires architectural judgment.

---

## `effect/no-effect-without-semantics`

**Message**

```txt
This Effect wrapper adds no semantics. Use the plain value.
```

**Bad**

```ts
Effect.succeed(1)
Effect.sync(() => 'ready')
```

**Good**

```ts
1
;('ready')
```

**Auto-fix**

Yes, aggressive.

Fixable:

```ts
Effect.succeed(value)
```

to:

```ts
value
```

```ts
Effect.sync(() => value)
```

to:

```ts
value
```

Only preserve wrappers when they are required by a surrounding Effect combinator.

---

## `effect/no-effect-type-erasure`

**Message**

```txt
Effect.Effect must not erase error or requirement types. Add the missing type parameters or remove the explicit type.
```

**Bad**

```ts
readonly get: (id: string) => Effect.Effect<User>
```

**Good**

```ts
readonly get: (id: string) => Effect.Effect<User, UserError>
```

Better when possible:

```ts
const get = Effect.fnUntraced(function* (id: string) {
	return yield* loadUser(id)
})
```

**Auto-fix**

Partial.

Prefer deleting the explicit type if inference can recover the full Effect type.

Otherwise leave a diagnostic.

---

## `effect/no-effect-type-alias`

**Message**

```txt
Named Effect type aliases are banned. Inline the Effect type or rely on inference.
```

**Bad**

```ts
type Program = Effect.Effect<User, UserError>
```

**Good**

```ts
const program = Effect.gen(function* () {
	return yield* loadUser
})
```

**Bad**

```ts
type LoadUser = (id: string) => Effect.Effect<User, UserError>
```

**Good**

```ts
const loadUser = Effect.fnUntraced(function* (id: string) {
	return yield* getUser(id)
})
```

**Auto-fix**

Yes, aggressive for single-use aliases.

Inline the alias at the use site, then delete it.

If the alias is exported or multi-use, leave diagnostics after inlining obvious local uses.

---

## `effect/prefer-effect-try`

**Message**

```txt
Use Effect.try or Effect.tryPromise for throwing or Promise-producing code. Map unknown errors into typed errors.
```

**Bad**

```ts
try {
	return JSON.parse(input)
} catch (error) {
	return new ParseError({cause: error})
}
```

**Good**

```ts
return Effect.try({
	try: () => JSON.parse(input),
	catch: error => new ParseError({cause: error})
})
```

**Bad**

```ts
const response = await fetch(url)
```

inside Effect code.

**Good**

```ts
const response =
	yield *
	Effect.tryPromise({
		try: () => fetch(url),
		catch: error => new FetchError({cause: error})
	})
```

**Auto-fix**

Yes, aggressive.

Fix simple `try/catch` blocks into `Effect.try`.

Fix `await promise` inside Effect generator bodies into `yield* Effect.tryPromise(...)`.

When the error constructor is not knowable, insert the `catch` shape with a generic placeholder for the agent to complete.

---

## `effect/prefer-effect-catch-tag`

**Message**

```txt
Broad Effect catch handlers are banned. Use catchTag or catchTags for specific tagged errors.
```

**Bad**

```ts
pipe(
	program,
	Effect.catch(error => recover(error))
)
```

**Good**

```ts
pipe(
	program,
	Effect.catchTag('UserNotFound', error => recover(error))
)
```

**Good**

```ts
pipe(
	program,
	Effect.catchTags({
		UserNotFound: error => recoverMissingUser(error),
		PermissionDenied: error => recoverPermission(error)
	})
)
```

**Auto-fix**

No.

The correct tag depends on the error model.

---

## `effect/prefer-schema-tagged-error`

**Message**

```txt
Use Schema.TaggedErrorClass for Effect errors.
```

**Bad**

```ts
class UserError extends Data.TaggedError('UserError')<{
	readonly message: string
}> {}
```

**Good**

```ts
class UserError extends Schema.TaggedErrorClass<UserError>()('UserError', {
	message: Schema.String
}) {}
```

**Bad**

```ts
Effect.fail(new UserError({message}))
```

**Good**

```ts
yield * new UserError({message})
```

**Auto-fix**

Partial, aggressive.

Fixable inside generators:

```ts
Effect.fail(new ErrorClass(args))
```

to:

```ts
yield * new ErrorClass(args)
```

Class migrations are mostly manual, but simple `Data.TaggedError` shapes can be rewritten into `Schema.TaggedErrorClass` if fields are obvious.

---

## `effect/no-option-constructor`

**Message**

```txt
Option constructors are banned. Use guards, optional values, or direct control flow.
```

**Bad**

```ts
Option.some(value)
Option.none()
Option.fromNullable(value)
```

**Good**

```ts
value
undefined
value ?? undefined
```

**Auto-fix**

Yes, aggressive.

Fixable:

```ts
Option.none()
```

to:

```ts
undefined
```

```ts
Option.some(value)
```

to:

```ts
value
```

```ts
Option.fromNullable(value)
```

to:

```ts
value ?? undefined
```

The agent can repair surrounding type mismatches.

---

## `effect/prefer-top-level-rcmap`

**Message**

```txt
RcMap constructors must be top-level values.
```

**Bad**

```ts
function getCache() {
  return RcMap.make(...)
}
```

**Good**

```ts
const UserCache = RcMap.make(...)
```

**Auto-fix**

Partial.

Fixable only when the `RcMap.make(...)` expression captures no local values.

Move the declaration to module scope and use the top-level value.

Leave diagnostics when local captures exist.

---

# Most valuable `--fix` wins

## High-confidence fixes

```txt
base/prefer-readonly-types
base/prefer-optional-property
base/no-redundant-type-syntax
base/no-redundant-type-system-check
base/prefer-function-declaration
base/prefer-arrow-callback
base/prefer-node-subpath-import

react/no-use-state-lazy-initializer
react/no-manual-memoization

effect/no-single-operation-pipe
effect/no-effect-without-semantics
effect/no-standard-global-modules
effect/no-option-constructor
```

## Aggressive refactor fixes

```txt
base/no-type-assertion-except-as-const
base/prefer-undefined-over-null
base/no-unnecessary-named-type
base/no-destructuring
base/no-spread-syntax
base/no-single-use-local-binding
base/no-simple-local-binding
base/no-vacuous-abstraction
base/no-local-namespace-import
base/no-default-export-except-config

react/no-jsx-props-object
react/no-tailwind-class-indirection
react/no-forward-ref
react/prefer-hook-variable
react/no-property-mutation-outside-ref-current

effect/no-standard-prototype-methods
effect/prefer-pipe-for-multi-operation-composition
effect/prefer-effect-fn-untraced
effect/prefer-effect-gen-program
effect/no-floating-effect
effect/no-effect-type-erasure
effect/no-effect-type-alias
effect/prefer-effect-try
effect/prefer-schema-tagged-error
effect/prefer-top-level-rcmap
```

## Diagnostic-only or mostly diagnostic

```txt
base/no-plain-class
effect/no-effect-run-away-from-boundary
effect/prefer-effect-catch-tag
```

---

# Biome config changes

## Enable Biome regex literal rule

Your Biome config currently has `complexity.useRegexLiterals` set to `off`.

Change it to:

```json
{
	"linter": {
		"rules": {
			"complexity": {
				"useRegexLiterals": "error"
			}
		}
	}
}
```

Reason:

```txt
deslop should not own regex literal style. Biome already has the correct generic rule.
```

## Remove Biome restricted globals

Your current Biome config uses `style.noRestrictedGlobals` to ban globals like `Array`, `String`, `Object`, `Boolean`, etc. with custom messages.

Remove this block from Biome and let `deslop` own it through:

```txt
effect/no-standard-global-modules
effect/no-standard-prototype-methods
```

Reason:

```txt
Biome does not expose the custom messages clearly enough for the refactoring agent.
deslop should give direct rewrite instructions.
```

## Keep Tailwind sorting

Keep:

```json
{
	"nursery": {
		"useSortedClasses": {
			"level": "error",
			"fix": "safe"
		}
	}
}
```

Your current config already has this.

Reason:

```txt
Biome sorts class strings.
deslop bans moving class strings out of JSX.
They are complementary.
```

## Keep `noExplicitAny`

Keep:

```json
{
	"suspicious": {
		"noExplicitAny": "error"
	}
}
```

Your current config already has it.

Reason:

```txt
Explicit any is generic linting and Biome handles it.
```

## Keep `noUselessElse`

Keep:

```json
{
	"style": {
		"noUselessElse": "error"
	}
}
```

Your current config already has it.

Reason:

```txt
deslop no longer needs an early-return-over-else rule.
```

## Add Biome barrel-file rule

Use Biome for barrels instead of `deslop`.

Biome rule:

```txt
performance/noBarrelFile
```

Biome’s rule flags `export * from`, `export {x} from`, and `export {default as x} from`, while ignoring `.d.ts` and type-only exports.

Add:

```json
{
	"linter": {
		"rules": {
			"performance": {
				"noBarrelFile": "error"
			}
		}
	}
}
```

If the components package has legitimate edge cases, disable only there with a Biome override.

---

# TypeScript config changes

## Remove Effect language-service plugin

Your `tsconfig.json` currently includes:

```json
{
	"plugins": [
		{
			"name": "@effect/language-service",
			"diagnosticSeverity": {
				"anyUnknownInErrorContext": "error",
				"deterministicKeys": "error",
				"extendsNativeError": "error",
				"instanceOfSchema": "error",
				"missedPipeableOpportunity": "error",
				"nodeBuiltinImport": "error",
				"serviceNotAsClass": "error"
			}
		}
	]
}
```

Remove the plugin if you are not using the Effect LSP CLI anymore.

Do not migrate all of those diagnostics into `deslop`.

Only keep the practical agent-facing equivalent:

```txt
effect/prefer-effect-try
```

## Keep strict compiler options

Keep the strict TypeScript options already present:

```txt
strict
noUnusedLocals
noUnusedParameters
noUncheckedIndexedAccess
noPropertyAccessFromIndexSignature
noFallthroughCasesInSwitch
isolatedModules
verbatimModuleSyntax
```

They are still useful and do not overlap badly with `deslop`.
