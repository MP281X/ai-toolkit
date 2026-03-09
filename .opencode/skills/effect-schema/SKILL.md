---
name: effect-schema
description: Load when defining schemas - Classes, TaggedClass, literals, unions, defaults, errors
---

## Source files

```
.opencode/resources/effect/packages/effect/src/Schema.ts
.opencode/resources/effect/migration/schema.md
```


## Classes

```typescript
// Bad - plain interface with no schema
interface Usage {
  input: number
  output: number
}

// Good - Schema.Class creates both schema and constructor
export class Usage extends Schema.Class<Usage>('Usage')({
  input: Schema.Number,
  output: Schema.Number
}) {}
```

```typescript
// Bad - required field where undefined should be valid
export class Event extends Schema.Class<Event>('Event')({
  id: Schema.NonEmptyString,
  kind: Schema.String,     // required, can't be undefined
  data: Schema.String      // required, can't be missing
}) {}

// Good - optional and optionalKey for nullable/absent fields
export class Event extends Schema.Class<Event>('Event')({
  id: Schema.NonEmptyString,
  kind: Schema.optional(Schema.String),    // can be undefined
  data: Schema.optionalKey(Schema.String)  // can be absent
}) {}
```


## Tagged classes

```typescript
// Bad - Schema.Class with a manual _tag field
export class TextDelta extends Schema.Class<TextDelta>('TextDelta')({
  _tag: Schema.Literal('text-delta'),
  messageId: Schema.NonEmptyString,
  text: Schema.String
}) {}

// Good - Schema.TaggedClass adds _tag automatically
export class TextDelta extends Schema.TaggedClass<TextDelta>()('text-delta', {
  messageId: Schema.NonEmptyString,
  text: Schema.String
}) {}
```

```typescript
// Bad - string literal for a non-_tag discriminant
export class ClickEvent extends Schema.Class<ClickEvent>('ClickEvent')({
  type: Schema.Literal('click'),
  x: Schema.Number
}) {}

// Good - Schema.tag for non-_tag discriminant fields
export class ClickEvent extends Schema.Class<ClickEvent>('ClickEvent')({
  type: Schema.tag('click'),
  x: Schema.Number
}) {}
```


## Literals

Use Schema.Literals for fixed-value unions. Always infer the type from the schema — never define the type manually alongside it. Put the type declaration before the schema value.

```typescript
// Bad - manual type defined separately from schema
type Role = 'user' | 'assistant'
const Role = Schema.Literals(['user', 'assistant'])

// Good - infer type from schema, type declaration comes first
type Role = typeof Role.Type
const Role = Schema.Literals(['user', 'assistant'])
```


## Unions

Use Schema.Union for discriminated unions combining tagged classes, regular classes, or literals.

```typescript
// Bad - plain TypeScript union with no schema
type Part = TextPart | FilePart | ToolPart | ErrorPart

// Good - Schema.Union for a validated schema union
type Part = typeof Part.Type
const Part = Schema.Union([TextPart, FilePart, ToolPart, ErrorPart])
```


## Constructor defaults

Use Schema.withConstructorDefault to provide default values in constructors. The callback must return Option.some(value).

```typescript
// Bad - required fields that callers must always provide
export class Message extends Schema.Class<Message>('Message')({
  id: Schema.NonEmptyString,
  createdAt: Schema.Number,
  role: Role,
  parts: Schema.Array(Part)
}) {}

// Good - Schema.withConstructorDefault for fields with sensible defaults
export class Message extends Schema.Class<Message>('Message')({
  id: Schema.NonEmptyString.pipe(
    Schema.withConstructorDefault(() => Option.some(crypto.randomUUID()))
  ),
  createdAt: Schema.Number.pipe(
    Schema.withConstructorDefault(() => Option.some(Date.now()))
  ),
  role: Role,
  parts: Schema.Array(Part).pipe(
    Schema.withConstructorDefault(() => Option.some([] as const))
  )
}) {}
```

## Internal construction

For Schema.Class and Schema.TaggedClass, use `new` for trusted internal construction. This bypasses validation for known-good data.

```typescript
// Bad - Schema.decode for internally constructed data
const event = yield* Schema.decodeUnknown(TextDelta)({
  messageId: '123',
  text: 'hello'
})

// Good - new for internal construction of known-good data
const event = new TextDelta({
  messageId: '123',
  text: 'hello'
})
```

```typescript
// Bad - Option wrapper when a direct API exists
const decoded = Option.getOrUndefined(Schema.decodeUnknownOption(MySchema)(value))

// Good - direct Exit API
const exit = Schema.decodeUnknownExit(MySchema)(value)
const decoded = Exit.isSuccess(exit) ? exit.value : undefined
```


## Field reuse

Spread .fields to compose schemas. Do not introduce wrappers or inheritance helpers just to reuse a few fields.

```typescript
// Bad - inheritance helper just to share fields
class BaseEntity extends Schema.Class<BaseEntity>('BaseEntity')({
  createdAt: Schema.Number,
  updatedAt: Schema.Number
}) {}
class User extends BaseEntity { ... } // Wrong pattern

// Good - spread .fields for composition
export class Timestamped extends Schema.Class<Timestamped>('Timestamped')({
  createdAt: Schema.Number,
  updatedAt: Schema.Number
}) {}

export class User extends Schema.Class<User>('User')({
  ...Timestamped.fields,
  name: Schema.NonEmptyString
}) {}
```


## Type inference

Always infer types from schemas. Never define types manually alongside schemas.

For `Schema.Class` and `Schema.TaggedClass`, use the class itself as the type — no separate type alias needed.

For every non-class schema value, always export the inferred type with the same name, declared before the schema value.

```typescript
// Bad - manual type defined alongside a Class
type Usage = {input: number; output: number}
class Usage extends Schema.Class<Usage>('Usage')({...}) {}

// Bad - missing type export for a non-class schema
export const ModelSelection = Schema.Struct({
  agent: AgentId,
  provider: ProviderId,
  model: ModelId
})

// Good - Class provides its own type automatically
export class Usage extends Schema.Class<Usage>('Usage')({
  input: Schema.Number,
  output: Schema.Number
}) {}

// Good - export matching type for non-class schemas, type first
export type ModelSelection = typeof ModelSelection.Type
export const ModelSelection = Schema.Struct({
  agent: AgentId,
  provider: ProviderId,
  model: ModelId
})
```
