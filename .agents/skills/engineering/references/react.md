# React dataflow

## Intent

Give authoritative application state and async behavior one reactive owner while components render current state and express user intent.

- Backend state uses `SubscriptionRef`; expose current values through streaming RPCs.
- Each frontend has one always-defined `AtomRpc.Service` client in its established runtime module.

```ts
RpcClient.query('projects.branches', {cwd})
RpcClient.mutation('projects.maintenance')
```

- Suspending or failing reads use suspense atoms.
- Use local React state only for direct ephemeral interaction and pending UI intent.
- A ref-shaped value uses `useRef`, not state containing `{current}`.
- Use a reducer for coupled state with named user or domain events, never generic patches.
- Give `Atom.family` arguments an explicit stable domain type when inference cannot preserve it. Identity comes from structured values, not array positions or concatenated strings.
- Keep props beside their owner. Reusable component packages receive no service-schema types.
- Async commands expose pending and failure. Success follows backend confirmation.
- Imperative effects are reserved for browser systems and include cleanup.

**Reject:** component-owned fetching, domain validation, Promise state, duplicated backend state, local runtimes, synchronous wrapper atoms, generic state patches, fake refs, and effects that fetch or derive application data.
