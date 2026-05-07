# TypeScript De-slop Linter Rules

## Global scope

Apply to:

- `**/*.ts`
- `**/*.tsx`
- `**/*.test.*`

Always exclude:

- gitignored files
- generated files
- vendored files
- framework-generated files
- `**/components/ui/**`
- `**/*.gen.ts`
- `**/*.gen.tsx`
- `**/gen.ts`

Usually exclude from architecture/locality rules:

- `**/*.config.*`

Still run these rules in config files unless explicitly allowlisted:

- `no-type-assertion-except-as-const`
- `prefer-strict-literal-const`
- `prefer-readonly-types`
- `prefer-undefined-over-null`
- `no-redundant-type-system-check`
- `no-redundant-generic-type-argument`
- `no-unnecessary-type-constraint`

Global diagnostic requirements:

- Name the exact symbol or syntax node.
- State the exact structural problem.
- Tell the agent what to replace it with.
- Tell the agent what to delete.
- Tell the agent what not to do when that avoids a common bad fix.
- Never suggest a fix that violates another rule.
- Prefer direct fixes such as “inline X”, “delete Y”, “replace with Z”.
- Avoid vague words such as “cleaner”, “better”, “simpler”, or “unnecessary abstraction”.
- Mention `as const`, `satisfies`, `pipe`, `flow`, `yield*`, or direct Effect module calls exactly when those are the required fix.
- When removing an alias, include: “Do not replace this with another local variable.”
- When removing a destructuring binding, include: “Do not fix this by destructuring another value.”
- When removing a cast, include: “Do not replace this with another type assertion.”
- When removing a runtime check, include: “Trust the static type unless the value comes from an untrusted boundary.”

Line width policy:

- Maximum line width is 120.
- Single-line `if` bodies without braces are preferred when the full line stays within 120 columns.
- Braces are required when removing them would exceed 120 columns or when the branch has more than one statement.
- `else` after a terminal branch is banned independently of brace style.

---

## Rule ID:
  `no-type-assertion-except-as-const`

Name:
  Ban type assertions except useful `as const`

Root cause:
  Type-safety degradation

Intent:
  Prevent code from claiming a type that TypeScript did not prove.

Detects:
  - `value as T`
  - `<T>value`
  - `value!`
  - `property!: T`
  - `value as unknown as T`
  - `value as any`
  - `value as never`
  - `as const` when it does not make the type stricter

Does not flag:
  - `as const` on literals when it preserves stricter literal values, readonly fields, readonly arrays, discriminants, or tuple length
  - `as const satisfies Shape`
  - declaration files
  - generated files

