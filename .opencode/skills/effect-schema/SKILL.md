---
name: effect-schema
description: Effect Schema v4 patterns - Classes, TaggedClass, literals, unions, constructor defaults, error classes
---

## Source files

```
.opencode/resources/effect/packages/effect/src/Schema.ts
.opencode/resources/effect/migration/schema.md
```


## Overview

Prefer Schema.Class and Schema.TaggedClass for application data. These provide constructors, type inference, and runtime validation in one definition.

Use Schema.Struct only when a plain schema value is better for transforms or low-level composition.


## Classes

Define data models using Schema.Class. This creates both a schema and a constructor.


### DO: Define simple classes

```typescript
export class Usage extends Schema.Class<Usage>('Usage')({
  input: Schema.Number,
  output: Schema.Number
}) {}
```

Optional fields can be undefined or absent. Use Schema.optional for fields that can be undefined. Use Schema.optionalKey for fields that can be absent.


### DO: Define classes with optional fields

```typescript
export class Event extends Schema.Class<Event>('Event')({
  id: Schema.NonEmptyString,
  kind: Schema.optional(Schema.String),
  data: Schema.optionalKey(Schema.String)
}) {}
```


## Tagged classes

Use Schema.TaggedClass for discriminated data with a _tag field. This is the standard way to define ADTs in Effect.


### DO: Define tagged classes

```typescript
export class TextDelta extends Schema.TaggedClass<TextDelta>()('text-delta', {
  messageId: Schema.NonEmptyString,
  text: Schema.String
}) {}
```

If the discriminant field is not _tag, use Schema.tag explicitly.


### DO: Use custom discriminant fields

```typescript
export class ClickEvent extends Schema.Class<ClickEvent>('ClickEvent')({
  type: Schema.tag('click'),
  x: Schema.Number
}) {}
```


## Literals

Use Schema.Literals for fixed-value unions like enums or status values.

Always infer the type from the schema. Do not define the type manually alongside the schema.


### DO: Define literal unions with inferred types

```typescript
type Role = typeof Role.Type
const Role = Schema.Literals(['user', 'assistant'])
```


### DON'T: Define types manually

```typescript
// Bad
type Role = 'user' | 'assistant'
const Role = Schema.Literals(['user', 'assistant'])

// Good
type Role = typeof Role.Type
const Role = Schema.Literals(['user', 'assistant'])
```

Put the type declaration before the schema value.


## Unions

Use Schema.Union for discriminated unions. Combine tagged classes, regular classes, or literals.


### DO: Define unions

```typescript
type Part = typeof Part.Type
const Part = Schema.Union([TextPart, FilePart, ToolPart, ErrorPart])
```


## Constructor defaults

Use Schema.withConstructorDefault to provide default values for constructors. The callback must return Option.some(value).


### DO: Provide constructor defaults

```typescript
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

Option.some(...) is required by the Schema API here. This is the only place where creating Option values is expected.


## Internal construction

For Schema.Class and Schema.TaggedClass, prefer using new for trusted internal construction. This bypasses validation for known-good data.


### DO: Use new for internal construction

```typescript
const event = new TextDelta({
  messageId: '123',
  text: 'hello'
})
```

Keep decode and encode functions for external boundaries and real transformations where validation matters.

Use makeUnsafe only for non-class schemas that intentionally stay as schema values.


## Domain errors

Use Schema.TaggedErrorClass for service-level errors. Define one error type per service.


### DO: Define error classes

```typescript
export class GitError extends Schema.TaggedErrorClass<GitError>()('GitError', {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.optional(Schema.NonEmptyString)
}) {}
```

Errors are yieldable. Use them directly in effects.


### DO: Yield error classes

```typescript
yield* new GitError({message: 'failed'})
```


## Field reuse

Spread .fields to compose schemas. Do not introduce wrappers or inheritance helpers just to reuse a few fields.


### DO: Spread fields for composition

```typescript
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


### DON'T: Define types manually

```typescript
// Bad
type Usage = { input: number; output: number }
const Usage = Schema.Class<Usage>('Usage')({
  input: Schema.Number,
  output: Schema.Number
})

// Good
export class Usage extends Schema.Class<Usage>('Usage')({
  input: Schema.Number,
  output: Schema.Number
}) {}

// Type is automatically available as Usage.Type
```
