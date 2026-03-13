---
name: effect-atom
description: React state management with Effect Atom
metadata:
  patterns: Atom, useAtomValue, useAtomSuspense, mutations, subscriptions
---

## Source files

```
.opencode/resources/effect/packages/effect/src/unstable/reactivity/Atom.ts
```


## Module scope atoms

Define all atoms at module scope using AtomRuntime. Keep all logic out of components.

```typescript
import {AtomRuntime} from '#lib/atomRuntime.ts'

// Bad - React state inside component
function Component() {
  const [data, setData] = useState()
  useEffect(() => {
    fetchData().then(setData)
  }, [])
}

// Good - atom at module scope with Effect
const dataAtom = AtomRuntime.atom(
  Effect.gen(function* () {
    const value = yield* fetchData()
    return value
  })
)

function Component() {
  const {value: data} = useAtomSuspense(dataAtom)
  return <div>{data}</div>
}
```


## Stream atoms

For real-time data from RpcClient, use keepAlive with Stream.unwrap.

```typescript
const itemsAtom = Atom.keepAlive(
  AtomRuntime.atom(
    pipe(
      RpcClient.asEffect(),
      Effect.map(client => client('rpc.method', void 0)),
      Stream.unwrap
    )
  )
)

function Component() {
  const {value: items} = useAtomSuspense(itemsAtom)
  return <List items={items} />
}
```


## Reading atoms

Use useAtomSuspense. The route has a Suspense boundary.

```typescript
function Component() {
  const {value: items} = useAtomSuspense(itemsAtom)
  return <List items={items} />
}
```


## Mutations

Use useAtomSet for mutations.

```typescript
function Component() {
  const createItem = useAtomSet(createAtom)
  createItem({name: 'New'})
}
```


## Logic in atoms

Move all logic into atoms. Components should only read values and trigger mutations.

```typescript
// Bad - React useState and useEffect
function Component() {
  const [state, setState] = useState({items: [], selected: null})
  useEffect(() => {
    fetchItems().then(items => setState(s => ({...s, items})))
  }, [])
}

// Good - all logic in atom
const itemsAtom = AtomRuntime.atom(
  Effect.gen(function* () {
    const items = yield* fetchItems()
    return items
  })
)

function Component() {
  const {value: items} = useAtomSuspense(itemsAtom)
  return <List items={items} />
}
```
