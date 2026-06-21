---
name: react
description: Use when editing React routes, atoms, RPC clients, async UI state, component props, or frontend dataflow.
---

# React

## Composition

- Apps compose services.
- Packages expose service boundaries.
- Components render; atoms own logic.
- UI observes reactive state.
- Synchronized backend state: `SubscriptionRef` atoms.
- Incremental backend data: streams.
- Reads that can fail/suspend: suspense atoms.
- Mutations: action atoms or local action state.

## Errors

- Route/layout error boundaries for load failure.
- Action failure: toast when user can continue.
- No fake success UI.
- No fallback UI unless requested or real loading/error state.

## Compiler

- React Compiler on.
- No `memo`, `useMemo`, `useCallback`.
- Remove manual memo when touched.

## Components

- Inline prop types for structural service mirrors.
- No service-schema imports in reusable component packages.
- No bridge props inferable from existing props.
- Local obvious derivation stays at use site.
- Async command = visible loading state.
- Disable unavailable UI actions; backend remains authority.
