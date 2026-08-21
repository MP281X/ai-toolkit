---
name: project-engineering
description: "Use with engineering for this repository's architecture, workspace, testing, components, or visual conventions."
---

## Boundary

Extend `engineering` with only this repository's selected architecture and conventions.

| Owner       | Responsibility                                                       |
| ----------- | -------------------------------------------------------------------- |
| Effect      | Behavior, immutable data, state, resources, concurrency, and failure |
| Server      | Authoritative application state                                      |
| Effect RPC  | Frontend/backend operations and streaming boundary                   |
| Effect Atom | Client synchronization and shared view state                         |
| React       | Presentation                                                         |

## Workflow

Use the owner table to place behavior before implementation.

## References

| Condition                                                         | Reference                                  |
| ----------------------------------------------------------------- | ------------------------------------------ |
| Application boundaries, RPC, client runtime, and source placement | [Architecture](references/architecture.md) |
| Repository test placement and acceptance ownership                | [Testing](references/testing.md)           |
| Components, interaction, and visual system                        | [UI design](references/ui-design.md)       |
| Generators, topology, manifests, scripts, and exports             | [Workspace](references/workspace.md)       |
