# React and Effect Atom

| State                                         | Owner                  |
| --------------------------------------------- | ---------------------- |
| Shareable or restorable view                  | TanStack Router search |
| Cross-component, async, derived, or real-time | Effect Atom            |
| Backend operation and stream                  | Effect RPC             |
| Ephemeral DOM handle                          | React                  |

## Real-time vertical slice

```ts
// BAD: component.tsx
function NotesList() {
	const [notes, setNotes] = useState<Note[]>([])

	useEffect(() => {
		const close = subscribe(next => setNotes(next))
		return close
	}, [])

	return Array.map(notes, note => <NoteRow key={note.id} note={note} />)
}

// GOOD: apps/<app>/src/rpcs/contracts.ts
export class NotesRpcs extends RpcGroup.make(
	Rpc.make('notes.changes', {
		stream: true,
		success: Schema.Array(Note)
	}),
	Rpc.make('notes.create', {
		payload: CreateNote,
		success: Note
	})
) {}

// GOOD: handlers.ts
export const NotesRpcsLayer = NotesRpcs.toLayer(
	Effect.gen(function* () {
		const notes = yield* Notes

		return NotesRpcs.of({
			'notes.changes': () => SubscriptionRef.changes(notes.state),
			'notes.create': input => notes.create(input)
		})
	})
)

// GOOD: apps/<app>/src/lib/state.ts
export const notesAtom = Atom.keepAlive(
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('notes.changes', undefined)),
			Stream.unwrap
		)
	)
)

// GOOD: apps/<app>/src/routes/notes.tsx
function NotesList() {
	const notes = useAtomSuspense(notesAtom).value

	return Array.map(notes, note => <NoteRow key={note.id} note={note} />)
}
```

`RpcClient` is the existing `AtomRpc.Service` from `apps/<app>/src/lib/atomRuntime.ts`. Feature code never declares another client service or transport Layer.

```ts
// BAD: pull-oriented stream batches require explicit writes
const notesAtom = RpcClient.query('notes.changes', undefined)

// GOOD: latest authoritative emission stays synchronized
const notesAtom = Atom.keepAlive(
	RpcClient.runtime.atom(
		pipe(
			RpcClient,
			Effect.map(client => client('notes.changes', undefined)),
			Stream.unwrap
		)
	)
)
```

## Presentation action

```tsx
// BAD
const createNoteAtom = RpcClient.mutation('notes.create')

function CreateNoteForm() {
	const [result, create] = useAtom(createNoteAtom)
	return (
		<Button disabled={AsyncResult.isWaiting(result)} onClick={() => create({payload: {text: 'Note'}})}>
			Create
		</Button>
	)
}

// GOOD
function CreateNoteForm() {
	const [result, create] = useAtom(RpcClient.mutation('notes.create'))

	return (
		<>
			<Button disabled={AsyncResult.isWaiting(result)} onClick={() => create({payload: {text: 'Note'}})}>
				Create
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
const item = itemAtom({itemId, workspaceId})
```

## Derived state

```ts
// BAD
function Items() {
	const items = useAtomSuspense(itemsAtom).value
	const visible = Array.filter(items, item => item.visible)

	return Array.map(visible, item => <ItemRow key={item.id} item={item} />)
}

// GOOD
const visibleItemsAtom = Atom.mapResult(
	itemsAtom,
	Array.filter(Struct.get('visible'))
)

function Items() {
	const items = useAtomSuspense(visibleItemsAtom).value

	return Array.map(items, item => <ItemRow key={item.id} item={item} />)
}
```

## Placement

| Value                                            | Scope                      |
| ------------------------------------------------ | -------------------------- |
| Direct RPC query or mutation                     | component consumption site |
| Shared Atom, derived graph, family, subscription | module                     |
| DOM ref or browser synchronization               | component                  |

Presentation components read Atom state, render, and dispatch writes. DOM-local input state remains in React. Queries and streams render through Suspense/error boundaries; mutations expose pending failure at the launcher. React APIs with native `null` emptiness use their implicit form.

```tsx
// BAD
const inputRef = useRef<HTMLInputElement | null>(null)

// GOOD
const inputRef = useRef<HTMLInputElement>(null)
```

## Pure render

```tsx
// BAD
function Sparkle(props: {random: Random.Random}) {
	const [angle] = useState(() => props.random.nextDoubleUnsafe())
	return <span style={{rotate: `${angle}turn`}} />
}

// GOOD
function Sparkle(props: {angle: number}) {
	return <span style={{rotate: `${props.angle}turn`}} />
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
- `.agents/repos/effect/packages/effect/src/unstable/reactivity/AtomRegistry.ts`
- `.agents/repos/effect/packages/effect/src/unstable/reactivity/Reactivity.ts`
- `.agents/repos/effect/packages/effect/src/unstable/reactivity/Hydration.ts`
- `.agents/repos/effect/packages/effect/src/unstable/rpc/Rpc.ts`
- `.agents/repos/effect/packages/effect/src/unstable/rpc/RpcGroup.ts`
- `.agents/repos/effect/packages/effect/src/unstable/rpc/RpcClient.ts`
- `.agents/repos/effect/packages/effect/src/unstable/rpc/RpcServer.ts`
- `.agents/repos/effect/packages/effect/src/unstable/rpc/RpcSchema.ts`
- `.agents/repos/effect/packages/atom/react/src/Hooks.ts`
- `.agents/repos/react/packages/react/src/ReactHooks.js`
- `.agents/repos/react/compiler`
- `.agents/repos/tanstack-router/packages/router-core/src`
