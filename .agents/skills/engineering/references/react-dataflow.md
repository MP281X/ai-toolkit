# React dataflow

## Intent

Give authoritative application state and async behavior one reactive owner while components render current state and express user intent.

- Current backend state uses `SubscriptionRef` atoms; incremental data uses streams.
- Suspending or failing reads use suspense atoms. Commands use action or RPC mutation atoms.
- Use local React state only for direct ephemeral interaction and pending UI intent.
- Use a reducer for coupled state with named user or domain events, never generic patches.
- Keep props beside their owner. Reusable component packages receive no service-schema types.
- Keep derived values at use unless shared behavior owns them.
- Async commands expose pending and failure. Success follows backend confirmation.
- Imperative effects are reserved for browser systems and include cleanup.

**Reject:** component-owned fetching, domain validation, Promise state, duplicated backend state, local runtimes, synchronous wrapper atoms, and effects that fetch or derive application data.
