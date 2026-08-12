# React and Effect Atom

| State                                      | Owner                  |
| ------------------------------------------ | ---------------------- |
| Shareable or restorable view               | TanStack Router search |
| Cross-component, async, derived, real-time | Effect Atom            |
| Backend operation and stream               | Effect RPC             |
| Ephemeral DOM handle                       | React                  |

## Real-time vertical slice

```ts
// BAD: component.tsx
function Items() {
	const [items, setItems] = useState<Item[]>([])

	useEffect(() => {
		const close = subscribe(next => setItems(next))
		return close
	}, [])

	return items.map(item => <ItemRow key={item.id} item={item} />)
}

// GOOD: contracts.ts
Rpc.make('items.changes', {
	stream: true,
	success: Schema.Array(Item)
})

// GOOD: handlers.ts
'items.changes': () => SubscriptionRef.changes(items.state)

// GOOD: atoms.ts
export const itemsAtom = Atom.keepAlive(
	RpcClient.runtime.atom(
		Stream.unwrap(
			RpcClient.useSync(client => client('items.changes', undefined))
		)
	)
)

// GOOD: component.tsx
function Items() {
	const items = useAtomSuspense(itemsAtom).value

	return Array.map(items, item => <ItemRow key={item.id} item={item} />)
}
```

## Presentation action

```tsx
// BAD
const saveAtom = RpcClient.mutation('item.save')

function SaveButton(props: {item: Item}) {
	const save = useAtomSet(saveAtom, {mode: 'promise'})
	return <Button onClick={() => void save({payload: props.item})}>Save</Button>
}

// GOOD
function SaveButton(props: {item: Item}) {
	const [result, save] = useAtom(RpcClient.mutation('item.save'))

	return (
		<>
			<Button aria-label="Save" disabled={AsyncResult.isWaiting(result)} onClick={() => save({payload: props.item})}>
				<SaveIcon />
			</Button>
			{AsyncResult.isFailure(result) && <p role="alert">{Cause.pretty(result.cause)}</p>}
		</>
	)
}
```

## Stable family identity

```ts
// BAD
const itemAtom = Atom.family((key: string) => RpcClient.query('item', {key}))
const item = itemAtom(`${workspaceId}:${itemId}`)

// GOOD
type ItemKey = typeof ItemKey.Type
const ItemKey = Schema.Struct({itemId: Schema.String, workspaceId: Schema.String})

const itemAtom = Atom.family((key: ItemKey) => RpcClient.query('item', key))
const item = itemAtom(ItemKey.make({itemId, workspaceId}))
```

## Derived state

```ts
// BAD
function Items() {
	const items = useAtomSuspense(itemsAtom).value
	const visible = items.filter(item => item.visible)

	return visible.map(item => <ItemRow key={item.id} item={item} />)
}

// GOOD
const visibleItemsAtom = Atom.mapResult(
	itemsAtom,
	Array.filter(item => item.visible)
)

function Items() {
	const items = useAtomSuspense(visibleItemsAtom).value

	return Array.map(items, item => <ItemRow key={item.id} item={item} />)
}
```

## Material optimism

```ts
// BAD: infrequent background action
const refreshAtom = Atom.optimisticFn(Atom.optimistic(statusAtom), {
	fn: RpcClient.mutation('status.refresh'),
	reducer: () => 'refreshing'
})

// GOOD: immediate editable interaction
const saveItemAtom = Atom.family((id: string) =>
	Atom.optimisticFn(Atom.optimistic(RpcClient.query('item', {id})), {
		fn: RpcClient.mutation('item.save'),
		reducer: (result, input) => AsyncResult.map(result, item => Item.update(item, input.payload))
	})
)
```

## Placement

| Value                                            | Scope                      |
| ------------------------------------------------ | -------------------------- |
| Direct RPC query or mutation                     | component consumption site |
| Shared Atom, derived graph, family, subscription | module                     |
| DOM ref or browser synchronization               | component                  |

Suspense and error boundaries own async presentation. React APIs with native `null` emptiness use their implicit form.

```tsx
// BAD
const inputRef = useRef<HTMLInputElement | null>(null)

// GOOD
const inputRef = useRef<HTMLInputElement>(null)
```

## Synchronous React boundary

```tsx
// BAD
const random = Random.Random.defaultValue()

function Sparkle() {
	const [angle] = useState(() => random.nextDoubleUnsafe())
	return <span style={{rotate: `${angle}turn`}} />
}

// GOOD
function Sparkle() {
	const [angle] = useState(() => Random.Random.defaultValue().nextDoubleUnsafe())
	return <span style={{rotate: `${angle}turn`}} />
}
```

## Source

| API                                | Import                       |
| ---------------------------------- | ---------------------------- |
| `Atom` · `AsyncResult` · `AtomRpc` | `effect/unstable/reactivity` |
| `Rpc` · `RpcGroup`                 | `effect/unstable/rpc`        |
| React Atom hooks                   | `@effect/atom-react`         |

- `.agents/repos/effect/packages/effect/src/unstable/reactivity/Atom.ts`
- `.agents/repos/effect/packages/effect/src/unstable/reactivity/AtomRpc.ts`
- `.agents/repos/effect/packages/effect/src/unstable/reactivity/AsyncResult.ts`
- `.agents/repos/effect/packages/atom/react/src/Hooks.ts`
- `.agents/repos/react/packages/react/src/ReactHooks.js`
- `.agents/repos/react/compiler`
- `.agents/repos/tanstack-router/packages/router-core/src`