Bad:
```ts
function parseUser(payload: unknown) {
  return payload as User
}
````

Good:

```ts
function parseUser(payload: unknown) {
  return UserSchema.decodeUnknownSync(payload)
}
```

Bad:

```ts
function UserName(props: {
  readonly user?: User
}) {
  return <span>{props.user!.name}</span>
}
```

Good:

```ts
function UserName(props: {
  readonly user?: User
}) {
  if (props.user === undefined) return undefined

  return <span>{props.user.name}</span>
}
```

Diagnostic message:
`payload as User` asserts `User` without proof from TypeScript. Remove the assertion. Change the producer type, decode or refine the unknown value, or keep the value typed as `unknown` until it is proven. Do not replace this with another type assertion.

Fix instruction:
Delete the assertion. Let TypeScript expose the real type mismatch. Fix the producer type, add a boundary schema/refinement, or narrow the value with normal control flow. Use `as const` only when it preserves a stricter literal type.

Severity:
error

Phase:
1

---

## Rule ID:

`prefer-strict-literal-const`

Name:
Prefer strict literal const

Root cause:
Type widening

Intent:
Preserve literal values, readonly object fields, readonly arrays, discriminants, and tuple lengths.

Detects:

* immutable object literals assigned to `const` where `as const` would preserve useful literal structure
* immutable array literals assigned to `const` where `as const` would preserve tuple/readonly structure
* broad literal annotations that should be `as const satisfies Shape`

Does not flag:

* mutable builders
* arrays intentionally appended to later
* objects intentionally mutated later
* external APIs that require mutable data
* React state values where the value is replaced rather than mutated

Bad:

```ts
const routes: Record<string, { readonly path: string }> = {
  home: { path: "/" },
  settings: { path: "/settings" },
}
```

Good:

```ts
const routes = {
  home: { path: "/" },
  settings: { path: "/settings" },
} as const satisfies Record<string, { readonly path: string }>
```

Bad:

```ts
const events = [
  { _tag: "created", id: "1" },
  { _tag: "deleted", id: "2" },
]
```

Good:

```ts
const events = [
  { _tag: "created", id: "1" },
  { _tag: "deleted", id: "2" },
] as const
```

Diagnostic message:
`routes` is an immutable literal, but the annotation widens its keys and literal values. Replace the annotation with `as const satisfies Record<string, { readonly path: string }>` so TypeScript checks the shape while preserving the strict literal type.

Fix instruction:
Remove the widening annotation. Add `as const`. If shape checking is needed, use `as const satisfies Shape`. Do not use a type assertion other than useful `as const`.

Severity:
error

Phase:
1

---

## Rule ID:

`prefer-readonly-types`

Name:
Prefer readonly types

Root cause:
Accidental mutability

Intent:
Make object and array types immutable by default.

Detects:

* mutable object properties in type literals, interfaces, and aliases
* `T[]`
* `Array<T>`
* mutable tuple types
* mutable props types

Does not flag:

* `ref.current`
* explicit mutable builders
* explicit mutable adapter boundaries
* external library types requiring mutable arrays or mutable fields
* generated files

Bad:

```ts
function Tags(props: {
  tags: string[]
}) {
  return (
    <ul>
      {Array.map(props.tags, (tag) => <li key={tag}>{tag}</li>)}
    </ul>
  )
}
```

Good:

```ts
function Tags(props: {
  readonly tags: ReadonlyArray<string>
}) {
  return (
    <ul>
      {Array.map(props.tags, (tag) => <li key={tag}>{tag}</li>)}
    </ul>
  )
}
```

Diagnostic message:
`tags` is typed as mutable `string[]`. Change it to `readonly tags: ReadonlyArray<string>` unless this API intentionally mutates the array.

Fix instruction:
Add `readonly` to object properties. Replace `T[]` and `Array<T>` with `ReadonlyArray<T>`. Use mutable types only in explicit mutable/ref boundaries.

Severity:
error

Phase:
1

---

## Rule ID:

`prefer-undefined-over-null`

Name:
Prefer undefined

Root cause:
Nullability drift

Intent:
Standardize internal absence as `undefined`.

Detects:

* `T | null`
* `value === null`
* `value !== null`
* `null` object property values
* `return value ?? null`
* `prop={null}`
* schema/internal types that introduce `null` where the boundary does not require it

Does not flag:

* `return null` from React components
* `useRef<T>(null)` for DOM refs
* external APIs that actually send `null`
* database schemas that actually return `null`
* JSON/protocol mirrors that actually contain `null`
* React-owned types where `null` is part of the library contract

Bad:

```tsx
function Avatar(props: {
  readonly imageUrl: string | null
}) {
  return <img src={props.imageUrl ?? undefined} />
}
```

Good:

```tsx
function Avatar(props: {
  readonly imageUrl?: string
}) {
  return <img src={props.imageUrl} />
}
```

Diagnostic message:
`imageUrl` uses `null` for internal absence. Use an optional property or `string | undefined`; reserve `null` for React render/ref cases or external data boundaries.

Fix instruction:
Replace `null` unions with `undefined` or optional properties. Delete `?? undefined` adapters when the prop is already optional. Do not add a runtime null check if the static type no longer includes `null`.

Severity:
error

Phase:
1

---

## Rule ID:

`no-destructuring-except-react-hook-tuples`

Name:
No destructuring

Root cause:
Local aliasing

Intent:
Keep all property and element access explicit at the use site.

Detects:

* object destructuring
* array destructuring
* destructured function parameters
* destructured loop bindings
* destructured catch bindings
* destructured imports from non-module values

Does not flag:

* array destructuring directly from React hook tuple calls such as `useState`, `useReducer`, `useTransition`, `useActionState`, and `useOptimistic`
* configured tuple-returning React hooks
* normal ES import syntax

Bad:

```tsx
function Profile(props: {
  readonly user: User
}) {
  const { user } = props

  return <span>{user.name}</span>
}
```

Good:

```tsx
function Profile(props: {
  readonly user: User
}) {
  return <span>{props.user.name}</span>
}
```

Bad:

```tsx
function Profile({ user }: {
  readonly user: User
}) {
  return <span>{user.name}</span>
}
```

Good:

```tsx
function Profile(props: {
  readonly user: User
}) {
  return <span>{props.user.name}</span>
}
```

Diagnostic message:
`user` is destructured from `props`, creating an alias for a value that can be read directly. Delete the destructuring and use `props.user` at each access site. Do not fix this by creating another local variable.

Fix instruction:
Replace every destructured binding with direct property or element access from the original value. Delete the destructuring declaration. Do not introduce replacement access variables.

Severity:
error

Phase:
1

---

## Rule ID:

`no-access-alias`

Name:
No access aliases

Root cause:
Local aliasing

Intent:
Prevent temporary variables that only rename property access, element access, optional access, or cheap derived access.

Detects:

* `const name = props.user.name`
* `const first = values[0]`
* `const title = props.post.title ?? "Untitled"`
* `const normalized = String.toLowerCase(props.user.name)`
* aliases used only once
* aliases used multiple times when the expression is cheap

Does not flag:

* Effect programs assigned to a name
* schemas assigned to a name
* React components
* service tags
* expensive computations used more than once
* values passed to APIs that require stable identity
* React hook tuple bindings

Bad:

```tsx
function Profile(props: {
  readonly user: User
}) {
  const name = props.user.name

  return <span>{name}</span>
}
```

Good:

```tsx
function Profile(props: {
  readonly user: User
}) {
  return <span>{props.user.name}</span>
}
```

Bad:

```tsx
function PostTitle(props: {
  readonly post: Post
}) {
  const title = props.post.title ?? "Untitled"

  return <h1>{title}</h1>
}
```

Good:

```tsx
function PostTitle(props: {
  readonly post: Post
}) {
  return <h1>{props.post.title ?? "Untitled"}</h1>
}
```

Diagnostic message:
`name` only aliases `props.user.name`. Inline `props.user.name` at each use site, delete `name`, and do not replace this with another local variable or destructuring.

Fix instruction:
Inline the accessed expression. Delete the variable. Preserve direct property access. Do not create another alias for the same expression.

Severity:
error

Phase:
1

---

## Rule ID:

`no-boolean-expression-alias`

Name:
No boolean aliases

Root cause:
Hidden condition logic

Intent:
Keep equality checks, nullability checks, fallbacks, and logical chains visible where they control behavior.

Detects:

* `const isActive = user.status === "active"`
* `const hasName = props.user.name !== undefined`
* `const canEdit = a && b && c`
* `const shouldRender = conditionA || conditionB`
* boolean aliases used once
* boolean aliases used multiple times when the expression is cheap
* exported helpers that only hide cheap boolean logic

Does not flag:

* schema/refinement predicates over `unknown`
* security or permission policies with real domain semantics and non-trivial logic
* expensive checks
* predicates exported as a real validation boundary
* callback predicates passed directly inline to Effect module functions

Bad:

```tsx
function PostActions(props: {
  readonly post: Post
  readonly session: Session
}) {
  const canEdit = props.post.status === "draft" && props.post.authorId === props.session.user.id

  return canEdit ? <EditPostButton post={props.post} /> : undefined
}
```

Good:

```tsx
function PostActions(props: {
  readonly post: Post
  readonly session: Session
}) {
  return props.post.status === "draft" && props.post.authorId === props.session.user.id
    ? <EditPostButton post={props.post} />
    : undefined
}
```

Diagnostic message:
`canEdit` hides a boolean expression that is only used to choose behavior. Inline the full condition where it is consumed, delete `canEdit`, and do not replace this with another local boolean variable.

Fix instruction:
Move the full boolean expression into the `if`, ternary, `Match.when`, `Predicate` combinator, or Effect pipeline that consumes it. Delete the alias. Do not destructure props or create access aliases while doing this.

Severity:
error

Phase:
1

---

## Rule ID:

`no-redundant-type-annotation`

Name:
Prefer inference

Root cause:
Type-locality degradation

Intent:
Remove explicit annotations that duplicate or widen inferred types.

Detects:

* `const value: T = expression` when `expression` already infers `T`
* return annotations on non-recursive functions when inference is identical or narrower
* redundant variable annotations around Effect values
* annotations that widen literal types
* annotations that hide precise inferred generic parameters

Does not flag:

* function parameters without contextual type
* recursive function return annotations
* overload signatures
* declaration files
* public ambient declarations
* places where removing the annotation changes the inferred type unsafely

Bad:

```ts
function normalize(value: string): string {
  return pipe(
    value,
    String.trim,
    String.toLowerCase,
  )
}
```

Good:

```ts
function normalize(value: string) {
  return pipe(
    value,
    String.trim,
    String.toLowerCase,
  )
}
```

Bad:

```ts
const user: User = createUser(input)
```

Good:

```ts
const user = createUser(input)
```

Diagnostic message:
The annotation on `user` duplicates the inferred type from `createUser(input)`. Remove the annotation and let TypeScript carry the precise inferred type.

Fix instruction:
Delete the annotation. Keep only parameter annotations TypeScript cannot infer and recursive return annotations needed for stable inference. If the value is a literal and needs shape checking, use `as const satisfies Shape`.

Severity:
error

Phase:
1

---

## Rule ID:

`no-redundant-generic-type-argument`

Name:
No redundant generic type arguments

Root cause:
Type-locality degradation

Intent:
Let TypeScript infer generic type arguments when the inferred type is already correct.

Detects:

* `Option.some<string>("value")` when `string` is inferred
* `Array.map<User, string>(users, ...)` when both types are inferred
* `Effect.succeed<number>(1)` when `number` is inferred
* `Schema.decodeUnknownSync<User>(schema)` when the decoded type is inferred from the schema
* JSX generic arguments when props infer them correctly

Does not flag:

* generic arguments required because inference fails
* generic arguments used to intentionally choose a wider/narrower overload that cannot be inferred
* empty literal cases where TypeScript cannot infer the intended element type
* recursive definitions requiring explicit generic anchors

Bad:

```ts
const value = Option.some<string>("value")
```

Good:

```ts
const value = Option.some("value")
```

Bad:

```ts
const program = Effect.succeed<number>(1)
```

Good:

```ts
const program = Effect.succeed(1)
```

Diagnostic message:
The generic argument `<string>` on `Option.some` is already inferred from `"value"`. Remove `<string>` and let TypeScript infer the type. Do not replace this with a type annotation or type assertion.

Fix instruction:
Delete the redundant generic argument list. Re-run type checking. Keep explicit generic arguments only when inference is not enough and the call would otherwise infer the wrong type.

Severity:
error

Phase:
1

---

## Rule ID:

`no-unnecessary-type-constraint`

Name:
No unnecessary generic constraints

Root cause:
Type-locality degradation

Intent:
Remove generic constraints and type parameters that add no type information.

Detects:

* generic parameters used only once
* `T extends unknown`
* `T extends any`
* generic identity wrappers where a concrete inferred type is enough
* type parameters that only forward to another generic call
* generic constraints duplicating the parameter type already known at the call site

Does not flag:

* real reusable generic utilities with multiple independent call sites
* constraints required for property access
* constraints required for conditional types
* schema/type-level helpers where the generic is the point of the API

Bad:

```ts
function getId<T extends { readonly id: string }>(value: T) {
  return value.id
}
```

Good:

```ts
function getId(value: {
  readonly id: string
}) {
  return value.id
}
```

Bad:

```ts
function identity<T>(value: T) {
  return value
}
```

Good:

```ts
value
```

Diagnostic message:
`T` is only used to forward the input type and does not add useful type information. Replace the generic parameter with the concrete required shape or inline the value directly.

Fix instruction:
Remove the generic parameter. Use a concrete structural parameter type when a property is accessed. Inline identity wrappers. Do not add casts to preserve the old generic signature.

Severity:
error

Phase:
1

---

## Rule ID:

`no-redundant-type-system-check`

Name:
Trust proven types

Root cause:
Redundant defensive code

Intent:
Remove runtime checks for facts already guaranteed by TypeScript.

Detects:

* nullability checks on non-nullish values
* `typeof` checks on statically known primitive types
* `Array.isArray` on statically known arrays
* property-existence checks on required properties
* optional chaining on non-nullish values
* nullish coalescing where the left side cannot be nullish
* fallback expressions where the fallback is unreachable
* dead branches made unreachable by literal/discriminated types
* schema/type guard checks on values already narrowed by TypeScript
* equality checks impossible under the static type

Does not flag:

* checks on `unknown`
* checks on `any` only when `any` comes from an external allowlisted boundary
* checks before decoding external input
* checks where the static type includes the checked case
* checks after mutation where TypeScript cannot prove the value
* external JavaScript APIs with inaccurate declarations behind an explicit allowlist

Bad:

```ts
function UserName(props: {
  readonly user: User
}) {
  if (props.user === undefined) return undefined

  return <span>{props.user.name}</span>
}
```

Good:

```ts
function UserName(props: {
  readonly user: User
}) {
  return <span>{props.user.name}</span>
}
```

Bad:

```ts
function UserName(props: {
  readonly user: User
}) {
  return <span>{props.user.name ?? "Anonymous"}</span>
}
```

Good:

```ts
function UserName(props: {
  readonly user: User
}) {
  return <span>{props.user.name}</span>
}
```

Bad:

```ts
function Users(props: {
  readonly users: ReadonlyArray<User>
}) {
  if (!Array.isArray(props.users)) return undefined

  return <span>{props.users.length}</span>
}
```

Good:

```ts
function Users(props: {
  readonly users: ReadonlyArray<User>
}) {
  return <span>{props.users.length}</span>
}
```

Diagnostic message:
`props.user === undefined` is unreachable because `props.user` is typed as `User`. Delete the check and use `props.user` directly. Trust the static type unless the value comes from an untrusted boundary.

Fix instruction:
Delete the redundant check, fallback, optional chain, or unreachable branch. Do not replace it with another runtime check. If the case is actually possible, fix the static type so it includes the case.

Severity:
error

Phase:
1

---

## Rule ID:

`no-floating-type-contract`

Name:
No floating type contracts

Root cause:
Type-locality degradation

Intent:
Inline ad-hoc and intermediate types instead of leaving weak named types around files or exports.

Detects:

* single-use type aliases
* single-use interfaces
* exported type aliases used only by one nearby function
* exported interfaces used only by one nearby function
* intermediate `Pick`, `Omit`, `Partial`, `ReturnType`, or `Parameters` aliases
* primitive aliases without branding
* object aliases that do not cross a real boundary

Does not flag:

* branded/opaque types
* recursive types
* real multi-variant discriminated unions
* schema-derived boundary types
* Effect service tags/classes
* types imported by another workspace package through a configured public subpath
* explicitly allowlisted package public API types

Bad:

```ts
export interface ButtonOptions {
  readonly disabled?: boolean
  readonly label: string
}

