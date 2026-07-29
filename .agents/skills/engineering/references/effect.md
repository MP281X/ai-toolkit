# Effect

## Intent

Preserve typed failure, requirements, interruption, scope, observability, and composability across application behavior.

## Boundaries

- Unknown input uses `Schema`; configuration uses `Config`; expected failures use typed errors.
- Decode once at the owning RPC, HTTP, storage, process, SDK, form, or browser boundary, normalize once, then trust the decoded type.
- Keep named schema/type pairs at module scope. Use schema-backed constructors for domain data; tagged errors are the supported schema-class exception and are constructed with `.make`.
- Consume existing `Option` values directly instead of reconstructing presence or absence.
- Use maintained Effect or platform capabilities before JavaScript globals, prototypes, or native state, time, process, network, filesystem, cancellation, cache, event, JSON, and collection machinery.
- Keep unavoidable native APIs at a narrow external or synchronous presentation boundary.
- When a foreign API requires a callback that returns `void` or `Promise` and exposes no Effect adapter, capture the caller's context once and bridge only that callback with `Effect.runForkWith` or `Effect.runPromiseWith`. Keep resource ownership and cleanup in the surrounding Effect scope.

**Reject:** casts, property probing after decode, raw tagged objects, raw JSON, `Data` classes, non-error `Schema.Class`, local runtimes, `Effect.run*` outside a process entrypoint or the required foreign-callback bridge, Promise callbacks or orchestration inside Effect-owned behavior, mutable native collections, manual cancellation, and native prototype pipelines.

## Effect values

- Named functions returning Effect use `Effect.fn` when it preserves their natural call shape and tracing.
- Nullary Effect work is an Effect value, usually `Effect.gen`; use a function only when invocation itself carries input or creates a distinct resource or lifecycle.
- Yield the real operation directly. A wrapper must add policy, failure translation, requirements, lifecycle, or observability.

**Failure:** zero-argument factories and single-yield wrappers hide when work is constructed, duplicate signatures, and sever diagnostic context.

**Direction:** expose the Effect value or named operation that owns the behavior.

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

**Reject:** method `.pipe`, schema-decoder aliases, signature-only wrappers, access aliases, and traces around pure transformations or entire infinite stream lifetimes.
