# Effect

## Intent

Preserve typed failure, requirements, interruption, scope, observability, and composability across application behavior.

## Boundaries

- Unknown input uses `Schema`; configuration uses `Config`; expected failures use typed errors.
- Decode once at the owning RPC, HTTP, storage, process, SDK, form, or browser boundary, normalize once, then trust the decoded type.
- Keep named schema/type pairs at module scope. Tagged errors are the supported schema-class exception and are constructed with `.make`.
- Use maintained Effect or platform capabilities before native state, time, process, network, filesystem, cancellation, cache, event, or collection machinery.
- Keep unavoidable native APIs at a narrow external or synchronous presentation boundary.

**Reject:** casts, property probing after decode, raw JSON, local runtimes, `Effect.run*` in application code, Promise orchestration, mutable native collections, and manual cancellation.

## Public services

- `service.ts` owns the tag, contract, and public layer constructors; named `internal/*` modules own implementations.
- Shared instance input belongs in layer/config; operation input belongs in the method.
- Public methods expose `R = never`, except caller-owned scoped resources.
- Current mutable values have one `SubscriptionRef` read path; incremental-only output uses `Stream`.
- Construct refs, caches, sockets, clients, queues, subscriptions, and fibers inside their owning scope.
- Cleanup methods exist only for domain stop behavior.

**Reject:** leaked requirements, `*Live` exports, global instances, public implementation types, multiple read paths, and redundant layers.

## Shape and tracing

- Keep pure transformations local until they own policy or change together.
- A helper earns a name for domain policy, lifecycle, an external boundary, recursion, or behavior that changes as one unit.
- Use data-first dual APIs and imported `pipe` or `flow` for larger compositions.
- Trace public Effect, Stream, channel, and scoped capabilities plus meaningful external I/O and failure-prone stages.

**Reject:** method `.pipe`, signature-only wrappers, access aliases, object bags, tuple-rest parameters, deeply nested conditionals, and traces around pure transformations or entire infinite stream lifetimes.
