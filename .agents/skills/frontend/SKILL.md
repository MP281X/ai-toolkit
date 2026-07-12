---
name: frontend
description: 'React routes, atoms, RPC state; UI layout, controls, loading, mutation feedback, visual design.'
---

Frontend work has two branches. Load only the branch the change reaches:

- State, async behavior, routes, atoms, RPC, or component boundaries: `references/dataflow.md`.
- Layout, interaction, visual states, controls, styling, or copy: `references/design.md`.

Changes that reach both branches must compose around one user-facing interaction and one source of backend truth.
