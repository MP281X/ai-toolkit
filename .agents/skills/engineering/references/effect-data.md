# Effect data

## RPC boundary

```ts
// BAD: contracts.ts
type CreateItem = typeof CreateItem.Type
const CreateItem = Schema.Struct({label: Schema.optional(Schema.Trim)})

// BAD: handlers.ts
create: input => pipe(input, Schema.decodeUnknownEffect(CreateItem), Effect.flatMap(items.create))

// GOOD: contracts.ts
type CreateItem = typeof CreateItem.Type
const CreateItem = Schema.Struct({
	label: pipe(Schema.Trim, Schema.optional, Schema.withDecodingDefault(Effect.succeed('Untitled')))
})

// GOOD: handlers.ts
create: input => items.create(input)
```

## External unknown boundary

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

## Filter and order

```ts
// BAD
const active = input.users.filter(user => user.active).sort((left, right) => left.name.localeCompare(right.name))

// GOOD
const active = pipe(
	input.users,
	Array.filter(user => user.active),
	Array.sortWith(user => user.name, Order.String)
)
```

## Source

- `.agents/repos/effect/packages/effect/src/Schema.ts`
- `.agents/repos/effect/packages/effect/src/UndefinedOr.ts`
- `.agents/repos/effect/packages/effect/src/Option.ts`
- `.agents/repos/effect/packages/effect/src/Filter.ts`
- `.agents/repos/effect/packages/effect/src/Order.ts`
