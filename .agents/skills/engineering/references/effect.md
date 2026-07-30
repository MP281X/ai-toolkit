# Effect

## Intent

Preserve typed failure, requirements, interruption, scope, observability, and composability across application behavior.

## Boundaries

- Unknown input → `Schema`
- Configuration → `Config`
- Expected failure → typed error
- Existing optionality → consume its `Option`
- Decode and normalize once at the owning external boundary.
- Use Effect and Effect Platform before equivalent globals, prototypes, promises, timers, process, filesystem, network, cancellation, cache, events, JSON, or mutable collections.
- Keep unavoidable native APIs inside the smallest foreign or synchronous presentation boundary.

```ts
type Input = typeof Input.Type
const Input = Schema.Struct({value: Schema.String})

function consume(value: typeof Usage.Type.rate_limit.primary_window) {}
```

Reject duplicated structural types, `satisfies Schema.Schema<...>`, nested-access aliases, property probing after decode, raw tagged objects, and raw JSON.

When a foreign callback requires `void` or `Promise` and has no Effect adapter, capture the caller context once and bridge only that callback with `Effect.runForkWith` or `Effect.runPromiseWith`.

An Effect wrapper must add policy, failure translation, requirements, lifecycle, or observability. Reject zero-argument factories and single-yield wrappers.

## Public services

- `service.ts` owns the tag, contract, and public layer constructors; `internal/*` owns implementations.
- Shared instance input belongs in layer/config; operation input belongs in the method.
- Public methods expose `R = never`, except caller-owned scoped resources.
- Current mutable state has one `SubscriptionRef` read path; incremental-only output uses `Stream`.
- Construct refs, caches, sockets, clients, queues, subscriptions, and fibers inside their owning scope.
- Cleanup methods exist only for domain stop behavior.

Reject leaked requirements, `*Live` exports, global instances, public implementation types, duplicate read paths, and redundant layers.

## Shape and tracing

- Use Effect modules, data-first dual APIs, `pipe`, and `flow`.
- Trace public Effect, Stream, channel, and scoped capabilities plus meaningful external I/O and failure-prone stages.

```ts
pipe(values, Array.filter(Predicate.isNotNull), Array.map(transform))
pipe(value, String.trim, String.toLowerCase)
Boolean.match(condition, {onFalse, onTrue})
```

Reject schema-decoder aliases and traces around pure transformations or entire infinite stream lifetimes.
