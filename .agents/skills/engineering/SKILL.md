---
name: engineering
description: 'Use for approved workspace, Effect, React, or UI changes; return coherent implementation and package wiring.'
---

# Workspace

- Repository enforcement and review policy: `references/enforcement.md`.
- Packages expose public entrypoints through `exports` and private aliases through `imports`.
- Put dependencies and scripts in the manifest that uses them; preserve grouping and intentional ranges.
- Manifest changes include only the required lockfile resolution.
- Root scripts orchestrate shared checks; package scripts own package behavior; CLI commands use `bin`.
- Keep scripts direct unless named orchestration owns status merging.

# Routing

- Effect application behavior or external boundaries: `references/effect.md`.
- Effect test mechanics: `references/effect-testing.md`.
- React state, async behavior, routes, atoms, RPC, or component boundaries: `references/react-dataflow.md`.
- Layout, interaction, visual states, controls, styling, or copy: `references/ui-design.md`.

Load only the references required by the changed surface.