function Button(props: ButtonOptions) {
  return <button disabled={props.disabled}>{props.label}</button>
}
```

Good:

```tsx
function Button(props: {
  readonly disabled?: boolean
  readonly label: string
}) {
  return <button disabled={props.disabled}>{props.label}</button>
}
```

Bad:

```ts
type CreateUserInput = Pick<User, "name" | "email">

function createUser(input: CreateUserInput) {
  return UserRepo.create(input)
}
```

Good:

```ts
function createUser(input: Pick<User, "name" | "email">) {
  return UserRepo.create(input)
}
```

Diagnostic message:
`ButtonOptions` is a named type used only as the props shape for `Button`. Inline the object type at the parameter and delete `ButtonOptions`. Do not replace it with another exported type name.

Fix instruction:
Inline the type where it is used. Keep a named type only when it carries a brand, recursion, real variants, schema identity, or real cross-package API value.

Severity:
error

Phase:
1

---

## Rule ID:

`prefer-function-declaration`

Name:
Prefer function declarations

Root cause:
Inconsistent callable style

Intent:
Use `function` declarations for named plain functions and React components.

Detects:

* named arrow functions
* named function expressions assigned to variables
* React components declared as arrows
* direct-return arrows for named functions

Does not flag:

* callbacks
* `flow(...)` function values
* `Effect.fnUntraced(...)`
* `Effect.gen(...)`
* `Match.type(...)` / reusable matcher values
* schemas
* service tags
* data constructors
* values that are not callable declarations

Bad:

```tsx
const UserCard = (props: {
  readonly user: User
}) => <span>{props.user.name}</span>
```

Good:

```tsx
function UserCard(props: {
  readonly user: User
}) {
  return <span>{props.user.name}</span>
}
```

Bad:

```ts
const normalize = (value: string) =>
  pipe(
    value,
    String.trim,
    String.toLowerCase,
  )
```

Good:

```ts
function normalize(value: string) {
  return pipe(
    value,
    String.trim,
    String.toLowerCase,
  )
}
```

Diagnostic message:
`UserCard` is a named function written as an arrow function. Rewrite it as `function UserCard(...) { ... }`. Keep arrow functions only for callbacks.

Fix instruction:
Convert the variable declaration to a function declaration. Do not destructure parameters. Do not introduce access aliases. Preserve direct returns when possible.

Severity:
error

Phase:
1

---

## Rule ID:

`prefer-arrow-callback`

Name:
Prefer arrow callbacks

Root cause:
Inconsistent callable style

Intent:
Use arrow functions for callbacks and never `function` expressions, except Effect generator callbacks.

Detects:

* callback `function` expressions
* callback method expressions when an arrow callback is equivalent

Does not flag:

* `function*` callbacks passed to `Effect.gen`
* `function*` callbacks passed to `Effect.fnUntraced`
* external APIs that require dynamic `this`, behind explicit allowlist

Bad:

```ts
Array.map(props.users, function (user) {
  return user.name
})
```

Good:

```ts
Array.map(props.users, (user) => user.name)
```

Bad:

```ts
setTimeout(function () {
  Effect.runFork(Console.log("done"))
})
```

Good:

```ts
setTimeout(() => {
  Effect.runFork(Console.log("done"))
})
```

Diagnostic message:
This callback uses a `function` expression. Rewrite it as an arrow callback. Only `function*` callbacks passed to `Effect.gen` or `Effect.fnUntraced` are allowed.

Fix instruction:
Replace the callback with an arrow function. Preserve `this` only in explicit external API allowlists.

Severity:
error

Phase:
1

---

## Rule ID:

`prefer-effect-fn-untraced`

Name:
Prefer Effect.fnUntraced for parameterized Effect functions

Root cause:
Effect composability loss

Intent:
Parameterized functions that return `Effect.Effect` should be declared with `Effect.fnUntraced`.

Detects:

* `function name(args) { return effect }`
* `const name = (args) => effect`
* parameterized functions whose inferred return type is `Effect.Effect<...>`
* parameterized async-style factories that only wrap and return an Effect

Does not flag:

* callbacks passed to Effect combinators
* React event handlers that run Effects at an explicit boundary
* framework functions requiring a fixed signature
* zero-argument Effect programs; those are handled by `prefer-effect-gen-program`

Bad:

```ts
function getUserName(id: UserId) {
  return pipe(
    UserRepo.get(id),
    Effect.map((user) => user.name),
  )
}
```

Good:

```ts
const getUserName = Effect.fnUntraced(function* (id: UserId) {
  return (yield* UserRepo.get(id)).name
})
```

Bad:

```ts
const saveUser = (user: User) =>
  pipe(
    UserRepo.save(user),
    Effect.asVoid,
  )
