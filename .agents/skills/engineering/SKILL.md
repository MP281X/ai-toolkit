---
name: engineering
description: 'Use for approved implementation, fixes, refactors, tests, or product-code review.'
---

Effect is the language and functional mental model: Effect owns behavior, immutable data, state, resources, concurrency, and failure; servers are authoritative; streaming RPC synchronizes Atom; React presents; adapters translate external interfaces.

- Trust typed values and decode unknown external data once at its boundary.
- Preserve intact typed values; transform shape only when the contract requires it.
- Omit states excluded by types or schemas.
- Propagate the first reachable failure; retry or recover only when required.
- Keep arguments, props, service values, and returned values immutable without `readonly` syntax.
- Use direct names, inferred local types, domain operations, and existing repository conventions.
- Add tests only for durable behavior whose regression cost justifies them. Generated scaffolding and presentation details do not require unit tests by default.

## References

Applicable work routes to:

| Work                                                                                 | Reference                                 |
| ------------------------------------------------------------------------------------ | ----------------------------------------- |
| Effect operation selection, composition, Stream, tracing, errors, and concurrency    | [Effect](references/effect.md)            |
| Schema-owned public shapes, service interfaces, and RPC contracts                    | [Contracts](references/contracts.md)      |
| External boundary decoding and missing values                                        | [Effect data](references/effect-data.md)  |
| Service implementations, Layers, resources, state, and caches                        | [Services](references/effect-services.md) |
| Router, RPC client, Atom, and React                                                  | [Frontend](references/react.md)           |
| Durable service or helper behavior tests                                             | [Testing](references/testing.md)          |
| Product interaction or visual design                                                 | [UI design](references/ui-design.md)      |
| Package topology, manifests, dependencies, scripts, exports, CLI, or generated files | [Workspace](references/workspace.md)      |
