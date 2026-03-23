---
name: react
description: Load when building screens — route files, search params, atom-based state, async UI data, RPC client usage.
metadata:
  patterns: |
    createFileRoute(, Route.useSearch, Route.useParams,
    validateSearch:, Atom., AtomRuntime., useAtom, useAtomSuspense,
    AsyncResult., RpcClient.query, RpcClient.mutation,
    Atom.keepAlive, Atom.family, Reactivity.
---

## Source files

### Effect Reactivity

- `.opencode/resources/effect/packages/effect/src/unstable/reactivity/Atom.ts`
- `.opencode/resources/effect/packages/effect/src/unstable/reactivity/AtomRpc.ts`
- `.opencode/resources/effect/packages/effect/src/unstable/reactivity/Reactivity.ts`
- `.opencode/resources/effect/packages/effect/src/unstable/reactivity/AsyncResult.ts`

### TanStack Router

- `.opencode/resources/tanstack-router/packages/router-core/src/route.ts`
- `.opencode/resources/tanstack-router/packages/router-core/src/link.ts`
- `.opencode/resources/tanstack-router/packages/router-core/src/useSearch.ts`
- `.opencode/resources/tanstack-router/packages/router-core/src/useNavigate.ts`
- `.opencode/resources/tanstack-router/packages/router-core/src/useParams.ts`
- `.opencode/resources/tanstack-router/packages/router-core/src/useLoaderData.ts`
- `.opencode/resources/tanstack-router/packages/router-core/src/redirect.ts`
- `.opencode/resources/tanstack-router/packages/react-router/src/route.tsx`
- `.opencode/resources/tanstack-router/packages/react-router/src/useSearch.tsx`
- `.opencode/resources/tanstack-router/packages/react-router/src/useNavigate.tsx`
- `.opencode/resources/tanstack-router/packages/react-router/src/link.tsx`
- `.opencode/resources/tanstack-router/packages/react-router/src/router.ts`

## Patterns

- Route search params → `createFileRoute`, `validateSearch`, `Schema.toStandardSchemaV1`
- Atoms → `Atom.keepAlive`, `AtomRuntime.atom`, `Atom.family`, `Atom.mapResult`
- RPC clients → `AtomRpc.Service`, `RpcClient.query`, `RpcClient.mutation`
- Suspense reads → `useAtomSuspense`
- Mutations and invalidation → `AtomRuntime.fn`, `Reactivity.mutation`, `Reactivity.query`, `reactivityKeys`
- Cache lifecycle → `setIdleTTL`, `keepAlive`, `autoDispose`, `family`
- Stale async state → `AsyncResult.previousSuccess`, `getOrElse`, `matchWithWaiting`, `swr`
- Persistence → `kvs`, `searchParam`

## Examples

```typescript
export const Route = createFileRoute('/items')({
  validateSearch: Schema.toStandardSchemaV1(
    Schema.Struct({id: Schema.optional(Schema.String), query: Schema.optional(Schema.String)})
  )
})
```

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

```typescript
// Bad
const text = result.waiting ? 'loading' : AsyncResult.getOrThrow(result)

// Good
const text = AsyncResult.getOrElse(result, () => 'loading')
```

```typescript
// Bad
const pending = {saving: true}

// Good
const optimistic = Atom.optimistic(valueAtom)
```