```

Good:

```ts
const saveUser = Effect.fnUntraced(function* (user: User) {
  yield* UserRepo.save(user)
})
```

Diagnostic message:
`getUserName` has parameters and returns an `Effect`. Rewrite it as `Effect.fnUntraced(function* (...) { ... })`, yield each Effect with `yield*`, and return the plain success value.

Fix instruction:
Wrap the function body in `Effect.fnUntraced(function* (...) { ... })`. Replace Effect pipelines that only sequence dependent values with `yield*`. Do not return an Effect from inside the generator.

Severity:
error

Phase:
1

---

## Rule ID:

`prefer-effect-gen-program`

Name:
Prefer Effect.gen for zero-argument Effect programs

Root cause:
Unnecessary Effect factory

Intent:
A zero-argument function returning an Effect should usually be an Effect value.

Detects:

* zero-argument functions returning `Effect.Effect`
* zero-argument arrows returning `Effect.Effect`
* zero-argument wrappers around `Effect.gen`
* zero-argument wrappers around Effect pipelines

Does not flag:

* callbacks required by external APIs
* factories that intentionally create a fresh resource scope per call
* test helper factories where each call intentionally creates distinct scoped state
* functions that should become parameterized and then use `Effect.fnUntraced`

Bad:

```ts
function program() {
  return Effect.gen(function* () {
    yield* Console.log("starting")

    return yield* Config.load
  })
}
```

Good:

```ts
const program = Effect.gen(function* () {
  yield* Console.log("starting")

  return yield* Config.load
})
```

Diagnostic message:
`program` is a zero-argument function that only returns an Effect. Replace it with `const program = Effect.gen(function* () { ... })` and delete the function wrapper.

Fix instruction:
Move the generator body into a top-level `Effect.gen`. Assign the resulting Effect to a `const`. If dynamic data is needed, make it an explicit parameter and use `Effect.fnUntraced`.

Severity:
error

Phase:
1

---

## Rule ID:

`no-floating-effect`

Name:
No floating Effects

Root cause:
Lazy Effect not executed

Intent:
Prevent Effect values from being constructed and discarded.

Detects:

* bare expression statements typed as `Effect.Effect<...>`
* Effect values inside `Effect.gen` not preceded by `yield*`
* Effect values inside `Effect.fnUntraced` not preceded by `yield*`
* Effect values outside generators that are not assigned, returned, composed, or run at a configured boundary

Does not flag:

* `yield* effect`
* `return effect` from a callback explicitly expected to return an Effect
* `const program = Effect.gen(...)`
* arguments to Effect combinators such as `Effect.all`, `Effect.tap`, `Effect.acquireUseRelease`
* `Effect.run*` calls in configured runtime boundaries
* Effect values assigned to a variable for later composition

Bad:

```ts
const program = Effect.gen(function* () {
  Console.log("saving")

  return yield* UserRepo.save(props.user)
})
```

Good:

```ts
const program = Effect.gen(function* () {
  yield* Console.log("saving")

  return yield* UserRepo.save(props.user)
})
```

Bad:

```ts
function handleClick(props: {
  readonly user: User
}) {
  UserRepo.save(props.user)
}
```

Good:

```ts
function handleClick(props: {
  readonly user: User
}) {
  Effect.runFork(UserRepo.save(props.user))
}
```

Diagnostic message:
This `Effect` value is created but never yielded, assigned, composed, or run. Add `yield*` inside an Effect generator, assign it to a program value, pass it to an Effect combinator, or run it only at a configured boundary. Do not fix this with `void`.

Fix instruction:
If inside `Effect.gen` or `Effect.fnUntraced`, add `yield*`. If outside, either return/assign the Effect program, pass it to an Effect combinator, or move execution to a runtime boundary. Do not use `void effect`.

Severity:
error

Phase:
1

---

## Rule ID:

`prefer-top-level-pipe-for-effect-values`

Name:
Prefer top-level pipe for Effect values

Root cause:
Inconsistent Effect composition

Intent:
Use `pipe(effect, ...)` instead of `.pipe(...)` or data-first direct calls for values typed as `Effect.Effect`.

Detects:

* `effect.pipe(...)` where `effect` is typed as `Effect.Effect<...>`
* `Effect.asVoid(effect)`
* `Effect.map(effect, callback)`
* `Effect.flatMap(effect, callback)`
* any data-first Effect operation called directly on an Effect value

Does not flag:

* non-Effect data module one-step calls such as `Array.filter(values, Predicate.isNotUndefined)`
* `yield* effect` inside Effect generators
* Effect constructor calls such as `Effect.succeed(value)`

Bad:

```ts
Effect.succeed(0).pipe(Effect.asVoid)
```

Good:

```ts
pipe(
  Effect.succeed(0),
  Effect.asVoid,
)
```

Bad:

```ts
Effect.asVoid(Effect.succeed(0))
```

Good:

```ts
pipe(
  Effect.succeed(0),
  Effect.asVoid,
)
```

Diagnostic message:
This composes an `Effect.Effect` using `.pipe` or a direct data-first call. Rewrite it as `pipe(effect, Effect.asVoid)` so Effect programs use one readable composition shape.

Fix instruction:
Move the Effect expression into the first argument of `pipe`. Move every Effect operation into later pipe steps. Do this even for a single Effect operation.

Severity:
error

Phase:
1

---

## Rule ID:

`prefer-effect-module-over-standard-library`

Name:
Prefer Effect modules over standard-library calls

Root cause:
Equivalent-pattern drift

Intent:
Replace standard prototype/global helpers with Effect module functions when an Effect module equivalent exists.

Detects:

* standard Array prototype calls such as `.map`, `.filter`, `.flatMap`, `.reduce`, `.some`, `.every`, `.find`, `.includes`, `.slice`, `.join`
* standard String prototype calls such as `.trim`, `.toLowerCase`, `.toUpperCase`, `.startsWith`, `.endsWith`, `.includes`, `.slice`
* standard Object globals such as `Object.keys`, `Object.values`, `Object.entries`, `Object.fromEntries`
* standard Array globals such as `Array.isArray`
* standard Number globals where Effect has an equivalent
* standard JSON/global helpers only when a configured Effect module equivalent exists

Does not flag:

* external API methods
* DOM methods
* React APIs
* methods with no Effect equivalent
* mutation inside explicit ref boundaries
* performance-specialized loops behind allowlist
* framework-required code behind allowlist

Bad:

```ts
props.users
  .filter((user) => user !== undefined)
  .map((user) => user.name.trim().toLowerCase())
