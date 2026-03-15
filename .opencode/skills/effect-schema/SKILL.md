---
name: effect-schema
description: Schema definitions and type modeling
metadata:
  patterns: Schema.Class, Struct, TaggedClass, TaggedErrorClass, literals, unions
---

## Source files

```
.opencode/resources/effect/packages/effect/src/Schema.ts
.opencode/resources/effect/migration/schema.md
```

## Purpose

- Prefer schemas over manual TypeScript types
- Use `Schema.Class` for modeled values and `Schema.Struct` for nested object fields or composition
- Keep the schema as the single source of truth and derive types from it
- Research the local source files above before using advanced schema capabilities

## Modeled values

- Prefer `Schema.Class` for modeled values

```typescript
// Bad
type User = {name: string}

// Good
export class User extends Schema.Class<User>('User')({
  name: Schema.String
}) {}
```

## Nested objects

- Use `Schema.Struct` for nested object fields or composition

```typescript
// Good
export class User extends Schema.Class<User>('User')({
  name: Schema.String,
  profile: Schema.Struct({bio: Schema.optional(Schema.String)})
}) {}
```

## Construction boundary

- Use `new` for trusted internal construction
- Decode only real unknown boundary data

```typescript
// Bad
const user = Schema.decodeUnknownSync(User)(value)

// Good
const user = new User({name: 'Ada'})
```

## Composition

- Keep schema composition simple; use `.fields` when there is clear reuse

```typescript
// Good
export class Timestamped extends Schema.Class<Timestamped>('Timestamped')({
  createdAt: Schema.Number
}) {}

export class UserWithTimestamp extends Schema.Class<UserWithTimestamp>('UserWithTimestamp')({
  ...Timestamped.fields,
  name: Schema.String
}) {}
```
