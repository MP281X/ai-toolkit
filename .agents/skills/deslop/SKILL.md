---
name: deslop
description: "Use for this repository's application architecture, Effect RPC boundary, workspace topology, test placement, component system, or visual design."
---

Extend the generic `engineering` skill with only this repository's selected architecture and conventions.

| Owner       | Responsibility                                                       |
| ----------- | -------------------------------------------------------------------- |
| Effect      | Behavior, immutable data, state, resources, concurrency, and failure |
| Server      | Authoritative application state                                      |
| Effect RPC  | Frontend/backend operations and streaming boundary                   |
| Effect Atom | Client synchronization and shared view state                         |
| React       | Presentation                                                         |

## References

| Work                                                              | Reference                                  |
| ----------------------------------------------------------------- | ------------------------------------------ |
| Application boundaries, RPC, client runtime, and source placement | [Architecture](references/architecture.md) |
| Repository test placement and acceptance ownership                | [Testing](references/testing.md)           |
| Components, interaction, and visual system                        | [UI design](references/ui-design.md)       |
| Generators, topology, manifests, scripts, and exports             | [Workspace](references/workspace.md)       |