```

Good:

```ts
pipe(
  props.users,
  Array.filter(Predicate.isNotUndefined),
  Array.map((user) =>
    pipe(
      user.name,
      String.trim,
      String.toLowerCase,
    )
  ),
)
```

Bad:

```ts
props.user.name.trim()
```

Good:

```ts
String.trim(props.user.name)
```

Diagnostic message:
This calls `String.prototype.trim`. Use `String.trim` from Effect. For one operation, call `String.trim(value)`; for multiple operations, use `pipe(value, String.trim, ...)`.

Fix instruction:
Resolve the called symbol. If it comes from a standard JavaScript prototype/global and an Effect module equivalent exists, replace it with the Effect module function. Do not flag external object methods with the same name.

Severity:
error

Phase:
1

---

## Rule ID:

`prefer-pipe-for-transform-sequences`

Name:
Prefer pipelines over intermediate variables

Root cause:
Imperative intermediate state

Intent:
Replace sequential temporary variables with composable `pipe` / `flow`.

Detects:

* linear transformation variables
* variables where each next variable only consumes the previous variable
* temporary collection variables used only to feed the next transformation
* temporary normalized/string/object variables used only once
* return of the final temporary variable

Does not flag:

* values with meaningful side-effect boundaries
* expensive computations consumed independently more than once
* debugging-only code behind explicit test/debug allowlists
* React hook tuple state variables
* Effect values assigned as named programs

Bad:

```ts
function getNames(users: ReadonlyArray<User | undefined>) {
  const filtered = Array.filter(users, Predicate.isNotUndefined)
  const names = Array.map(filtered, (user) => user.name)
  const normalized = Array.map(names, String.toLowerCase)

  return normalized
}
```

Good:

```ts
function getNames(users: ReadonlyArray<User | undefined>) {
  return pipe(
    users,
    Array.filter(Predicate.isNotUndefined),
    Array.map((user) => user.name),
    Array.map(String.toLowerCase),
  )
}
```

Diagnostic message:
`filtered`, `names`, and `normalized` form a linear transformation chain. Replace the temporary variables with one `pipe(...)` expression and delete the intermediate variables.

Fix instruction:
Use the first source value as the first `pipe` argument. Convert each subsequent transformation into a pipe step. Return or pass the pipeline result directly. Do not replace the chain with new temporary variables.

Severity:
error

Phase:
1

---

## Rule ID:

`prefer-direct-call-for-single-data-operation`

Name:
Prefer direct data-module call for one operation

Root cause:
Pipe ceremony

Intent:
Avoid one-step `pipe` for non-Effect data transformations.

Detects:

* `pipe(value, Array.filter(...))`
* `pipe(value, String.trim)`
* `pipe(value, Record.keys)`
* any one-step pipe where `value` is not typed as `Effect.Effect<...>`

Does not flag:

* values typed as `Effect.Effect<...>`
* Match pipelines
* multi-step transformations
* one-step pipelines where the first argument is multiline and direct call would exceed 120 columns

Bad:

```ts
function getUsers(values: ReadonlyArray<User | undefined>) {
  return pipe(
    values,
    Array.filter(Predicate.isNotUndefined),
  )
}
```

Good:

```ts
function getUsers(values: ReadonlyArray<User | undefined>) {
  return Array.filter(values, Predicate.isNotUndefined)
}
```

Diagnostic message:
This `pipe` has one non-Effect data operation. Replace it with `Array.filter(values, Predicate.isNotUndefined)`. Keep top-level `pipe` for all `Effect.Effect` composition and multi-step data transformations.

Fix instruction:
Convert one-step non-Effect data pipelines to direct Effect module calls. Keep `pipe` for multi-step transformations, Match pipelines, and all `Effect.Effect` composition.

Severity:
error

Phase:
1

---

## Rule ID:

`prefer-flow-for-reusable-unary-composition`

Name:
Prefer flow for unary composition

Root cause:
Temporary function bodies

Intent:
Use `flow` for reusable unary transformation composition instead of manually threading one parameter.

Detects:

* named unary functions that only pipe one value through pure unary transformations
* named unary functions that manually nest pure unary transformations
* reusable unary arrows that should either be `flow` or inlined

Does not flag:

* one-off inline expressions
* functions with branching
* functions with multiple parameters
* functions with validation
* functions with Effect context
* functions with real domain policy

Bad:

```ts
function normalize(value: string) {
  return pipe(
    value,
    String.trim,
    String.toLowerCase,
  )
}
```

Good:

```ts
const normalize = flow(
  String.trim,
  String.toLowerCase,
)
```

But when single-use, prefer inlining:

```ts
function UserName(props: {
  readonly user: User
}) {
  return (
    <span>
      {pipe(
        props.user.name,
        String.trim,
        String.toLowerCase,
      )}
    </span>
  )
}
```

Diagnostic message:
`normalize` only threads one input through pure unary transformations. Replace it with `flow(String.trim, String.toLowerCase)`, or inline the pipeline if `normalize` has one consumer.

Fix instruction:
Use `flow` for reusable unary composition. If the composed function is single-use, inline it at the call site and delete the helper. Do not create access aliases.

Severity:
error

Phase:
1

---

## Rule ID:

`prefer-match-for-pattern-branching`

Name:
Prefer Match for pattern branching

Root cause:
Heavy branching

Intent:
Replace switch statements and nested ternaries over literal variants with `Match`.

Detects:

* `switch` over `_tag`
* `switch` over discriminant/literal union fields
* nested ternaries over the same discriminant or literal field
* chained `if`/`else if` over the same closed union variant

Does not flag:

* simple binary boolean `if`
* simple binary ternaries
* imperative switches with mutation
* external unknown values before decoding/narrowing
* performance-critical dispatch tables behind allowlist

Bad:

```tsx
function renderEvent(event: Event) {
  switch (event._tag) {
    case "created":
      return <CreatedEvent event={event} />
    case "deleted":
      return <DeletedEvent event={event} />
  }
}
```

Good:

```tsx
const renderEvent = pipe(
  Match.type<Event>(),
  Match.tag("created", (event) => <CreatedEvent event={event} />),
  Match.tag("deleted", (event) => <DeletedEvent event={event} />),
  Match.exhaustive,
)
```

Diagnostic message:
This `switch` is pure pattern matching over `event._tag`. Replace it with `pipe(Match.type<Event>(), Match.tag(...), Match.exhaustive)`. Do not add `as const` to the tag input; add `as const` only to literal outputs from Match handlers.

Fix instruction:
Create a `Match.type<T>()` matcher. Convert each case to `Match.tag("literal", callback)`. Finish with `Match.exhaustive`. Preserve direct property access and do not introduce boolean aliases.

Severity:
error

Phase:
1

---

## Rule ID:

`require-as-const-match-output-literals`

Name:
Require const Match output literals

Root cause:
Agent type-iteration loops

Intent:
Preserve literal output unions from `Match`.

Detects:

* `Match.tag("x", () => "literal")`
* `Match.when(..., () => "literal")`
* `Match.orElse(() => "literal")`
* Match handlers returning string/number/boolean literals without `as const`

Does not flag:

* JSX output
* object literals already using `as const`
* non-literal values
* callbacks returning a value intentionally widened by a required API
* tag/discriminator inputs

Bad:

```ts
const eventLabel = pipe(
  Match.type<Event>(),
  Match.tag("created", () => "created"),
  Match.tag("deleted", () => "deleted"),
  Match.exhaustive,
)
```

Good:

```ts
const eventLabel = pipe(
  Match.type<Event>(),
  Match.tag("created", () => "created" as const),
  Match.tag("deleted", () => "deleted" as const),
  Match.exhaustive,
)
```

Diagnostic message:
This Match handler returns literal `"created"` without preserving the literal type. Change the return value to `"created" as const`. Do not add `as const` to `Match.tag("created", ...)`.

Fix instruction:
Add `as const` to literal outputs from Match handlers. Do not cast the matched input value, do not cast the tag input, and do not add a broad result annotation.

Severity:
error

Phase:
1

---

## Rule ID:

`prefer-early-return-over-else`

Name:
Prefer early return over else

Root cause:
Nested branching

Intent:
Keep `if` imperative, but flatten control flow.

Detects:

* `else` after `return`
* `else` after `throw`
* `else` after `continue`
* `else` after `break`
* nested branches that can be flattened by a terminal guard

Does not flag:

* non-terminal branches
* `else if` chains that should be converted to `Match`
* ref-boundary code where both branches intentionally mutate `ref.current`

Bad:

```tsx
function PostStatus(props: {
  readonly post: Post
}) {
  if (props.post.status === "draft") {
    return <DraftPost post={props.post} />
  } else {
    return <PublishedPost post={props.post} />
  }
}
```

Good:

```tsx
function PostStatus(props: {
  readonly post: Post
}) {
  if (props.post.status === "draft") return <DraftPost post={props.post} />

  return <PublishedPost post={props.post} />
}
```

Diagnostic message:
This `else` follows a branch that already returns. Delete the `else`, keep the first branch as an early return, and move the second branch after the `if`.

Fix instruction:
Remove the `else` wrapper. Preserve the `if`. If the early-return branch fits within 120 columns and has one statement, remove the braces. Do not replace the condition with a local boolean alias.

Severity:
error

Phase:
1

---

## Rule ID:

`prefer-minimal-if-braces`

Name:
Prefer minimal if braces

Root cause:
Visual noise

Intent:
Remove braces from single-statement `if` branches when the statement stays within the 120-column line width, and require braces when it would not.

Detects:

* single-statement `if` branches with braces that fit on one line without braces
* single-line `if` branches without braces that exceed 120 columns
* braceless branches with more than one statement
* inconsistent branches where one side needs braces and the other side should be explicit for readability

Does not flag:

* multi-statement branches
* branches whose body would exceed 120 columns without braces
* branches containing comments
* branches with declarations that require block scope
* branches where removing braces would change ASI-sensitive behavior

Bad:

```tsx
function Button(props: {
  readonly disabled?: boolean
}) {
  if (props.disabled === true) {
    return <button disabled>Save</button>
  }

  return <button>Save</button>
}
```

Good:

```tsx
function Button(props: {
  readonly disabled?: boolean
}) {
  if (props.disabled === true) return <button disabled>Save</button>

  return <button>Save</button>
}
```

Bad:

```tsx
function Button(props: {
  readonly disabled?: boolean
}) {
  if (props.disabled === true) return <button disabled aria-label="Save all pending changes before leaving the page">Save</button>

  return <button>Save</button>
}
```

Good:

```tsx
function Button(props: {
  readonly disabled?: boolean
}) {
  if (props.disabled === true) {
    return <button disabled aria-label="Save all pending changes before leaving the page">Save</button>
  }

  return <button>Save</button>
}
```

Diagnostic message:
This `if` branch has braces around one statement that fits within 120 columns. Remove the braces and keep the early return on one line.

Fix instruction:
If the branch has one statement and the full line fits within 120 columns, remove braces. If the braceless line would exceed 120 columns, keep or add braces and format the body as a block.

Severity:
error

Phase:
1

---

## Rule ID:

`prefer-effect-nullish-predicates`

Name:
Prefer Effect nullish predicates

Root cause:
Equivalent-pattern drift

Intent:
Use Effect Predicate helpers for real nullable/undefined filtering and refinement.

Detects:

* `(value) => value !== undefined` used as a filter/refinement callback
* `(value) => value !== null`
* `(value) => value != null`
* project helpers such as `isDefined`, `isPresent`, `notNullish`
* nullish predicate helpers that duplicate Effect Predicate

Does not flag:

* non-callback `if` conditions where a direct local check is clearer
* values already non-nullish; those are handled by `no-redundant-type-system-check`
* domain predicates that check more than nullability

Bad:

```ts
function getUsers(values: ReadonlyArray<User | undefined>) {
  return Array.filter(values, (value) => value !== undefined)
}
```

Good:

```ts
function getUsers(values: ReadonlyArray<User | undefined>) {
  return Array.filter(values, Predicate.isNotUndefined)
}
```

Bad:

```ts
function getUsers(values: ReadonlyArray<User | null | undefined>) {
  return Array.filter(values, (value) => value != null)
}
```

Good:

```ts
function getUsers(values: ReadonlyArray<User | null | undefined>) {
  return Array.filter(values, Predicate.isNotNullish)
}
```

Diagnostic message:
This filter callback only checks nullability. Replace it with `Predicate.isNotUndefined`, `Predicate.isNotNull`, or `Predicate.isNotNullish` from Effect.

Fix instruction:
Use the most precise Effect Predicate helper matching the static type. Delete any project helper that only duplicates the Predicate module.

Severity:
error

Phase:
1

---

## Rule ID:

`no-forwarding-wrapper`

Name:
Forwarding wrapper

Root cause:
Mechanical indirection

Intent:
Prevent helpers that only rename, forward, await, spread, or reorder another call.

Detects:

* functions whose body is one call to another symbol
* wrappers that only `return await target(...)`
* wrappers that only reorder parameters
* wrappers that only spread arguments
* React components that only pass props through
* exported aliases that only rename another symbol

Does not flag:

* adapters crossing real external library/framework boundaries
* wrappers that add validation, policy, authorization, error mapping, tracing, unit conversion, resource handling, or type refinement
* configured public compatibility exports
* test helpers used by multiple `*.test.*` files and required by a test framework

Bad:

```ts
function parseUser(input: unknown) {
  return parseInput(input)
}
```

Good:

```ts
parseInput(input)
```

Bad:

```ts
async function getUser(id: UserId) {
  return await fetchUser(id)
}
```

Good:

```ts
fetchUser(id)
```

Diagnostic message:
`parseUser` only forwards to `parseInput`. Replace calls to `parseUser` with `parseInput`, delete `parseUser`, and keep a wrapper only if it adds validation, error mapping, policy, or another observable semantic change.

Fix instruction:
Replace every local reference with the forwarded target. If the wrapper is exported, verify it is not part of a configured public API. Delete the wrapper and any now-unused imports.

Severity:
error

Phase:
1

---

## Rule ID:

`prefer-near-use-definition`

Name:
Define code near use

Root cause:
Locality loss

Intent:
Keep helper code adjacent to the code that consumes it.

Detects:

* private helpers used once far from their call site
* helpers used only inside one component/function/test block but declared at module top level
* helpers used multiple times but only inside one local region
* exported helpers whose only consumers are near one feature
* utilities in `lib/utils.ts` whose consumers are all in one local region

Does not flag:

* heavy algorithms
* recursive helpers
* helpers used across genuinely separate regions
* expensive computations worth naming
* Effect programs/services/schemas that are intentionally top-level
* test `beforeEach` / setup helpers used across multiple test cases in the same `*.test.*` file

Bad:

```tsx
function getUserLabel(user: User) {
  return user.name ?? user.email
}

