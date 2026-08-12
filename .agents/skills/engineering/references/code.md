# Code

## Review-local dataflow

```ts
// BAD
const user = input.session.user
const id = user.id
const result = load(id)

return result

// GOOD
return load(input.session.user.id)
```

## Meaningful reused computation

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

## Inferred types

```ts
// BAD
const [target, setTarget] = useState<ReviewTarget>(ReviewTarget.make({}))

// GOOD
const [target, setTarget] = useState(ReviewTarget.make({}))
```

Name types only for schema pairs, public boundaries, recursive structures, or large independently shared shapes.

## Module scope

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

Module scope owns stable identity or lifecycle: schema, service, component, Atom, cache, `RcMap`, `LayerMap`, or reused expensive computation.

## Immutable ownership

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

Arguments, returned values, service values, and exposed refs remain immutable outside their owning Effect implementation.
