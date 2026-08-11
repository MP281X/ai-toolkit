# Effect

## Intent

Preserve typed failure, requirements, interruption, scope, observability, and composability across application behavior.

## Boundaries

- Unknown input → `Schema`
- Existing canonical protocol or domain value → import its owning schema and type directly without a local alias; AI messages, parts, and streaming response parts use `effect/unstable/ai` `Prompt` and `Response`.
- Configuration → `Config`
- Expected failure → typed error
- Existing optionality → consume its `Option`; otherwise use `Option` only when it simplifies composition or elimination, and decode nullable or omittable boundary fields into `Option` once
- Decode and normalize once at the owning external boundary.
- Use Effect and Effect Platform before equivalent globals, prototypes, promises, timers, process, filesystem, network, cancellation, cache, events, JSON, or mutable collections.
- Keep unavoidable native APIs inside the smallest foreign or synchronous presentation boundary.

```ts
type Input = typeof Input.Type
const Input = Schema.Struct({value: Schema.String})

function consume(value: typeof Usage.Type.rate_limit.primary_window) {}
```

Reject duplicated structural types, nested-access aliases, property probing after decode, and raw tagged objects.

When a foreign callback requires `void` or `Promise` and has no Effect adapter, capture the caller context once and bridge only that callback with `Effect.runForkWith` or `Effect.runPromiseWith`.

An Effect wrapper must add policy, failure translation, requirements, lifecycle, or observability. Reject zero-argument factories and single-yield wrappers.

## Public services

- `service.ts` owns the tag, contract, and public layer constructors; `internal/*` owns implementations.
- Immutable instance configuration belongs in the layer constructor, is declared under `export declare namespace ServiceName`, and is not a schema unless it crosses an unknown boundary; changing configuration creates another service instance.
- Operation input belongs inline in the method unless it has its own boundary or shared identity.
- A service represents one configured instance. The application owns multiple keyed instances through a scoped `RcMap`; do not add registries or keyed instance maps to the package service.
- Public methods expose `R = never`, except caller-owned scoped resources.
- Each current mutable value has one public `SubscriptionRef` read path so RPC consumers can remain synchronized; group values that change atomically, never mirror one value through another effect or stream, keep commands and point-in-time queries as effects, and use `Stream` only for incremental output.
- Gate `SubscriptionRef` writes with the owning schema's equivalence because the primitive publishes every write. Invalidate after every owned mutation; observe externally mutable state through a scoped watcher or internally scheduled polling, never a user refresh action.
- Construct refs, caches, sockets, clients, queues, subscriptions, and fibers inside their owning scope.
- Cleanup methods exist only for domain stop behavior.

Reject global instances, public implementation types, and duplicate read paths.

## Shape and tracing

- Use Effect modules, data-first dual APIs, `pipe`, and `flow`.
- Use persistent Effect collections and expression-based transitions; reject reassigned locals and mutable collections outside irreducible foreign ownership.
- Use a module's `match` only for its owned elimination semantics: `Boolean.match` for boolean branches, `Option.match` for optionality, `Array.match` for empty/non-empty structure, and `Match` for type refinements. Prefer specific `Predicate` refinements; use `Match.instanceOf` for arbitrary constructors inside a match.
- Trace public Effect, Stream, channel, and scoped capabilities plus meaningful external I/O and failure-prone stages.

```ts
pipe(values, Array.filter(Predicate.isNotNull), Array.map(transform))
pipe(value, String.trim, String.toLowerCase)
Boolean.match(condition, {onFalse, onTrue})
```

Reject traces around pure transformations or entire infinite stream lifetimes.
