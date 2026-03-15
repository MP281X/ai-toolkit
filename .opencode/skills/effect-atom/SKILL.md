---
name: effect-atom
description: React state management with Effect Atom
metadata:
  patterns: AtomRuntime, AtomRpc.Service, Atom.keepAlive, Stream.unwrap, optimisticFn, AsyncResult, reactivityKeys
---

## Source files

```
.opencode/resources/effect/packages/effect/src/unstable/reactivity/Atom.ts
.opencode/resources/effect/packages/effect/src/unstable/reactivity/AtomRpc.ts
.opencode/resources/effect/packages/effect/src/unstable/reactivity/Reactivity.ts
.opencode/resources/effect/packages/effect/src/unstable/reactivity/AsyncResult.ts
```

## Purpose

- Use atoms as the logic and state-management layer for screens
- Keep async work, business logic, subscriptions, and mutations in atoms
- Keep components mostly render-local; tiny presentational state can stay local
- Prefer suspense reads by default
- Prefer the long-lived stream-inside-atom pattern over pull-based streams
- Start in `Atom.ts`, `AtomRpc.ts`, and `AsyncResult.ts` to choose the simplest atom/runtime pattern

## Where to look

- RPC-backed query / mutation clients: `AtomRpc.Service`
- Suspense reads: `useAtomSuspense`
- Project stream pattern: `Atom.keepAlive`, `AtomRuntime.atom`, `Stream.unwrap`, and the stream constructors in `Atom.ts`
- Mutation orchestration: `AtomRuntime.fn`, `Reset`, `Interrupt`, and `FnContext`
- Invalidation and table-style refresh: `Reactivity.mutation`, `Reactivity.query`, `runtime.withReactivity`, `reactivityKeys`
- Cache lifecycle: `setIdleTTL`, `keepAlive`, `autoDispose`, `family`
- Stale async UI state: `AsyncResult.previousSuccess`, `value`, `getOrElse`, `matchWithWaiting`, `withFallback`, `swr`
- Persistence and URL state: `kvs`, `searchParam`

## Best practices

- Prefer `useAtomSuspense` for reads and keep non-suspense result handling for the cases that actually need it
- Prefer the repo stream pattern with `keepAlive` + stream-inside-atom for long-lived subscriptions
- Keep invalidation in reactivity keys instead of manual refresh wiring spread across components
- Keep stale async data visible through `AsyncResult` helpers instead of collapsing back to blank loading states
- Use `optimistic` / `optimisticFn` for mutation UX instead of separate ad-hoc pending containers
- Keep tiny presentational state local; do not move trivial UI toggles into atoms

## RPC stream pattern

For long-lived RPC subscriptions in this repo, keep the stream inside the atom and keep the atom alive.

```typescript
// Bad
const eventsAtom = AtomRuntime.atom(RpcClient.use(client => client('events', payload)))

// Good
const eventsAtom = Atom.keepAlive(
  AtomRuntime.atom(
    pipe(
      RpcClient.asEffect(),
      Effect.map(client => client('events', payload)),
      Stream.unwrap
    )
  )
)
```

## AsyncResult stale data

When you are not using suspense for a read, or when you intentionally need custom waiting / failure handling, `AsyncResult` can still carry the previous good value. Prefer rendering from that value and treating `waiting` as an overlay.

```typescript
// Bad
const text = result.waiting ? 'loading' : AsyncResult.getOrThrow(result)

// Good
const text = AsyncResult.getOrElse(result, () => 'loading')
```

## Optimistic updates

If you need optimistic mutation UX, start with the atom helpers instead of adding a separate pending-state model.

```typescript
// Bad
const pending = {saving: true}

// Good
const optimisticValueAtom = Atom.optimistic(valueAtom)
```
