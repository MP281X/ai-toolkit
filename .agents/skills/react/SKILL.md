---
name: react
description: Use when editing React routes, atoms, RPC clients, async UI state, component props, or frontend dataflow.
---

# React

## State And RPC

- Components render; atoms own logic
- URL-owned state: router search params + existing schema pattern
- Reads that can fail/suspend: suspense atoms
- Mutations: action atoms or local action state
- Incremental backend data: streams
- Synchronized backend state: `SubscriptionRef` atoms
- No component-only shape unless UI creates a real domain value
- Load failure: route/layout error boundary
- Action failure: toast when user can continue

## Components

- React Compiler is enabled; do not add manual memoization unless a measured boundary requires it
- Name component data shapes only when they are real domain concepts
- No service-schema imports in reusable component packages
- No bridge props inferable from existing props
- Local obvious derivation stays at use site
- Async command = visible loading state
- Disable UI actions that cannot currently run instead of duplicating the validation in the backend
