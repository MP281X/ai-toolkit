---
name: engineering
description: 'Use for product-code guidelines, architecture, coding style, implementation, testing, or review.'
---

Use Effect v4, React, Effect Atom, and TanStack Router when the repository contains or selects them. Preserve every other established technology and boundary.

| Applicable owner | Responsibility                                                       |
| ---------------- | -------------------------------------------------------------------- |
| Effect           | Behavior, immutable data, state, resources, concurrency, and failure |
| Effect Atom      | Shared client state, async state, derivation, and synchronization    |
| TanStack Router  | Shareable navigation and URL state                                   |
| React            | Presentation and DOM-local interaction                               |
| Adapter          | External interface translation                                       |

| Lead       | Requirement                                                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Inspect    | Establish surrounding code, configured dependencies, project conventions, and authoritative reference behavior before design. |
| Decode     | Trust typed values; decode unknown external data once at its boundary.                                                        |
| Transform  | Preserve intact typed values; transform shape only when the Contract requires it.                                             |
| State      | Omit states excluded by types or schemas.                                                                                     |
| Fail       | Propagate the first reachable failure; retry or recover only when required.                                                   |
| Mutability | Keep arguments, props, service values, and returned values immutable without `readonly` syntax.                               |
| Name       | Use direct names, inferred local types, domain operations, and established repository conventions.                            |
| Test       | Test durable behavior only when regression cost justifies it; omit generated scaffolding and presentation-detail unit tests.  |
| Comment    | Explain only a surprising constraint or non-obvious behavior.                                                                 |

## References

Applicable work routes to:

| Work                                                                                    | Reference                                 |
| --------------------------------------------------------------------------------------- | ----------------------------------------- |
| Effect operation selection, composition, Stream, tracing, errors, and concurrency       | [Effect](references/effect.md)            |
| Schema-owned public boundary shapes                                                     | [Contracts](references/contracts.md)      |
| External boundary decoding and missing values                                           | [Effect data](references/effect-data.md)  |
| Effect services, Layers, resources, state, and caches when used                         | [Services](references/effect-services.md) |
| TanStack Router, Effect Atom, React, and optional Effect RPC                            | [Frontend](references/react.md)           |
| Durable Effect and application behavior tests                                           | [Testing](references/testing.md)          |
| Product interaction or visual design                                                    | [UI design](references/ui-design.md)      |
| Repository topology, manifests, dependencies, scripts, exports, CLI, or generated files | [Workspace](references/workspace.md)      |
