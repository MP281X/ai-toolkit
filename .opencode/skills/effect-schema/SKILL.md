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
interface User { name: string; age: number }

// Good
export class User extends Schema.Class<User>('User')({
  name: Schema.String,
  age: Schema.Number
}) {}
```

Use Schema.optional for nullable fields:

```typescript
// Bad
export class Event extends Schema.Class<Event>('Event')({
  id: Schema.String,
  data: Schema.String
}) {}

// Good
export class Event extends Schema.Class<Event>('Event')({
  id: Schema.String,
  data: Schema.optional(Schema.String)
}) {}
```


## Tagged classes

Use Schema.TaggedClass for _tag fields.

```typescript
// Bad
export class TextDelta extends Schema.Class<TextDelta>('TextDelta')({
  _tag: Schema.Literal('text'),
  text: Schema.String
}) {}

// Good
export class TextDelta extends Schema.TaggedClass<TextDelta>()('text', {
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
type Role = 'user' | 'admin'
const Role = Schema.Literal('user', 'admin')

// Good
type Role = typeof Role.Type
const Role = Schema.Literal('user', 'admin')
```


## Unions

Use Schema.Union for discriminated unions.

```typescript
// Bad
type Part = TextPart | FilePart

// Good
type Part = typeof Part.Type
const Part = Schema.Union(TextPart, FilePart)
```


## Constructor defaults

Use Schema.withConstructorDefault for default fields.

```typescript
// Bad
export class Item extends Schema.Class<Item>('Item')({
  id: Schema.String,
  createdAt: Schema.Number
}) {}

// Good
export class Item extends Schema.Class<Item>('Item')({
  id: Schema.String.pipe(
    Schema.withConstructorDefault(() => 'default-id')
  ),
  createdAt: Schema.Number.pipe(
    Schema.withConstructorDefault(() => Date.now())
  )
}) {}
```


## Internal construction

Use `new` for trusted internal construction.

```typescript
// Bad
const event = yield* Schema.decodeUnknown(Event)({id: '123'})

// Good
const event = new Event({id: '123'})
```

Use Schema.decodeUnknownSync for trusted data:

```typescript
// Bad - soft-failing decode
const exit = Schema.decodeUnknownExit(Schema)(value)
if (Exit.isFailure(exit)) return

// Good - fail fast
const decoded = Schema.decodeUnknownSync(Schema)(value)
```


## Field reuse

Inline small schemas. Use `.fields` only for clear reuse.

```typescript
// Bad - extracted with no reuse
export const Status = Schema.Literal('active', 'inactive')

// Good - inline
status: Schema.Literal('active', 'inactive')

// Good - use .fields when reusing
Schema.decodeUnknownSync(User.fields.name)(value)
```

Spread `.fields` for composition. No inheritance helpers.

```typescript
// Bad - inheritance helper
class Base extends Schema.Class<Base>('Base')({createdAt: Schema.Number}) {}
class User extends Base { ... }

// Good - spread .fields
export class Timestamped extends Schema.Class<Timestamped>('Timestamped')({
  createdAt: Schema.Number
}) {}

export class User extends Schema.Class<User>('User')({
  ...Timestamped.fields,
  name: Schema.String
}) {}
```


## Type inference

Always infer types from schemas.

```typescript
// Bad - manual type
type User = {name: string}
class User extends Schema.Class<User>('User')({...}) {}

// Good - Class provides type
export class User extends Schema.Class<User>('User')({
  name: Schema.String
}) {}

// Good - export type for Struct
type Config = typeof Config.Type
export const Config = Schema.Struct({key: Schema.String})
```
