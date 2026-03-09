---
name: effect-atom
description: Load for React components using Effect Atom - atoms, subscriptions, mutations, hooks
---

## Source files

```
.opencode/resources/effect/packages/effect/src/unstable/reactivity/Atom.ts
.opencode/resources/effect/packages/effect/src/unstable/reactivity/AtomRpc.ts
.opencode/resources/effect/packages/atom/react/src/Hooks.ts
```


## Stream atoms

Define atoms at module scope using Atom.keepAlive with AtomRuntime.atom. Never define atoms inside components.

```typescript
// Bad - atom defined inside a component, recreated on every render
function RouteComponent() {
  const itemsAtom = Atom.keepAlive(...) // Never do this
  const items = useAtomValue(itemsAtom)
}

// Good - atom at module scope with full definition
const itemsAtom = Atom.keepAlive(
  AtomRuntime.atom(
    pipe(
      RpcClient.asEffect(),
      Effect.map(client => client('items.stream', void 0)),
      Stream.unwrap
    )
  )
)
function RouteComponent() {
  const items = useAtomValue(itemsAtom)
}
```


## Derived stream atoms

Keep stream shaping logic inside the atom definition. Never transform atom data inside components.

```typescript
// Bad - data transformation inside the component
const itemsAtom = Atom.keepAlive(...)
function RouteComponent() {
  const {value: items} = useAtomSuspense(itemsAtom)
  const visible = items.filter(item => item.visible) // transform in component
}

// Good - shape the stream inside the atom definition
const visibleItemsAtom = Atom.keepAlive(
  AtomRuntime.atom(
    pipe(
      RpcClient.asEffect(),
      Effect.map(client =>
        client('items.stream', void 0).pipe(
          Stream.map(items => Array.filter(items, item => item.visible))
        )
      ),
      Stream.unwrap
    )
  )
)
function RouteComponent() {
  const {value: visible} = useAtomSuspense(visibleItemsAtom)
}
```


## Reading atoms

```typescript
// Bad - useAtomValue on an async atom (exposes raw AsyncResult, not the value)
function RouteComponent() {
  const items = useAtomValue(itemsAtom) // async atom needs useAtomSuspense
}

// Good - useAtomSuspense for async, useAtomValue for synchronous
function RouteComponent() {
  const {value: items} = useAtomSuspense(itemsAtom)
  const count = useAtomValue(countAtom)
}
```


## Mutations

Use useAtomSet with RpcClient.mutation for write operations. Never use useState plus fetch for data that comes from RPC.

```typescript
// Bad - useState + manual fetch for mutations
function RouteComponent() {
  const [isLoading, setIsLoading] = useState(false)
  const createItem = async (name: string) => {
    setIsLoading(true)
    await api.post('/items', {name})
    setIsLoading(false)
  }
}

// Good - useAtomSet with RpcClient.mutation
function RouteComponent() {
  const createItem = useAtomSet(RpcClient.mutation('items.create'))
  const archiveItem = useAtomSet(RpcClient.mutation('items.archive'))

  createItem({payload: {name: 'Draft'}})
  archiveItem({payload: {id: item.id}})
}
```


## Additional hooks

```typescript
// Bad - manual re-fetch pattern or no refresh mechanism
function RouteComponent() {
  const [_, setTick] = useState(0)
  const refresh = () => setTick(t => t + 1) // manual refresh hack
}

// Good - use the dedicated atom hooks
function RouteComponent() {
  const refresh = useAtomRefresh(itemsAtom)
  useAtomSubscribe(itemsAtom, items => console.log('Items updated:', items))

  return <button onClick={() => refresh()}>Refresh</button>
}
```

## Route wiring

Keep atom definitions at module scope and route logic inside the route component. Use TanStack Router patterns.

```typescript
// Bad - atoms defined inline, data fetched with useEffect
export const Route = createFileRoute('/items/')({
  component: () => {
    const [data, setData] = useState(null)
    useEffect(() => { fetchData().then(setData) }, [])
    return <div>{data}</div>
  }
})

// Good - atoms at module scope, route component uses atom hooks
export const Route = createFileRoute('/items/')({
  component: RouteComponent
})

function RouteComponent() {
  const {value: data} = useAtomSuspense(dataAtom)
  const mutate = useAtomSet(RpcClient.mutation('rpc.method'))
  return <div>...</div>
}
```