function Profile(props: {
  readonly user: User
}) {
  return <span>{getUserLabel(props.user)}</span>
}
```

Good:

```tsx
function Profile(props: {
  readonly user: User
}) {
  return <span>{props.user.name ?? props.user.email}</span>
}
```

Diagnostic message:
`getUserLabel` is a small helper used only near `Profile`. Inline it at the use site or move it directly above the consuming block, then delete the original helper.

Fix instruction:
Inline small expressions. Move medium helpers into or directly above the only local region that uses them. Delete the old declaration. Do not create access aliases during the move.

Severity:
error

Phase:
1

---

## Rule ID:

`no-shared-trivial-predicate-fallback-helper`

Name:
Inline trivial predicates and fallbacks

Root cause:
Mechanical indirection

Intent:
Do not share helpers for equality checks, nullability checks, simple fallbacks, or other cheap expressions.

Detects even when used multiple times:

* equality helpers
* nullability helpers
* fallback helpers
* cheap `&&` / `||` condition helpers
* helpers that only check one or two fields
* helpers that wrap Effect Predicate/String/Array/Record functions without adding semantics

Does not flag:

* expensive computations
* schema/refinement predicates over `unknown`
* domain validation checking multiple fields with real validation semantics
* security/permission policy
* cross-runtime normalization
* predicates intentionally passed as stable callbacks and not trivial

Bad:

```ts
function isPublished(post: Post) {
  return post.status === "published"
}
```

Good:

```tsx
function PostBadge(props: {
  readonly post: Post
}) {
  return props.post.status === "published" ? <PublishedBadge /> : undefined
}
```

Bad:

```ts
function withDefaultName(name: string | undefined) {
  return name ?? "Anonymous"
}
```

Good:

```tsx
function UserName(props: {
  readonly user: User
}) {
  return <span>{props.user.name ?? "Anonymous"}</span>
}
```

Diagnostic message:
`isPublished` only aliases `post.status === "published"`. Inline the equality check at each call site and delete the helper. Do not replace this with a boolean variable.

Fix instruction:
Replace calls with the direct expression. For nullable array filtering, use `Predicate.isNotUndefined`, `Predicate.isNotNull`, or `Predicate.isNotNullish` instead of a project helper. Delete the helper and its tests if they only test the alias.

Severity:
error

Phase:
1

---

## Rule ID:

`no-fake-public-export`

Name:
Export only real API

Root cause:
Fake reuse

Intent:
Do not keep symbols exported merely because they might be useful later.

Detects:

* exported symbols with no real imports in the Bun workspace graph
* exported symbols used only inside the same file
* exported symbols used only by one local feature and not part of a configured public API
* symbols exported only through glob exports but not imported anywhere

Does not flag:

* configured package public API allowlist
* framework-discovered exports
* route handlers
* generated exports
* symbols imported by another workspace package through a real subpath
* test helpers used by multiple `*.test.*` files

Bad:

```ts
export function isPublished(post: Post) {
  return post.status === "published"
}
```

Good:

```tsx
function PostBadge(props: {
  readonly post: Post
}) {
  return props.post.status === "published" ? <PublishedBadge /> : undefined
}
```

Diagnostic message:
`isPublished` is exported but has no real imports in the Bun workspace graph. Inline it or make it private, then delete the export.

Fix instruction:
Remove `export`. If the symbol has one local consumer, inline it. If it has no consumers, delete it. Do not keep a symbol public only because a glob export exposes the file.

Severity:
error

Phase:
1

---

## Rule ID:

`no-react-manual-memoization`

Name:
No React manual memoization

Root cause:
React Compiler conflict / redundant ceremony

Intent:
Let React Compiler handle memoization instead of adding manual memoization constructs.

Detects:

* `useMemo(...)`
* `useCallback(...)`
* `memo(Component)`
* `React.memo(Component)`
* `"use memo"`
* `"use no memo"`

Does not flag:

* explicitly allowlisted migration files with an expiry comment

Bad:

```tsx
const Button = memo(function Button(props: {
  readonly label: string
}) {
  return <button>{props.label}</button>
})
```

Good:

```tsx
function Button(props: {
  readonly label: string
}) {
  return <button>{props.label}</button>
}
```

Bad:

```tsx
function Search(props: {
  readonly query: string
}) {
  const normalized = useMemo(() => String.toLowerCase(props.query), [props.query])

  return <span>{normalized}</span>
}
```

Good:

```tsx
function Search(props: {
  readonly query: string
}) {
  return <span>{String.toLowerCase(props.query)}</span>
}
```

Diagnostic message:
`useMemo` is manual memoization in a React Compiler codebase. Inline the expression or move it into a pure helper only if it has real reuse; do not replace it with another memoization wrapper.

Fix instruction:
Delete `useMemo`, `useCallback`, or `memo`. Inline the expression or function. If computation is truly expensive, require an explicit allowlist for manual memoization.

Severity:
error

Phase:
1

---

## Rule ID:

`no-react-forward-ref`

Name:
No forwardRef

Root cause:
React 19 ref indirection

Intent:
Use React 19 ref-as-prop instead of `forwardRef`.

Detects:

* `forwardRef(...)`
* `React.forwardRef(...)`

Does not flag:

* third-party compatibility wrappers in explicit migration allowlists

Bad:

```tsx
const Input = forwardRef<HTMLInputElement, {
  readonly placeholder?: string
}>(function Input(props, ref) {
  return <input ref={ref} placeholder={props.placeholder} />
})
```

Good:

```tsx
function Input(props: {
  readonly ref?: React.Ref<HTMLInputElement>
  readonly placeholder?: string
}) {
  return <input ref={props.ref} placeholder={props.placeholder} />
}
```

Diagnostic message:
`forwardRef` is unnecessary in React 19. Accept `ref` as a prop, pass `props.ref` to the DOM node, and delete the `forwardRef` wrapper.

Fix instruction:
Remove `forwardRef`. Add `readonly ref?: React.Ref<T>` to the inline props type. Use `props.ref` directly. Do not destructure `ref`.

Severity:
error

Phase:
1

---

## Rule ID:

`no-broad-literal-annotation`

Name:
No broad literal annotation

Root cause:
Type-locality degradation

Intent:
Preserve literal keys, discriminants, tuple lengths, and narrow values by preferring inference, `as const`, and `satisfies`.

Detects:

* `const value: Record<string, T> = literal`
* `const value: T[] = literal`
* `const value: Array<T> = literal`
* `const value: object = literal`
* object literals annotated as broad interfaces when the inferred literal type is more precise

Does not flag:

* mutable `let` variables
* arrays intentionally built up later
* recursive values
* values passed directly to external APIs requiring annotation
* places where `as const satisfies` would not type-check

Bad:

```ts
const routes: Record<string, RouteConfig> = {
  home: { path: "/" },
  settings: { path: "/settings" },
}
```

Good:

```ts
const routes = {
  home: { path: "/" },
  settings: { path: "/settings" },
} as const satisfies Record<string, RouteConfig>
```

Diagnostic message:
The annotation on `routes` widens literal keys such as `"home"` and `"settings"`. Replace the annotation with `as const satisfies Record<string, RouteConfig>` so TypeScript checks the shape while preserving the local literal type.

Fix instruction:
Remove the `: Type` annotation from the literal declaration. Add `as const satisfies Type` after the literal. Re-run type checking and adjust only the properties TypeScript reports.

Severity:
error

Phase:
1

---

## Rule ID:

`no-effect-async-constructor-mismatch`

Name:
Wrong Effect constructor for async work

Root cause:
Effect semantic misuse

Intent:
Ensure Promise-returning or throwing async work is lifted into Effect with the constructor that preserves its semantics.

Detects:

* `Effect.succeed(promise)`
* `Effect.sync(async () => ...)`
* `Effect.try(() => promise)`
* sync Effect constructors receiving thenables
* async callbacks passed to sync Effect constructors

Does not flag:

* code intentionally returning a `Promise` as a plain success value only when the expected success type is explicitly `Promise<T>` and no Effect sequencing is implied

Bad:

```ts
const user = Effect.succeed(fetchUser(id))
```

Good:

```ts
const user = Effect.tryPromise(() => fetchUser(id))
```

Bad:

```ts
const file = Effect.sync(async () => readFile(path))
```

Good:

```ts
const file = Effect.tryPromise(() => readFile(path))
```

Diagnostic message:
This Effect constructor captures a Promise as a success value instead of modeling the async operation. Use `Effect.tryPromise(() => ...)` so the Promise is sequenced by Effect and failures stay in the Effect error channel.

Fix instruction:
Replace `Effect.succeed`, `Effect.sync`, or `Effect.try` with the async Effect constructor. Ensure the callback returns the Promise directly. Map or tag the error if the project uses typed domain errors.

Severity:
error

Phase:
2

---

## Rule ID:

`no-effect-type-erasure`

Name:
Effect type erasure

Root cause:
Type-locality degradation

Intent:
Preserve specific Effect success, error, and dependency types instead of widening them through aliases, annotations, or casts.

Detects:

* `Effect.Effect<User>`
* `Effect.Effect<User, Error>`
* `Effect.Effect<User, unknown, any>`
* project aliases such as `Task<A>`
* casts to broad Effect types
* false `never` requirements/errors
* annotations that erase inferred Effect error or environment types

Does not flag:

* public boundary functions that actually map internal errors to a public error type
* intentionally erased dependencies at a configured runtime boundary
* tests that assert only success after errors have been handled

Bad:

```ts
const program: Effect.Effect<User, Error, never> = pipe(
  getUser(id),
  Effect.flatMap(loadPosts),
)
```

Good:

```ts
const program = pipe(
  getUser(id),
  Effect.flatMap(loadPosts),
)
```

Diagnostic message:
The annotation on `program` widens the inferred Effect error or dependency type. Remove the annotation or write the precise `Effect.Effect<Success, Error, Requirements>` type.

Fix instruction:
Prefer inference. If the symbol is exported and needs an annotation, copy the precise inferred success, error, and requirements types. Do not use broad aliases unless errors are explicitly mapped first.

Severity:
error

Phase:
2

---

## Rule ID:

`no-effect-without-semantics`

Name:
Effect without Effect semantics

Root cause:
Effect ceremony

Intent:
Keep pure synchronous computation as plain TypeScript unless an Effect boundary requires it.

Detects:

* `Effect.Effect<A, never, never>` helpers that only perform pure synchronous transformations
* `Effect.gen` with zero meaningful yielded effects
* `Effect.succeed(value).pipe(Effect.map(...))` for pure local computation
* Effect-returning helpers with no error, dependency, resource, async, concurrency, interruption, retry/schedule, or observability semantics

Does not flag:

* functions implementing a required Effect-returning interface
* code composing into a larger Effect at a boundary
* pure values lifted once at the edge of an existing Effect pipeline
* observability
* retry/scheduling
* interruption
* dependency access
* scoped resources
* typed failure
* async side-effect capture

Bad:

```ts
const normalizeName = Effect.fnUntraced(function* (name: string) {
  return pipe(
    name,
    String.trim,
    String.toLowerCase,
  )
})
```

Good:

```ts
function normalizeName(name: string) {
  return pipe(
    name,
    String.trim,
    String.toLowerCase,
  )
}
```

Diagnostic message:
`normalizeName` returns an Effect but performs only pure synchronous transformations and has no error, dependency, resource, async, concurrency, interruption, retry, schedule, or observability semantics. Make it a plain function and delete the Effect wrapper.

Fix instruction:
Convert yielded/piped pure transformations to normal TypeScript/Effect module expressions. Return the plain value. Lift the result into Effect only at the caller that already requires an Effect.

Severity:
error

Phase:
2

---

## Rule ID:

`no-effect-run-away-from-boundary`

Name:
Effect run outside boundary

Root cause:
Hidden coupling

Intent:
Keep Effect execution at explicit runtime boundaries instead of inside reusable library code.

Detects:

* `Effect.runPromise`
* `Effect.runSync`
* `Effect.runFork`
* imported aliases of Effect run functions
* Effect execution inside reusable helpers

Does not flag:

* configured CLI/server/browser entrypoints
* configured React event/runtime adapters
* individual test bodies
* explicitly configured runtime boundaries

Bad:

```ts
async function getUserName(id: UserId) {
  return Effect.runPromise(getUser(id))
}
```

Good:

```ts
const getUserName = Effect.fnUntraced(function* (id: UserId) {
  return (yield* getUser(id)).name
})
```

Diagnostic message:
`Effect.runPromise` executes an Effect inside reusable code. Return or compose the Effect instead, move `Effect.runPromise` to the configured boundary, and delete the hidden runtime call.

Fix instruction:
Change reusable functions to return or compose the Effect. Replace `await`/`Promise` composition with Effect composition. Move the run call to an entrypoint, event adapter, or test body.

Severity:
error

Phase:
2

---

## Rule ID:

`no-mutation-outside-ref-boundary`

Name:
No mutation outside refs

Root cause:
Imperative state

Intent:
Keep mutation confined to React refs or explicit external adapters.

Detects:

* assignment to non-ref variables after initialization
* property mutation
* index assignment
* mutating array methods
* increment/decrement on non-ref state
* object mutation outside allowlisted builders/adapters

Does not flag:

* `ref.current = ...`
* local mutation inside explicitly allowlisted builders
* external adapter code
* generated code
* tests that mutate local test doubles

Bad:

```ts
props.user.name = "Updated"
```

Good:

```ts
props.onUserChange({
  ...props.user,
  name: "Updated",
})
```

Allowed:

```ts
props.inputRef.current = element
```

Diagnostic message:
This assignment mutates state outside a ref boundary. Replace it with an immutable value update, or confine the mutation to `ref.current` if this is an imperative DOM/ref operation.

Fix instruction:
Replace mutation with immutable construction or Effect/React state update. Keep direct mutation only on `ref.current` or explicitly allowlisted mutable adapters.

Severity:
error

Phase:
2

---

## Rule ID:

`no-equivalent-helper-duplicates`

Name:
Equivalent helper duplicates

Root cause:
Equivalent-pattern drift

Intent:
Prevent multiple project helpers from expressing the same operation under different names.

Detects:

* exported helpers with normalized equivalent bodies
* utility helpers that duplicate Effect module operations
* helpers that duplicate each other under different names
* duplicate boolean/fallback/predicate helpers

Does not flag:

* deliberately duplicated local code inside unrelated features
* tests with local scenario duplication
* generated code
* overloads
* wrappers that add different domain brands, errors, units, telemetry, or policy

Bad:

```ts
function isBlank(value: string) {
  return String.isEmpty(String.trim(value))
}

