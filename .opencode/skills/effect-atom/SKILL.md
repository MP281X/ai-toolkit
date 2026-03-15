---
name: effect-atom
description: React state management with Effect Atom
metadata:
  patterns: AtomRuntime, atoms, useAtomSuspense, useAtomSet
---

## Source files

```
.opencode/resources/effect/packages/effect/src/unstable/reactivity/Atom.ts
```

## Purpose

- Use atoms as the logic and state-management layer for screens
- Keep async work, business logic, subscriptions, and mutations in atoms
- Keep components mostly render-local; tiny presentational state can stay local
- Research the local source file above before assuming Atom APIs or capabilities


## Reads and writes

- Prefer `useAtomSuspense` for reads and `useAtomSet` for writes

```typescript
function Screen() {
  const {value: user} = useAtomSuspense(userAtom)
  const saveUser = useAtomSet(saveUserAtom)
  return <button onClick={() => saveUser(user)}>save</button>
}
```

## Streams and real-time

- For real-time data, keep the stream inside the atom and research `keepAlive` and `Stream.unwrap`

```typescript
const eventsAtom = Atom.keepAlive(
  AtomRuntime.atom(
    pipe(
      RpcClient.asEffect(),
      Effect.map(client => client('events.subscribe', void 0)),
      Stream.unwrap
    )
  )
)
```

## Tiny UI state

- Tiny presentational state can stay local

```typescript
function Toolbar() {
  const [open, setOpen] = useState(false)
  return <Popover open={open} onOpenChange={setOpen} />
}
```
