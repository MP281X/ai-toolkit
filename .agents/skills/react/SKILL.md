---
name: react
description: Use when editing React routes, atoms, RPC clients, async UI state, component props, or frontend dataflow.
---

# React

Keep React as the rendering layer.

## Compiler

- Assume React Compiler is enabled
- Take advantage of React Compiler instead of preserving manual memoization patterns
- Never add `memo`, `useMemo`, or `useCallback`
- Remove manual memoization when touching code
- Keep values direct and local; let the compiler optimize stable references

## State

- Put frontend logic in atoms
- Keep components mostly presentational
- Put route state in TanStack Router search params when it belongs in the URL
- Use schema validation for route search params
- Use suspense atoms for reads that should throw to route or layout boundaries
- Use action atoms or local action state for mutations that need loading UI

## RPC And Streams

- Keep RPC contracts schema-backed
- Use streams for incremental backend data
- Use `SubscriptionRef`-backed atoms for synchronized backend state
- Do not transform service schemas into component-only shapes unless the UI truly needs a new domain value
- Throw unrecoverable load errors to the route or layout error boundary
- Show action failures with a toast when the user can continue

## Components

- Inline prop types when they are structural mirrors of service data
- Do not import service schemas into reusable component packages
- Do not add bridge props that can be inferred from existing props
- Derive display values at the use site when the derivation is local and obvious
- Show loading state for every async button or command
- Disable UI actions that cannot currently run instead of duplicating the validation in the backend
