---
name: react
description: Use when editing React routes, atoms, RPC clients, async UI state, component props, or frontend dataflow.
---

# React

## Composition

- Components render; atoms own logic.
- Synchronized backend state: `SubscriptionRef` atoms.
- Incremental backend data: streams.
- Reads that can fail/suspend: suspense atoms.
- Mutations: action atoms or local action state.

## Errors

- Route/layout error boundaries for load failure.
- Action failure: toast when user can continue.
- No fake success UI.
- Fallback UI requires real loading/error state or explicit request.

## Components

- Keep component props close to the component that owns them.
- Name prop types when they are public, reused, recursive, or necessary for a complex component contract.
- No service-schema imports in reusable component packages.
- Bridge props or adapters must own layout, lifecycle, state, domain policy, or a repeated interaction contract.
- Keep simple derived values where they are used.
- Do not extract section arrays, wrapper components, or handler modules only to make diagnostics disappear.
- Async command = visible loading state.
- Disable unavailable UI actions; backend remains authority.
- Group UI state by user-facing interaction.
- Use `useState` for local UI state that has direct setters or small inline functional updates.
- Use a reducer when coupled state has named user or domain events with shared update logic.
- Reducer actions describe user or domain events; avoid generic patch actions.
