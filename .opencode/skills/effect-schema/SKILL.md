---
name: effect-schema
description: Schema definitions and type modeling
metadata:
  patterns: Schema.Class, TaggedClass, TaggedErrorClass, literals, unions, defaults
---

## Source files

```
.opencode/resources/effect/packages/effect/src/Schema.ts
.opencode/resources/effect/migration/schema.md
```


## Classes

Use Schema.Class instead of interfaces.

```typescript
// Bad
interface Usage { input: number; output: number }

// Good
export class Usage extends Schema.Class<Usage>('Usage')({
  input: Schema.Number,
  output: Schema.Number
}) {}
```

Use Schema.optional and Schema.optionalKey for nullable/absent fields:

```typescript
// Bad
export class Event extends Schema.Class<Event>('Event')({
  id: Schema.NonEmptyString,
  data: Schema.String
}) {}

// Good
export class Event extends Schema.Class<Event>('Event')({
  id: Schema.NonEmptyString,
  kind: Schema.optional(Schema.String),
  data: Schema.optionalKey(Schema.String)
}) {}
```


## Tagged classes

Use Schema.TaggedClass for _tag fields.

```typescript
// Bad
export class TextDelta extends Schema.Class<TextDelta>('TextDelta')({
  _tag: Schema.Literal('text-delta'),
  text: Schema.String
}) {}

// Good
export class TextDelta extends Schema.TaggedClass<TextDelta>()('text-delta', {
  text: Schema.String
}) {}
```

Use Schema.tag for non-_tag discriminant fields:

```typescript
// Bad
export class ClickEvent extends Schema.Class<ClickEvent>('ClickEvent')({
  type: Schema.Literal('click'),
  x: Schema.Number
}) {}

// Good
export class ClickEvent extends Schema.Class<ClickEvent>('ClickEvent')({
  type: Schema.tag('click'),
  x: Schema.Number
}) {}
```


## Literals

Use Schema.Literals for fixed-value unions.

```typescript
// Bad
type Role = 'user' | 'assistant'
const Role = Schema.Literals(['user', 'assistant'])

// Good
type Role = typeof Role.Type
const Role = Schema.Literals(['user', 'assistant'])
```


## Unions

Use Schema.Union for discriminated unions.

```typescript
// Bad
type Part = TextPart | FilePart | ToolPart

// Good
type Part = typeof Part.Type
const Part = Schema.Union([TextPart, FilePart, ToolPart])
```


## Constructor defaults

Use Schema.withConstructorDefault for default fields.

```typescript
// Bad
export class Message extends Schema.Class<Message>('Message')({
  id: Schema.NonEmptyString,
  createdAt: Schema.Number,
  parts: Schema.Array(Part)
}) {}

// Good
export class Message extends Schema.Class<Message>('Message')({
  id: Schema.NonEmptyString.pipe(
    Schema.withConstructorDefault(() => Option.some(crypto.randomUUID()))
  ),
  createdAt: Schema.Number.pipe(
    Schema.withConstructorDefault(() => Option.some(Date.now()))
  ),
  parts: Schema.Array(Part).pipe(
    Schema.withConstructorDefault(() => Option.some([] as const))
  )
}) {}
```


## Internal construction

Use `new` for trusted internal construction.

```typescript
// Bad
const event = yield* Schema.decodeUnknown(TextDelta)({messageId: '123', text: 'hello'})

// Good
const event = new TextDelta({messageId: '123', text: 'hello'})
```

Use Schema.decodeUnknownSync for trusted data and fail fast:

```typescript
// Bad - soft-failing decode
const exit = Schema.decodeUnknownExit(MySchema)(value)
if (Exit.isFailure(exit)) return

// Good - fail fast
const decoded = Schema.decodeUnknownSync(MySchema)(value)
```


## JSON Schema

Derive JSON Schema from Schema definitions.

```typescript
// Bad - manual JSON schema
tool({
  inputSchema: jsonSchema({
    type: 'object',
    properties: {query: {type: 'string'}},
    required: ['query']
  })
})

// Good - derive from schema
tool({
  inputSchema: jsonSchema(Schema.toJsonSchemaDocument(SearchQuery.fields))
})
```


## Field reuse

Inline small schemas. Use `.fields` only for clear reuse.

```typescript
// Bad - extracted literal with no reuse benefit
export type ToolName = typeof ToolName.Type
export const ToolName = Schema.Literals(['question', 'websearch'])

// Good - inline
role: Schema.Literals(['user', 'assistant'])

// Good - use .fields when reusing
Schema.decodeUnknownSync(QuestionTool.fields.input)(value)
```

Spread `.fields` for composition. No inheritance helpers.

```typescript
// Bad - inheritance helper
class BaseEntity extends Schema.Class<BaseEntity>('BaseEntity')({
  createdAt: Schema.Number
}) {}
class User extends BaseEntity { ... }

// Good - spread .fields
export class Timestamped extends Schema.Class<Timestamped>('Timestamped')({
  createdAt: Schema.Number
}) {}

export class User extends Schema.Class<User>('User')({
  ...Timestamped.fields,
  name: Schema.NonEmptyString
}) {}
```


## Type inference

Always infer types from schemas.

```typescript
// Bad - manual type
type Usage = {input: number; output: number}
class Usage extends Schema.Class<Usage>('Usage')({...}) {}

// Bad - missing type export
export const Config = Schema.Struct({agent: AgentId})

// Good - Class provides type
export class Usage extends Schema.Class<Usage>('Usage')({
  input: Schema.Number,
  output: Schema.Number
}) {}

// Good - export type for non-class schemas
type Config = typeof Config.Type
export const Config = Schema.Struct({agent: AgentId})
```
