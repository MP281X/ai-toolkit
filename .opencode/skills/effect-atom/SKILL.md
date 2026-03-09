---
name: effect-atom
description: Effect Atom and RPC patterns for React frontends - runtime, atoms, subscriptions, mutations, hooks
---

## Source files

```
.opencode/resources/effect/packages/effect/src/unstable/reactivity/Atom.ts
.opencode/resources/effect/packages/effect/src/unstable/reactivity/AtomRpc.ts
.opencode/resources/effect/packages/atom/react/src/Hooks.ts
```


## Overview

Assume AtomRuntime and any shared client services are already configured at the application entrypoint. This skill covers atom definitions and React component usage.

Atoms provide reactive state management integrated with Effect's runtime.


## Stream atoms

Use Atom.keepAlive with AtomRuntime.atom for long-lived stream-backed state. Define atoms at module scope, never inside components.


### DO: Define stream atoms at module scope

```typescript
const itemsAtom = Atom.keepAlive(
  AtomRuntime.atom(
    pipe(
      RpcClient.asEffect(),
      Effect.map(client => client('items.stream', void 0)),
      Stream.unwrap
    )
  )
)
```


### DON'T: Define atoms inside components

```typescript
// Bad
function RouteComponent() {
  const itemsAtom = Atom.keepAlive(...) // Never do this
  const items = useAtomValue(itemsAtom)
}

// Good
const itemsAtom = Atom.keepAlive(...) // Define at module scope
function RouteComponent() {
  const items = useAtomValue(itemsAtom)
}
```


## Derived stream atoms

Keep stream shaping logic inside the atom definition, not in the component. This keeps components simple and ensures consistent data transformations.


### DO: Shape streams inside atoms

```typescript
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


### DON'T: Transform data in components

```typescript
// Bad
const itemsAtom = Atom.keepAlive(...)
function RouteComponent() {
  const {value: items} = useAtomSuspense(itemsAtom)
  const visible = items.filter(item => item.visible) // Don't do this
}

// Good
const visibleItemsAtom = Atom.keepAlive(...) // Shape in atom
function RouteComponent() {
  const {value: visible} = useAtomSuspense(visibleItemsAtom)
}
```


## Reading atoms

Choose the right hook based on the atom type:

- Use `useAtomValue` for plain atoms with synchronous values
- Use `useAtomSuspense` for async atoms that expose AsyncResult


### DO: Read atoms appropriately

```typescript
function RouteComponent() {
  const {value: items} = useAtomSuspense(itemsAtom)
  const count = useAtomValue(countAtom)
  // ...
}
```


### DON'T: Use useAtomValue for async atoms

```typescript
// Bad
function RouteComponent() {
  const items = useAtomValue(itemsAtom) // Async atom needs useAtomSuspense
}

// Good
function RouteComponent() {
  const {value: items} = useAtomSuspense(itemsAtom)
}
```


## Mutations

Use useAtomSet with RpcClient.mutation for write operations. This integrates mutations with the atom system.


### DO: Use mutations properly

```typescript
function RouteComponent() {
  const createItem = useAtomSet(RpcClient.mutation('items.create'))
  const archiveItem = useAtomSet(RpcClient.mutation('items.archive'))

  createItem({payload: {name: 'Draft'}})
  archiveItem({payload: {id: item.id}})
}
```


## Additional hooks

- `useAtomRefresh(atom)` - Trigger explicit refresh actions
- `useAtomSubscribe(atom, listener)` - Run side effects when atom changes
- `useAtomMount(atom)` - Mount an atom without reading its value
- `useAtomRef(...)` - Only when component really needs an atom reference


### DO: Use hooks appropriately

```typescript
function RouteComponent() {
  const refresh = useAtomRefresh(itemsAtom)
  useAtomSubscribe(itemsAtom, items => console.log('Items updated:', items))

  return <button onClick={() => refresh()}>Refresh</button>
}
```


## Route wiring

Keep atom definitions at module scope and route logic inside the route component. Use TanStack Router patterns.


### DO: Structure route components

```typescript
export const Route = createFileRoute('/items/')({
  component: RouteComponent
})

function RouteComponent() {
  const {value: data} = useAtomSuspense(dataAtom)
  const mutate = useAtomSet(RpcClient.mutation('rpc.method'))
  return <div>...</div>
}
```


## Rules

- One AtomRuntime per application
- Define atoms at module level, never inside components
- Use useAtomValue for synchronous atoms
- Use useAtomSuspense for async reads
- Use useAtomSet for writes
- Do not use useState plus useEffect for data from RPC streams
- Compose streams with pipe, Stream.map, Stream.scan, and Stream.unwrap
