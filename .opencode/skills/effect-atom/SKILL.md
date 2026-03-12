---
name: effect-atom
description: React state management with Effect Atom
metadata:
  patterns: Atom, useAtomValue, useAtomSuspense, mutations, subscriptions
---

## Source files

```
.opencode/resources/effect/packages/effect/src/unstable/reactivity/Atom.ts
.opencode/resources/effect/packages/atom/react/src/Hooks.ts
```


## Atom definition

Define atoms at module scope.

```typescript
// Bad - atom inside component
function RouteComponent() {
  const itemsAtom = Atom.keepAlive(...)
  const items = useAtomValue(itemsAtom)
}

// Good - atom at module scope
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
  const {value: items} = useAtomSuspense(itemsAtom)
}
```


## Stream shaping

Keep stream logic inside the atom.

```typescript
// Bad - transform in component
const itemsAtom = Atom.keepAlive(...)
function RouteComponent() {
  const {value: items} = useAtomSuspense(itemsAtom)
  const visible = Array.filter(items, item => item.visible)
}

// Good - shape in atom definition
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
```


## Reading atoms

Use useAtomSuspense for async, useAtomValue for sync.

```typescript
// Bad - useAtomValue on async atom
function RouteComponent() {
  const items = useAtomValue(itemsAtom)
}

// Good
function RouteComponent() {
  const {value: items} = useAtomSuspense(itemsAtom)
  const count = useAtomValue(countAtom)
}
```


## Mutations

Use useAtomSet with RpcClient.mutation.

```typescript
// Bad - useState + manual fetch
function RouteComponent() {
  const [isLoading, setIsLoading] = useState(false)
  const create = async (name: string) => {
    setIsLoading(true)
    await api.post('/items', {name})
    setIsLoading(false)
  }
}

// Good - useAtomSet
function RouteComponent() {
  const createItem = useAtomSet(RpcClient.mutation('items.create'))
  createItem({payload: {name: 'Draft'}})
}
```


## Hooks

Use dedicated atom hooks.

```typescript
// Bad - manual re-fetch pattern
function RouteComponent() {
  const [_, setTick] = useState(0)
  const refresh = () => setTick(t => t + 1)
}

// Good
function RouteComponent() {
  const refresh = useAtomRefresh(itemsAtom)
  useAtomSubscribe(itemsAtom, items => console.log(items))
}
```


## Route wiring

Atoms at module scope, route logic in component.

```typescript
// Bad - atoms inline, useEffect for data
export const Route = createFileRoute('/items/')({
  component: () => {
    const [data, setData] = useState(null)
    useEffect(() => { fetchData().then(setData) }, [])
    return <div>{data}</div>
  }
})

// Good
export const Route = createFileRoute('/items/')({
  component: RouteComponent
})

function RouteComponent() {
  const {value: data} = useAtomSuspense(dataAtom)
  const mutate = useAtomSet(RpcClient.mutation('rpc.method'))
  return <div>...</div>
}
```
