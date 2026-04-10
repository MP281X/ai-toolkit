---
name: react
description: Patterns for routes, search params, atoms, streams, and RPC client usage.
---

## Rules

- Move state into the URL via `validateSearch` — keep component state minimal
- Move logic into atoms — components only read and render
- Use `Atom.keepAlive` + `Stream.unwrap` for RPC streams
- Use `useAtomSuspense` for reads

## Patterns

### URL state

```typescript
export const Route = createFileRoute('/items')({
  validateSearch: Schema.toStandardSchemaV1(
    Schema.Struct({id: Schema.optional(Schema.String), query: Schema.optional(Schema.String)})
  )
})
```

### RPC streams

```typescript
// Bad
const items = AtomRuntime.atom(RpcClient.use(client => client('list', request)))

// Good
const items = Atom.keepAlive(
  AtomRuntime.atom(
    pipe(
      RpcClient.asEffect(),
      Effect.map(client => client('list', request)),
      Stream.unwrap
    )
  )
)
```

### Async results

```typescript
// Bad
const text = result.waiting ? 'loading' : AsyncResult.getOrThrow(result)

// Good
const text = AsyncResult.getOrElse(result, () => 'loading')
```
