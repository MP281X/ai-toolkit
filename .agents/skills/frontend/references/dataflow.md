# React Dataflow

## Ownership

Components render; atoms own logic.

- Current backend state uses `SubscriptionRef` atoms.
- Incremental backend data uses streams.
- Reads that suspend or fail use suspense atoms.
- Mutations use action atoms or local action state.

## Local state

Use `useState` for direct setters and small inline functional updates. Use a reducer when coupled state has named user or domain events with shared transition logic. Reducer actions are events, not generic patches.

Group state by user-facing interaction. The backend remains the authority for availability; the frontend disables actions already known to be unavailable.

## Boundaries

- Keep props beside the component that owns them.
- Reusable component packages receive no service-schema types.
- Keep derived values at their use site unless shared behavior owns them.
- Async commands expose pending and failure state.
- Route/layout boundaries own load failures.
- Recoverable action failures remain local; success follows backend confirmation.
