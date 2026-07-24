# React dataflow

- Components render; atoms own logic.
- Current backend state uses `SubscriptionRef` atoms; incremental data uses streams.
- Suspending or failing reads use suspense atoms; mutations use action atoms or local action state.
- Use `useState` for direct setters and small inline updates. Use a reducer for coupled state with named user or domain events, never generic patches.
- Group state by user interaction. The backend remains authoritative; disable only actions already known unavailable.
- Keep props beside their owner. Reusable component packages receive no service-schema types.
- Keep derived values at use unless shared behavior owns them.
- Async commands expose pending and failure. Route boundaries own load failures; recoverable action failures remain local; success follows backend confirmation.
