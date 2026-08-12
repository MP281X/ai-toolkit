# Code

## Narrowest owner

```ts
// BAD
const user = input.session.user
const id = user.id
const result = load(id)

return result

// GOOD
return load(input.session.user.id)
```

## Standalone composition

```ts
// BAD
const CreateNote = Schema.String.pipe(Schema.withDecodingDefault(Effect.succeed('Untitled')))

// GOOD
const CreateNote = pipe(Schema.String, Schema.withDecodingDefault(Effect.succeed('Untitled')))
```

## Evaluate reused effects once

```ts
// BAD
return Effect.all({
	audit: audit(yield * authorize(input.session.user.id)),
	view: render(yield * authorize(input.session.user.id))
})

// GOOD
const permissions = yield * authorize(input.session.user.id)

return Effect.all({audit: audit(permissions), view: render(permissions)})
```

## Intact objects

```tsx
// BAD
function Row({item: {id, title}}: {item: Item}) {
	return <ItemView id={id} title={title} />
}

// GOOD
function Row(props: {item: Item}) {
	return <ItemView id={props.item.id} title={props.item.title} />
}
```

Tuple and array destructuring remain canonical.

```ts
// BAD
const state = useState(initial)
const value = state[0]
const setValue = state[1]

// GOOD
const [value, setValue] = useState(initial)
```

## Inference

```ts
// BAD
const [target, setTarget] = useState<ReviewTarget>(ReviewTarget.make({}))

// GOOD
const [target, setTarget] = useState(ReviewTarget.make({}))
```

Annotate only schema pairs, public boundaries, recursive structures, or independently shared large shapes.

```ts
// BAD
const normalize = flow(String.trim, String.toLowerCase)

export function Label(props: {value: string}) {
	return <span>{normalize(props.value)}</span>
}

// GOOD
export function Label(props: {value: string}) {
	return <span>{pipe(props.value, String.trim, String.toLowerCase)}</span>
}
```

Module scope owns reuse, public boundaries, recursive or shared shapes, expensive shared computation, identity, or lifecycle: schema, service, component, Atom, cache, `RcMap`, `LayerMap`.

## Direct names

```ts
// BAD
import {Status as StatusSchema} from './schema.ts'

type StatusValue = typeof StatusSchema.Type

// GOOD
import {Status} from './schema.ts'

function render(status: Status) {
	return status
}
```

Name distinct owners to avoid import, type, property-access, or binding aliases. Schema pairs are the only mandatory same-name type declarations.

## Immutable ownership

Immutability is behavior; omit `readonly` syntax.

```ts
// BAD
function normalize(input: Item[]) {
	input.sort((left, right) => left.rank - right.rank)
	return input
}

// GOOD
function normalize(input: Item[]) {
	return Array.sortWith(input, item => item.rank, Order.Number)
}
```

Arguments, returned values, and service values remain immutable outside their owner.