function isEmptyString(value: string) {
  return String.isEmpty(String.trim(value))
}
```

Good:

```ts
String.isEmpty(String.trim(value))
```

or, when used in a pipeline:

```ts
pipe(
  value,
  String.trim,
  String.isEmpty,
)
```

Diagnostic message:
`isBlank` and `isEmptyString` have equivalent implementations and compatible types. Inline the direct expression or keep one canonical helper only if it has real semantic reuse. Delete the duplicate.

Fix instruction:
Pick the existing canonical operation or inline the expression. Replace the other helper’s references. Delete duplicate exports and tests that only test the duplicate name.

Severity:
error

Phase:
2

---

## Rule ID:

`no-constant-variation-parameter`

Name:
Constant variation parameter

Root cause:
Fake variability

Intent:
Remove options, modes, and branches whose variability is not exercised by real callers.

Detects:

* boolean flags where all callers pass the same value
* option-object properties where all callers pass the same value or omit the property
* string-literal modes with only one used mode
* enum modes with only one used mode
* branches unreachable under all known call sites

Does not flag:

* public APIs
* callbacks exposed to external callers
* framework hooks
* functions called through dynamic references
* test data builders whose options are varied across test cases

Bad:

```ts
function loadUser(id: UserId, options: {
  readonly includePosts: boolean
}) {
  if (options.includePosts) return loadUserWithPosts(id)

  return loadUserOnly(id)
}

loadUser(id, { includePosts: true })
```

Good:

```ts
loadUserWithPosts(id)
```

Diagnostic message:
`loadUser` has option `includePosts`, but every known caller passes `true`. Remove the option, inline the always-used branch, delete the unused branch, and call the concrete operation directly.

Fix instruction:
Inspect all call sites. Replace calls with the branch currently selected. Remove the mode/option parameter and dead branch. Delete tests that only assert unreachable configuration unless the configuration becomes real.

Severity:
error

Phase:
2

---

## Rule ID:

`no-single-use-cross-file-symbol`

Name:
Single-use cross-file symbol

Root cause:
Cross-file locality loss

Intent:
Keep behavior in the file that uses it unless the extracted symbol has independent consumers or public-boundary value.

Detects:

* exported functions used by exactly one non-generated external file
* exported constants used by exactly one non-generated external file
* exported types used by exactly one non-generated external file
* exported fixtures used by exactly one test file
* exported hooks/components/helpers with one real consumer

Does not flag:

* configured public API exports
* framework-discovered exports
* route files
* server entrypoints
* large standalone components
* recursive symbols
* symbols used by two or more independent feature areas
* symbols imported by another workspace package through a real `#` or package subpath

Bad:

```ts
export function formatUserName(user: User) {
  return `${user.firstName} ${user.lastName}`
}
```

Good:

```tsx
function ProfileCard(props: {
  readonly user: User
}) {
  return <span>{`${props.user.firstName} ${props.user.lastName}`}</span>
}
```

