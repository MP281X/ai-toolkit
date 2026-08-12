# Effect data

## Boundary schema: type first, decode once

```ts
// BAD: schema.ts
type CreateNote = typeof CreateNote.Type
const CreateNote = Schema.Struct({text: Schema.optional(Schema.Trim)})

// BAD: handlers.ts
create: input => pipe(input, Schema.decodeUnknownEffect(CreateNote), Effect.flatMap(notes.create))

// GOOD: schema.ts
type CreateNote = typeof CreateNote.Type
const CreateNote = Schema.Struct({text: pipe(Schema.Trim, Schema.withDecodingDefault(Effect.succeed('Untitled')))})

// GOOD: handlers.ts
create: input => notes.create(input)
```

```ts
// BAD
const response: Search = JSON.parse(text)

// GOOD
const response = yield * Schema.decodeUnknownEffect(Schema.fromJsonString(Search))(text)
```

## Missing values

```ts
// BAD
function label(value: string | undefined) {
	return Option.match(Option.fromNullishOr(value), {onNone: () => '*', onSome: String.trim})
}

// GOOD
function label(value?: string) {
	return UndefinedOr.match(value, {onUndefined: () => '*', onDefined: String.trim})
}
```

```ts
// BAD
const owner = repository.find(input.id)
if (Option.isNone(owner)) return Option.none()

return permissions.read(owner.value.ownerId)

// GOOD
return pipe(
	repository.find(input.id),
	Option.flatMap(item => permissions.read(item.ownerId))
)
```

## Source

- `.agents/repos/effect/packages/effect/src/Schema.ts`
- `.agents/repos/effect/packages/effect/src/UndefinedOr.ts`
- `.agents/repos/effect/packages/effect/src/Option.ts`