Diagnostic message:
`formatUserName` is exported but has only one external consumer. Inline it in the consuming file or move it next to that caller, then delete the exported helper file if it becomes empty.

Fix instruction:
Inline the body at the only call site, or move the symbol into the consuming file as a private local helper if it is too large to inline. Delete the old export and remove stale imports.

Severity:
error

Phase:
2

---

## Rule ID:

`no-single-implementation-abstraction`

Name:
Single-implementation abstraction

Root cause:
Fake variability

Intent:
Prevent interfaces, abstract classes, or service ports that pretend to support substitution when the project has only one implementation and no boundary evidence.

Detects:

* interfaces implemented by exactly one concrete class/object
* abstract classes with exactly one subclass
* object-shape aliases implemented by exactly one concrete provider
* repository/service ports with one implementation and no test/live layer split

Does not flag:

* public plugin APIs
* external protocol contracts
* generated interfaces
* abstractions with a production implementation and a real test/mock implementation
* Effect service tags used through environment requirements with live and test layers
* interfaces consumed by separate deployable packages

Bad:

```ts
interface UserRepository {
  findById(id: UserId): Promise<User | undefined>
}

class PostgresUserRepository implements UserRepository {
  findById(id: UserId) {
    return db.user.findUnique({ where: { id } })
  }
}
```

Good:

```ts
class PostgresUserRepository {
  findById(id: UserId) {
    return db.user.findUnique({ where: { id } })
  }
}
```

Diagnostic message:
`UserRepository` has exactly one implementation, `PostgresUserRepository`, and no configured public or test substitution boundary. Use the concrete type directly and delete the interface.

Fix instruction:
Replace references to the interface with the concrete implementation type. Delete the interface. If substitution is real, add the second implementation or configure the boundary instead of keeping a speculative port.

Severity:
error

Phase:
2

---

## Rule ID:

`no-facade-object`

Name:
Mechanical facade object

Root cause:
Mechanical indirection

Intent:
Prevent namespace/service objects that only group existing functions without owning state or policy.

Detects:

* exported object literals whose members are imported functions
* service objects that only group functions
* static classes that only forward to functions
* namespace-like wrappers with no state, lifecycle, dependency, policy, or protocol role

Does not flag:

* objects with private state
* runtime configuration
* lifecycle/dependency ownership
* protocol implementations
* stable external API role
* mock objects passed directly to a unit under test

Bad:

```ts
import { createUser } from "./create-user"
import { deleteUser } from "./delete-user"

export const UserService = {
  createUser,
  deleteUser,
}
```

Good:

```ts
createUser(input)
deleteUser(id)
```

Diagnostic message:
`UserService` only groups existing functions. Import or call `createUser` and `deleteUser` directly, delete the facade object, and keep a service object only if it owns state, dependencies, lifecycle, or policy.

Fix instruction:
Replace property calls with direct function imports/calls. Delete the facade object and its now-unused imports.

Severity:
error

Phase:
2

---

## Rule ID:

`no-plain-class`

Name:
Ban plain classes

Root cause:
Unnecessary nominal abstraction

Intent:
Allow classes only when they participate in an Effect/schema/error/tag hierarchy or another explicit inheritance boundary.

Detects:

* classes with no `extends`
* service classes with no inheritance
* data classes with no Effect/schema/error/tag base
* static utility classes

Does not flag:

* classes extending `Error`
* classes extending Effect data/tag/error/schema bases
* classes extending framework-required bases in explicit allowlists
* generated classes

Bad:

```ts
class UserService {
  create(input: {
    readonly name: string
    readonly email: string
  }) {
    return createUser(input)
  }
}
```

Good:

```ts
function createUserFromInput(input: {
  readonly name: string
  readonly email: string
}) {
  return createUser(input)
}
```

Diagnostic message:
`UserService` is a class with no `extends` clause. Replace it with functions or data. Keep a class only when it extends an Effect/schema/error/tag/framework base.

Fix instruction:
Convert methods to functions or values. Delete the class. If the class is meant to be an Effect/schema/error/tag type, make the inheritance explicit.

Severity:
error

Phase:
2

---

## Rule ID:

`prefer-composition-over-render-branching`

Name:
Prefer composition over render branching

Root cause:
Heavy component branching

Intent:
Split branch-heavy React components into composable or compound components.

Detects:

* React components with `mode`, `variant`, or `type` props selecting substantially different JSX trees
* components with multiple boolean props controlling large optional regions
* render functions with three or more JSX branches
* components that would be easier to call by composing children/slots

Does not flag:

* small style variants
* simple binary conditional rendering
* `Match` over domain state when branches are small and local
* controlled components where branching is intrinsic to the control

Bad:

```tsx
function Panel(props: {
  readonly mode: "summary" | "details" | "edit"
  readonly post: Post
}) {
  return pipe(
    Match.value(props.mode),
    Match.when("summary", () => <PostSummary post={props.post} />),
    Match.when("details", () => <PostDetails post={props.post} />),
    Match.when("edit", () => <PostEditor post={props.post} />),
    Match.exhaustive,
  )
}
```

Good:

```tsx
function Panel(props: {
  readonly children?: React.ReactNode
}) {
  return <section>{props.children}</section>
}

function PostPanel(props: {
  readonly post: Post
}) {
  return (
    <Panel>
      <PostSummary post={props.post} />
      <PostDetails post={props.post} />
      <PostEditor post={props.post} />
    </Panel>
  )
}
```

Diagnostic message:
`Panel` uses `mode` to choose between separate JSX structures. Split the structures into composable components or compound children, delete the mode prop, and let the caller compose the UI.

Fix instruction:
Extract branch bodies into named components if they are not already components. Replace the variant prop with children, slots, or explicit composed components. Do not introduce local boolean aliases.

Severity:
error

Phase:
3

---

## Rule ID:

`prefer-node-subpath-import`

Name:
Prefer `#` subpath imports

Root cause:
Import-path drift

Intent:
Use Node/Bun package subpath imports that start with `#`.

Detects:

* long relative imports that can be expressed through `package.json#imports`
* monorepo-internal imports that bypass configured `#` aliases
* imports reaching into package internals when a configured subpath exists

Does not flag:

* same-directory sibling imports
* imports not exposed through `#`
* external packages
* generated files
* config files
* imports where the alias would cross a private package boundary incorrectly

Bad:

```ts
import { parseUser } from "../../lib/users/parse-user"
```

Good:

```ts
import { parseUser } from "#lib/users/parse-user"
```

Diagnostic message:
This import can use the configured `#lib/users/parse-user` subpath. Replace the relative path with the `#` import.

Fix instruction:
Resolve the target file through `package.json#imports`, Bun workspace resolution, and TypeScript paths. Replace with the shortest matching `#` subpath. Do not use `@` aliases unless they are actual package names.

Severity:
error

Phase:
3

---

## Rule ID:

`no-single-variant-abstraction`

Name:
Single-variant abstraction

Root cause:
Fake variability

Intent:
Avoid unions, enums, registries, and switches that model future variants that do not exist.

Detects:

* discriminated unions with one member
* enums with one member
* registry objects with one key plus generic lookup logic
* switches over a discriminant that has only one possible current value

Does not flag:

* external protocol mirrors
* generated schemas
* compatibility types matching an external API
* tests intentionally constructing minimal protocol fixtures

Bad:

```ts
type PaymentEvent =
  | { readonly type: "payment.created"; readonly paymentId: string }

function handleEvent(event: PaymentEvent) {
  switch (event.type) {
    case "payment.created":
      return createPayment(event.paymentId)
  }
}
```

Good:

```ts
function handlePaymentCreated(event: {
  readonly paymentId: string
}) {
  return createPayment(event.paymentId)
}
```

Diagnostic message:
`PaymentEvent` has only one variant, so the union and switch add future-facing structure without current behavior. Replace it with the concrete event shape and delete the switch.

Fix instruction:
Rename the single variant to the concrete concept. Inline the only switch branch. Delete unreachable default/exhaustive handling created only for nonexistent variants.

Severity:
error

Phase:
3

---

## Rule ID:

`no-internal-barrel-import`

Name:
Internal barrel import

Root cause:
Hidden coupling

Intent:
Make dependencies point to the file that owns the behavior, not to an internal re-export aggregator.

Detects:

* imports from internal `index.ts`
* imports from internal `barrel.ts`
* imports from re-export-only modules when a direct source module exists

Does not flag:

* external package imports
* configured package root public APIs
* framework-required route/module exports
* generated barrels
* stable test harness entrypoints used by multiple `*.test.*` files

Bad:

```ts
import { formatUserName } from "#users"
```

Good:

```ts
import { formatUserName } from "#users/format-user-name"
```

Diagnostic message:
This import comes through the internal barrel `#users`. Import `formatUserName` from its defining file instead, then delete the barrel export if nothing external uses it.

Fix instruction:
Resolve the exported symbol to its source file. Replace the barrel import with a direct import. Remove unused barrel exports.

Severity:
error

Phase:
3

